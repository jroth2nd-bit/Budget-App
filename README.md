# Budget App

A simple budgeting app built with React and TypeScript.

## Features

- Add recurring or one-time incomes
- Mark paycheck income to define the current pay period and the next-paycheck dashboard summary
- Add expenses with various frequencies (weekly, biweekly, bimonthly, monthly, quarterly, semiannual, annual)
- Track salary changes, annual income goals, raises, and notes separately on the Salary History page
- View monthly summary
- Balance projections over 12 months
- Dashboard chart and Upcoming sections are shown together across screen sizes

## Getting Started

1. Install dependencies: `npm install`
2. Start the development server: `npm run dev`
3. Open your browser to `http://localhost:5173`

## Usage

- Add incomes and expenses using the forms
- Expand Add salary change or Annual income goals on Salary History to enter or manage those records
- Expand a salary change in Salary History to view calculated details, notes, and edit or delete actions
- Use Salary What-If to compare a hypothetical annual salary with your latest entry and a selected annual goal; scenarios are not saved
- Salary History and Salary What-If estimate take-home pay at 66.6% of gross, using 26 biweekly paychecks per year. Monthly figures are yearly take-home averaged over 12 months; annual income, raises, and goals remain gross.
- The Salary History chart has separate Cleveland city and Ohio ACS household-income controls. Refresh checks Census Reporter’s latest available ACS 1-year release and retains newer existing data if the provider is behind. Benchmarks are fixed references, not historical figures or individual salaries; shaded brackets are the largest reported ranges, not exact modes. Mean is aggregate household income divided by households.
- On phones and tablets, the salary chart defaults to the latest five salary changes and goals within their date range; use Show all to see the full history and goals. Salary records and the full history list are unaffected.
- In Administration, use Export Salary History to save a private JSON file containing only salary entries and annual goals. Import Salary History accepts that file or a full Budget App backup and replaces only salary entries and goals, leaving budget and transaction data unchanged. When signed in, wait for account sync to finish before importing and confirm it is saved afterward.
- Income tiers are a Pew-inspired approximation using the latest individual salary as household income and a four-person household. The calculation assumes the unadjusted local median represents three people, adjusts by √(4/3), and defines middle income as two-thirds to twice that adjusted median. This is not an official Pew classification.
- Mark income as a paycheck when adding or editing it; income descriptions containing “Paycheck” are detected automatically when imported or migrated
- Review posted and unposted transactions in the current paycheck period
- Choose a 30-, 60-, or 90-day range on the Transactions page (defaults to 30 days); the range selector is available at all screen sizes
- View the monthly net income
- See the balance projection for the next 12 months

Data is stored in local storage.