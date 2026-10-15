begin;

alter table public.property_pms_connections
  add column if not exists vendor_account_reference text;

alter table public.property_pms_connections
  drop constraint if exists property_pms_connections_vendor_account_reference_format;

alter table public.property_pms_connections
  add constraint property_pms_connections_vendor_account_reference_format check (
    vendor_account_reference is null
    or (
      length(btrim(vendor_account_reference)) between 1 and 120
      and vendor_account_reference ~ '^[A-Za-z0-9._:/-]+$'
    )
  );

comment on column public.property_pms_connections.vendor_account_reference is
  'Optional non-secret vendor account or subscription identifier used for certification intake. Never stores credentials.';

commit;
