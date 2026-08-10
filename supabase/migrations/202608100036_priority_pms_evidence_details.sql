begin;

alter table public.priority_pms_launch_evidence
  add column if not exists vendor_approval_reference text,
  add column if not exists approved_environment text,
  add column if not exists property_code text,
  add column if not exists support_contact text,
  add column if not exists verification_notes text;

alter table public.priority_pms_launch_evidence
  drop constraint if exists priority_pms_launch_evidence_details_length,
  add constraint priority_pms_launch_evidence_details_length check (
    length(coalesce(vendor_approval_reference, '')) <= 500
    and length(coalesce(approved_environment, '')) <= 200
    and length(coalesce(property_code, '')) <= 200
    and length(coalesce(support_contact, '')) <= 500
    and length(coalesce(verification_notes, '')) <= 4000
  );

comment on column public.priority_pms_launch_evidence.vendor_approval_reference is
  'Non-secret vendor case, agreement, or certification reference.';
comment on column public.priority_pms_launch_evidence.approved_environment is
  'Non-secret name of the vendor-approved sandbox or production environment.';
comment on column public.priority_pms_launch_evidence.property_code is
  'Non-secret vendor property identifier or portfolio scope.';
comment on column public.priority_pms_launch_evidence.support_contact is
  'Non-secret vendor support or escalation contact.';
comment on column public.priority_pms_launch_evidence.verification_notes is
  'Non-secret operational evidence notes; credentials and secrets are prohibited.';

commit;

