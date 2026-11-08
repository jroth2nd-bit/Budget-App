# Milestone

A personal dashboard for finances, skills, games, and weight planning, built with React and TypeScript. Existing Budget App data and backups remain compatible.

## Features

- Add recurring or one-time incomes
- Mark paycheck income to define the current pay period and the next-paycheck summary
- Add expenses with various frequencies (weekly, biweekly, bimonthly, monthly, quarterly, semiannual, annual)
- Track salary changes, annual income goals, raises, and notes on Salary Tracker
- View monthly summary
- Balance projections over 12 months
- Budget Tracker combines transactions, balance projections, and Upcoming
- Mercy Ledger for RAID shard mercy, Soulstone and event calculators, and Clan Boss rewards; Champion Builds and BJJ Skills

## Getting Started

1. Install dependencies: `npm install`
2. Start the development server: `npm run dev`
3. Open your browser to `http://localhost:5173`

## Usage

- The dashboard contains clickable summary cards for Budget, Salary, Mercy, Champion Builds, BJJ, Weight, and Book Tracker. It displays no financial amounts; detailed amounts remain on their respective pages.
- Budget Tracker shows the current balance, upcoming low balance, lowest projected balance, next paycheck, balance projection chart, Upcoming list, and transaction controls. The separate Upcoming panel remains in the header.
- The dashboard's salary card compares the two latest salary entries; the mercy card picks the known counter closest to mercy, prioritizing those already in mercy; BJJ shows marked skills first, then the highest confidence below 100%; weight shows the planned days remaining, latest recorded weight, and active-plan track status.
- Dashboard cards and their navigation entries are defined together in the `overviewCards` registry. Add a summary there when adding a new tracker; tracker data must use the existing sync and backup safeguards.
- Add incomes and expenses using the forms
- Expand Add salary change or Annual income goals on Salary Tracker to enter or manage those records
- Expand a salary change in Salary Tracker to view calculated details, notes, and edit or delete actions
- Use Salary What-If to compare a hypothetical annual salary with your latest entry and a selected annual goal; scenarios are not saved
- Salary Tracker and Salary What-If estimate take-home pay at 66.6% of gross, using 26 biweekly paychecks per year. Monthly figures are yearly take-home averaged over 12 months; annual income, raises, and goals remain gross.
- The Salary Tracker chart has separate Cleveland city and Ohio ACS household-income controls. Refresh checks Census Reporter’s latest available ACS 1-year release and retains newer existing data if the provider is behind. Benchmarks are fixed references, not historical figures or individual salaries; shaded brackets are the largest reported ranges, not exact modes. Mean is aggregate household income divided by households.
- On phones and tablets, the salary chart defaults to the latest five salary changes and goals within their date range; use Show all to see the full history and goals. Salary records and the full history list are unaffected.
- In Administration, use Export Salary History to save a private JSON file containing only salary entries and annual goals. Import Salary History accepts that file or a full Budget App backup and replaces only salary entries and goals, leaving budget and transaction data unchanged. When signed in, wait for account sync to finish before importing and confirm it is saved afterward.
- Income tiers are a Pew-inspired approximation using the latest individual salary as household income and a four-person household. The calculation assumes the unadjusted local median represents three people, adjusts by √(4/3), and defines middle income as two-thirds to twice that adjusted median. This is not an official Pew classification.
- Mark income as a paycheck when adding or editing it; income descriptions containing “Paycheck” are detected automatically when imported or migrated
- Review posted and unposted transactions in the current paycheck period
- Choose a 30-, 60-, or 90-day range for the Budget Tracker transaction list (defaults to 30 days); the range selector is available at all screen sizes
- View the monthly net income
- See the balance projection for the next 12 months

## Tracker data and setup

All pages appear in the sidebar with Admin at the bottom. On desktop and tablet, click the Milestone icon to expand or collapse the navigation; it defaults to a compact icon rail and remembers your choice in this browser. On phones, open **More** for additional trackers and Admin. The Mercy, Champion Builds, and BJJ tracker views are hosted inside the app rather than separate embedded pages. They share their data, but do not change budget data. The waypoint accents connect each dashboard card to its page: gold for Budget, steel blue for Salary, crimson for Mercy, emerald for Champion Builds, and copper for Weight. BJJ follows the selected belt color on both its page and card. Dashboard uses ivory and Admin uses slate; warning and danger indicators retain their semantic colors.

Tracker filters use the same choices as their editable fields. The BJJ Type filter includes the built-in skill types and custom types currently in use; select All or use Clear filters to remove the selection.

The Soulstone coin calculator independently projects Immortal purchases from owned Mortal stones (20 Immortal coins per pull) and Eternal purchases from owned Immortal stones (30 Eternal coins per pull). Each purchase costs 1,000 coins of the relevant type. The purchasable count and stones needed for another purchase are shown for each conversion; expand **Calculation details** for intermediate totals. The calculator does not spend resources or automatically include projected purchases in the other conversion. Previously saved inventory remains in backups, including fields no longer shown.

Champion Builds can be filtered by the number of completed fields, from 0/6 through 6/6; a blessing counts as complete at level 6.

On BJJ Skills, the default sort shows the highest confidence first, followed by skills without enough data. Champion Builds defaults to the most complete first. Select a table heading to sort, and select it again to reverse the order. In the BJJ card layout, use the field buttons above the cards the same way.

BJJ skills can have optional suggested or custom starting positions, which can be added, edited, sorted, and filtered. Confidence is an estimate based on Practice (40%) and Live rolls (60%): Not yet = 0, Learning = 40, Sometimes = 75, and Consistently = 100. If either is Unset, confidence shows Not enough data; mastery remains a separate choice. Older backups migrate with no starting positions.

On BJJ Tracker, Focus marks skills you want to work on next (existing selections and imports are preserved). Expand a skill's Details to see its one-line description preview, edit the description or video link, or delete the skill. Description and video sorting remain available within Filter skills on desktop and in the sort controls on smaller screens.

Add dialogs let you enter the editable fields before saving a transaction, salary change, champion, or BJJ skill. Clan Boss rewards and annual salary goals also use dialogs. Calculated values such as balances and champion rankings are still calculated automatically; choosing Posted for a new transaction marks only its first dated occurrence.

When Supabase is configured, tracker data syncs separately to the signed-in account in `tracker_data`, with a browser-local recovery cache. The existing budget table and authentication are unchanged. Before deploying this version, run [supabase/tracker.sql](./supabase/tracker.sql) in the existing Supabase project's SQL editor, and verify that row-level security is enabled and each policy restricts access to the signed-in user. The app cannot load account tracker data until that table and its policies exist. No migration is applied automatically.

Without Supabase, tracker data remains in this browser's local storage under `mercy-ledger-v1`; it does not sync. In account mode, any original tracker data under that key is not automatically uploaded or deleted. The Administration **Export Everything** backup includes budget data, salary history, and all tracker data in a version 2 JSON file. Its **Import Backup** accepts full backups, older version 1 budget backups (which leave tracker data unchanged), and original tracker backups (which leave budget data unchanged). The separate salary-only transfer and the budget wipe action do not change tracker data.

To transfer data from the original tracker, open the original Mercy Ledger in the browser where its data exists and choose **Export backup**. In Milestone, open **Administration → Backup → Import Backup** and select that JSON file. A different site origin or browser cannot read the original local storage directly. Import validates and migrates supported tracker versions 1–16, and asks for confirmation before replacing tracker data; invalid files leave existing data unchanged. The source ZIP does not contain personal tracker data.

Tracker changes are saved in the local recovery cache before account sync. Wait for **Tracker: account sync ready** before closing the page. If a cloud save fails or another device changes the tracker, the app stops further saves and offers a recovery backup. Export that file first; then reload the account copy and review or import the backup if appropriate. Import replaces the complete tracker dataset, not just the changed fields. A recovery cache belongs to the account and browser profile that created it; clearing site data can remove it. Keep independent JSON backups, especially before changing devices, accounts, or browsers.

Weight Tracker and Book Tracker use the same account sync, local-only storage, recovery, and full backup as the other trackers. Tracker backups now use version 16; older backups migrate with an empty library, and pre-version-15 backups migrate with empty weight data. Reload older open app tabs before editing: older versions cannot safely read the new backup format. No new Supabase table or migration is required.

Book Tracker groups library totals and favorite genre in one panel and rating counts in another. It searches Open Library as you type a title. Selecting a result fills available catalog details without changing your reading status or rating; genre and fiction type are estimates and series or summaries may be missing, so review them. Title searches and recommendation queries are sent to Open Library. Select a library cell to edit it; expand the summary to read or edit it. Text saves when the field loses focus and selections save when changed. Press Escape to cancel an edit. Read and rating are independent, and every unread book remains eligible for library recommendations, including one marked Did Not Finish.

Recommendations require at least one Liked or Really Liked rating. They rank matches by genre, author, and shared summary terms, with negative ratings reducing scores. New recommendations search Open Library using a liked author and favorite genre, exclude matching title/author pairs already in the library, and may be unavailable when catalog data is incomplete or the service fails. Results are suggestions, not guarantees of similarity.

New plans can start today or in the past, but cannot begin before the latest phase ended or, when replacing an active phase, before it began. Starting another plan cancels the active one on the new start date; it is blocked if the active plan has later weigh-ins, so those records are not silently reassigned. The starting weight defaults to the most recent weigh-in on or before the chosen start date until manually overridden. Each plan retains its planned and actual end dates. Enter a planned end date and the target weight is calculated at 2 lb gained per calendar month for a bulk or 5 lb lost per calendar month for a cut. Partial months are prorated between successive monthly anniversaries, clamped to the last day of shorter months. Existing plan goals remain unchanged until the plan is edited and saved; saving an edit recalculates the goal at the fixed rate.

Use **Add past plan** in the timeline to record a completed or cancelled phase with its actual end date without cancelling the active plan. Past phases can be inserted between existing phases, but may not overlap them. Edit any phase from the timeline (or the current phase card); its linked weigh-ins keep their measurements, dates, and notes, while expected weights, differences, and plan type are recalculated. An edit that would leave linked weigh-ins outside the phase is blocked and identifies their dates. Expand **Weigh-ins** to edit records in place. Start Plan and Add Weigh-In open dialogs. Weights of 1,000 lb or more cannot be saved: the form suggests dividing by ten, but only applies that correction when selected.

One weigh-in is allowed per date, including backdated dates covered by a plan. When plans share a boundary date, new entries belong to the most recently started plan. Corrections and deletions require confirmation; completing a plan requires confirmation after a qualifying weigh-in. Editing or deleting that weigh-in does not automatically reopen the plan; the most recent completed plan can be reopened when no other plan is active. Status compares the latest weigh-in in the active plan to its expected weight on that date, not today's estimate. Current weight is the latest recorded weigh-in and its date is displayed. Current monthly pace uses a linear regression over at least two active-plan weigh-ins in the last 30 days. Plans and their goals are not changed by weigh-ins.

For a signed-in full restore, tracker sync is checked and the tracker write must succeed before budget data is replaced. These are separate cloud writes, not a single database transaction: check both tracker and budget sync statuses after importing. If a tracker write fails or cannot be confirmed, budget data is not replaced; the account tracker may already have changed, so export any offered recovery backup before resolving the error. A full export requires both budget and tracker sync to be ready and checks the account tracker revision; it does not include the refreshable public Census benchmark cache.

Budget data is stored in local storage and, when Supabase is configured, synced to the signed-in account.

## Tests

Run `npm test` for the supplied tracker calculation and backup-migration tests, and `npm run test:integration` for browser navigation, editing, import, isolation, and mocked account-sync tests. Browser tests use Microsoft Edge on Windows and Playwright's Chromium on other platforms (install the browser with `npx playwright install chromium` if needed). The cloud tests use a mock service; they do not apply or verify the production database migration.