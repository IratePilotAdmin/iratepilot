begin;

alter table public.priority_pms_launch_evidence
  drop constraint if exists priority_pms_launch_evidence_provider_id_check;

alter table public.priority_pms_launch_evidence
  add constraint priority_pms_launch_evidence_provider_id_check check (provider_id in (
    'oracle-opera', 'hilton-pep', 'hilton-onq', 'marriott-fosse', 'marriott-fs-pms', 'hotelkey',
    'oracle-opera-5', 'infor-hms', 'agilysys-pms', 'planet-protel', 'mews', 'stayntouch',
    'cloudbeds', 'sihot', 'rms-cloud', 'maestro-pms', 'apaleo', 'shiji-pms', 'guestline',
    'ezee-absolute', 'clock-pms-plus', 'hotelogix'
  ));

comment on table public.priority_pms_launch_evidence is
  'Admin-confirmed non-secret evidence for PMS production launch gates.';

commit;
