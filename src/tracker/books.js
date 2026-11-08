export const genres = ["Fantasy", "Science Fiction", "Mystery / Thriller", "Historical Fiction", "Biography", "History", "Business", "Self-Improvement", "Technology", "Other"];
export const ratings = ["Really Liked", "Liked", "Did Not Like", "Did Not Finish"];

export function validateBooks(value) {
  if (!Array.isArray(value)) throw new Error("Missing book library.");
  const ids = new Set();
  return value.map(book => {
    if (!book || typeof book !== "object" || typeof book.id !== "string" || !book.id.trim() || book.id.length > 100 || ids.has(book.id)) throw new Error("Invalid or duplicate book ID.");
    ids.add(book.id);
    for (const [field, limit] of [["title", 300], ["author", 300], ["series", 300], ["summary", 4000]]) {
      if (typeof book[field] !== "string" || book[field].length > limit || (["title", "author"].includes(field) && !book[field].trim())) throw new Error(`Invalid book ${field}.`);
    }
    if (!genres.includes(book.genre) || !["Fiction", "Non-Fiction"].includes(book.fictionType) || typeof book.read !== "boolean" || !["", ...ratings].includes(book.rating)) throw new Error("Invalid book genre, fiction type, reading status, or rating.");
    return { id: book.id, title: book.title.trim(), author: book.author.trim(), series: book.series.trim(), genre: book.genre, fictionType: book.fictionType, read: book.read, rating: book.rating, summary: book.summary.trim() };
  });
}

const weight = { "Really Liked": 3, "Liked": 1, "Did Not Like": -2, "Did Not Finish": -3 };
const words = text => new Set(text.toLowerCase().match(/[a-z0-9]{4,}/g) || []);
const ignored = new Set(["this", "that", "with", "from", "their", "they", "have", "about", "when", "where", "into", "book", "novel", "story", "world", "after", "before"]);
export function scoreBook(candidate, history) {
  let score = 0;
  const reasons = new Set();
  const terms = words(candidate.summary);
  for (const book of history) {
    const points = weight[book.rating] || 0;
    if (!points) continue;
    if (candidate.genre !== "Other" && candidate.genre === book.genre) {
      score += points * 2;
      if (points > 0) reasons.add(`your interest in ${candidate.genre}`);
    }
    if (candidate.author.toLocaleLowerCase() === book.author.toLocaleLowerCase()) {
      score += points * 4;
      if (points > 0) reasons.add(`books you enjoyed by ${candidate.author}`);
    }
    const bookTerms = words(book.summary);
    const overlap = [...terms].filter(term => !ignored.has(term) && bookTerms.has(term)).length;
    if (overlap >= 2) {
      score += points * Math.min(overlap, 4) / 2;
      if (points > 0) reasons.add("similar themes in books you enjoyed");
    }
  }
  return { score, reason: reasons.size ? `Matches ${[...reasons].slice(0, 2).join(" and ")}.` : "This is the closest match to your rated reading history." };
}

export function rankBooks(candidates, history) {
  return candidates.map(book => ({ book, ...scoreBook(book, history) }))
    .sort((a, b) => b.score - a.score || a.book.title.localeCompare(b.book.title) || a.book.author.localeCompare(b.book.author));
}
