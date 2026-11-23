export type StoicModuleId = string;
export type StoicModule = {
  id: StoicModuleId;
  month: number;
  days: 30;
  virtue: string;
  focus: string;
  quote: { text: string; attribution: string };
  morning: readonly [string, string];
  evening: readonly [string, string, string];
};
export type StoicEntry = {
  date: string;
  moduleId: StoicModuleId;
  morning: [string, string];
  evening: [string, string, string];
};
export type StoicData = { entries: StoicEntry[]; activeModuleId: StoicModuleId; generated: StoicModule[] };
export const stoicCurriculum: readonly StoicModule[];
export function validateStoicData(value: unknown, legacy?: boolean): StoicData;
export function validateGeneratedStoicModule(value: unknown, month: number, id: string): StoicModule;
export function stoicCompletion(entry: Partial<StoicEntry> | null | undefined): { morningDone: boolean; eveningDone: boolean; dayDone: boolean };
export function currentStoicStreak(entries: StoicEntry[], today: string): number;
export function completedStoicEntries(entries: StoicEntry[], moduleId: StoicModuleId): number;
