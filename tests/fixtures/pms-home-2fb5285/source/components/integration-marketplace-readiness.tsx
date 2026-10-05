import {integrationMarketplace} from '@/lib/integration-marketplace';

export function IntegrationMarketplaceReadiness(){
 return <section className="card" aria-label="Integration marketplace readiness">
  <div className="section-top">
   <div><h2>Other property integrations</h2><p className="muted">Readiness from this PMS release. A saved setup or local contract does not mean a provider is connected.</p></div>
  </div>
  <div className="pilot-settings-grid">
   {integrationMarketplace.map(item=><article className="card pilot-connection" key={item.id}>
    <span className="pill gray">{item.statusLabel}</span>
    <h3>{item.name}</h3>
    <p>{item.currentState}</p>
    <p><strong>Next launch gate:</strong> {item.nextGate}</p>
   </article>)}
  </div>
 </section>;
}
