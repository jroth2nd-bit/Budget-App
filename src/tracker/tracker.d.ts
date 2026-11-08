import type { WeightData } from './weight.js';
import type { Book } from './books.js';

export type MercyHistoryEntry = {
  id: string;
  createdAt: string;
  kind: 'shard' | 'soul';
  source: string;
  rarity: string;
  quantity: number;
  rank?: number;
};

export type DemonLordRecord = {
  date: string;
  difficulties: Record<string, {
    chests: number;
    books: number;
    epicBooks: number | null;
    sacred: number;
    void: number;
    ancient: number;
  }>;
};

export type ChampionBuild = {
  id: string;
  name: string;
  statuses: {
    blessing: number | null;
    books: string;
    masteries: string;
    gear: string;
    glyphs: string;
    relic: string;
  };
  notes: string;
};

export type BjjSkill = {
  id: string;
  name: string;
  type: string;
  positions: string[];
  description: string;
  link: string;
  practice: 'unset' | 'not_yet' | 'learning' | 'sometimes' | 'consistently';
  live: 'unset' | 'not_yet' | 'learning' | 'sometimes' | 'consistently';
  preference: 'unset' | 'low' | 'medium' | 'high';
  mastered: boolean;
  workOnNext: boolean;
};

export type TrackerState = {
  version: number;
  entries: MercyHistoryEntry[];
  clanBoss: DemonLordRecord[];
  champions: ChampionBuild[];
  bjj: { belt: string; stripes: number; skills: BjjSkill[] };
  weight: WeightData;
  books: Book[];
  [key: string]: unknown;
};

declare const tracker: {
  emptyState(): TrackerState;
  validateState(value: unknown): TrackerState;
  bjjConfidence(skill: BjjSkill): number | null;
  bjjLearningPriorities(skills: BjjSkill[]): { skill: BjjSkill; confidence: number | null }[];
  buildCompletion(statuses: ChampionBuild['statuses']): { complete: number; applicable: number; percentage: number };
  rules: Record<string, Record<string, { threshold: number; base: number; increment: number }>>;
  calculate(state: TrackerState): { counters: Record<string, Record<string, { known: boolean; count: number }>> };
  nextChance(rule: { threshold: number; base: number; increment: number }, count: number): number;
};
export default tracker;
