/**
 * Metadata for the `config.toml` fields — the forms on the Config screen are
 * generated from this list. Adding a new key is one line, not new UI code.
 *
 * The `restartRequired` flag matters: the Supabase CLI only hands the
 * configuration to the containers at `supabase start`, so almost every field
 * needs a restart. The exceptions are explicitly `false`.
 *
 * The `label` and `help` strings below are the Azerbaijani source text. The
 * renderer overlays translations on top of them through the
 * `config.fields.<path>.label` / `.help` keys (see `renderer/src/i18n`), so this
 * file — which the main process also imports — never depends on the UI's
 * translation layer.
 */
import type { ConfigField } from './types.js'

const R = true // needs a restart

export const CONFIG_FIELDS: ConfigField[] = [
  /* ------------------------------------------------------------ General */
  {
    path: 'project_id',
    type: 'string',
    group: 'General',
    label: 'Project ID',
    help: 'Konteyner və volume adlarını bağlayan açar. Dəyişsən köhnə baza sahibsiz qalır.',
    restartRequired: R
  },

  /* ------------------------------------------------------------ API */
  {
    path: 'api.enabled',
    type: 'boolean',
    group: 'API',
    label: 'API aktiv',
    default: true,
    restartRequired: R
  },
  {
    path: 'api.port',
    type: 'number',
    group: 'API',
    label: 'Port',
    default: 54321,
    restartRequired: R
  },
  {
    path: 'api.schemas',
    type: 'string[]',
    group: 'API',
    label: 'Açıq sxemlər',
    help: 'Data API-nin göstərdiyi sxemlər.',
    default: ['public', 'graphql_public'],
    restartRequired: R
  },
  {
    path: 'api.extra_search_path',
    type: 'string[]',
    group: 'API',
    label: 'Əlavə search_path',
    default: ['public', 'extensions'],
    restartRequired: R
  },
  {
    path: 'api.max_rows',
    type: 'number',
    group: 'API',
    label: 'Maks. sətir',
    default: 1000,
    restartRequired: R
  },
  {
    path: 'api.tls.enabled',
    type: 'boolean',
    group: 'API',
    label: 'TLS (https)',
    default: false,
    restartRequired: R
  },

  /* ------------------------------------------------------------ Database */
  {
    path: 'db.port',
    type: 'number',
    group: 'Database',
    label: 'Postgres portu',
    default: 54322,
    restartRequired: R
  },
  {
    path: 'db.shadow_port',
    type: 'number',
    group: 'Database',
    label: 'Shadow port',
    help: '`db diff` üçün müvəqqəti baza.',
    default: 54320,
    restartRequired: R
  },
  {
    path: 'db.major_version',
    type: 'number',
    group: 'Database',
    label: 'Postgres versiyası',
    help: 'Produksiya ilə eyni olmalıdır — fərq miqrasiyaların lokalda keçib produksiyada sınmasına gətirir.',
    default: 17,
    restartRequired: R
  },
  {
    path: 'db.health_timeout',
    type: 'string',
    group: 'Database',
    label: 'Sağlamlıq gözləmə müddəti',
    default: '2m',
    restartRequired: R
  },
  {
    path: 'db.migrations.enabled',
    type: 'boolean',
    group: 'Database',
    label: 'Miqrasiyalar aktiv',
    default: true,
    restartRequired: R
  },
  {
    path: 'db.migrations.schema_paths',
    type: 'string[]',
    group: 'Database',
    label: 'Deklarativ sxem yolları',
    default: [],
    restartRequired: R
  },
  {
    path: 'db.seed.enabled',
    type: 'boolean',
    group: 'Database',
    label: 'Seed aktiv',
    default: true,
    restartRequired: R
  },
  {
    path: 'db.seed.sql_paths',
    type: 'string[]',
    group: 'Database',
    label: 'Seed faylları',
    default: ['./seed.sql'],
    restartRequired: R
  },
  {
    path: 'db.pooler.enabled',
    type: 'boolean',
    group: 'Database',
    label: 'Pooler (Supavisor)',
    default: false,
    restartRequired: R
  },
  {
    path: 'db.pooler.port',
    type: 'number',
    group: 'Database',
    label: 'Pooler portu',
    default: 54329,
    restartRequired: R
  },
  {
    path: 'db.pooler.pool_mode',
    type: 'enum',
    group: 'Database',
    label: 'Pool rejimi',
    options: ['transaction', 'session'],
    default: 'transaction',
    restartRequired: R
  },
  {
    path: 'db.pooler.default_pool_size',
    type: 'number',
    group: 'Database',
    label: 'Pool ölçüsü',
    default: 20,
    restartRequired: R
  },
  {
    path: 'db.pooler.max_client_conn',
    type: 'number',
    group: 'Database',
    label: 'Maks. klient bağlantısı',
    default: 100,
    restartRequired: R
  },
  {
    path: 'db.network_restrictions.enabled',
    type: 'boolean',
    group: 'Database',
    label: 'Şəbəkə məhdudiyyəti',
    default: false,
    restartRequired: R
  },
  {
    path: 'db.network_restrictions.allowed_cidrs',
    type: 'string[]',
    group: 'Database',
    label: 'İcazəli CIDR (v4)',
    default: ['0.0.0.0/0'],
    restartRequired: R
  },
  {
    path: 'db.network_restrictions.allowed_cidrs_v6',
    type: 'string[]',
    group: 'Database',
    label: 'İcazəli CIDR (v6)',
    default: ['::/0'],
    restartRequired: R
  },

  /* ------------------------------------------------------------ Studio */
  {
    path: 'studio.enabled',
    type: 'boolean',
    group: 'Studio',
    label: 'Studio aktiv',
    default: true,
    restartRequired: R
  },
  {
    path: 'studio.port',
    type: 'number',
    group: 'Studio',
    label: 'Studio portu',
    default: 54323,
    restartRequired: R
  },
  {
    path: 'studio.api_url',
    type: 'string',
    group: 'Studio',
    label: 'API URL',
    default: 'http://127.0.0.1',
    restartRequired: R
  },
  {
    path: 'studio.openai_api_key',
    type: 'string',
    group: 'Studio',
    label: 'OpenAI açarı',
    help: 'Studio-dakı SQL köməkçisi üçün.',
    envAllowed: true,
    secret: true,
    restartRequired: R
  },
  {
    path: 'local_smtp.enabled',
    type: 'boolean',
    group: 'Studio',
    label: 'Mailpit aktiv',
    help: 'Lokalda göndərilən e-poçtlar həqiqətən getmir, bu panelə düşür.',
    default: true,
    restartRequired: R
  },
  {
    path: 'local_smtp.port',
    type: 'number',
    group: 'Studio',
    label: 'Mailpit portu',
    default: 54324,
    restartRequired: R
  },

  /* ------------------------------------------------------------ Auth */
  {
    path: 'auth.enabled',
    type: 'boolean',
    group: 'Auth',
    label: 'Auth aktiv',
    default: true,
    restartRequired: R
  },
  {
    path: 'auth.site_url',
    type: 'string',
    group: 'Auth',
    label: 'Site URL',
    help: 'Brauzer origin-i. Login sonrası buraya qayıdılır.',
    default: 'http://localhost:3000',
    restartRequired: R
  },
  {
    path: 'auth.additional_redirect_urls',
    type: 'string[]',
    group: 'Auth',
    label: 'Əlavə redirect URL-lər',
    help: 'Wildcard dəstəklənir: http://localhost:3000/**',
    default: [],
    restartRequired: R
  },
  {
    path: 'auth.external_url',
    type: 'string',
    group: 'Auth',
    label: 'Xarici auth URL',
    help: 'Auth servisinin bayırdan görünən ünvanı (reverse proxy arxasında).',
    envAllowed: true,
    restartRequired: R
  },
  {
    path: 'auth.jwt_expiry',
    type: 'number',
    group: 'Auth',
    label: 'JWT ömrü (san.)',
    default: 3600,
    restartRequired: R
  },
  {
    path: 'auth.enable_refresh_token_rotation',
    type: 'boolean',
    group: 'Auth',
    label: 'Refresh token rotasiyası',
    default: true,
    restartRequired: R
  },
  {
    path: 'auth.refresh_token_reuse_interval',
    type: 'number',
    group: 'Auth',
    label: 'Refresh yenidən istifadə pəncərəsi (san.)',
    default: 10,
    restartRequired: R
  },
  {
    path: 'auth.enable_signup',
    type: 'boolean',
    group: 'Auth',
    label: 'Qeydiyyat açıq',
    default: true,
    restartRequired: R
  },
  {
    path: 'auth.enable_anonymous_sign_ins',
    type: 'boolean',
    group: 'Auth',
    label: 'Anonim giriş',
    default: false,
    restartRequired: R
  },
  {
    path: 'auth.enable_manual_linking',
    type: 'boolean',
    group: 'Auth',
    label: 'Əl ilə hesab bağlama',
    default: false,
    restartRequired: R
  },
  {
    path: 'auth.minimum_password_length',
    type: 'number',
    group: 'Auth',
    label: 'Min. parol uzunluğu',
    default: 6,
    restartRequired: R
  },
  {
    path: 'auth.password_requirements',
    type: 'enum',
    group: 'Auth',
    label: 'Parol tələbləri',
    options: [
      '',
      'letters_digits',
      'lower_upper_letters_digits',
      'lower_upper_letters_digits_symbols'
    ],
    default: '',
    restartRequired: R
  },
  {
    path: 'auth.web3.solana.enabled',
    type: 'boolean',
    group: 'Auth',
    label: 'Solana Web3 girişi',
    default: false,
    restartRequired: R
  },
  {
    path: 'auth.oauth_server.enabled',
    type: 'boolean',
    group: 'Auth',
    label: 'OAuth server',
    default: false,
    restartRequired: R
  },
  {
    path: 'auth.oauth_server.authorization_url_path',
    type: 'string',
    group: 'Auth',
    label: 'OAuth consent yolu',
    default: '/oauth/consent',
    restartRequired: R
  },
  {
    path: 'auth.oauth_server.allow_dynamic_registration',
    type: 'boolean',
    group: 'Auth',
    label: 'Dinamik qeydiyyat',
    default: false,
    restartRequired: R
  },

  /* ------------------------------------------------------------ Auth Email */
  {
    path: 'auth.email.enable_signup',
    type: 'boolean',
    group: 'Auth Email',
    label: 'E-poçtla qeydiyyat',
    default: true,
    restartRequired: R
  },
  {
    path: 'auth.email.double_confirm_changes',
    type: 'boolean',
    group: 'Auth Email',
    label: 'E-poçt dəyişikliyini iki dəfə təsdiqlə',
    default: true,
    restartRequired: R
  },
  {
    path: 'auth.email.enable_confirmations',
    type: 'boolean',
    group: 'Auth Email',
    label: 'Təsdiq məktubu tələb et',
    default: false,
    restartRequired: R
  },
  {
    path: 'auth.email.secure_password_change',
    type: 'boolean',
    group: 'Auth Email',
    label: 'Parol dəyişəndə köhnəni tələb et',
    default: false,
    restartRequired: R
  },
  {
    path: 'auth.email.max_frequency',
    type: 'string',
    group: 'Auth Email',
    label: 'Maks. tezlik',
    default: '1s',
    restartRequired: R
  },
  {
    path: 'auth.email.otp_length',
    type: 'number',
    group: 'Auth Email',
    label: 'OTP uzunluğu',
    default: 6,
    restartRequired: R
  },
  {
    path: 'auth.email.otp_expiry',
    type: 'number',
    group: 'Auth Email',
    label: 'OTP ömrü (san.)',
    default: 3600,
    restartRequired: R
  },
  {
    path: 'auth.email.smtp.enabled',
    type: 'boolean',
    group: 'Auth Email',
    label: 'Xarici SMTP',
    default: false,
    restartRequired: R
  },
  {
    path: 'auth.email.smtp.host',
    type: 'string',
    group: 'Auth Email',
    label: 'SMTP host',
    envAllowed: true,
    restartRequired: R
  },
  {
    path: 'auth.email.smtp.port',
    type: 'number',
    group: 'Auth Email',
    label: 'SMTP port',
    default: 587,
    restartRequired: R
  },
  {
    path: 'auth.email.smtp.user',
    type: 'string',
    group: 'Auth Email',
    label: 'SMTP istifadəçi',
    envAllowed: true,
    restartRequired: R
  },
  {
    path: 'auth.email.smtp.pass',
    type: 'string',
    group: 'Auth Email',
    label: 'SMTP parol',
    envAllowed: true,
    secret: true,
    restartRequired: R
  },
  {
    path: 'auth.email.smtp.admin_email',
    type: 'string',
    group: 'Auth Email',
    label: 'Göndərən e-poçt',
    envAllowed: true,
    restartRequired: R
  },
  {
    path: 'auth.email.smtp.sender_name',
    type: 'string',
    group: 'Auth Email',
    label: 'Göndərən adı',
    envAllowed: true,
    restartRequired: R
  },

  /* ------------------------------------------------------------ Auth SMS */
  {
    path: 'auth.sms.enable_signup',
    type: 'boolean',
    group: 'Auth SMS',
    label: 'SMS ilə qeydiyyat',
    default: false,
    restartRequired: R
  },
  {
    path: 'auth.sms.enable_confirmations',
    type: 'boolean',
    group: 'Auth SMS',
    label: 'SMS təsdiqi',
    default: false,
    restartRequired: R
  },
  {
    path: 'auth.sms.template',
    type: 'string',
    group: 'Auth SMS',
    label: 'Şablon',
    default: 'Your code is {{ .Code }}',
    restartRequired: R
  },
  {
    path: 'auth.sms.max_frequency',
    type: 'string',
    group: 'Auth SMS',
    label: 'Maks. tezlik',
    default: '5s',
    restartRequired: R
  },
  {
    path: 'auth.sms.twilio.enabled',
    type: 'boolean',
    group: 'Auth SMS',
    label: 'Twilio',
    default: false,
    restartRequired: R
  },
  {
    path: 'auth.sms.twilio.account_sid',
    type: 'string',
    group: 'Auth SMS',
    label: 'Account SID',
    envAllowed: true,
    restartRequired: R
  },
  {
    path: 'auth.sms.twilio.message_service_sid',
    type: 'string',
    group: 'Auth SMS',
    label: 'Message Service SID',
    envAllowed: true,
    restartRequired: R
  },
  {
    path: 'auth.sms.twilio.auth_token',
    type: 'string',
    group: 'Auth SMS',
    label: 'Auth token',
    envAllowed: true,
    secret: true,
    restartRequired: R
  },

  /* ------------------------------------------------------------ Auth MFA */
  {
    path: 'auth.mfa.max_enrolled_factors',
    type: 'number',
    group: 'Auth MFA',
    label: 'Maks. faktor sayı',
    default: 10,
    restartRequired: R
  },
  {
    path: 'auth.mfa.totp.enroll_enabled',
    type: 'boolean',
    group: 'Auth MFA',
    label: 'TOTP qeydiyyatı',
    default: false,
    restartRequired: R
  },
  {
    path: 'auth.mfa.totp.verify_enabled',
    type: 'boolean',
    group: 'Auth MFA',
    label: 'TOTP yoxlaması',
    default: false,
    restartRequired: R
  },
  {
    path: 'auth.mfa.phone.enroll_enabled',
    type: 'boolean',
    group: 'Auth MFA',
    label: 'Telefon qeydiyyatı',
    default: false,
    restartRequired: R
  },
  {
    path: 'auth.mfa.phone.verify_enabled',
    type: 'boolean',
    group: 'Auth MFA',
    label: 'Telefon yoxlaması',
    default: false,
    restartRequired: R
  },
  {
    path: 'auth.mfa.phone.otp_length',
    type: 'number',
    group: 'Auth MFA',
    label: 'OTP uzunluğu',
    default: 6,
    restartRequired: R
  },
  {
    path: 'auth.mfa.phone.template',
    type: 'string',
    group: 'Auth MFA',
    label: 'SMS şablonu',
    default: 'Your code is {{ .Code }}',
    restartRequired: R
  },
  {
    path: 'auth.mfa.phone.max_frequency',
    type: 'string',
    group: 'Auth MFA',
    label: 'Maks. tezlik',
    default: '5s',
    restartRequired: R
  },

  /* ------------------------------------------------------------ Rate limits */
  {
    path: 'auth.rate_limit.email_sent',
    type: 'number',
    group: 'Auth Rate limits',
    label: 'E-poçt / saat',
    default: 2,
    restartRequired: R
  },
  {
    path: 'auth.rate_limit.sms_sent',
    type: 'number',
    group: 'Auth Rate limits',
    label: 'SMS / saat',
    default: 30,
    restartRequired: R
  },
  {
    path: 'auth.rate_limit.anonymous_users',
    type: 'number',
    group: 'Auth Rate limits',
    label: 'Anonim istifadəçi / saat',
    default: 30,
    restartRequired: R
  },
  {
    path: 'auth.rate_limit.token_refresh',
    type: 'number',
    group: 'Auth Rate limits',
    label: 'Token refresh / 5 dəq.',
    default: 150,
    restartRequired: R
  },
  {
    path: 'auth.rate_limit.sign_in_sign_ups',
    type: 'number',
    group: 'Auth Rate limits',
    label: 'Giriş/qeydiyyat / 5 dəq.',
    default: 30,
    restartRequired: R
  },
  {
    path: 'auth.rate_limit.token_verifications',
    type: 'number',
    group: 'Auth Rate limits',
    label: 'Token yoxlaması / 5 dəq.',
    default: 30,
    restartRequired: R
  },
  {
    path: 'auth.rate_limit.web3',
    type: 'number',
    group: 'Auth Rate limits',
    label: 'Web3 / 5 dəq.',
    default: 30,
    restartRequired: R
  },

  /* ------------------------------------------------------------ Storage */
  {
    path: 'storage.enabled',
    type: 'boolean',
    group: 'Storage',
    label: 'Storage aktiv',
    default: true,
    restartRequired: R
  },
  {
    path: 'storage.file_size_limit',
    type: 'string',
    group: 'Storage',
    label: 'Fayl həcmi limiti',
    default: '50MiB',
    restartRequired: R
  },
  {
    path: 'storage.s3_protocol.enabled',
    type: 'boolean',
    group: 'Storage',
    label: 'S3 protokolu',
    default: true,
    restartRequired: R
  },
  {
    path: 'storage.image_transformation.enabled',
    type: 'boolean',
    group: 'Storage',
    label: 'Şəkil çevirmə (imgproxy)',
    help: 'Ayrıca konteyner qaldırır. Şəkil resize/format çevirməsi lazım deyilsə bağlı saxla.',
    default: false,
    restartRequired: R
  },
  {
    path: 'storage.analytics.enabled',
    type: 'boolean',
    group: 'Storage',
    label: 'Analytics bucket-ləri (Iceberg)',
    default: false,
    restartRequired: R
  },
  {
    path: 'storage.analytics.max_catalogs',
    type: 'number',
    group: 'Storage',
    label: 'Maks. katalog',
    default: 2,
    restartRequired: R
  },
  {
    path: 'storage.analytics.max_namespaces',
    type: 'number',
    group: 'Storage',
    label: 'Maks. namespace',
    default: 5,
    restartRequired: R
  },
  {
    path: 'storage.analytics.max_tables',
    type: 'number',
    group: 'Storage',
    label: 'Maks. cədvəl',
    default: 10,
    restartRequired: R
  },
  {
    path: 'storage.vector.enabled',
    type: 'boolean',
    group: 'Storage',
    label: 'Vector bucket-ləri',
    default: false,
    restartRequired: R
  },
  {
    path: 'storage.vector.max_buckets',
    type: 'number',
    group: 'Storage',
    label: 'Maks. bucket',
    default: 10,
    restartRequired: R
  },
  {
    path: 'storage.vector.max_indexes',
    type: 'number',
    group: 'Storage',
    label: 'Maks. indeks',
    default: 5,
    restartRequired: R
  },

  /* ------------------------------------------------------------ Realtime */
  {
    path: 'realtime.enabled',
    type: 'boolean',
    group: 'Realtime',
    label: 'Realtime aktiv',
    default: true,
    restartRequired: R
  },
  {
    path: 'realtime.ip_version',
    type: 'enum',
    group: 'Realtime',
    label: 'IP versiyası',
    options: ['IPv4', 'IPv6'],
    restartRequired: R
  },
  {
    path: 'realtime.max_header_length',
    type: 'number',
    group: 'Realtime',
    label: 'Maks. başlıq uzunluğu',
    default: 4096,
    restartRequired: R
  },

  /* ------------------------------------------------------------ Functions */
  {
    path: 'edge_runtime.enabled',
    type: 'boolean',
    group: 'Functions',
    label: 'Edge runtime aktiv',
    default: true,
    restartRequired: R
  },
  {
    path: 'edge_runtime.policy',
    type: 'enum',
    group: 'Functions',
    label: 'Sorğu siyasəti',
    options: ['per_worker', 'oneshot'],
    help: '`per_worker` hot reload verir; simlink çox olan repo-larda `oneshot`-a keç.',
    default: 'per_worker',
    restartRequired: R
  },
  {
    path: 'edge_runtime.inspector_port',
    type: 'number',
    group: 'Functions',
    label: 'İnspektor portu',
    default: 8083,
    restartRequired: R
  },
  {
    path: 'edge_runtime.deno_version',
    type: 'number',
    group: 'Functions',
    label: 'Deno versiyası',
    default: 2,
    restartRequired: R
  },

  /* ------------------------------------------------------------ Analytics */
  {
    path: 'analytics.enabled',
    type: 'boolean',
    group: 'Analytics',
    label: 'Analytics (Logflare)',
    help: 'Lokalda ən tez sınan hissədir; lazım deyilsə bağlı saxla.',
    default: false,
    restartRequired: R
  },
  {
    path: 'analytics.port',
    type: 'number',
    group: 'Analytics',
    label: 'Port',
    default: 54327,
    restartRequired: R
  },
  {
    path: 'analytics.backend',
    type: 'enum',
    group: 'Analytics',
    label: 'Backend',
    options: ['postgres', 'bigquery'],
    default: 'postgres',
    restartRequired: R
  },

  /* ------------------------------------------------------------ Experimental */
  {
    path: 'experimental.orioledb_version',
    type: 'string',
    group: 'Experimental',
    label: 'OrioleDB versiyası',
    default: '',
    restartRequired: R
  },
  {
    path: 'experimental.s3_host',
    type: 'string',
    group: 'Experimental',
    label: 'S3 host',
    envAllowed: true,
    restartRequired: R
  },
  {
    path: 'experimental.s3_region',
    type: 'string',
    group: 'Experimental',
    label: 'S3 region',
    envAllowed: true,
    restartRequired: R
  },
  {
    path: 'experimental.s3_access_key',
    type: 'string',
    group: 'Experimental',
    label: 'S3 access key',
    envAllowed: true,
    secret: true,
    restartRequired: R
  },
  {
    path: 'experimental.s3_secret_key',
    type: 'string',
    group: 'Experimental',
    label: 'S3 secret key',
    envAllowed: true,
    secret: true,
    restartRequired: R
  },
  {
    path: 'experimental.pgdelta.enabled',
    type: 'boolean',
    group: 'Experimental',
    label: 'pg-delta diff mühərriki',
    help: 'Bağlansa köhnə `migra` mühərrikinə qayıdılır.',
    default: true,
    restartRequired: R
  }
]

export const CONFIG_GROUPS = [
  'General',
  'API',
  'Database',
  'Studio',
  'Auth',
  'Auth Email',
  'Auth SMS',
  'Auth MFA',
  'Auth Rate limits',
  'Storage',
  'Realtime',
  'Functions',
  'Analytics',
  'Experimental'
] as const

export const FIELD_BY_PATH = new Map(CONFIG_FIELDS.map((f) => [f.path, f]))

/** If any of these paths changed, the stack needs a restart. */
export function needsRestart(paths: string[]): boolean {
  return paths.some((p) => FIELD_BY_PATH.get(p)?.restartRequired ?? true)
}
