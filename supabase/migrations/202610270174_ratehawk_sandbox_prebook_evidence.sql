begin;

alter table public.inventory_supplier_validation_evidence
  drop constraint inventory_supplier_validation_evidence_validation_kind_check;

alter table public.inventory_supplier_validation_evidence
  add column price_changed boolean,
  add constraint inventory_supplier_validation_evidence_validation_kind_check
    check (validation_kind in ('hotel_search', 'hotel_prebook')),
  add constraint inventory_supplier_validation_evidence_price_changed_check
    check (
      (validation_kind = 'hotel_search' and price_changed is null)
      or (validation_kind = 'hotel_prebook' and price_changed is not null)
    );

comment on column public.inventory_supplier_validation_evidence.price_changed is
  'Sanitized RateHawk prebook price-change flag. No hashes, credentials, or raw supplier responses are stored.';

commit;
