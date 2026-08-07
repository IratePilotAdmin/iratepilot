-- Store Expo push tokens under the authenticated customer who registered them.
create table if not exists public.mobile_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null,
  platform text not null check (platform in ('ios', 'android')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expo_push_token)
);

create index if not exists mobile_push_tokens_user_id_idx
  on public.mobile_push_tokens (user_id);

alter table public.mobile_push_tokens enable row level security;

drop policy if exists "Users manage their mobile push tokens" on public.mobile_push_tokens;
create policy "Users manage their mobile push tokens"
  on public.mobile_push_tokens
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on table public.mobile_push_tokens from anon;
grant select, insert, update, delete on table public.mobile_push_tokens to authenticated;
