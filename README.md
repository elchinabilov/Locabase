# Supabase GUI

Lokal Supabase stack-ini idarə etmək, `config.toml`-u forma üzərindən redaktə
etmək və lokal ilə remote (managed **və** self-hosted) arasındakı fərqi görüb
deploy etmək üçün masaüstü alət.

Self-hosted Supabase Studio auth provider, secret və funksiya ekranlarını
vermir — həmin ayarlar yalnız `supabase/config.toml`-da yaşayır. Bu alət həmin
boşluğu doldurur: **hər şey UI-dan, faylı əl ilə açmadan.**

## Nə edir

| Ekran | Nə verir |
| --- | --- |
| **Ümumi** | Konteyner sağlamlığı, start/stop/restart/`db reset`, Studio·Mailpit·API·DB linkləri, port toqquşması xəbərdarlığı |
| **Konfiqurasiya** | `config.toml`-un 108 sahəsi forma kimi, 14 qrupda; diff önizləməsi, restart banneri |
| **Auth** | 19 OAuth provider, callback URL-in avtomatik hesablanması, `env()` bağlantısı |
| **Secrets** | Kök `.env` redaktoru, maskalama, `config.toml`-un gözlədiyi boş referenslərin siyahısı |
| **Miqrasiyalar** | Fayllar · lokal ledger · remote ledger yan-yana; new/up/diff/repair |
| **Funksiyalar** | Siyahı, şablondan yaratma, lokal serve, `verify_jwt`, tək-tək və ya toplu deploy |
| **Sync / Deploy** | Beş ox üzrə fərq (miqrasiya, sxem, funksiya, secret, auth), seçmə deploy, quru rejim |

## Qurulma

```bash
npm install
npm run dev
```

macOS `.dmg` üçün:

```bash
npm run dist:mac
```

## Tələblər

`supabase` CLI, Docker (və ya OrbStack), self-hosted mühitlər üçün `ssh` və
`rsync`. Hamısını **Ayarlar → Mühit yoxlaması** ekranı göstərir.

## Arxitektura

```
src/
  shared/            # main ↔ renderer paylaşılan tiplər, IPC kontraktı,
                     # config sahə metadata-sı, provider siyahısı
  main/core/
    toml/            # şərh qoruyan config.toml yamaqlayıcısı (scan + patch)
    remote/          # RemoteAdapter: managed.ts (CLI + Management API),
                     # selfhosted.ts (ssh + docker exec + rsync)
    ...              # projects, stack, docker, ports, config, envfile,
                     # migrations, functions, sync, secrets, log, cli
  renderer/src/      # React 19 + Tailwind 4, öz kiçik UI primitivləri
```

### Şərh qoruyan TOML yamaqlayıcısı

Layihələrin `config.toml` faylları sıx şərhlərlə doludur, yenidən-serializasiya
edən heç bir JS TOML kitabxanası isə onları saxlamır. Buradakı yanaşma
**cərrahidir**: fayl bir dəfə skan olunur, hər açarın dəyərinin offset aralığı
tapılır, dəyişən açarda **yalnız o aralıq** əvəz olunur.

Yazmazdan əvvəl nəticə `smol-toml` ilə yenidən parse olunur və hər yamağın
gözlənilən dəyəri verdiyi yoxlanılır — uyğunsuzluqda heç nə yazılmır. Hər
yazımda `config.toml.bak` nüsxəsi qalır.

Testlər üç real layihənin `config.toml` faylı (1085 sətir) üzərində işləyir:
yamaqsız keçid bayt-bayt eyni nəticə verməli, `auth.jwt_expiry` dəyişikliyi isə
**tam bir sətir** fərq yaratmalıdır.

### Təhlükəsizlik qaydaları

- Secret dəyərləri **heç vaxt** CLI arqumenti deyil: managed tərəfdə
  `secrets set --env-file` (0600, müvəqqəti), self-hosted tərəfdə stdin.
- Bütün log sətirləri `redact()`-dən keçir: JWT, `sb_secret_`, `sbp_`,
  `KEY=dəyər` və Postgres URL-indəki parol gizlədilir.
- Remote access token-lər `safeStorage`-də (Keychain / DPAPI / libsecret).
- `db reset` və remote deploy layihə adının yazılması ilə təsdiqlənir.
- Remote sxem dəyişikliyindən əvvəl **həmişə** yedək alınır.

## Testlər

```bash
npm test
```

37 test: TOML yamaqlayıcısı (19), `.env` redaktoru (12), log redaksiyası (6).

## Bilinən məhdudiyyətlər

- Managed mühitdə seçmə miqrasiya tətbiqi yoxdur — `supabase db push` gözləyən
  bütün miqrasiyaları tətbiq edir. UI bunu deploy təsdiqində xəbərdarlıq kimi
  göstərir.
- Auth konfiqurasiyasının remote ilə müqayisəsi hələ yoxdur; managed tərəfdə
  `supabase config push`, self-hosted tərəfdə serverin `.env`-i işlədilir.
- İmzalama, notarization və auto-update daxil edilməyib (şəxsi build).
