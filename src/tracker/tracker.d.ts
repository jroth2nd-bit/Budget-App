import type { WeightData } from './weight.js';

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
  [key: string]: unknown;
};

declare const tracker: {
  emptyState(): TrackerState;
  validateState(value: unknown): TrackerState;
};
export default tracker;
