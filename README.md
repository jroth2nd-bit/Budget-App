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
- Mercy Ledger for RAID shard mercy, Soulstone and event calculators, and Clan Boss rewards; Champion Builds and BJJ Skills

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

## Tracker data and setup

The tracker uses the existing sidebar; on phones, open **Trackers** in the bottom navigation. The three tracker views are hosted inside the app rather than separate embedded pages. They share their data, but do not change budget data. Champion Builds gives the shared shell green accents; BJJ Skills matches the shell to the selected belt and retains its belt themes and responsive skill cards. Budget pages and Mercy Ledger retain their usual shell colors.

When Supabase is configured, tracker data syncs separately to the signed-in account in `tracker_data`, with a browser-local recovery cache. The existing budget table and authentication are unchanged. Before deploying this version, run [supabase/tracker.sql](./supabase/tracker.sql) in the existing Supabase project's SQL editor, and verify that row-level security is enabled and each policy restricts access to the signed-in user. The app cannot load account tracker data until that table and its policies exist. No migration is applied automatically.

Without Supabase, tracker data remains in this browser's local storage under `mercy-ledger-v1`; it does not sync. In account mode, any original tracker data under that key is not automatically uploaded or deleted. The Administration **Export Everything** backup includes budget data, salary history, and all tracker data in a version 2 JSON file. Its **Import Backup** accepts full backups, older version 1 budget backups (which leave tracker data unchanged), and original tracker backups (which leave budget data unchanged). The separate salary-only transfer and the budget wipe action do not change tracker data.

To transfer data from the original tracker, open the original Mercy Ledger in the browser where its data exists and choose **Export backup**. In the Budget App, open **Administration → Backup → Import Backup** and select that JSON file. A different site origin or browser cannot read the original local storage directly. Import validates and migrates supported tracker versions 1–12, and asks for confirmation before replacing tracker data; invalid files leave existing data unchanged. The source ZIP does not contain personal tracker data.

Tracker changes are saved in the local recovery cache before account sync. Wait for **Tracker: account sync ready** before closing the page. If a cloud save fails or another device changes the tracker, the app stops further saves and offers a recovery backup. Export that file first; then reload the account copy and review or import the backup if appropriate. Import replaces the complete tracker dataset, not just the changed fields. A recovery cache belongs to the account and browser profile that created it; clearing site data can remove it. Keep independent JSON backups, especially before changing devices, accounts, or browsers.

For a signed-in full restore, tracker sync is checked and the tracker write must succeed before budget data is replaced. These are separate cloud writes, not a single database transaction: check both tracker and budget sync statuses after importing. If a tracker write fails or cannot be confirmed, budget data is not replaced; the account tracker may already have changed, so export any offered recovery backup before resolving the error. A full export requires both budget and tracker sync to be ready and checks the account tracker revision; it does not include the refreshable public Census benchmark cache.

Budget data is stored in local storage and, when Supabase is configured, synced to the signed-in account.

## Tests

Run `npm test` for the supplied tracker calculation and backup-migration tests, and `npm run test:integration` for browser navigation, editing, import, isolation, and mocked account-sync tests. Browser tests use Microsoft Edge on Windows and Playwright's Chromium on other platforms (install the browser with `npx playwright install chromium` if needed). The cloud tests use a mock service; they do not apply or verify the production database migration.