begin;

alter table public.inventory_supplier_validation_evidence
  drop constraint inventory_supplier_validation_evidence_supplier_id_check;

alter table public.inventory_supplier_validation_evidence
  add constraint inventory_supplier_validation_evidence_supplier_id_check
    check (supplier_id in ('ratehawk', 'expedia-rapid'));

comment on table public.inventory_supplier_validation_evidence is
  'Server-recorded, non-secret RateHawk and Expedia Rapid sandbox validation evidence. Never stores credentials or raw supplier responses.';

commit;
