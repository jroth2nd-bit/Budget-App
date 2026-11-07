import type { TrackerStorage } from '../TrackerHost';
export type BeltTheme = 'white' | 'blue' | 'purple' | 'brown' | 'black';
export function mount(root: ShadowRoot, storage: TrackerStorage, tracker: unknown, onBeltChange: (belt: BeltTheme) => void): void;
