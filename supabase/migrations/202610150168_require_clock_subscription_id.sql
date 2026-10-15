begin;

alter table public.property_pms_connections
  drop constraint if exists property_pms_connections_vendor_account_reference_format;

alter table public.property_pms_connections
  add constraint property_pms_connections_vendor_account_reference_format check (
    (provider_id <> 'clock-pms-plus' or vendor_account_reference is not null)
    and (
      vendor_account_reference is null
      or (
        length(btrim(vendor_account_reference)) between 1 and 120
        and vendor_account_reference ~ '^[A-Za-z0-9._:/-]+$'
      )
    )
  );

comment on constraint property_pms_connections_vendor_account_reference_format
  on public.property_pms_connections is
  'Requires a non-secret Subscription ID for Clock PMS+ and validates optional vendor references for other providers.';

commit;
