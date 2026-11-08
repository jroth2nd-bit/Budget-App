import { Fragment, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type FormEvent } from 'react';
import FormDialog from '../FormDialog';
import type { TrackerStorage } from '../TrackerHost';
import tracker from './tracker.js';
import { genres, ratings, rankBooks, scoreBook, type Book, type Genre, type Rating } from './books.js';
import { catalogBook, catalogPreview, searchCatalog } from './bookCatalog';
import BookCell from './BookCell';
import './books.css';

const KEY = 'mercy-ledger-v1';
type Suggestion = Awaited<ReturnType<typeof searchCatalog>>[number];
type Recommendation = { book: Book; reason: string; isNew: boolean };
const emptyBook = (): Book => ({ id: crypto.randomUUID(), title: '', author: '', series: '', genre: 'Other', fictionType: 'Fiction', read: false, rating: '', summary: '' });
const identity = (book: Pick<Book, 'title' | 'author'>) => `${book.title.trim().toLocaleLowerCase()}|${book.author.trim().toLocaleLowerCase()}`;
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

export type BookTrackerHandle = { openAdd(): void };

const BookTracker = forwardRef<BookTrackerHandle, { storage: TrackerStorage; onActionReady: (ready: boolean) => void }>(function BookTracker({ storage, onActionReady }, ref) {
  const [snapshot, setSnapshot] = useState(() => {
    try {
      const raw = storage.getItem(KEY);
      return { raw, state: raw === null ? tracker.emptyState() : tracker.validateState(JSON.parse(raw)), error: '' };
    } catch (error) {
      return { raw: null, state: null, error: `Could not load books: ${errorText(error)}` };
    }
  });
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Book | null>(null);
  const [lookup, setLookup] = useState<Suggestion[]>([]);
  const [lookupMessage, setLookupMessage] = useState('');
  const [lookupEnabled, setLookupEnabled] = useState(false);
  const [search, setSearch] = useState('');
  const [readFilter, setReadFilter] = useState('All');
  const [ratingFilter, setRatingFilter] = useState('All');
  const [genreFilter, setGenreFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [seriesFilter, setSeriesFilter] = useState('All');
  const [expandedSummaries, setExpandedSummaries] = useState<Set<string>>(() => new Set());
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [recommendationMessage, setRecommendationMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const detailRequest = useRef<AbortController | null>(null);
  const books = snapshot.state?.books || [];

  useEffect(() => {
    onActionReady(!!snapshot.state);
    return () => onActionReady(false);
  }, [snapshot.state, onActionReady]);
  useImperativeHandle(ref, () => ({ openAdd: () => { detailRequest.current?.abort(); setError(''); setLookup([]); setLookupMessage(''); setLookupEnabled(false); setDraft(emptyBook()); } }), []);
  useEffect(() => () => detailRequest.current?.abort(), []);

  useEffect(() => {
    if (!draft || !lookupEnabled || draft.title.trim().length < 2) { setLookup([]); setLookupMessage(''); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLookupMessage('Searching Open Library…');
      searchCatalog(draft.title.trim(), controller.signal).then(results => {
        setLookup(results.slice(0, 6));
        setLookupMessage(results.length ? '' : 'No matches found. You can enter the book manually.');
      }).catch(failure => {
        if (!controller.signal.aborted) { setLookup([]); setLookupMessage(`Lookup failed: ${errorText(failure)} You can enter the book manually.`); }
      });
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [draft?.title, lookupEnabled]);

  const save = (next: Book[]) => {
    if (!snapshot.state) return false;
    try {
      if (storage.getItem(KEY) !== snapshot.raw) throw new Error('Tracker data changed in another tab. Reload before editing.');
      const state = tracker.validateState({ ...snapshot.state, books: next });
      const raw = JSON.stringify(state);
      storage.setItem(KEY, raw);
      setSnapshot({ raw, state, error: '' });
      setError('');
      return true;
    } catch (failure) {
      setError(`Could not save your library: ${errorText(failure)}`);
      return false;
    }
  };
  const update = (book: Book, patch: Partial<Book>) => {
    return save(books.map(item => item.id === book.id ? { ...item, ...patch } : item));
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (draft && save([...books, draft])) { setDraft(null); setLookupEnabled(false); }
  };
  const chooseSuggestion = async (item: Suggestion) => {
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    setLookupEnabled(false);
    setLookup([]);
    setLookupMessage('Loading book details…');
    try {
      const found = await catalogBook(item, controller.signal);
      if (controller.signal.aborted) return;
      setDraft(current => current ? { ...found, id: current.id, read: current.read, rating: current.rating } : current);
      setLookupMessage('Review the catalog details; some information may be missing or approximate.');
    } catch (failure) {
      if (!controller.signal.aborted) setLookupMessage(`Could not load book details: ${errorText(failure)}. Enter them manually or try again.`);
    }
  };
  const history = books.filter(book => book.rating !== '');
  const hasPositiveHistory = history.some(book => book.rating === 'Really Liked' || book.rating === 'Liked');
  const recommendLibrary = () => {
    setRecommendation(null);
    const unread = books.filter(book => !book.read);
    if (!unread.length) { setRecommendationMessage('Add an unread book to get a library recommendation.'); return; }
    if (!hasPositiveHistory) { setRecommendationMessage('Rate a book Liked or Really Liked to build your recommendations.'); return; }
    const best = rankBooks(unread, history)[0];
    setRecommendation({ book: best.book, reason: best.reason, isNew: false });
    setRecommendationMessage('');
  };
  const recommendNew = async () => {
    setRecommendation(null);
    if (!hasPositiveHistory) { setRecommendationMessage('Rate a book Liked or Really Liked to build your recommendations.'); return; }
    setBusy(true);
    setRecommendationMessage('Searching Open Library for recommendations…');
    try {
      const positives = history.filter(book => book.rating === 'Really Liked' || book.rating === 'Liked');
      const preferred = [...positives].sort((a, b) => Number(b.rating === 'Really Liked') - Number(a.rating === 'Really Liked'));
      const genreCounts = new Map<string, number>();
      positives.forEach(book => genreCounts.set(book.genre, (genreCounts.get(book.genre) || 0) + (book.rating === 'Really Liked' ? 3 : 1)));
      const topGenre = [...genreCounts.entries()].filter(([genre]) => genre !== 'Other').sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
      const queries = [`author:"${preferred[0].author.replace(/"/g, '')}"`, ...(topGenre ? [`subject:"${topGenre.replace(/"/g, '')}"`] : [])];
      const results = await Promise.all(queries.map(query => searchCatalog(query)));
      const unique = new Map(results.flatMap(items => items.slice(0, 10)).map(item => [item.key, item]));
      const owned = new Set(books.map(identity));
      const candidates = [...unique.values()].filter(item => !owned.has(identity({ title: item.title, author: item.author_name?.[0] || '' })));
      if (!candidates.length) { setRecommendationMessage('No new matches were found. Try again after rating more books.'); return; }
      const ranked = candidates.map(item => ({ item, preview: catalogPreview(item) }))
        .map(row => ({ ...row, score: scoreBook(row.preview, history).score }))
        .sort((a, b) => b.score - a.score || a.preview.title.localeCompare(b.preview.title) || a.preview.author.localeCompare(b.preview.author));
      const detailed = await Promise.all(ranked.slice(0, 6).map(({ item }) => catalogBook(item)));
      const best = rankBooks(detailed, history)[0];
      if (!best || best.score <= 0) { setRecommendationMessage('No suitable new match was found. Try again after rating more books.'); return; }
      setRecommendation({ book: best.book, reason: best.reason, isNew: true });
      setRecommendationMessage('');
    } catch (failure) {
      setRecommendationMessage(`Could not get a new recommendation: ${errorText(failure)}`);
    } finally { setBusy(false); }
  };
  const filtered = books.filter(book =>
    [book.title, book.author, book.series, book.genre].some(value => value.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim())) &&
    (readFilter === 'All' || book.read === (readFilter === 'Read')) &&
    (ratingFilter === 'All' || book.rating === ratingFilter) &&
    (genreFilter === 'All' || book.genre === genreFilter) &&
    (typeFilter === 'All' || book.fictionType === typeFilter) &&
    (seriesFilter === 'All' || book.series === seriesFilter));
  const series = useMemo(() => [...new Set(books.map(book => book.series).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [books]);
  const favorite = genres.map(genre => ({ genre, count: books.filter(book => book.genre === genre && (book.rating === 'Really Liked' || book.rating === 'Liked')).length })).sort((a, b) => b.count - a.count)[0];
  const libraryStats: Array<[string, string | number]> = [
    ['Total Books', books.length], ['Books Read', books.filter(book => book.read).length], ['Books Unread', books.filter(book => !book.read).length],
    ['Favorite Genre', favorite.count ? favorite.genre : 'Not enough data'],
  ];
  const ratingStats: Array<[string, number]> = ratings.map(rating => [rating, books.filter(book => book.rating === rating).length]);

  return <div className="bookPage">
    {snapshot.error && <p role="alert" className="bookError">{snapshot.error}</p>}
    {error && <p role="alert" className="bookError">{error}</p>}
    {snapshot.state && <>
      <div className="bookOverview">
        {[{ title: 'Library', stats: libraryStats }, { title: 'Ratings', stats: ratingStats }].map(group => <section className="card bookStatPanel" aria-label={`${group.title} statistics`} key={group.title}>
          <h2>{group.title}</h2>
          <dl className="bookStatGrid">{group.stats.map(([label, value]) => <div className="bookStat" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        </section>)}
        <section className="card bookRecommendations" aria-labelledby="book-recommendations-title">
          <h2 id="book-recommendations-title">Find your next read</h2>
          <div className="bookActions"><button className="primary" type="button" onClick={recommendLibrary} disabled={busy}>Recommend From My Library</button><button className="primary" type="button" onClick={() => void recommendNew()} disabled={busy}>Recommend Something New</button></div>
          {recommendationMessage && <p role="status">{recommendationMessage}</p>}
          {recommendation && <div className="bookResult"><strong>{recommendation.book.title}</strong><span>by {recommendation.book.author}{recommendation.isNew ? ` · ${recommendation.book.genre}` : ''}</span><p>{recommendation.reason}</p>{recommendation.isNew && <button type="button" onClick={() => { if (books.some(book => identity(book) === identity(recommendation.book))) { setError('This book is already in your library.'); return; } if (save([...books, recommendation.book])) { setRecommendation(null); setRecommendationMessage('Added to your library as unread.'); } }}>Add To Library</button>}</div>}
        </section>
      </div>
      <section className="card bookCollection">
        <h2>Your library</h2>
        <div className="bookFilters">
          <label>Search<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Title, author, series, or genre" /></label>
          <label>Read Status<select value={readFilter} onChange={event => setReadFilter(event.target.value)}><option>All</option><option>Read</option><option>Unread</option></select></label>
          <label>Rating<select value={ratingFilter} onChange={event => setRatingFilter(event.target.value)}><option>All</option>{ratings.map(item => <option key={item}>{item}</option>)}</select></label>
          <label>Genre<select value={genreFilter} onChange={event => setGenreFilter(event.target.value)}><option value="All">All Genres</option>{genres.map(item => <option key={item}>{item}</option>)}</select></label>
          <label>Fiction Type<select value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option>All</option><option>Fiction</option><option>Non-Fiction</option></select></label>
          <label>Series<select value={seriesFilter} onChange={event => setSeriesFilter(event.target.value)}><option value="All">All Series</option>{series.map(item => <option key={item}>{item}</option>)}</select></label>
        </div>
        {!filtered.length ? <p>No books match your filters.</p> : <><p className="bookTableHint">Select a value to edit it. Text saves when you leave the field; press Escape to cancel.</p><div className="bookTableWrap"><table className="bookTable"><thead><tr>{['Title', 'Author', 'Series', 'Genre', 'Fiction / Non-Fiction', 'Read', 'Rating', 'Summary'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>
          {filtered.map(book => <Fragment key={book.id}><tr>
            {(['title', 'author', 'series'] as const).map(field => <td key={field} data-label={field}><BookCell label={`${field} for ${book.title}`} value={book[field]} maxLength={300} onSave={value => {
              if ((field === 'title' || field === 'author') && !value.trim()) { setError(`${field} is required.`); return false; }
              return update(book, { [field]: value });
            }} /></td>)}
            <td data-label="Genre"><BookCell label={`Genre for ${book.title}`} value={book.genre} options={genres.map(value => ({ value, label: value }))} onSave={value => update(book, { genre: value as Genre })} /></td>
            <td data-label="Fiction / Non-Fiction"><BookCell label={`Fiction type for ${book.title}`} value={book.fictionType} options={['Fiction', 'Non-Fiction'].map(value => ({ value, label: value }))} onSave={value => update(book, { fictionType: value as Book['fictionType'] })} /></td>
            <td data-label="Read"><BookCell label={`Read status for ${book.title}`} value={book.read ? 'Yes' : 'No'} options={['Yes', 'No'].map(value => ({ value, label: value }))} onSave={value => update(book, { read: value === 'Yes' })} /></td>
            <td data-label="Rating"><BookCell label={`Rating for ${book.title}`} value={book.rating} emptyLabel="Not rated" options={[{ value: '', label: 'Not rated' }, ...ratings.map(value => ({ value, label: value }))]} onSave={value => update(book, { rating: value as Rating })} /></td>
            <td data-label="Summary"><button type="button" className="bookSummaryToggle" aria-label={`Expand summary for ${book.title}`} aria-expanded={expandedSummaries.has(book.id)} onClick={() => setExpandedSummaries(previous => {
              const next = new Set(previous);
              if (next.has(book.id)) next.delete(book.id); else next.add(book.id);
              return next;
            })}>{book.summary ? 'View summary' : 'Add summary'}</button></td>
          </tr>{expandedSummaries.has(book.id) && <tr className="bookSummaryRow"><td colSpan={8} data-label="Summary"><BookCell label={`Summary for ${book.title}`} value={book.summary} emptyLabel="Select to add a summary" multiline maxLength={4000} onSave={value => update(book, { summary: value })} /></td></tr>}</Fragment>)}
        </tbody></table></div></>}
      </section>
    </>}
    {draft && <FormDialog title="Add Book" onClose={() => { detailRequest.current?.abort(); setDraft(null); setLookupEnabled(false); }}><form onSubmit={submit} className="bookForm">
      {error && <p role="alert" className="bookError bookFormSummary">{error}</p>}
      <label>Title<input required maxLength={300} value={draft.title} onChange={event => { detailRequest.current?.abort(); setLookupEnabled(true); setDraft({ ...draft, title: event.target.value }); }} /></label>
      {(lookup.length > 0 || lookupMessage) && <div className="bookLookup">{lookupMessage && <p role="status">{lookupMessage}</p>}{lookup.map(item => <button key={item.key} type="button" onClick={() => void chooseSuggestion(item)}>{item.title} — {item.author_name?.[0]}</button>)}</div>}
      <label>Author<input required maxLength={300} value={draft.author} onChange={event => setDraft({ ...draft, author: event.target.value })} /></label>
      <label>Series<input maxLength={300} value={draft.series} onChange={event => setDraft({ ...draft, series: event.target.value })} /></label>
      <label>Genre<select value={draft.genre} onChange={event => setDraft({ ...draft, genre: event.target.value as Genre })}>{genres.map(item => <option key={item}>{item}</option>)}</select></label>
      <label>Fiction / Non-Fiction<select value={draft.fictionType} onChange={event => setDraft({ ...draft, fictionType: event.target.value as Book['fictionType'] })}><option>Fiction</option><option>Non-Fiction</option></select></label>
      <label>Read<select value={draft.read ? 'Yes' : 'No'} onChange={event => setDraft({ ...draft, read: event.target.value === 'Yes' })}><option>No</option><option>Yes</option></select></label>
      <label>Rating<select value={draft.rating} onChange={event => setDraft({ ...draft, rating: event.target.value as Rating })}><option value="">Not rated</option>{ratings.map(item => <option key={item}>{item}</option>)}</select></label>
      <label className="bookFormSummary">Summary<textarea maxLength={4000} value={draft.summary} onChange={event => setDraft({ ...draft, summary: event.target.value })} placeholder="A short description, ideally 1–4 sentences" /></label>
      <button className="primary" type="submit">Add Book</button>
    </form></FormDialog>}
  </div>;
});

export default BookTracker;
