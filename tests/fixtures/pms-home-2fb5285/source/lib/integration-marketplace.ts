export type IntegrationReadiness = 'development'|'architecture_only'|'adapter_not_implemented';

export type IntegrationCatalogEntry={
 id:string;
 name:string;
 readiness:IntegrationReadiness;
 statusLabel:string;
 currentState:string;
 nextGate:string;
};

/** Source-reviewed statuses for non-OTA property integrations; none imply a live provider connection. */
export const integrationMarketplace:IntegrationCatalogEntry[]=[
 {id:'digital-keys',name:'Door locks and digital keys',readiness:'architecture_only',statusLabel:'Architecture only',currentState:'A provider-neutral issue and revoke contract exists. No lock vendor is connected.',nextGate:'Select an approved lock vendor, build its adapter, then verify test issuance and revocation on a real device.'},
 {id:'id-scanning',name:'ID scanners',readiness:'development',statusLabel:'Development only',currentState:'Browser camera and photo OCR can suggest contact fields for staff review.',nextGate:'Verify supported documents, physical cameras, legal use, and hosted browser behavior.'},
 {id:'card-terminals',name:'Card-present payment terminals',readiness:'adapter_not_implemented',statusLabel:'Provider adapter not implemented',currentState:'The PMS has no certified terminal or card-present processor connection.',nextGate:'Choose a processor, complete merchant onboarding and certification, then verify test-mode terminal checkout.'},
 {id:'pos',name:'POS outlets',readiness:'architecture_only',statusLabel:'Architecture only',currentState:'A POS-to-folio charge contract is documented; no production endpoint or POS vendor is connected.',nextGate:'Build a scoped signed endpoint and durable folio transaction, then complete a provider sandbox round trip.'},
 {id:'accounting',name:'Accounting',readiness:'architecture_only',statusLabel:'Architecture only',currentState:'Balanced export and reconciliation boundaries are specified; no accounting adapter is connected.',nextGate:'Choose the accounting system, map a chart of accounts, and test an export/import reconciliation.'},
 {id:'crm',name:'CRM',readiness:'adapter_not_implemented',statusLabel:'Provider adapter not implemented',currentState:'No CRM data synchronization is active.',nextGate:'Select a CRM and approve field mapping, consent, retention, and deletion behavior.'},
 {id:'revenue-systems',name:'External revenue systems',readiness:'adapter_not_implemented',statusLabel:'Provider adapter not implemented',currentState:'PMS rates and availability are managed locally; no external RMS is connected.',nextGate:'Select an RMS provider and test scoped data exchange and manager-approved rate changes.'},
 {id:'reputation',name:'Reputation management',readiness:'adapter_not_implemented',statusLabel:'Provider adapter not implemented',currentState:'No review or reputation provider is connected.',nextGate:'Select a provider and verify consent-qualified requests, opt-outs, and inbound review status.'},
 {id:'guest-messaging',name:'Guest messaging',readiness:'development',statusLabel:'Development only',currentState:'Consent capture and a local queue helper exist; no active sender or provider is connected.',nextGate:'Build an authorized producer, current-stay resolver, unsubscribe/suppression path, sender, and verified test delivery.'},
 {id:'wifi',name:'Guest Wi-Fi',readiness:'adapter_not_implemented',statusLabel:'Provider adapter not implemented',currentState:'No Wi-Fi access provider is connected.',nextGate:'Select a provider and verify a stay-bound guest access and revocation lifecycle.'},
 {id:'pbx',name:'Telephone and PBX',readiness:'adapter_not_implemented',statusLabel:'Provider adapter not implemented',currentState:'No call event or room-charge integration is active.',nextGate:'Select a PBX provider and verify room mapping, attribution, and duplicate-safe folio posting.'},
 {id:'energy',name:'Energy management',readiness:'adapter_not_implemented',statusLabel:'Provider adapter not implemented',currentState:'No energy gateway or room-state data exchange is active.',nextGate:'Select a vendor and validate minimized, time-bounded room-state exchange.'},
 {id:'housekeeping-technology',name:'External housekeeping technology',readiness:'adapter_not_implemented',statusLabel:'Provider adapter not implemented',currentState:'PMS mobile housekeeping works as an internal workflow; no external vendor is connected.',nextGate:'Select a vendor and test task assignment, versioned status updates, and property scope.'},
 {id:'smart-room',name:'Smart-room devices',readiness:'architecture_only',statusLabel:'Architecture only',currentState:'A narrow property-mapped device boundary is documented; no device vendor or gateway is connected.',nextGate:'Select supported devices and verify authorization, consent, audit, and manual fallback.'},
];
