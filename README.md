# Budget App

A simple budgeting app built with React and TypeScript.

## Features

- Add recurring or one-time incomes
- Mark paycheck income to define the current pay period and the next-paycheck dashboard summary
- Add expenses with various frequencies (weekly, biweekly, bimonthly, monthly, quarterly, semiannual, annual)
- View monthly summary
- Balance projections over 12 months

## Getting Started

1. Install dependencies: `npm install`
2. Start the development server: `npm run dev`
3. Open your browser to `http://localhost:5173`

## Usage

- Add incomes and expenses using the forms
- Mark income as a paycheck when adding or editing it; income descriptions containing “Paycheck” are detected automatically when imported or migrated
- Review posted and unposted transactions in the current paycheck period
- Choose a 30-, 60-, or 90-day range on the Transactions page; the range selector is available at all screen sizes
- View the monthly net income
- See the balance projection for the next 12 months

Data is stored in local storage.