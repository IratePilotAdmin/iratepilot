begin;

alter table public.property_pms_connections
  drop constraint if exists property_pms_connections_provider_id_check;

alter table public.property_pms_connections
  add constraint property_pms_connections_provider_id_check check (provider_id in (
    'oracle-opera', 'hilton-pep', 'hilton-onq', 'marriott-fosse',
    'marriott-fs-pms', 'hotelkey', 'oracle-opera-5', 'infor-hms',
    'agilysys-pms', 'planet-protel', 'mews', 'stayntouch', 'cloudbeds',
    'sihot', 'rms-cloud', 'maestro-pms', 'apaleo', 'shiji-pms',
    'guestline', 'ezee-absolute', 'clock-pms-plus', 'hotelogix',
    'thinkreservations', 'siteminder', 'roomraccoon', 'anand-systems'
  ));

comment on constraint property_pms_connections_provider_id_check
  on public.property_pms_connections is
  'Approved PMS integration catalog. A listed provider still requires vendor approval, property authorization, sandbox validation, and production activation.';

commit;
