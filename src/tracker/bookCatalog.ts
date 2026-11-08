import { genres, type Book, type Genre } from './books.js';

type CatalogWork = { key: string; title: string; author_name?: string[]; subject?: string[]; series?: string[] };
type SearchResponse = { docs: CatalogWork[] };

function classify(subjects: string[]): Genre {
  const text = subjects.join(' ').toLowerCase();
  const rules: Array<[Genre, RegExp]> = [
    ['Science Fiction', /science fiction|sci-fi/], ['Historical Fiction', /historical fiction/],
    ['Fantasy', /fantasy/], ['Mystery / Thriller', /mystery|detective|thriller|suspense/],
    ['Biography', /biograph|autobiograph|memoir/], ['History', /\bhistory\b/],
    ['Business', /business|entrepreneur|management/], ['Self-Improvement', /self.help|self.improvement|personal development/],
    ['Technology', /technology|computers|programming/],
  ];
  return rules.find(([, pattern]) => pattern.test(text))?.[0] || genres[9];
}

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Open Library request failed (${response.status}).`);
  return response.json();
}

export async function searchCatalog(query: string, signal?: AbortSignal): Promise<CatalogWork[]> {
  const params = new URLSearchParams({ q: query, limit: '30', fields: 'key,title,author_name,subject,series' });
  const result = await getJson(`https://openlibrary.org/search.json?${params}`, signal) as SearchResponse;
  if (!Array.isArray(result.docs)) throw new Error('Open Library returned an invalid search response.');
  return result.docs.filter(doc => typeof doc.key === 'string' && /^\/works\/OL\d+W$/.test(doc.key) && typeof doc.title === 'string' && Array.isArray(doc.author_name) && !!doc.author_name[0]);
}

export function catalogPreview(work: CatalogWork): Book {
  const genre = classify(Array.isArray(work.subject) ? work.subject : []);
  const fictionType = ['Biography', 'History', 'Business', 'Self-Improvement', 'Technology'].includes(genre) ? 'Non-Fiction' : 'Fiction';
  return { id: crypto.randomUUID(), title: work.title.slice(0, 300), author: (work.author_name?.[0] || '').slice(0, 300), series: (work.series?.[0] || '').slice(0, 300), genre, fictionType, read: false, rating: '', summary: '' };
}

export async function catalogBook(work: CatalogWork, signal?: AbortSignal): Promise<Book> {
  const details = await getJson(`https://openlibrary.org${work.key}.json`, signal);
  if (!details || typeof details !== 'object') throw new Error('Open Library returned invalid book details.');
  const data = details as { description?: string | { value?: string }; subjects?: string[] };
  const description = typeof data.description === 'string' ? data.description : data.description?.value || '';
  const summary = (description.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g) || []).slice(0, 4).join(' ').slice(0, 4000);
  const preview = catalogPreview({ ...work, subject: Array.isArray(work.subject) ? work.subject : data.subjects });
  return { ...preview, summary };
}
