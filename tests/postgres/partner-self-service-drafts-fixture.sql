-- Minimal disposable fixtures for the actual canonical RPC and draft migration.
-- Loaded only by the in-memory PGlite runtime runner, never into a hosted target.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth, public to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
create type public.user_role as enum ('customer','partner','admin');
create type public.property_type as enum ('hotel','resort','vacation_home');
create table public.profiles (id uuid primary key references auth.users(id), role public.user_role not null);
alter table public.profiles enable row level security;
create policy profile_owner_read on public.profiles for select to authenticated using (id = auth.uid());
grant select on public.profiles to authenticated;
create table public.properties (id uuid primary key, active boolean not null default false);
create table public.partners (id uuid primary key);
create table public.hotel_commercial_agreement_execution_evidence (id uuid primary key);
create table public.partner_applications (
  id uuid primary key default gen_random_uuid(), property_name text not null,
  contact_name text not null, email text not null, property_type public.property_type not null,
  star_rating smallint check (star_rating in (4,5)), contact_role text,
  phone text, website_url text, address_line1 text, city text, region text, postal_code text,
  country text, description text, amenities text[], photo_source_url text, additional_notes text,
  hotel_authorized boolean not null default false, content_rights_confirmed boolean not null default false,
  information_accurate boolean not null default false, property_id uuid,
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  created_at timestamptz not null default now(), legal_business_name text,
  support_contact_email text, country_code text, primary_image_url text,
  representative_authority_confirmed boolean not null default false,
  commercial_terms_version_acknowledged text, commercial_terms_acknowledged boolean not null default false,
  commercial_terms_acknowledged_at timestamptz
);
create unique index one_pending_partner_application_per_email_and_property
  on public.partner_applications (lower(trim(email)), lower(trim(property_name))) where status = 'pending';
alter table public.partner_applications enable row level security;
create policy application_admin_read on public.partner_applications for select to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
grant select on public.partner_applications to authenticated;
insert into auth.users values
  ('10000000-0000-4000-8000-000000000001','owner-a@example.com',now()),
  ('10000000-0000-4000-8000-000000000002','owner-b@example.com',now()),
  ('10000000-0000-4000-8000-000000000003','unconfirmed@example.com',null),
  ('10000000-0000-4000-8000-000000000004','admin@example.com',now());
insert into public.profiles select id, case when email = 'admin@example.com' then 'admin'::public.user_role else 'customer'::public.user_role end from auth.users;
