export const genres: readonly ["Fantasy", "Science Fiction", "Mystery / Thriller", "Historical Fiction", "Biography", "History", "Business", "Self-Improvement", "Technology", "Other"];
export const ratings: readonly ["Really Liked", "Liked", "Did Not Like", "Did Not Finish"];
export type Genre = typeof genres[number];
export type Rating = typeof ratings[number] | '';
export type Book = { id: string; title: string; author: string; series: string; genre: Genre; fictionType: 'Fiction' | 'Non-Fiction'; read: boolean; rating: Rating; summary: string };
export function validateBooks(value: unknown): Book[];
export function scoreBook(candidate: Book, history: Book[]): { score: number; reason: string };
export function rankBooks(candidates: Book[], history: Book[]): Array<{ book: Book; score: number; reason: string }>;
