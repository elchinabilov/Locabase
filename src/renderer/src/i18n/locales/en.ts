/**
 * English translation. Must mirror `az.ts`'s shape exactly — `Dict` in
 * `../types.ts` doesn't enforce that at the type level (values are widened
 * to `string`), so keep sections in the same order and don't skip keys;
 * `t()` falls back to the AZ string for anything missing here.
 */
import type { Dict } from '../types.js'

const en = {
  common: {
    close: 'Close',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    loading: 'loading',
    checking: 'checking',
    add: 'Add'
  },
  app: {
    nav: {
      dashboard: 'Overview',
      config: 'Configuration',
      auth: 'Auth',
      tables: 'Tables',
      sql: 'SQL',
      secrets: 'Secrets',
      migrations: 'Migrations',
      functions: 'Functions',
      sync: 'Sync / Deploy',
      settings: 'Settings'
    },
    sidebar: {
      projects: 'Projects',
      addProject: 'Add project',
      emptyBeforePlus: 'No projects yet.',
      emptyAfterPlus: 'to set up a new project or open a repo with a `supabase/` folder.'
    },
    selectProject: {
      title: 'No project selected',
      hint: 'Add a project from the sidebar.'
    }
  },
  newProject: {
    addTitle: 'Add project',
    choiceNew: {
      label: 'New project',
      hint: 'Runs `supabase init` in the chosen folder and assigns it a free port block.'
    },
    choiceOpen: {
      label: 'Open existing project',
      hint: 'A folder that already has `supabase/config.toml`. Nothing is changed.'
    },
    title: 'New project',
    addExisting: 'Add as existing project',
    build: 'Build',
    folder: {
      label: 'Folder',
      hint: '`supabase/` will be created inside it'
    },
    name: {
      label: 'Name',
      hintSuffix: '— container names are derived from this',
      hintEmpty: 'At least one letter or digit is required'
    },
    portBase: {
      label: 'Port block',
      searching: 'Looking for a free block…',
      hint: 'api · db · studio → {ports} (so it doesn’t clash with other projects)'
    },
    occupiedBefore: 'This folder already has',
    occupiedAfter: '. We won’t overwrite it — you can add the project as-is instead.',
    willRunBefore: 'will run, then',
    willRunAfter: 'and ports will be written. Logs show up in the panel below.'
  },
  settings: {
    title: 'Settings',
    appearance: {
      title: 'Appearance',
      subtitle: 'Colour scheme',
      system: 'Match system',
      light: 'Light',
      dark: 'Dark'
    },
    typography: {
      title: 'Typography',
      subtitle: 'Interface and SQL editor',
      interfaceFont: 'Interface font',
      textSize: 'Text size',
      editorFont: 'SQL editor font',
      editorSize: 'SQL editor size',
      unavailable: 'not installed',
      previewText: 'The quick brown fox jumps over the lazy dog — 0123456789',
      previewCode: 'select * from public.posts where id = 42;',
      reset: 'Reset to defaults',
      scale: {
        small: 'Small',
        default: 'Default',
        large: 'Large',
        larger: 'Larger'
      }
    },
    language: {
      title: 'Language'
    },
    doctor: {
      title: 'Environment check',
      subtitle: 'The tool relies on these commands',
      present: 'found',
      absent: 'missing'
    },
    ports: {
      title: 'Ports',
      nextFreeBefore: 'Next free range:',
      nextFreeAfter: '— for a new project: api {api}, db {db}, studio {studio}.',
      conflicts: 'Conflicting ports: {ports}'
    }
  },
  dashboard: {
    empty: {
      title: 'No project added',
      hintBefore: 'Set up a new project from scratch in an empty folder, or open a repo with',
      hintAfter: 'in it. For an existing project the tool copies nothing — every file stays where it is.',
      newProject: 'New project',
      openProject: 'Open existing project'
    },
    status: {
      running: 'running',
      stopped: 'stopped'
    },
    actions: {
      restart: 'Restart',
      stop: 'Stop',
      start: 'Start',
      dbReset: 'db reset'
    },
    portConflict: 'Port conflict: {ports} — the same port is used by more than one project. Move the ports to a different 100-block from the Configuration screen.',
    needsRestart: {
      message: 'The service toggle was written to `config.toml`. Containers only change after a restart.',
      now: 'Restart now',
      later: 'later'
    },
    lastCheck: 'Last checked: {time}',
    services: {
      title: 'Services',
      checking: 'checking docker…',
      disabled: 'disabled',
      restartNeeded: 'restart needed',
      subtitle: '{running} / {total} running',
      ramSuffix: ' · {size} RAM',
      logButton: 'log',
      noContainers: 'No containers — the toggles reflect `config.toml`; status shows up once the stack is up.',
      note: {
        imgproxy: 'Image transformation. Doesn’t start anyway if Storage is disabled.',
        analytics: 'The heaviest and most crash-prone service locally. Keep it off if you don’t need it.'
      }
    },
    quickLinks: {
      title: 'Quick links',
      empty: 'Addresses show up here once the stack is running.',
      copy: 'copy',
      open: 'open'
    },
    environments: {
      title: 'Remote environments',
      add: 'Add',
      sync: 'Sync',
      empty: 'No environment yet. Add a managed (supabase.com) or self-hosted (SSH) environment to see the diff against local.',
      managed: 'managed',
      selfHosted: 'self-hosted'
    },
    reset: {
      title: 'db reset',
      confirmButton: 'Reset database',
      body: 'The local database is completely wiped and every migration is reapplied to an empty database. The seed file runs too.',
      dataLoss: 'Local data is lost.',
      confirmLabel: 'Type «{name}» to confirm',
      genericError: 'Failed'
    }
  },
  auth: {
    title: 'Auth providers',
    changeCount: '{count} change(s)',
    saveEllipsis: 'Save…',
    copied: 'copied ✓',
    callbackHint:
      'Paste this URL into the provider console (Google Cloud Console → Credentials, GitHub → OAuth Apps, LinkedIn → Auth). It changes when the local port changes — remember to update it on the provider side too.',
    providers: 'Providers',
    activeCount: '{active} active / {total}',
    noKey: 'no key',
    collapse: 'collapse',
    settings: 'settings',
    bindEnvTitle: 'Bind to a .env variable (using the name the CLI expects)',
    defaultName: 'default name',
    diffTitle: 'Auth changes',
    writeFile: 'Write file',
    diffChangedLines: '{count} line(s) change. If a provider key is bound to `env()`, set its value from the Secrets screen.',
    restartRequired: 'Restart required.',
    fieldLabel: {
      clientId: 'Client ID',
      secret: 'Client secret',
      url: 'Provider URL',
      redirectUri: 'Redirect URI (override)',
      skipNonceCheck: 'Skip nonce check',
      emailOptional: 'Email not required'
    },
    providerHint: {
      apple: 'The `client_id` is the Services ID, and `secret` is a signed JWT (renews every 6 months). `skip_nonce_check` may be needed for native iOS sign-in.',
      azure: '`url` is the tenant endpoint: https://login.microsoftonline.com/<tenant>/v2.0',
      github: 'GitHub Developer Settings → OAuth Apps → Authorization callback URL.',
      gitlab: 'For self-hosted GitLab, `url` is the instance address.',
      google: 'Google Cloud Console → Credentials → OAuth 2.0 Client (Web) → Authorized redirect URI.',
      keycloak: '`url` is the realm address: https://<host>/realms/<realm>',
      linkedinOidc: 'The provider name is `linkedin_oidc`, not the old `linkedin` — the app must send this name too.'
    }
  },
  fieldEditor: {
    varNamePlaceholder: 'VARIABLE_NAME',
    none: '(none)',
    commaSeparated: 'comma-separated',
    changed: 'changed',
    defaultTitle: 'not in the file — the default applies',
    default: 'default',
    hide: 'hide',
    reveal: 'reveal',
    bindEnvTitle: 'Bind to a variable in the .env file',
    currentValue: 'current value:',
    missingInEnv: 'missing from .env'
  },
  config: {
    title: 'Configuration',
    searchPlaceholder: 'search fields…',
    savedRestartMessage:
      'Changes were written, but haven’t reached the containers yet — Supabase only reads the config at startup.',
    searchResults: 'Search: {count} field(s)',
    defaultHint: 'Fields not in the file are shown with their default value.',
    fieldNotFound: 'No field found.',
    previewTitle: 'Preview changes',
    previewChangedLines: '{count} line(s) change. Comments and order are kept as-is; a',
    previewBackupSuffix: 'copy is taken before writing.',
    previewRestartRequired: 'This change requires a restart.',
    fields: {
  project_id: { label: 'Project ID', help: 'The key that ties together container and volume names. Changing it orphans the old database.' },
  api: {
    enabled: { label: 'API enabled' },
    port: { label: 'Port' },
    schemas: { label: 'Exposed schemas', help: 'Schemas the Data API serves.' },
    extra_search_path: { label: 'Extra search_path' },
    max_rows: { label: 'Max. rows' },
    tls: {
      enabled: { label: 'TLS (https)' },
    },
  },
  db: {
    port: { label: 'Postgres port' },
    shadow_port: { label: 'Shadow port', help: 'Temporary database used for `db diff`.' },
    major_version: { label: 'Postgres version', help: 'Should match production — a mismatch causes migrations to pass locally and fail in production.' },
    health_timeout: { label: 'Health check timeout' },
    migrations: {
      enabled: { label: 'Migrations enabled' },
      schema_paths: { label: 'Declarative schema paths' },
    },
    seed: {
      enabled: { label: 'Seed enabled' },
      sql_paths: { label: 'Seed files' },
    },
    pooler: {
      enabled: { label: 'Pooler (Supavisor)' },
      port: { label: 'Pooler port' },
      pool_mode: { label: 'Pool mode' },
      default_pool_size: { label: 'Pool size' },
      max_client_conn: { label: 'Max. client connections' },
    },
    network_restrictions: {
      enabled: { label: 'Network restrictions' },
      allowed_cidrs: { label: 'Allowed CIDR (v4)' },
      allowed_cidrs_v6: { label: 'Allowed CIDR (v6)' },
    },
  },
  studio: {
    enabled: { label: 'Studio enabled' },
    port: { label: 'Studio port' },
    api_url: { label: 'API URL' },
    openai_api_key: { label: 'OpenAI key', help: 'For Studio\'s SQL assistant.' },
  },
  local_smtp: {
    enabled: { label: 'Mailpit enabled', help: 'Emails sent locally don\'t actually go out — they land in this panel.' },
    port: { label: 'Mailpit port' },
  },
  auth: {
    enabled: { label: 'Auth enabled' },
    site_url: { label: 'Site URL', help: 'Browser origin. You\'re redirected here after login.' },
    additional_redirect_urls: { label: 'Extra redirect URLs', help: 'Wildcards supported: http://localhost:3000/**' },
    external_url: { label: 'External auth URL', help: 'The auth service\'s externally visible address (behind a reverse proxy).' },
    jwt_expiry: { label: 'JWT lifetime (s)' },
    enable_refresh_token_rotation: { label: 'Refresh token rotation' },
    refresh_token_reuse_interval: { label: 'Refresh reuse window (s)' },
    enable_signup: { label: 'Signup enabled' },
    enable_anonymous_sign_ins: { label: 'Anonymous sign-in' },
    enable_manual_linking: { label: 'Manual account linking' },
    minimum_password_length: { label: 'Min. password length' },
    password_requirements: { label: 'Password requirements' },
    web3: {
      solana: {
        enabled: { label: 'Solana Web3 sign-in' },
      },
    },
    oauth_server: {
      enabled: { label: 'OAuth server' },
      authorization_url_path: { label: 'OAuth consent path' },
      allow_dynamic_registration: { label: 'Dynamic registration' },
    },
    email: {
      enable_signup: { label: 'Email signup' },
      double_confirm_changes: { label: 'Double-confirm email change' },
      enable_confirmations: { label: 'Require confirmation email' },
      secure_password_change: { label: 'Require old password on change' },
      max_frequency: { label: 'Max. frequency' },
      otp_length: { label: 'OTP length' },
      otp_expiry: { label: 'OTP lifetime (s)' },
      smtp: {
        enabled: { label: 'External SMTP' },
        host: { label: 'SMTP host' },
        port: { label: 'SMTP port' },
        user: { label: 'SMTP user' },
        pass: { label: 'SMTP password' },
        admin_email: { label: 'Sender email' },
        sender_name: { label: 'Sender name' },
      },
    },
    sms: {
      enable_signup: { label: 'SMS signup' },
      enable_confirmations: { label: 'SMS confirmation' },
      template: { label: 'Template' },
      max_frequency: { label: 'Max. frequency' },
      twilio: {
        enabled: { label: 'Twilio' },
        account_sid: { label: 'Account SID' },
        message_service_sid: { label: 'Message Service SID' },
        auth_token: { label: 'Auth token' },
      },
    },
    mfa: {
      max_enrolled_factors: { label: 'Max. enrolled factors' },
      totp: {
        enroll_enabled: { label: 'TOTP enrollment' },
        verify_enabled: { label: 'TOTP verification' },
      },
      phone: {
        enroll_enabled: { label: 'Phone enrollment' },
        verify_enabled: { label: 'Phone verification' },
        otp_length: { label: 'OTP length' },
        template: { label: 'SMS template' },
        max_frequency: { label: 'Max. frequency' },
      },
    },
    rate_limit: {
      email_sent: { label: 'Emails / hour' },
      sms_sent: { label: 'SMS / hour' },
      anonymous_users: { label: 'Anonymous users / hour' },
      token_refresh: { label: 'Token refresh / 5 min' },
      sign_in_sign_ups: { label: 'Sign-in/signup / 5 min' },
      token_verifications: { label: 'Token verification / 5 min' },
      web3: { label: 'Web3 / 5 min' },
    },
  },
  storage: {
    enabled: { label: 'Storage enabled' },
    file_size_limit: { label: 'File size limit' },
    s3_protocol: {
      enabled: { label: 'S3 protocol' },
    },
    image_transformation: {
      enabled: { label: 'Image transformation (imgproxy)', help: 'Starts a separate container. Keep it off if you don\'t need image resize/format conversion.' },
    },
    analytics: {
      enabled: { label: 'Analytics buckets (Iceberg)' },
      max_catalogs: { label: 'Max. catalogs' },
      max_namespaces: { label: 'Max. namespaces' },
      max_tables: { label: 'Max. tables' },
    },
    vector: {
      enabled: { label: 'Vector buckets' },
      max_buckets: { label: 'Max. buckets' },
      max_indexes: { label: 'Max. indexes' },
    },
  },
  realtime: {
    enabled: { label: 'Realtime enabled' },
    ip_version: { label: 'IP version' },
    max_header_length: { label: 'Max. header length' },
  },
  edge_runtime: {
    enabled: { label: 'Edge runtime enabled' },
    policy: { label: 'Request policy', help: '`per_worker` gives hot reload; switch to `oneshot` for repos with lots of symlinks.' },
    inspector_port: { label: 'Inspector port' },
    deno_version: { label: 'Deno version' },
  },
  analytics: {
    enabled: { label: 'Analytics (Logflare)', help: 'The most crash-prone part locally; keep it off if you don\'t need it.' },
    port: { label: 'Port' },
    backend: { label: 'Backend' },
  },
  experimental: {
    orioledb_version: { label: 'OrioleDB version' },
    s3_host: { label: 'S3 host' },
    s3_region: { label: 'S3 region' },
    s3_access_key: { label: 'S3 access key' },
    s3_secret_key: { label: 'S3 secret key' },
    pgdelta: {
      enabled: { label: 'pg-delta diff engine', help: 'Disabling it falls back to the old `migra` engine.' },
    },
  },
}
  },
  diffView: {
    noDiff: 'No difference.'
  },
  logDrawer: {
    title: 'Logs',
    filterPlaceholder: 'filter…',
    clear: 'clear',
    empty: 'No logs yet.'
  },
  remoteServices: {
    title: 'Remote services',
    managedHint:
      'A managed project can’t toggle individual services — supabase.com manages them and there’s no API for it. RAM management is only available for self-hosted environments.',
    refresh: 'refresh',
    checkingServer: 'checking server',
    required: 'required',
    stopHint:
      'Stopping here is a `docker stop`. Coolify may bring the container back up on the next deploy — remove the service from the compose file to stop it for good.'
  },
  envPicker: {
    local: 'Local',
    localBadge: 'local',
    managedLine1: 'Runs over the Management API: no column types, same-named columns merge.',
    managedLine2: '"Read only" is enforced by Supabase’s API.',
    selfHostedLine1: 'Runs over SSH + psql: a single result block is shown, error position isn’t marked.',
    selfHostedLine2: '"Read only" is enforced on the server with `begin read only`.',
    cancelHint: 'Canceling a query is only possible locally.',
    checkingDb: 'checking database…',
    dbDownTitle: 'Local database isn’t running',
    dbDownHintBefore: 'This screen connects directly to the local Postgres.',
    dbDownHintAfter: 'to start the stack — or switch to a remote environment from the picker above.'
  },
  envForm: {
    editTitle: 'Environment — {name}',
    newTitle: 'New remote environment',
    name: { label: 'Name', hint: 'production, staging, …' },
    kind: {
      label: 'Kind',
      managed: 'Managed — supabase.com',
      selfHosted: 'Self-hosted — SSH + Docker'
    },
    projectRef: { label: 'Project ref' },
    accessToken: {
      label: 'Access token',
      hintSaved: 'Saved. Entering a new value replaces it.',
      hintNew: 'supabase.com → Account → Access Tokens. Encrypted in the system keychain.'
    },
    sshHost: { label: 'SSH host', hint: '`root@server` or an alias from ~/.ssh/config' },
    sshPort: { label: 'SSH port' },
    sshKey: { label: 'SSH key', hint: 'Leave empty to use ssh-agent and default keys' },
    dbContainer: {
      label: 'Postgres container',
      hint: "on the server: docker ps --format '{{.Names}}' | grep supabase-db"
    },
    remoteDir: { label: 'Service folder', hint: 'Coolify: /data/coolify/services/<id>' },
    functionsContainer: {
      label: 'Edge runtime container',
      hint: 'Leave empty to disable function deploys'
    },
    apiUrl: { label: 'API URL' },
    siteUrl: { label: 'Site URL' },
    backupDir: { label: 'Backup folder' },
    backupRetention: { label: 'Backup retention (days)' }
  },
  functionDiff: {
    status: {
      same: 'same',
      changed: 'different',
      localOnly: 'local only',
      remoteOnly: 'remote only'
    },
    drift: {
      same: 'in sync',
      changed: 'content differs',
      localOnly: 'not on remote',
      remoteOnly: 'remote only',
      unknown: 'unknown'
    },
    title: 'Diff — {name}',
    fetching: 'Fetching remote source…',
    summary: '{fileCount} file(s) · {changed} · left (−) remote, right (+) local',
    noDiff: 'no difference',
    filesDiffer: '{count} file(s) differ',
    fileNotFound: 'No file found.',
    binaryFile: 'Binary or too-large file — content not shown.'
  },
  functions: {
    title: 'Functions',
    localOnly: 'Local only',
    serveRunning: 'serve running — stop',
    localServe: 'local serve',
    newFunction: '+ function',
    deployAll: 'Deploy all',
    staleWarning: '{count} function(s) not on remote: {names}',
    count: '{count} function(s)',
    empty: 'No functions. Use «+ function» to create one from the template.',
    remoteOnly: 'remote only',
    fileCount: '{count} file(s)',
    remoteStatus: 'remote: {status}',
    verifyJwtTitle: 'JWT check should be disabled for functions called from the database via pg_net',
    diff: 'diff',
    deploy: 'deploy',
    verifyJwtHint:
      'Disabling `verify_jwt` writes a `[functions.<name>]` block to `config.toml` — both local serve and deploy see the same setting.',
    newTitle: 'New function',
    deployTitle: 'Deploy — {count} function(s)',
    deployFailed: 'Deploy failed',
    deployNow: 'Deploy',
    deployConfirm:
      '{names} — will be sent to the {env} environment. On a self-hosted environment the folder is rsynced and the edge runtime container is restarted.',
    templateHint: '`supabase/functions/{name}/index.ts` is created from the template.',
    namePlaceholder: 'name',
    create: 'Create'
  },
  sync: {
    noEnv: {
      title: 'No remote environment',
      hint: 'Add a managed (supabase.com) or self-hosted (SSH + Docker) environment — then you’ll see the diff against local in one screen.'
    },
    addEnv: 'Add environment',
    envSettings: 'Environment settings',
    computeDiff: 'Compute diff',
    computedAt: 'computed: {time}',
    dryRun: 'Dry run',
    beforeReport: '"Compute diff" reads five axes: migrations, schema, functions, secret names, auth.',
    schema: 'Schema (db diff)',
    schemaClean: 'Local schema matches the migrations.',
    viewDiff: 'view diff',
    secretNames: 'Secret names',
    localOnly: 'local only',
    secretsClean: 'Key names match.',
    authConfig: 'Auth configuration',
    selectedCount: '{count} selected',
    hasDiff: 'diff found',
    cleanAxis: 'clean',
    deployTitle: 'Deploy → {name}',
    start: 'Start',
    step: {
      backup: 'Backup (before schema changes, always)',
      migrations: 'Migrations: {list}',
      functions: 'Functions: {list}',
      secrets: 'Secrets: {list}',
      verify: 'Verify (REST, auth, app)'
    },
    managedMigrationWarning:
      'A managed environment has no selective migration apply — `supabase db push` applies every pending migration in order.'
  },
  secrets: {
    showValues: 'show values',
    addVar: '+ variable',
    write: 'Write',
    missingHeading: '{count} reference(s) are empty — `config.toml` expects these variables, they’re missing from `.env`:',
    cardTitle: 'Local backend variables',
    cardSubtitle: 'The Supabase CLI reads every env() reference in `config.toml` from here',
    fileEmpty: '{file} is empty or missing.',
    unused: 'not referenced from config.toml',
    footerHint:
      'Clicking a masked field clears it — so you don’t accidentally type over the mask text. Restart the stack after writing changes; the CLI only reads `.env` at startup.',
    newVarTitle: 'New variable',
    value: 'Value',
    expectedNames: 'Empty names config.toml expects:'
  },
  migrations: {
    state: {
      synced: 'synced',
      pendingLocal: 'not applied locally',
      pendingRemote: 'not on remote',
      remoteOnly: 'file missing',
      localOnly: 'file missing (local)'
    },
    newMigration: '+ migration',
    applyLocal: 'Apply locally',
    localLedger: 'local ledger {status}',
    remoteLedger: 'remote ledger {status}',
    read: 'read',
    unreachable: 'unreachable',
    count: '{count} migration(s)',
    cardSubtitle: 'files · local ledger · remote ledger',
    empty: 'supabase/migrations folder is empty.',
    col: {
      version: 'Version',
      name: 'Name',
      file: 'File',
      local: 'Local',
      remote: 'Remote',
      state: 'State'
    },
    footerHint:
      'Don’t apply SQL from Studio: no ledger row is written, and the next deploy either re-runs the file or skips work that never happened. One change = one version number.',
    diffTitle: 'db diff — changes not captured in the local schema',
    newTitle: 'New migration',
    nameHint: 'Lowercase letters, digits and underscore only. The file is created as `supabase/migrations/<version>_{name}.sql`.',
    repairTitle: 'Ledger repair — {version}',
    repairBodyBefore: 'Fixing the ledger for the «{env}» environment.',
    repairBodyBold: 'No SQL runs',
    repairBodyAfter:
      '— only the row in `supabase_migrations.schema_migrations` changes. Use this only after confirming whether the objects actually exist in the database.',
    markApplied: 'Mark as "applied" (add the row)',
    markReverted: 'Mark as "reverted" (remove the row)'
  },
  dataGrid: {
    noRows: 'No rows',
    clickForFullValue: 'Click for the full value'
  },
  sql: {
    starterComment: 'run with ⌘↵ / Ctrl+↵',
    timeout: { '5s': '5 s', '30s': '30 s', '2m': '2 min' },
    resizeQueries: 'Resize the query list',
    resizeResults: 'Resize the results pane',
    queries: 'Queries',
    noSaved: 'No saved queries yet.',
    sharedViaGit: '— shared via git.',
    untitled: 'Untitled query',
    readOnly: 'read only',
    rowCount: '{count} row(s)',
    saveAsMigration: 'Save as migration',
    run: 'Run ⌘↵',
    writeModeOn:
      'Write mode is on{target}. If you’re changing the schema — use "Save as migration", otherwise the ledger and database drift apart.',
    writeModeTarget: ' — target «{name}»',
    running: 'running…',
    noResult: 'No result.',
    multiStatementHint: 'Multiple statements = one transaction.',
    firstRows: 'first {count} row(s)',
    error: 'Error',
    rowsAffected: '{command} — {count} row(s) affected.',
    notInLedger: 'SQL run here isn’t written to the migration ledger.',
    saveQueryTitle: 'Save query',
    saveQueryHint: 'Letters, digits, spaces, `_` and `-`. The file is created as `supabase/.locabase/queries/<name>.sql`.',
    deleteConfirmTitle: 'Delete «{name}»?',
    fileDeletedFromDisk: 'The file is deleted from disk.',
    errorField: {
      code: 'code',
      detail: 'detail',
      hint: 'hint',
      constraint: 'constraint',
      table: 'table',
      column: 'column'
    },
    dbUnreachable: 'Local database isn’t running — start the stack first.',
    goToError: 'Go to error'
  },
  tables: {
    resizeSidebar: 'Resize the table list',
    op: { isnull: 'is empty', notnull: 'is not empty' },
    kind: {
      table: 'table',
      partitioned: 'partitioned',
      view: 'view',
      materialized: 'materialized',
      foreign: 'foreign'
    },
    systemSchemaLabel: '{name} · system',
    searchTables: 'search tables…',
    noTablesInSchema: 'No tables in this schema.',
    systemSchemas: 'system schemas',
    selectTable: 'Select a table',
    selectTableHint: 'Pick a table or view from the sidebar.',
    tabRows: 'Rows',
    tabStructure: 'Structure',
    addRow: '+ row',
    deleteRows: 'Delete {count} row(s)',
    notEditable: '{reason} — rows can’t be edited.',
    edit: 'edit',
    newRowTitle: 'New row — {schema}.{table}',
    editRowTitle: 'Edit row — {schema}.{table}',
    removeFilter: 'Remove filter',
    addFilter: '+ filter',
    addFilterTitle: 'Add filter',
    selectColumn: 'select column…',
    value: 'value',
    valueNotNeeded: 'no value needed',
    col: {
      column: 'Column',
      type: 'Type',
      default: 'Default',
      attributes: 'Attributes'
    },
    ddlHint:
      'No DDL here — table and column changes should go through a migration file, otherwise the ledger and database drift apart.',
    default: 'default',
    deleteConfirmTitle: 'Delete {count} row(s)?',
    irreversible: 'This action can’t be undone.'
  }
} satisfies Dict

export default en
