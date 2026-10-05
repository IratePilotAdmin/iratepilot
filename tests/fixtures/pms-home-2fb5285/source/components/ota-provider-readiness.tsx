import {otaConnectorDefinitions} from '@/lib/ota-connectors';

const externalOtas=otaConnectorDefinitions.filter(connector=>connector.certificationRequired);
const firstParty=otaConnectorDefinitions.find(connector=>connector.key==='iratepilot')!;
const capabilityLabels={reservations:'Reservations',cancellations:'Cancellations',availability:'Availability',rates:'Rates',restrictions:'Stay restrictions'} as const;

export function OtaProviderReadiness(){
 return <section className="card pilot-connection" aria-label="External OTA connector readiness">
  <span className="pill gray">Not certified for live reservations</span>
  <h2>Third-party OTA channels</h2>
  <p>These channels are not ready to send or receive hotel reservations. Enable them only after the provider-specific integration and launch checks are complete.</p>
  <section className="card pilot-connection" aria-label="iRatePilot OTA production status">
   <span className="pill gray">Source integrated · live use unverified</span>
   <h3>{firstParty.name}</h3>
   <p><strong>Production status:</strong> Source is integrated, but the hosted migrations, scheduled worker, server secrets and controlled live booking flow have not been verified.</p>
   <p>Local implementation includes inbound reservations and outbound availability, rates and restrictions. Do not rely on it for a live property until the hosted release and end-to-end booking are verified.</p>
  </section>
  <div className="pilot-settings-grid">{externalOtas.map(connector=><section className="card pilot-connection" key={connector.key}>
   <span className="pill gray">Certification pending</span>
   <h3>{connector.name}</h3>
   <p><strong>Production status:</strong> {connector.productionStatus==='prototype_not_deployed'?'Local prototype only; not deployed or live':connector.productionStatus==='no_provider_adapter'?'Provider adapter not implemented':'Source integrated; hosted deployment and live traffic not verified'}</p>
   <p>{connector.onboarding}</p>
   <p><strong>Planned connector scope:</strong> {connector.plannedCapabilities.map(capability=>capabilityLabels[capability]).join(' · ')}</p>
   <p><strong>Local implementation only (not enabled or live):</strong> {connector.prototypeCapabilities.length?connector.prototypeCapabilities.map(capability=>capabilityLabels[capability]).join(' · '):'None'}</p>
   <p><strong>Working provider capabilities:</strong> {connector.capabilities.length?connector.capabilities.map(capability=>capabilityLabels[capability]).join(' · '):'None yet'}</p>
  </section>)}</div>
 </section>;
}
