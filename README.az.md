<img src="resources/logo-128.png" width="64" alt="Locabase">

# Locabase

Lokal Supabase stack-ini idarə etmək, `config.toml`-u forma üzərindən redaktə
etmək və lokal ilə remote (managed **və** self-hosted) arasındakı fərqi görüb
deploy etmək üçün masaüstü alət.

Self-hosted Supabase Studio auth provider, secret və funksiya ekranlarını
vermir — həmin ayarlar yalnız `supabase/config.toml`-da yaşayır. Bu alət həmin
boşluğu doldurur: **hər şey UI-dan, faylı əl ilə açmadan.**

## Nə edir

| Ekran             | Nə verir                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ümumi**         | Servis keçidləri (on/off) + **konteyner başına RAM**, start/stop/restart/`db reset`, Studio·Mailpit·API·DB linkləri, port toqquşması xəbərdarlığı                         |
| **Konfiqurasiya** | `config.toml`-un 108 sahəsi forma kimi, 14 qrupda; diff önizləməsi, restart banneri                                                                                       |
| **Auth**          | 19 OAuth provider, callback URL-in avtomatik hesablanması, `env()` bağlantısı                                                                                             |
| **Secrets**       | Kök `.env` redaktoru, maskalama, `config.toml`-un gözlədiyi boş referenslərin siyahısı                                                                                    |
| **Cədvəllər**     | Sxem/cədvəl siyahısı, sətirlərə baxış (filtr, sıralama, səhifələmə), sətir əlavə/redaktə/sil, struktur (tip, PK, FK, default)                                             |
| **SQL**           | CodeMirror redaktoru (sxem avtotamamlaması, ⌘↵), yalnız-oxu rejimi, çoxifadəli skript nəticələri, sorğuların repo-da saxlanması, «miqrasiya kimi saxla»                   |
| **Miqrasiyalar**  | Fayllar · lokal ledger · remote ledger yan-yana; new/up/diff/repair                                                                                                       |
| **Funksiyalar**   | Siyahı, şablondan yaratma, lokal serve, `verify_jwt`, tək-tək və ya toplu deploy                                                                                          |
| **Sync / Deploy** | Beş ox üzrə fərq (miqrasiya, sxem, funksiya, secret, auth), **funksiyaların fayl-fayl məzmun diffi**, seçmə deploy, quru rejim, **remote konteynerlərin on/off və RAM-ı** |

## Layihə əlavə etmək

Sol paneldəki **+** iki yol verir:

- **Yeni layihə** — seçilmiş qovluqda `supabase init` işlədilir (`supabase/`
  qovluğu orada yaranır), sonra `project_id` verdiyin addan törədilir və
  portlar **boş 100-lük bloka** köçürülür (543xx tutulubsa 553xx, 563xx…), ona
  görə yeni stack köhnələrlə toqquşmur. Ardınca `migrations/`, `functions/`,
  `seed.sql` və `supabase/.gitignore` tamamlanır.
- **Mövcud layihəni aç** — içində `supabase/config.toml` olan qovluq registry-yə
  yazılır. Heç nə kopyalanmır və heç nə dəyişdirilmir.

Qovluqda artıq `config.toml` varsa, «Yeni layihə» üstündən yazmır — sadəcə onu
olduğu kimi əlavə etməyi təklif edir.

## SQL və cədvəl redaktoru

Hər iki ekranın yuxarısında **mühit seçimi** var. Default **lokal**-dır
(`127.0.0.1:<config.toml db.port>`) və elə qalır — uzaq mühit yalnız açıq
seçimlə işə düşür.

Nəqliyyat mühitə görə dəyişir, sorğu mətnləri isə eynidir:

| Mühit       | Necə gedir                        | Məhdudiyyət                                                                                |
| ----------- | --------------------------------- | ------------------------------------------------------------------------------------------ |
| Lokal       | `pg` sürücüsü, `$n` parametrləri  | —                                                                                          |
| Managed     | Management API `database/query`   | Sütun tipləri yoxdur, eyniadlı sütunlar birləşir, `read_only` API tərəfindən tətbiq olunur |
| Self-hosted | SSH + `docker exec psql -q --csv` | Bir nəticə bloku, xəta mövqeyi yoxdur                                                      |

Uzaq nəqliyyatda `$n` bağlana bilmədiyinə görə **bizim qurduğumuz** sorğularda
dəyər `quoteLiteral()` ilə yapışdırılır (istifadəçinin SQL-i heç vaxt buradan
keçmir). Sorğunu ləğv etmək (`pg_cancel_backend`) yalnız lokalda mümkündür.

Uzaq mühitdə sətir yazmaq `json_agg` sarğısından yox, birbaşa yuxarı səviyyəli
ifadədən keçir — Postgres datanı dəyişən CTE-nin alt sorğuda olmasına icazə
vermir.

**Yalnız oxu default açıqdır** və hər açılışda sıfırlanır. Yazma server tərəfdə
bloklanır (lokal və self-hosted: `begin read only`; managed: API-nin
`read_only` bayrağı), SQL-i regex ilə yoxlamaqla yox — çünki
`with x as (delete … returning *) select * from x` istənilən regex-i keçir.

Əhatə qəsdən asimmetrikdir: **cədvəl redaktorunda DDL yoxdur** (yalnız sətir
CRUD-u), **SQL redaktorunda isə tam SQL var** — biri bələdçili UI, digəri güc
alətidir. Sxemi SQL redaktorundan dəyişirsənsə, «Miqrasiya kimi saxla» ilə
faylı da yarat: əks halda ledger ilə baza arasında drift yaranır.

PK-sı olmayan cədvəlin sətirləri redaktə olunmur (Studio-nun `ctid` fallback-i
qəsdən tətbiq edilməyib — `ctid` hər `UPDATE`-dən və `VACUUM FULL`-dan sonra
dəyişir, ona görə səhv sətri yeniləmək riski var). Görünüşlər də yalnız oxunur.

Saxlanmış sorğular `supabase/.locabase/queries/<ad>.sql` faylıdır — commit
olunur ki, komanda paylaşsın. Şəxsi saxlamaq üçün `.gitignore`-a
`supabase/.locabase/` əlavə et.

## Funksiya fərqi

Self-hosted mühitdə uzaq faylların md5-i **bir** ssh çağırışı ilə oxunur, ona
görə siyahı «üst-üstə düşür / məzmun fərqlidir / remote-da yoxdur» kimi dəqiq
vəziyyət göstərir — versiya nömrəsi ilə təxmin etmir. Managed tərəfdə
Management API fayl siyahısı vermir, vəziyyət `bilinmir` qalır.

«Fərqə bax» uzaq mənbəni **tələb üzərinə** gətirir (self-hosted: ssh + base64;
managed: `functions download` müvəqqəti iş qovluğuna — layihənin öz
`supabase/functions/` qovluğu heç vaxt üstündən yazılmır) və fayl-fayl diff
göstərir: `−` uzaqdakı, `+` lokaldakı sətir. 512 KB-dan böyük və binar fayllar
siyahıda qalır, məzmunu açılmır.

## Servis keçidləri və RAM

Lokal stack 9 konteynerlə ~1 GiB yeyir. Ən ağır hissələr çox vaxt lazım
olmur — `Logflare + Vector`, `Studio + pg-meta`, `Realtime`, `Imgproxy`.

**Ümumi** ekranındakı hər keçid `config.toml`-dakı bir `enabled` açarına
bağlıdır (eyni açarı bölüşən konteynerlər bir sətirdə birləşir: `api.enabled`
→ Kong + PostgREST). Söndürmək konteyneri dayandırmır — CLI-yə onu
ümumiyyətlə qaldırmamağı deyir, ona görə dəyişiklik **restartdan sonra**
qüvvəyə minir və ekran bunu banner kimi göstərir.

Yanında hər servisin RAM istifadəsi var (docker `MEM USAGE` ilə eyni
hesablama: xam `usage`-dan səhifə keşi çıxılır), başlıqda isə cəmi.

Self-hosted mühitdə **Sync / Deploy** ekranı serverin konteynerlərini eyni
şəkildə göstərir; oradakı keçid isə birbaşa `docker stop` / `docker start`-dır.
Managed layihədə belə idarəetmə yoxdur — platforma servisləri özü idarə edir və
kart bunu açıq deyir.

## Qurulma

```bash
npm install
npm run dev
```

macOS `.dmg` üçün:

```bash
npm run dist:mac
```

İkonlar `resources/*.svg`-dən doğulur; SVG dəyişəndə yenidən çək:

```bash
npm run icons
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

45 test: TOML yamaqlayıcısı (19), `.env` redaktoru (12), servis kataloqu və
RAM formatı (8), log redaksiyası (6).

## Ad və ikon

Tətbiq əvvəl «Supabase GUI» adlanırdı. Electron istifadəçi qovluğunu ad
üzərindən qurduğuna görə ilk açılışda köhnə registry avtomatik köçürülür
(`src/main/core/userdata.ts`) — köhnə qovluq silinmir.

İşarə iki yumru primitivdən qurulan «L»-dir: şaquli sap (_local_) və onun
oturduğu geniş plita (_base_). İkisi ayrı tonda olduğuna görə birləşmə
nöqtəsində tikiş görünür — forma bütöv oxunsa da, konstruksiya seçilir.
Rasterləşdirməni `scripts/make-icons.mjs` Electron-un Chromium-u ilə edir,
sistemdə əlavə alət tələb olunmur.

## Bilinən məhdudiyyətlər

- Managed mühitdə seçmə miqrasiya tətbiqi yoxdur — `supabase db push` gözləyən
  bütün miqrasiyaları tətbiq edir. UI bunu deploy təsdiqində xəbərdarlıq kimi
  göstərir.
- Auth konfiqurasiyasının remote ilə müqayisəsi hələ yoxdur; managed tərəfdə
  `supabase config push`, self-hosted tərəfdə serverin `.env`-i işlədilir.
- SQL redaktorunda çoxifadəli skript **bir implicit tranzaksiyadır** (psql-dən
  fərqli): üçüncü ifadə xəta versə, birinci ikisi də geri qaytarılır.
- Sətir limiti nəticə main prosesə yığıldıqdan sonra tətbiq olunur; çox böyük
  `select`-də əvvəlcə `statement_timeout` kəsir.
- Cədvəl redaktorunda offset paginasiya işlədilir — böyük cədvəldə uzaq
  səhifələr yavaşdır (keyset paginasiya sonraya).
- İmzalama, notarization və auto-update daxil edilməyib (şəxsi build).
