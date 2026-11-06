export type IncomeBracket = { lower: number; upper: number | null; label: string };
export type AreaBenchmark = { median: number; mean: number; bracket: IncomeBracket };
export type HouseholdBenchmarks = { year: number; cleveland: AreaBenchmark; ohio: AreaBenchmark };

const brackets: IncomeBracket[] = [
  { lower: 0, upper: 10000, label: 'Less than $10,000' },
  { lower: 10000, upper: 15000, label: '$10,000–$14,999' },
  { lower: 15000, upper: 20000, label: '$15,000–$19,999' },
  { lower: 20000, upper: 25000, label: '$20,000–$24,999' },
  { lower: 25000, upper: 30000, label: '$25,000–$29,999' },
  { lower: 30000, upper: 35000, label: '$30,000–$34,999' },
  { lower: 35000, upper: 40000, label: '$35,000–$39,999' },
  { lower: 40000, upper: 45000, label: '$40,000–$44,999' },
  { lower: 45000, upper: 50000, label: '$45,000–$49,999' },
  { lower: 50000, upper: 60000, label: '$50,000–$59,999' },
  { lower: 60000, upper: 75000, label: '$60,000–$74,999' },
  { lower: 75000, upper: 100000, label: '$75,000–$99,999' },
  { lower: 100000, upper: 125000, label: '$100,000–$124,999' },
  { lower: 125000, upper: 150000, label: '$125,000–$149,999' },
  { lower: 150000, upper: 200000, label: '$150,000–$199,999' },
  { lower: 200000, upper: null, label: '$200,000 or more' },
];

// U.S. Census 2025 ACS 1-year; mean is aggregate household income / households.
export const initialBenchmarks: HouseholdBenchmarks = {
  year: 2025,
  cleveland: { median: 51974, mean: 12065853200 / 172831, bracket: brackets[11] },
  ohio: { median: 74804, mean: 500019723900 / 4957873, bracket: brackets[11] },
};

const cacheKey = 'income_history_household_benchmarks';
const api = 'https://api.censusreporter.org/1.0/data/show/latest?table_ids=B19001%2CB19013%2CB19025&geo_ids=16000US3916000%2C04000US39';

export function benchmarkSources(year: number) {
  const base = `https://www2.census.gov/programs-surveys/acs/summary_file/${year}/table-based-SF/data/1YRData/acsdt1y${year}-`;
  return { distribution: `${base}b19001.dat`, median: `${base}b19013.dat`, aggregate: `${base}b19025.dat` };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBenchmark(value: unknown): value is HouseholdBenchmarks {
  if (!isRecord(value) || typeof value.year !== 'number' || !Number.isInteger(value.year) || value.year < 2025 || value.year > 2100) return false;
  return [value.cleveland, value.ohio].every(area =>
    isRecord(area) && typeof area.median === 'number' && Number.isFinite(area.median) && area.median > 0 &&
    typeof area.mean === 'number' && Number.isFinite(area.mean) && area.mean >= 0 &&
    isRecord(area.bracket) && brackets.some(bracket =>
      isRecord(area.bracket) && area.bracket.lower === bracket.lower && area.bracket.upper === bracket.upper && area.bracket.label === bracket.label
    )
  );
}

export function loadBenchmarks(): HouseholdBenchmarks {
  try {
    const saved = localStorage.getItem(cacheKey);
    if (!saved) return initialBenchmarks;
    const parsed: unknown = JSON.parse(saved);
    if (isBenchmark(parsed)) return parsed;
    console.warn('Invalid cached household benchmarks; using bundled Census estimates.');
  } catch (error) {
    console.warn('Could not read cached household benchmarks; using bundled Census estimates.', error);
  }
  return initialBenchmarks;
}

function estimate(table: unknown, key: string): number {
  if (!isRecord(table) || !isRecord(table.estimate)) throw new Error('The benchmark source returned an invalid table.');
  const value = table.estimate[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`The benchmark source returned an invalid ${key} estimate.`);
  return value;
}

function parseArea(value: unknown): AreaBenchmark {
  if (!isRecord(value)) throw new Error('The benchmark source did not return both areas.');
  const total = estimate(value.B19001, 'B19001001');
  const median = estimate(value.B19013, 'B19013001');
  const aggregate = estimate(value.B19025, 'B19025001');
  if (total === 0 || median === 0) throw new Error('The benchmark source returned an invalid household count or median.');
  const counts = brackets.map((_, index) => estimate(value.B19001, `B19001${String(index + 2).padStart(3, '0')}`));
  const maximum = Math.max(...counts);
  if (counts.filter(count => count === maximum).length !== 1) throw new Error('The largest income bracket is tied; the benchmark cannot be updated automatically.');
  return { median, mean: aggregate / total, bracket: brackets[counts.indexOf(maximum)] };
}

export async function fetchLatestBenchmarks(): Promise<HouseholdBenchmarks> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let response: Response;
  try {
    response = await fetch(api, { cache: 'no-store', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new Error(`Census Reporter request failed (HTTP ${response.status}).`);
  const result: unknown = await response.json();
  if (!isRecord(result) || !isRecord(result.release) || !isRecord(result.data)) throw new Error('The benchmark source returned an invalid response.');
  const release = result.release.id;
  const match = typeof release === 'string' ? /^acs(\d{4})_1yr$/.exec(release) : null;
  if (!match) throw new Error('The latest source data is not an ACS 1-year release.');
  return {
    year: Number(match[1]),
    cleveland: parseArea(result.data['16000US3916000']),
    ohio: parseArea(result.data['04000US39']),
  };
}

export function saveBenchmarks(value: HouseholdBenchmarks) {
  localStorage.setItem(cacheKey, JSON.stringify(value));
}

export function incomeTier(income: number, median: number, householdSize: number) {
  const adjustedMedian = median * Math.sqrt(householdSize / 3);
  const lower = adjustedMedian * 2 / 3;
  const upper = adjustedMedian * 2;
  return { lower, upper, label: income < lower ? 'Lower income' : income <= upper ? 'Middle income' : 'Upper income' };
}
