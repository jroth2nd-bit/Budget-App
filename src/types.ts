export interface Income {
  id: string;
  name: string;
  amount: number;
  isPaycheck?: boolean;
  frequency: 'weekly' | 'biweekly' | 'bimonthly' | 'monthly' | 'quarterly' | 'semiannual' | 'annual';
  startDate: string; // ISO date
  endDate?: string;
  isRecurring: boolean;
  tags?: string[];
  icon?: string;
  overrides?: Record<string, number>;
  amountSchedule?: Array<{ from: string; amount: number }>;
  // Occurrence dates (YYYY-MM-DD) removed from the series
  skipped?: string[];
}

export interface Expense {
  id: string;
  name: string;
  amount: number;
  frequency: 'weekly' | 'biweekly' | 'bimonthly' | 'monthly' | 'quarterly' | 'semiannual' | 'annual';
  startDate: string;
  endDate?: string;
  isRecurring: boolean;
  tags?: string[];
  icon?: string;
  overrides?: Record<string, number>;
  amountSchedule?: Array<{ from: string; amount: number }>;
  // Occurrence dates (YYYY-MM-DD) removed from the series
  skipped?: string[];
}

export interface Tag {
  name: string;
  icon: string;
  color: string;
}