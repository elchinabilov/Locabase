/**
 * Mənbə lüğət (Azərbaycan) — bütün UI mətni əvvəl bura köçürülür, `en.ts`
 * onun tərcüməsidir. Açar adları componentin adı ilə üst-üstə düşür ki,
 * hansı faylda işlədildiyini tapmaq asan olsun.
 */
const az = {
  common: {
    close: 'Bağla',
    cancel: 'Ləğv et',
    save: 'Yadda saxla',
    delete: 'Sil',
    loading: 'yüklənir',
    checking: 'yoxlanılır',
    add: 'Əlavə et'
  },
  app: {
    nav: {
      dashboard: 'Ümumi',
      config: 'Konfiqurasiya',
      auth: 'Auth',
      tables: 'Cədvəllər',
      sql: 'SQL',
      secrets: 'Secrets',
      migrations: 'Miqrasiyalar',
      functions: 'Funksiyalar',
      sync: 'Sync / Deploy',
      settings: 'Ayarlar'
    },
    sidebar: {
      projects: 'Layihələr',
      addProject: 'Layihə əlavə et',
      emptyBeforePlus: 'Hələ layihə yoxdur.',
      emptyAfterPlus: 'ilə yeni layihə qur və ya `supabase/` qovluğu olan repo-nu aç.'
    },
    selectProject: {
      title: 'Əvvəlcə layihə seç',
      hint: 'Sol tərəfdən layihə əlavə et.'
    }
  },
  newProject: {
    addTitle: 'Layihə əlavə et',
    choiceNew: {
      label: 'Yeni layihə',
      hint: 'Seçilən qovluqda `supabase init` işlədilir, portlar boş bloka salınır.'
    },
    choiceOpen: {
      label: 'Mövcud layihəni aç',
      hint: 'İçində `supabase/config.toml` olan qovluq. Heç nə dəyişdirilmir.'
    },
    title: 'Yeni layihə',
    addExisting: 'Mövcud layihə kimi əlavə et',
    build: 'Qur',
    folder: {
      label: 'Qovluq',
      hint: '`supabase/` bunun içində yaranacaq'
    },
    name: {
      label: 'Ad',
      hintSuffix: '— konteyner adları bundan törəyir',
      hintEmpty: 'Ən azı bir hərf və ya rəqəm lazımdır'
    },
    portBase: {
      label: 'Port bloku',
      searching: 'Boş blok axtarılır…',
      hint: 'api · db · studio → {ports} (digər layihələrlə toqquşmasın deyə)'
    },
    occupiedBefore: 'Bu qovluqda artıq',
    occupiedAfter: 'var. Üstündən yazmırıq — layihəni olduğu kimi əlavə edə bilərsən.',
    willRunBefore: 'işlədiləcək, sonra',
    willRunAfter: 'və portlar yazılacaq. Loglar aşağıdakı panelə düşür.'
  },
  settings: {
    title: 'Ayarlar',
    appearance: {
      title: 'Görünüş',
      subtitle: 'Rəng sxemi',
      system: 'Sistemə uyğun',
      light: 'İşıqlı',
      dark: 'Qaranlıq'
    },
    typography: {
      title: 'Şrift',
      subtitle: 'İnterfeys və SQL redaktoru',
      interfaceFont: 'İnterfeys şrifti',
      textSize: 'Mətn ölçüsü',
      editorFont: 'SQL redaktoru şrifti',
      editorSize: 'SQL redaktoru ölçüsü',
      unavailable: 'quraşdırılmayıb',
      previewText: 'Qırmızı ağacın altında sakit axşam — 0123456789',
      previewCode: 'select * from public.posts where id = 42;',
      reset: 'Standarta qaytar',
      scale: {
        small: 'Kiçik',
        default: 'Standart',
        large: 'Böyük',
        larger: 'Daha böyük'
      }
    },
    language: {
      title: 'Dil'
    },
    doctor: {
      title: 'Mühit yoxlaması',
      subtitle: 'Tool bu əmrlərə arxalanır',
      present: 'var',
      absent: 'yox'
    },
    ports: {
      title: 'Portlar',
      nextFreeBefore: 'Növbəti boş aralıq:',
      nextFreeAfter: '— yeni layihə üçün api {api}, db {db}, studio {studio}.',
      conflicts: 'Toqquşan portlar: {ports}'
    }
  },
  dashboard: {
    empty: {
      title: 'Layihə əlavə edilməyib',
      hintBefore: 'Boş qovluqda sıfırdan yeni layihə qur, ya da içində',
      hintAfter: 'olan repo-nu aç. Mövcud layihədə tool heç nə kopyalamır — bütün fayllar olduğu yerdə qalır.',
      newProject: 'Yeni layihə',
      openProject: 'Mövcud layihəni aç'
    },
    status: {
      running: 'işləyir',
      stopped: 'dayanıb'
    },
    actions: {
      restart: 'Restart',
      stop: 'Dayandır',
      start: 'Başlat',
      dbReset: 'db reset'
    },
    portConflict: 'Port toqquşması: {ports} — eyni port bir neçə layihədə yazılıb. Konfiqurasiya ekranından portları başqa 100-lük aralığa keçir.',
    needsRestart: {
      message: 'Servis keçidi `config.toml`-a yazıldı. Konteynerlər yalnız restartdan sonra dəyişəcək.',
      now: 'İndi restart et',
      later: 'sonra'
    },
    lastCheck: 'Sonuncu yoxlama: {time}',
    services: {
      title: 'Servislər',
      checking: 'docker yoxlanılır…',
      disabled: 'söndürülüb',
      restartNeeded: 'restart lazım',
      subtitle: '{running} / {total} işləyir',
      ramSuffix: ' · {size} RAM',
      logButton: 'log',
      noContainers: 'Konteyner yoxdur — keçidlər `config.toml`-u göstərir, stack qalxanda vəziyyət də gələcək.',
      note: {
        imgproxy: 'Şəkil çevirmə. Storage bağlıdırsa onsuz da qalxmır.',
        analytics: 'Lokalda ən ağır və ən tez sınan servis. Lazım deyilsə bağlı saxla.'
      }
    },
    quickLinks: {
      title: 'Sürətli linklər',
      empty: 'Stack qalxanda ünvanlar burada görünür.',
      copy: 'kopyala',
      open: 'aç'
    },
    environments: {
      title: 'Remote mühitlər',
      add: 'Əlavə et',
      sync: 'Sync',
      empty: 'Mühit yoxdur. Managed (supabase.com) və ya self-hosted (SSH) mühit əlavə edib lokal ilə fərqi görə bilərsən.',
      managed: 'managed',
      selfHosted: 'self-hosted'
    },
    reset: {
      title: 'db reset',
      confirmButton: 'Bazanı sıfırla',
      body: 'Lokal baza tamamilə silinir və bütün miqrasiyalar boş bazaya yenidən tətbiq olunur. Seed faylı da işə düşür.',
      dataLoss: 'Lokal data itir.',
      confirmLabel: 'Təsdiq üçün «{name}» yaz',
      genericError: 'Uğursuz oldu'
    }
  },
  auth: {
    title: 'Auth providerlər',
    changeCount: '{count} dəyişiklik',
    saveEllipsis: 'Yadda saxla…',
    copied: 'kopyalandı ✓',
    callbackHint:
      'Bu ünvan provider konsoluna yapışdırılır (Google Cloud Console → Credentials, GitHub → OAuth Apps, LinkedIn → Auth). Lokal port dəyişəndə bu URL də dəyişir — provider tərəfdə də yeniləməyi unutma.',
    providers: 'Providerlər',
    activeCount: '{active} aktiv / {total}',
    noKey: 'açar yoxdur',
    collapse: 'bağla',
    settings: 'ayarlar',
    bindEnvTitle: '.env dəyişəninə bağla (CLI-nin gözlədiyi adla)',
    defaultName: 'standart ad',
    diffTitle: 'Auth dəyişiklikləri',
    writeFile: 'Faylı yaz',
    diffChangedLines: '{count} sətir dəyişir. Provider açarları `env()`-ə bağlıdırsa dəyərləri Secrets ekranından yaz.',
    restartRequired: 'Restart tələb olunur.',
    fieldLabel: {
      clientId: 'Client ID',
      secret: 'Client secret',
      url: 'Provider URL',
      redirectUri: 'Redirect URI (override)',
      skipNonceCheck: 'Nonce yoxlamasını atla',
      emailOptional: 'E-poçt məcburi deyil'
    },
    providerHint: {
      apple: 'Services ID `client_id`-dir, `secret` isə imzalanmış JWT-dir (6 ayda bir yenilənir). Native iOS girişi üçün `skip_nonce_check` lazım ola bilər.',
      azure: '`url` tenant endpoint-idir: https://login.microsoftonline.com/<tenant>/v2.0',
      github: 'GitHub Developer Settings → OAuth Apps → Authorization callback URL.',
      gitlab: 'Self-hosted GitLab üçün `url` instansiyanın ünvanıdır.',
      google: 'Google Cloud Console → Credentials → OAuth 2.0 Client (Web) → Authorized redirect URI.',
      keycloak: '`url` realm ünvanıdır: https://<host>/realms/<realm>',
      linkedinOidc: 'Provider adı `linkedin_oidc`-dir, köhnə `linkedin` deyil — tətbiq də bu adı göndərməlidir.'
    }
  },
  fieldEditor: {
    varNamePlaceholder: 'DƏYİŞƏN_ADI',
    none: '(yoxdur)',
    commaSeparated: 'vergüllə ayır',
    changed: 'dəyişib',
    defaultTitle: 'faylda yoxdur — default işləyir',
    default: 'default',
    hide: 'gizlət',
    reveal: 'göstər',
    bindEnvTitle: '.env faylındakı dəyişənə bağla',
    currentValue: 'hazırkı dəyər:',
    missingInEnv: '.env-də yoxdur'
  },
  config: {
    title: 'Konfiqurasiya',
    searchPlaceholder: 'sahə axtar…',
    savedRestartMessage:
      'Dəyişikliklər yazıldı, amma konteynerlərə hələ çatmayıb — Supabase konfiqurasiyanı yalnız başlanğıcda oxuyur.',
    searchResults: 'Axtarış: {count} sahə',
    defaultHint: 'Faylda olmayan sahələr default dəyərlə göstərilir.',
    fieldNotFound: 'Sahə tapılmadı.',
    previewTitle: 'Dəyişikliklərin önizləməsi',
    previewChangedLines: '{count} sətir dəyişir. Şərhlər və sıra olduğu kimi qalır; yazmazdan əvvəl',
    previewBackupSuffix: 'nüsxəsi götürülür.',
    previewRestartRequired: 'Dəyişiklik restart tələb edir.',
    fields: {
  project_id: { label: 'Project ID', help: 'Konteyner və volume adlarını bağlayan açar. Dəyişsən köhnə baza sahibsiz qalır.' },
  api: {
    enabled: { label: 'API aktiv' },
    port: { label: 'Port' },
    schemas: { label: 'Açıq sxemlər', help: 'Data API-nin göstərdiyi sxemlər.' },
    extra_search_path: { label: 'Əlavə search_path' },
    max_rows: { label: 'Maks. sətir' },
    tls: {
      enabled: { label: 'TLS (https)' },
    },
  },
  db: {
    port: { label: 'Postgres portu' },
    shadow_port: { label: 'Shadow port', help: '`db diff` üçün müvəqqəti baza.' },
    major_version: { label: 'Postgres versiyası', help: 'Produksiya ilə eyni olmalıdır — fərq miqrasiyaların lokalda keçib produksiyada sınmasına gətirir.' },
    health_timeout: { label: 'Sağlamlıq gözləmə müddəti' },
    migrations: {
      enabled: { label: 'Miqrasiyalar aktiv' },
      schema_paths: { label: 'Deklarativ sxem yolları' },
    },
    seed: {
      enabled: { label: 'Seed aktiv' },
      sql_paths: { label: 'Seed faylları' },
    },
    pooler: {
      enabled: { label: 'Pooler (Supavisor)' },
      port: { label: 'Pooler portu' },
      pool_mode: { label: 'Pool rejimi' },
      default_pool_size: { label: 'Pool ölçüsü' },
      max_client_conn: { label: 'Maks. klient bağlantısı' },
    },
    network_restrictions: {
      enabled: { label: 'Şəbəkə məhdudiyyəti' },
      allowed_cidrs: { label: 'İcazəli CIDR (v4)' },
      allowed_cidrs_v6: { label: 'İcazəli CIDR (v6)' },
    },
  },
  studio: {
    enabled: { label: 'Studio aktiv' },
    port: { label: 'Studio portu' },
    api_url: { label: 'API URL' },
    openai_api_key: { label: 'OpenAI açarı', help: 'Studio-dakı SQL köməkçisi üçün.' },
  },
  local_smtp: {
    enabled: { label: 'Mailpit aktiv', help: 'Lokalda göndərilən e-poçtlar həqiqətən getmir, bu panelə düşür.' },
    port: { label: 'Mailpit portu' },
  },
  auth: {
    enabled: { label: 'Auth aktiv' },
    site_url: { label: 'Site URL', help: 'Brauzer origin-i. Login sonrası buraya qayıdılır.' },
    additional_redirect_urls: { label: 'Əlavə redirect URL-lər', help: 'Wildcard dəstəklənir: http://localhost:3000/**' },
    external_url: { label: 'Xarici auth URL', help: 'Auth servisinin bayırdan görünən ünvanı (reverse proxy arxasında).' },
    jwt_expiry: { label: 'JWT ömrü (san.)' },
    enable_refresh_token_rotation: { label: 'Refresh token rotasiyası' },
    refresh_token_reuse_interval: { label: 'Refresh yenidən istifadə pəncərəsi (san.)' },
    enable_signup: { label: 'Qeydiyyat açıq' },
    enable_anonymous_sign_ins: { label: 'Anonim giriş' },
    enable_manual_linking: { label: 'Əl ilə hesab bağlama' },
    minimum_password_length: { label: 'Min. parol uzunluğu' },
    password_requirements: { label: 'Parol tələbləri' },
    web3: {
      solana: {
        enabled: { label: 'Solana Web3 girişi' },
      },
    },
    oauth_server: {
      enabled: { label: 'OAuth server' },
      authorization_url_path: { label: 'OAuth consent yolu' },
      allow_dynamic_registration: { label: 'Dinamik qeydiyyat' },
    },
    email: {
      enable_signup: { label: 'E-poçtla qeydiyyat' },
      double_confirm_changes: { label: 'E-poçt dəyişikliyini iki dəfə təsdiqlə' },
      enable_confirmations: { label: 'Təsdiq məktubu tələb et' },
      secure_password_change: { label: 'Parol dəyişəndə köhnəni tələb et' },
      max_frequency: { label: 'Maks. tezlik' },
      otp_length: { label: 'OTP uzunluğu' },
      otp_expiry: { label: 'OTP ömrü (san.)' },
      smtp: {
        enabled: { label: 'Xarici SMTP' },
        host: { label: 'SMTP host' },
        port: { label: 'SMTP port' },
        user: { label: 'SMTP istifadəçi' },
        pass: { label: 'SMTP parol' },
        admin_email: { label: 'Göndərən e-poçt' },
        sender_name: { label: 'Göndərən adı' },
      },
    },
    sms: {
      enable_signup: { label: 'SMS ilə qeydiyyat' },
      enable_confirmations: { label: 'SMS təsdiqi' },
      template: { label: 'Şablon' },
      max_frequency: { label: 'Maks. tezlik' },
      twilio: {
        enabled: { label: 'Twilio' },
        account_sid: { label: 'Account SID' },
        message_service_sid: { label: 'Message Service SID' },
        auth_token: { label: 'Auth token' },
      },
    },
    mfa: {
      max_enrolled_factors: { label: 'Maks. faktor sayı' },
      totp: {
        enroll_enabled: { label: 'TOTP qeydiyyatı' },
        verify_enabled: { label: 'TOTP yoxlaması' },
      },
      phone: {
        enroll_enabled: { label: 'Telefon qeydiyyatı' },
        verify_enabled: { label: 'Telefon yoxlaması' },
        otp_length: { label: 'OTP uzunluğu' },
        template: { label: 'SMS şablonu' },
        max_frequency: { label: 'Maks. tezlik' },
      },
    },
    rate_limit: {
      email_sent: { label: 'E-poçt / saat' },
      sms_sent: { label: 'SMS / saat' },
      anonymous_users: { label: 'Anonim istifadəçi / saat' },
      token_refresh: { label: 'Token refresh / 5 dəq.' },
      sign_in_sign_ups: { label: 'Giriş/qeydiyyat / 5 dəq.' },
      token_verifications: { label: 'Token yoxlaması / 5 dəq.' },
      web3: { label: 'Web3 / 5 dəq.' },
    },
  },
  storage: {
    enabled: { label: 'Storage aktiv' },
    file_size_limit: { label: 'Fayl həcmi limiti' },
    s3_protocol: {
      enabled: { label: 'S3 protokolu' },
    },
    image_transformation: {
      enabled: { label: 'Şəkil çevirmə (imgproxy)', help: 'Ayrıca konteyner qaldırır. Şəkil resize/format çevirməsi lazım deyilsə bağlı saxla.' },
    },
    analytics: {
      enabled: { label: 'Analytics bucket-ləri (Iceberg)' },
      max_catalogs: { label: 'Maks. katalog' },
      max_namespaces: { label: 'Maks. namespace' },
      max_tables: { label: 'Maks. cədvəl' },
    },
    vector: {
      enabled: { label: 'Vector bucket-ləri' },
      max_buckets: { label: 'Maks. bucket' },
      max_indexes: { label: 'Maks. indeks' },
    },
  },
  realtime: {
    enabled: { label: 'Realtime aktiv' },
    ip_version: { label: 'IP versiyası' },
    max_header_length: { label: 'Maks. başlıq uzunluğu' },
  },
  edge_runtime: {
    enabled: { label: 'Edge runtime aktiv' },
    policy: { label: 'Sorğu siyasəti', help: '`per_worker` hot reload verir; simlink çox olan repo-larda `oneshot`-a keç.' },
    inspector_port: { label: 'İnspektor portu' },
    deno_version: { label: 'Deno versiyası' },
  },
  analytics: {
    enabled: { label: 'Analytics (Logflare)', help: 'Lokalda ən tez sınan hissədir; lazım deyilsə bağlı saxla.' },
    port: { label: 'Port' },
    backend: { label: 'Backend' },
  },
  experimental: {
    orioledb_version: { label: 'OrioleDB versiyası' },
    s3_host: { label: 'S3 host' },
    s3_region: { label: 'S3 region' },
    s3_access_key: { label: 'S3 access key' },
    s3_secret_key: { label: 'S3 secret key' },
    pgdelta: {
      enabled: { label: 'pg-delta diff mühərriki', help: 'Bağlansa köhnə `migra` mühərrikinə qayıdılır.' },
    },
  },
}
  },
  diffView: {
    noDiff: 'Fərq yoxdur.'
  },
  logDrawer: {
    title: 'Loglar',
    filterPlaceholder: 'filtr…',
    clear: 'təmizlə',
    empty: 'Hələ log yoxdur.'
  },
  remoteServices: {
    title: 'Remote servislər',
    managedHint:
      'Managed layihədə ayrı-ayrı servisləri söndürmək mümkün deyil — supabase.com onları özü idarə edir və belə bir API yoxdur. RAM idarəsi yalnız self-hosted mühitlərdə var.',
    refresh: 'yenilə',
    checkingServer: 'serverə baxılır',
    required: 'məcburi',
    stopHint:
      'Burada söndürmək `docker stop`-dur. Coolify növbəti deploy-da konteyneri yenidən qaldıra bilər — davamlı söndürmək üçün servisin compose faylından çıxar.'
  },
  envPicker: {
    local: 'Lokal',
    localBadge: 'lokal',
    managedLine1: 'Management API ilə işləyir: sütun tipləri yoxdur, eyniadlı sütunlar birləşir.',
    managedLine2: '«Yalnız oxu» Supabase-in API-si tərəfindən tətbiq olunur.',
    selfHostedLine1: 'SSH + psql ilə işləyir: bir nəticə bloku göstərilir, xəta mövqeyi işarələnmir.',
    selfHostedLine2: '«Yalnız oxu» serverdə `begin read only` ilə tətbiq olunur.',
    cancelHint: 'Sorğunu ləğv etmək yalnız lokalda mümkündür.',
    checkingDb: 'baza yoxlanılır…',
    dbDownTitle: 'Lokal baza işləmir',
    dbDownHintBefore: 'Bu ekran lokal Postgres-ə birbaşa qoşulur.',
    dbDownHintAfter: 'səhifəsindən stack-i başlat — və ya yuxarıdakı seçimdən uzaq mühitə keç.'
  },
  envForm: {
    editTitle: 'Mühit — {name}',
    newTitle: 'Yeni remote mühit',
    name: { label: 'Ad', hint: 'production, staging, …' },
    kind: {
      label: 'Növ',
      managed: 'Managed — supabase.com',
      selfHosted: 'Self-hosted — SSH + Docker'
    },
    projectRef: { label: 'Project ref' },
    accessToken: {
      label: 'Access token',
      hintSaved: 'Saxlanılıb. Yeni dəyər yazsan əvəzlənəcək.',
      hintNew: 'supabase.com → Account → Access Tokens. Sistem açar anbarında şifrələnir.'
    },
    sshHost: { label: 'SSH host', hint: '`root@server` və ya ~/.ssh/config-dakı alias' },
    sshPort: { label: 'SSH port' },
    sshKey: { label: 'SSH açarı', hint: 'Boş buraxsan ssh-agent və default açarlar işlənir' },
    dbContainer: {
      label: 'Postgres konteyneri',
      hint: "serverdə: docker ps --format '{{.Names}}' | grep supabase-db"
    },
    remoteDir: { label: 'Servis qovluğu', hint: 'Coolify: /data/coolify/services/<id>' },
    functionsContainer: {
      label: 'Edge runtime konteyneri',
      hint: 'Boş qalsa funksiya deploy-u söndürülür'
    },
    apiUrl: { label: 'API URL' },
    siteUrl: { label: 'Site URL' },
    backupDir: { label: 'Yedək qovluğu' },
    backupRetention: { label: 'Yedək saxlama (gün)' }
  },
  functionDiff: {
    status: {
      same: 'eyni',
      changed: 'fərqli',
      localOnly: 'yalnız lokal',
      remoteOnly: 'yalnız remote'
    },
    drift: {
      same: 'üst-üstə düşür',
      changed: 'məzmun fərqlidir',
      localOnly: 'remote-da yoxdur',
      remoteOnly: 'yalnız remote',
      unknown: 'bilinmir'
    },
    title: 'Fərq — {name}',
    fetching: 'Uzaq mənbə gətirilir…',
    summary: '{fileCount} fayl · {changed} · sol (−) uzaq, sağ (+) lokal',
    noDiff: 'fərq yoxdur',
    filesDiffer: '{count} fayl fərqlidir',
    fileNotFound: 'Fayl tapılmadı.',
    binaryFile: 'Binar və ya çox böyük fayl — məzmun göstərilmir.'
  },
  functions: {
    title: 'Funksiyalar',
    localOnly: 'Yalnız lokal',
    serveRunning: 'serve işləyir — dayandır',
    localServe: 'lokal serve',
    newFunction: '+ funksiya',
    deployAll: 'Hamısını deploy',
    staleWarning: '{count} funksiya remote-da yoxdur: {names}',
    count: '{count} funksiya',
    empty: 'Funksiya yoxdur. «+ funksiya» ilə şablondan yarat.',
    remoteOnly: 'yalnız remote',
    fileCount: '{count} fayl',
    remoteStatus: 'remote: {status}',
    verifyJwtTitle: 'Bazadan pg_net ilə çağrılan funksiyalarda JWT yoxlaması söndürülməlidir',
    diff: 'fərq',
    deploy: 'deploy',
    verifyJwtHint:
      '`verify_jwt` söndürüləndə `config.toml`-a `[functions.<ad>]` bloku yazılır — həm lokal serve, həm də deploy eyni ayarı görür.',
    newTitle: 'Yeni funksiya',
    deployTitle: 'Deploy — {count} funksiya',
    deployFailed: 'Deploy uğursuz oldu',
    deployNow: 'Deploy et',
    deployConfirm:
      '{names} — {env} mühitinə göndəriləcək. Self-hosted mühitdə qovluq rsync olunur və edge runtime konteyneri restart edilir.',
    templateHint: '`supabase/functions/{name}/index.ts` şablondan yaradılır.',
    namePlaceholder: 'ad',
    create: 'Yarat'
  },
  sync: {
    noEnv: {
      title: 'Remote mühit yoxdur',
      hint: 'Managed (supabase.com) və ya self-hosted (SSH + Docker) mühit əlavə et — sonra lokal ilə arasındakı fərqi bir ekranda görəcəksən.'
    },
    addEnv: 'Mühit əlavə et',
    envSettings: 'Mühit ayarları',
    computeDiff: 'Fərqi hesabla',
    computedAt: 'hesablandı: {time}',
    dryRun: 'Quru rejim (dry-run)',
    beforeReport: '«Fərqi hesabla» ilə beş ox oxunur: miqrasiyalar, sxem, funksiyalar, secret adları, auth.',
    schema: 'Sxem (db diff)',
    schemaClean: 'Lokal sxem miqrasiyalarla üst-üstə düşür.',
    viewDiff: 'fərqə bax',
    secretNames: 'Secret adları',
    localOnly: 'yalnız lokal',
    secretsClean: 'Açar adları üst-üstə düşür.',
    authConfig: 'Auth konfiqurasiyası',
    selectedCount: '{count} seçilib',
    hasDiff: 'fərq var',
    cleanAxis: 'təmiz',
    deployTitle: 'Deploy → {name}',
    start: 'Başlat',
    step: {
      backup: 'Yedək (sxem dəyişikliyindən əvvəl, həmişə)',
      migrations: 'Miqrasiyalar: {list}',
      functions: 'Funksiyalar: {list}',
      secrets: 'Secrets: {list}',
      verify: 'Yoxlama (REST, auth, tətbiq)'
    },
    managedMigrationWarning:
      'Managed mühitdə seçmə miqrasiya tətbiqi yoxdur — `supabase db push` gözləyən bütün miqrasiyaları sıra ilə tətbiq edir.'
  },
  secrets: {
    showValues: 'dəyərləri göstər',
    addVar: '+ dəyişən',
    write: 'Yaz',
    missingHeading: '{count} referens boşdur — `config.toml` bu dəyişənləri gözləyir, `.env`-də yoxdur:',
    cardTitle: 'Lokal backend dəyişənləri',
    cardSubtitle: 'Supabase CLI `config.toml`-dakı hər env() referensini buradan oxuyur',
    fileEmpty: '{file} faylı boşdur və ya yoxdur.',
    unused: 'config.toml-dan istifadə olunmur',
    footerHint:
      'Maskalanmış sahəyə klikləyəndə xana təmizlənir — maska mətnini təsadüfən yazmamaq üçün. Dəyişikliklər fayla yazılandan sonra stack-i restart et; CLI `.env`-i yalnız başlanğıcda oxuyur.',
    newVarTitle: 'Yeni dəyişən',
    value: 'Dəyər',
    expectedNames: 'config.toml-un gözlədiyi boş adlar:'
  },
  migrations: {
    state: {
      synced: 'sinxron',
      pendingLocal: 'lokala tətbiq olunmayıb',
      pendingRemote: 'remote-da yoxdur',
      remoteOnly: 'faylı yoxdur',
      localOnly: 'faylı yoxdur (lokal)'
    },
    newMigration: '+ miqrasiya',
    applyLocal: 'Lokala tətbiq et',
    localLedger: 'lokal ledger {status}',
    remoteLedger: 'remote ledger {status}',
    read: 'oxundu',
    unreachable: 'əlçatmaz',
    count: '{count} miqrasiya',
    cardSubtitle: 'fayllar · lokal ledger · remote ledger',
    empty: 'supabase/migrations qovluğu boşdur.',
    col: {
      version: 'Versiya',
      name: 'Ad',
      file: 'Fayl',
      local: 'Lokal',
      remote: 'Remote',
      state: 'Vəziyyət'
    },
    footerHint:
      'SQL-i Studio-dan tətbiq etmə: ledger sətri yazılmır və növbəti deploy ya faylı təkrar işlədir, ya da heç vaxt olmamış işi atlayır. Bir dəyişiklik = bir versiya nömrəsi.',
    diffTitle: 'db diff — lokal sxemdə tutulmayan dəyişikliklər',
    newTitle: 'Yeni miqrasiya',
    nameHint: 'Yalnız kiçik hərf, rəqəm və alt xətt. Fayl `supabase/migrations/<versiya>_{name}.sql` kimi yaranır.',
    repairTitle: 'Ledger təmiri — {version}',
    repairBodyBefore: '«{env}» mühitinin ledger-i düzəldilir.',
    repairBodyBold: 'Heç bir SQL işə düşmür',
    repairBodyAfter:
      '— yalnız `supabase_migrations.schema_migrations` cədvəlindəki sətir dəyişir. Yalnız obyektlərin həqiqətən bazada olub-olmadığını təsdiqlədikdən sonra istifadə et.',
    markApplied: '«tətbiq olunub» kimi işarələ (sətri əlavə et)',
    markReverted: '«geri qaytarılıb» kimi işarələ (sətri sil)'
  },
  dataGrid: {
    noRows: 'Sətir yoxdur',
    clickForFullValue: 'Tam dəyər üçün klikləyin'
  },
  sql: {
    starterComment: '⌘↵ / Ctrl+↵ ilə işlət',
    timeout: { '5s': '5 san.', '30s': '30 san.', '2m': '2 dəq.' },
    resizeQueries: 'Sorğu siyahısının enini dəyiş',
    resizeResults: 'Nəticə panelinin hündürlüyünü dəyiş',
    queries: 'Sorğular',
    noSaved: 'Hələ saxlanmış sorğu yoxdur.',
    sharedViaGit: '— git ilə paylaşılır.',
    untitled: 'Adsız sorğu',
    readOnly: 'yalnız oxu',
    rowCount: '{count} sətir',
    saveAsMigration: 'Miqrasiya kimi saxla',
    run: 'İşlət ⌘↵',
    writeModeOn:
      'Yazma rejimi açıqdır{target}. Sxemi dəyişirsənsə — «Miqrasiya kimi saxla», əks halda ledger ilə baza arasında drift yaranır.',
    writeModeTarget: ' — hədəf «{name}»',
    running: 'işləyir…',
    noResult: 'Nəticə yoxdur.',
    multiStatementHint: 'Bir neçə ifadə = bir tranzaksiya.',
    firstRows: 'ilk {count} sətir',
    error: 'Xəta',
    rowsAffected: '{command} — {count} sətir təsirləndi.',
    notInLedger: 'Burada işlədilən SQL miqrasiya ledger-inə yazılmır.',
    saveQueryTitle: 'Sorğunu saxla',
    saveQueryHint: 'Hərf, rəqəm, boşluq, `_` və `-`. Fayl `supabase/.locabase/queries/<ad>.sql` kimi yaranır.',
    deleteConfirmTitle: '«{name}» silinsin?',
    fileDeletedFromDisk: 'Fayl diskdən silinir.',
    errorField: {
      code: 'kod',
      detail: 'detal',
      hint: 'ipucu',
      constraint: 'constraint',
      table: 'cədvəl',
      column: 'sütun'
    },
    dbUnreachable: 'Lokal baza işləmir — əvvəlcə stack-i başlat.',
    goToError: 'Səhv yerə keç'
  },
  tables: {
    resizeSidebar: 'Cədvəl siyahısının enini dəyiş',
    op: { isnull: 'boşdur', notnull: 'boş deyil' },
    kind: {
      table: 'cədvəl',
      partitioned: 'partisiyalı',
      view: 'görünüş',
      materialized: 'materializə',
      foreign: 'xarici'
    },
    systemSchemaLabel: '{name} · sistem',
    searchTables: 'cədvəl axtar…',
    noTablesInSchema: 'Bu sxemdə cədvəl yoxdur.',
    systemSchemas: 'sistem sxemləri',
    selectTable: 'Cədvəl seç',
    selectTableHint: 'Sol tərəfdən bir cədvəl və ya görünüş seç.',
    tabRows: 'Sətirlər',
    tabStructure: 'Struktur',
    addRow: '+ sətir',
    deleteRows: '{count} sətri sil',
    notEditable: '{reason} — sətirlər redaktə olunmur.',
    edit: 'redaktə',
    newRowTitle: 'Yeni sətir — {schema}.{table}',
    editRowTitle: 'Sətri redaktə et — {schema}.{table}',
    removeFilter: 'Filtri sil',
    addFilter: '+ filtr',
    addFilterTitle: 'Filtr əlavə et',
    selectColumn: 'sütun seç…',
    value: 'dəyər',
    valueNotNeeded: 'dəyər tələb olunmur',
    col: {
      column: 'Sütun',
      type: 'Tip',
      default: 'Default',
      attributes: 'Xüsusiyyət'
    },
    ddlHint:
      'DDL burada yoxdur — cədvəl və sütun dəyişikliyi miqrasiya faylı ilə getməlidir, əks halda ledger ilə baza arasında drift yaranır.',
    default: 'default',
    deleteConfirmTitle: '{count} sətir silinsin?',
    irreversible: 'Bu əməliyyat geri qaytarılmır.'
  }
} as const

export default az
