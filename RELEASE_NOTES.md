# Release notes — v1.1.0 (in progress)

A running list for the next release. One short entry per piece of work, in the
order it landed. When the release is cut, this is folded into `CHANGELOG.md`
under a dated heading and the file is emptied for the version after it.

**Version:** 1.1.0 — a backwards-compatible feature on top of 1.0.0, so the
minor number moves and the major stays put (semver).

## Added

- **Light theme.** The interface is no longer dark-only: Settings → Appearance
  offers Light, Dark, or Match system, which follows the OS appearance live and
  is the new default. The choice is remembered between launches.
- **Font settings.** Settings → Typography sets the interface font and text size
  (Small to Larger, 92–115%), and the SQL editor's font and size (11–16px)
  separately. A font the machine doesn't have is labelled as such instead of
  silently falling back, and a live sample shows both before you leave the page.
- **Resizable panes on the SQL and Tables screens.** On SQL, the seam between
  the query list and the editor, and the one between the editor and the results;
  on Tables, the seam between the table list and the grid. All draggable —
  by pointer, or with the arrow keys once focused; double-click (or Home) puts a
  seam back where it started. The query list keeps its width in pixels and the
  results pane keeps its share of the height, so a resized window doesn't undo
  the layout. Every size is remembered between launches.
- **Authentication → Users.** The Auth screen is now a section with its own two
  pages, like the Supabase dashboard: **Users**, which lists everyone in
  `auth.users`, and **Sign In / Providers**, which is the provider configuration
  that used to be the whole screen. The user list has search across email, phone
  and UID, filters by provider and by status (confirmed, unconfirmed, anonymous,
  banned), five sort orders, paging, and a column showing which provider each
  user signed up through. Clicking a row opens their identities and their app /
  user metadata. It reads the local stack or any remote environment.
- **Ban, unban and delete users.** Each row carries a ⋮ menu with the two
  actions, and both go through a confirmation naming the user and the
  environment — the same row looks identical whether it came from the local
  stack or from production. A ban writes GoTrue's own `banned_until` and drops the user's open
  sessions, so it takes effect at the next token refresh; a delete relies on the
  auth schema's foreign keys to take identities and sessions with it, and is
  refused outright — with Postgres's own message — when one of your tables still
  references the user. Creating a user stays out: doing it properly means
  password hashing and identity rows, which is the admin API's job.
- **Backups, for every environment.** A new Backups screen dumps the local
  stack, a managed supabase.com project or a self-hosted server, all through one
  button. Local and self-hosted go through `pg_dump -Fc` (a self-hosted dump is
  piped down the SSH connection straight into a local file, so the server needs
  no free disk space); a managed project is assembled from `supabase db dump` —
  roles, schema and data concatenated in restore order. Full, schema-only and
  data-only are the three scopes. Every run lands in one list with its size,
  duration, whoever started it, and the failure reason when there is one.
- **Scheduler jobs.** The same backup, on a schedule: daily at a time, weekly on
  a weekday, every N minutes, or a plain five-field cron expression for anything
  else. A job carries its own target, scope, upload destination and retention
  (keep N days, keep N copies — 0 for no limit; the newest successful backup is
  never pruned). Jobs run while Locabase is open — a run missed with the app
  closed is not caught up on launch, so waking the laptop doesn't fire three
  dumps at once. "Run now" uses the identical code path as the schedule.
- **Storage connections (Cloudflare R2).** Settings → Storage connects an
  S3-compatible bucket, tested with a real signed request rather than a guess.
  Backups upload to it automatically (manually or from a job), and the local
  copy can be dropped once the upload succeeds. Access keys are held in the
  system key store like every other credential, and the signing is ~100 lines of
  SigV4 instead of a 4 MB SDK. R2 is the only provider today; the model is the
  S3 one, so the next is a row in a dropdown.
- **Restore.** Every finished backup carries a Restore action: the dump goes back
  into a database of your choosing — pulling a production dump into the local
  stack is a target select away, not a terminal session. Local and self-hosted go
  through `pg_restore` / `psql` inside the Postgres container (the file is piped
  up the SSH connection, nothing is staged on the server); a managed project
  takes a plain `.sql` through the Management API, and says so plainly, with the
  `psql` line to run, when the dump is too large for that. Custom-format restores
  can drop existing objects first (`--clean --if-exists`). It overwrites a
  database, so it asks for the target's name typed out — the same guard the stack
  reset uses. When the local copy is gone (a job with "keep local" off), the dump
  is pulled back down from the bucket first and the temp file is removed after.
- **Settings is now a section with pages.** Appearance (theme and typography),
  Language, Storage, and System (the CLI/Docker check and the port picture) each
  get their own page behind a resizable sidebar, the way Authentication is split
  — four unrelated groups stacked in one scroll meant the last of them was never
  seen. Backups links straight into the Storage page rather than to Settings at
  large.
- **Edge Functions is a section, and Secrets moved inside it.** The root sidebar
  item is now «Edge Functions», with two pages behind a resizable list:
  **Functions** (the folders and their drift against a remote) and **Secrets**
  (the variables those functions read). Deploying a function and setting the key
  it needs is one task; they no longer sit a list apart.

## Changed

- **The palette is now a set of tokens.** Every colour in the interface comes
  from a named CSS variable (surfaces, text scale, accent, and the warn / danger
  / info tints) instead of a hex value spelled out in a component — the ~80
  hardcoded colours are gone. Swapping themes is a variable swap, and a new
  colour has one place to live.
- **The window opens in the right colour.** The main process stores the theme
  and paints the window background before the page loads, so a light-theme
  launch no longer flashes a dark rectangle. The native title bar and traffic
  lights follow the theme too.
- **The SQL editor follows the theme.** CodeMirror is reconfigured in place on a
  switch, so the document, the undo history and the cursor all survive it.
- **"Auth" is now "Authentication"** in the sidebar, and the old screen lives on
  as its "Sign In / Providers" page.
- **Text sizes are a named ladder.** The ~200 one-off pixel sizes scattered
  through the components are now ten named steps (`text-micro` … `text-h1`),
  each a multiple of one variable — which is what makes a single text-size
  setting move the whole interface at once.
