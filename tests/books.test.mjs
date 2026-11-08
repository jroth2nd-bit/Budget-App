import test from 'node:test';
import assert from 'node:assert/strict';
import tracker from '../src/tracker/tracker.js';
import { rankBooks, scoreBook } from '../src/tracker/books.js';

const book = (id, patch = {}) => ({ id, title: id, author: 'Author', series: '', genre: 'Fantasy', fictionType: 'Fiction', read: true, rating: '', summary: '', ...patch });

test('version 15 libraries migrate empty and book data round trips with validation', () => {
  const old = tracker.emptyState();
  old.version = 15;
  delete old.books;
  const migrated = tracker.validateState(old);
  assert.equal(migrated.version, 16);
  assert.deepEqual(migrated.books, []);
  migrated.books = [book('1', { rating: 'Did Not Finish', read: false, series: 'Series #1' })];
  assert.deepEqual(tracker.validateState(JSON.parse(JSON.stringify(migrated))).books, migrated.books);
  assert.throws(() => tracker.validateState({ ...migrated, books: [migrated.books[0], migrated.books[0]] }), /duplicate/);
  assert.throws(() => tracker.validateState({ ...migrated, books: [book('2', { genre: 'Unlisted' })] }), /genre/);
  assert.throws(() => tracker.validateState({ ...migrated, books: [book('2', { title: '' })] }), /title/);
  assert.throws(() => tracker.validateState({ ...migrated, books: undefined }), /library/);
});

test('ranking favors liked authors, genres and shared themes and penalizes dislikes', () => {
  const history = [
    book('positive', { author: 'Good', rating: 'Really Liked', summary: 'Dragons cross distant kingdoms.' }),
    book('negative', { author: 'Bad', rating: 'Did Not Finish', genre: 'History', summary: 'Battles across ancient kingdoms.' }),
  ];
  const strong = book('strong', { author: 'Good', read: false, summary: 'Dragons explore distant kingdoms.' });
  const weak = book('weak', { author: 'Bad', genre: 'History', read: false, summary: 'Battles across ancient kingdoms.' });
  assert.ok(scoreBook(strong, history).score > scoreBook(weak, history).score);
  assert.equal(rankBooks([weak, strong], history)[0].book.id, 'strong');
  assert.match(scoreBook(strong, history).reason, /Good/);
  assert.ok(scoreBook(weak, history).score < 0);
});
