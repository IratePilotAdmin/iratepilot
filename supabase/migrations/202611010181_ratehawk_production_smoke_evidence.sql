begin;

alter table public.inventory_supplier_validation_evidence
  drop constraint inventory_supplier_validation_evidence_environment_check,
  drop constraint inventory_supplier_validation_evidence_validation_kind_check,
  drop constraint inventory_supplier_validation_evidence_price_changed_check;

alter table public.inventory_supplier_validation_evidence
  add constraint inventory_supplier_validation_evidence_environment_check
    check (environment in ('sandbox', 'production')),
  add constraint inventory_supplier_validation_evidence_validation_kind_check
    check (validation_kind in ('hotel_search', 'hotel_prebook', 'production_smoke')),
  add constraint inventory_supplier_validation_evidence_environment_kind_check
    check (
      (environment = 'sandbox' and validation_kind in ('hotel_search', 'hotel_prebook'))
      or (environment = 'production' and validation_kind = 'production_smoke')
    ),
  add constraint inventory_supplier_validation_evidence_price_changed_check
    check (
      (validation_kind in ('hotel_search', 'production_smoke') and price_changed is null)
      or (validation_kind = 'hotel_prebook' and price_changed is not null)
    );

comment on table public.inventory_supplier_validation_evidence is
  'Server-recorded, non-secret sandbox and read-only production inventory validation evidence. Never stores credentials or raw supplier responses.';

commit;
