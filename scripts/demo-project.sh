#!/usr/bin/env bash
#
# Creates the demo Supabase project the README screenshots are taken against.
# It is a throwaway project — nothing here is part of the app.
#
#   ./scripts/demo-project.sh          # create + start it
#   ./scripts/demo-project.sh --stop   # stop the stack again
#
# Requires the `supabase` CLI and a running Docker (or OrbStack).

set -euo pipefail

DEMO="${LOCABASE_DEMO_DIR:-$HOME/locabase-demo}"
PORT_BASE="${LOCABASE_DEMO_PORT_BASE:-583}"

if [[ "${1:-}" == "--stop" ]]; then
  cd "$DEMO" && supabase stop
  exit 0
fi

mkdir -p "$DEMO"
cd "$DEMO"

if [[ ! -f supabase/config.toml ]]; then
  supabase init
fi

# `project_id` names the containers; the ports move into their own block of 100
# so the demo stack never collides with a real project on the same machine.
python3 - "$PORT_BASE" <<'PY'
import re, sys
base = sys.argv[1]
path = 'supabase/config.toml'
s = open(path, encoding='utf-8').read()
s = re.sub(r'(?m)^project_id = ".*"$', 'project_id = "demo"', s)
s = re.sub(r'(?m)^(\s*(?:port|shadow_port|smtp_port|pop3_port|inspector_port)\s*=\s*)543(\d\d)',
           lambda m: f"{m.group(1)}{base}{m.group(2)}", s)
s = re.sub(r'(?m)^(\s*inspector_port\s*=\s*)8083$', rf'\g<1>{base}83', s)

if '[auth.external.github]' not in s:
    extra = '''
[auth.external.github]
enabled = true
client_id = "demo-github-client-id"
# DO NOT commit your OAuth provider secret to git. Use environment variable substitution instead:
secret = "env(SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET)"
redirect_uri = ""
url = ""

[auth.external.google]
enabled = true
client_id = "demo-google-client-id.apps.googleusercontent.com"
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"
redirect_uri = ""
url = ""
skip_nonce_check = true
'''
    i = s.index('[auth.external.apple]')
    j = s.index('\n[', i + 10)
    s = s[:j] + '\n' + extra.strip('\n') + '\n' + s[j:]

open(path, 'w', encoding='utf-8').write(s)
PY

mkdir -p supabase/migrations supabase/functions/send-welcome-email supabase/.locabase/queries

cat > supabase/migrations/20260101000000_init.sql <<'SQL'
-- Demo schema: a tiny blog used for the Locabase screenshots.

create table public.authors (
  id           bigint generated always as identity primary key,
  handle       text not null unique,
  display_name text not null,
  joined_at    timestamptz not null default now()
);

create table public.posts (
  id           bigint generated always as identity primary key,
  author_id    bigint not null references public.authors (id) on delete cascade,
  title        text not null,
  slug         text not null unique,
  body         text,
  published    boolean not null default false,
  views        integer not null default 0,
  published_at timestamptz,
  created_at   timestamptz not null default now()
);

create index posts_author_idx on public.posts (author_id);

alter table public.authors enable row level security;
alter table public.posts enable row level security;

create policy "posts are readable by everyone"
  on public.posts for select
  using (published);
SQL

cat > supabase/seed.sql <<'SQL'
-- Seed for the local database. `supabase db reset` applies this file.

insert into public.authors (handle, display_name) values
  ('ada', 'Ada Lovelace'),
  ('grace', 'Grace Hopper'),
  ('alan', 'Alan Turing'),
  ('katherine', 'Katherine Johnson');

insert into public.posts (author_id, title, slug, body, published, views, published_at) values
  (1, 'Notes on the Analytical Engine', 'analytical-engine', 'The engine weaves algebraic patterns.', true, 1284, now() - interval '9 days'),
  (1, 'On loops and recurrences', 'loops-and-recurrences', 'A draft about repetition.', false, 0, null),
  (2, 'Debugging, literally', 'debugging-literally', 'A moth in relay 70, panel F.', true, 8420, now() - interval '6 days'),
  (2, 'Compilers should read like English', 'compilers-english', 'Why write in machine code?', true, 3311, now() - interval '4 days'),
  (3, 'On computable numbers', 'computable-numbers', 'A machine with an infinite tape.', true, 15750, now() - interval '3 days'),
  (3, 'Can machines think?', 'can-machines-think', 'An imitation game.', true, 9902, now() - interval '2 days'),
  (4, 'Orbital mechanics by hand', 'orbital-mechanics', 'Check the numbers, then check again.', true, 6140, now() - interval '1 day'),
  (4, 'Trajectory notes', 'trajectory-notes', 'Working draft.', false, 0, null);
SQL

cat > supabase/migrations/20260114120000_post_views_index.sql <<'SQL'
-- Reading the "most viewed" list got slow once posts crossed 100k rows.
create index posts_views_idx on public.posts (views desc) where published;
SQL

cat > supabase/migrations/20260220093000_add_post_tags.sql <<'SQL'
create table public.tags (
  id   bigint generated always as identity primary key,
  name text not null unique
);

create table public.post_tags (
  post_id bigint not null references public.posts (id) on delete cascade,
  tag_id  bigint not null references public.tags (id) on delete cascade,
  primary key (post_id, tag_id)
);
SQL

# Deliberately left unapplied: the Migrations screen should show one pending row.
cat > supabase/migrations/20260305141500_add_post_search.sql <<'SQL'
alter table public.posts add column search tsvector
  generated always as (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))) stored;

create index posts_search_idx on public.posts using gin (search);
SQL

cat > supabase/functions/send-welcome-email/index.ts <<'TS'
// Sends a welcome email to a newly registered author.
// Call it with: POST ${SUPABASE_URL}/functions/v1/send-welcome-email

Deno.serve(async (req: Request) => {
  const { handle } = await req.json()
  if (typeof handle !== 'string') {
    return new Response(JSON.stringify({ error: 'handle is required' }), { status: 400 })
  }
  return new Response(JSON.stringify({ sent: true, handle }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
TS

mkdir -p supabase/functions/generate-og-image supabase/functions/_shared

cat > supabase/functions/_shared/cors.ts <<'TS'
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}
TS

cat > supabase/functions/generate-og-image/index.ts <<'TS'
// Renders an Open Graph image for a post and caches it in storage.
// Call it with: GET ${SUPABASE_URL}/functions/v1/generate-og-image?slug=...

import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  const slug = new URL(req.url).searchParams.get('slug')
  if (!slug) {
    return new Response(JSON.stringify({ error: 'slug is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
  return new Response(JSON.stringify({ slug, cached: false }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
TS

cat > 'supabase/.locabase/queries/top posts.sql' <<'SQL'
-- Most-read published posts, with their author.
select p.title,
       a.display_name as author,
       p.views,
       p.published_at::date as published
from public.posts p
join public.authors a on a.id = p.author_id
where p.published
order by p.views desc
limit 10;
SQL

cat > .env <<'ENV'
# Local secrets for the demo project — gitignored in a real repo.
SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET=demo-github-client-secret
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=demo-google-client-secret
RESEND_API_KEY=demo-resend-api-key
ENV

supabase start

echo
echo "Demo project ready at $DEMO — now run: npm run screenshots"
