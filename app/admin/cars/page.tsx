import type { Metadata } from "next";
import { Accessibility, BriefcaseBusiness, Building2, Calculator, Car, CheckCircle2, Circle, ClipboardCheck, Database, Fuel, GitCompareArrows, History, KeyRound, Network, ReceiptText, Scale, ShieldAlert, UserCheck, Workflow } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { adminNavigation } from "@/data/navigation";
import {
  buildCarRentalControlledLaunchPlan,
  carRentalControlledLaunchContracts,
  carRentalControlledLaunchProhibitedFields,
  carRentalControlledLaunchRecordedFields,
  carRentalControlledLaunchResultStates,
  carRentalIndependentReleaseReviewStates,
  carRentalLimitedPilotControlStates,
  carRentalObservabilityReadinessStates,
  carRentalPreviewAcceptanceStates,
  carRentalProductionDecisionStates,
  carRentalRollbackReadinessStates,
  carRentalSandboxEvidenceStates,
} from "@/lib/cars/controlled-launch-readiness";
import {
  buildCarRentalCommercialCompliancePlan,
  carRentalAccessibilityReadinessStates,
  carRentalCommercialAgreementStates,
  carRentalCommercialComplianceContracts,
  carRentalCommercialReadinessProhibitedFields,
  carRentalCommercialReadinessRecordedFields,
  carRentalCommercialReadinessResultStates,
  carRentalCompensationModels,
  carRentalConsumerLawReviewStates,
  carRentalDisclosureStates,
  carRentalIncidentResponseStates,
  carRentalProtectionWordingStates,
  carRentalServiceLevelStates,
  carRentalSupportOwnershipStates,
} from "@/lib/cars/commercial-compliance-readiness";
import {
  buildCarRentalDriverPrivacyPlan,
  carRentalDeletionStates,
  carRentalDriverPrivacyContracts,
  carRentalEligibilityStates,
  carRentalGeographicPermissionStates,
  carRentalLicenseRuleStates,
  carRentalMinimizedDriverFields,
  carRentalProhibitedDriverFields,
  carRentalRequirementStates,
} from "@/lib/cars/driver-eligibility-privacy";
import {
  buildCarRentalInventoryNormalizationPlan,
  carRentalAccessibilityStates,
  carRentalInventoryContracts,
  carRentalPowertrains,
  carRentalTransmissions,
} from "@/lib/cars/inventory-normalization";
import {
  buildCarRentalPaymentRiskPlan,
  carRentalAuthorizationHoldStates,
  carRentalChargebackStates,
  carRentalDepositStates as carRentalPaymentDepositStates,
  carRentalFraudReviewStates,
  carRentalPaymentCollectionModels,
  carRentalPaymentRiskContracts,
  carRentalPaymentRiskProhibitedFields,
  carRentalPaymentRiskRecordedFields,
  carRentalReceiptReconciliationStates,
  carRentalRefundEvidenceStates,
  carRentalTaxDisclosureStates,
} from "@/lib/cars/payment-risk-controls";
import {
  buildCarRentalOperationsSupportPlan,
  carRentalCounterDisputeStates,
  carRentalDamageClaimStates,
  carRentalEmergencyEscalationStates,
  carRentalOperationsCaseKinds,
  carRentalOperationsCaseStates,
  carRentalOperationsProhibitedFields,
  carRentalOperationsRecordedFields,
  carRentalOperationsSupportContracts,
  carRentalOperationsUrgencies,
  carRentalRoadsideAssistanceStates,
  carRentalSupportOutcomes,
  carRentalUpgradeStates,
  carRentalVehicleClassResolutionStates,
} from "@/lib/cars/operations-support";
import {
  buildCarRentalProviderAdapterPlan,
  carRentalAdapterKillSwitchStates,
  carRentalAdapterOperationKinds,
  carRentalAdapterProhibitedFields,
  carRentalAdapterRecordedFields,
  carRentalAdapterResponseOutcomes,
  carRentalAdapterRetryOutcomes,
  carRentalAdapterScopeLabels,
  carRentalAdapterWebhookStates,
  carRentalProviderAdapterContracts,
} from "@/lib/cars/provider-adapter-certification";
import {
  buildCarRentalNamedConnectorPlan,
  carRentalConnectorProhibitedFields,
  carRentalConnectorRecordedFields,
} from "@/lib/cars/provider-connectors";
import {
  buildCarRentalConnectorActivationPlan,
  carRentalConnectorActivationProhibitedFields,
  carRentalConnectorActivationRecordedFields,
} from "@/lib/cars/connector-activation-readiness";
import {
  buildCarRentalPricingPolicyPlan,
  carRentalDepositStates,
  carRentalFuelChargingPolicyKinds,
  carRentalMileagePolicyKinds,
  carRentalPriceLineItemKinds,
  carRentalPricingPolicyContracts,
  carRentalProtectionSelections,
} from "@/lib/cars/pricing-policy";
import {
  buildCarRentalQuoteRepricePlan,
  carRentalAvailabilityRecheckStates,
  carRentalPolicyChangeStates,
  carRentalPriceChangeKinds,
  carRentalPriceConsentStates,
  carRentalQuoteRepriceContracts,
} from "@/lib/cars/quote-reprice";
import {
  buildCarRentalReservationLifecyclePlan,
  carRentalReservationEventKinds,
  carRentalReservationEventOutcomes,
  carRentalReservationLifecycleContracts,
  carRentalReservationLifecycleStates,
  carRentalReservationProhibitedFields,
  carRentalReservationRecordedFields,
  carRentalSupplierReferenceStates,
} from "@/lib/cars/reservation-lifecycle";
import {
  buildCarRentalSupplierReadiness,
  carRentalCapabilityGroups,
  carRentalSupplierPaths,
} from "@/lib/cars/supplier-readiness";

export const metadata: Metadata = {
  title: "Car Rentals connector activation readiness | iRatePilot Admin",
  description: "Read-only car-rental live-connector activation control center with fail-closed Sabre, Travelport, and unselected aggregator tracks plus the completed provider-neutral software roadmap.",
};

export default function AdminCarsPage() {
  const connectorActivation = buildCarRentalConnectorActivationPlan();
  const namedConnectors = buildCarRentalNamedConnectorPlan();
  const controlledLaunch = buildCarRentalControlledLaunchPlan();
  const commercialCompliance = buildCarRentalCommercialCompliancePlan();
  const adapterCertification = buildCarRentalProviderAdapterPlan();
  const operationsSupport = buildCarRentalOperationsSupportPlan();
  const paymentRisk = buildCarRentalPaymentRiskPlan();
  const reservationLifecycle = buildCarRentalReservationLifecyclePlan();
  const driverPrivacy = buildCarRentalDriverPrivacyPlan();
  const quoteReprice = buildCarRentalQuoteRepricePlan();
  const pricingPolicy = buildCarRentalPricingPolicyPlan();
  const normalization = buildCarRentalInventoryNormalizationPlan();
  const readiness = buildCarRentalSupplierReadiness();

  return (
    <DashboardShell title="Admin Console" items={adminNavigation}>
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-700">Car Rentals · Live connector activation readiness</p>
        <div className="mt-2 grid gap-6 lg:grid-cols-[1fr_320px] lg:items-end">
          <div>
            <h1 className="text-3xl font-bold text-slate-950">Live connector activation control center</h1>
            <p className="mt-3 max-w-3xl leading-7 text-slate-600">Track the exact provider, commercial, account, capability, security, credential, sandbox, certification, operations, and Production decisions required to activate Sabre, Travelport, and one future aggregator. This workspace starts the activation program without contacting a supplier or enabling external traffic.</p>
          </div>
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
            <div className="flex items-center gap-3 text-amber-950"><ShieldAlert className="h-5 w-5" /><strong>{connectorActivation.activeConnectorCount} of {connectorActivation.tracks.length} live</strong></div>
            <p className="mt-2 text-sm leading-6 text-amber-900">All three activation tracks are fail-closed. Accounts, credentials, sandbox traffic, reservations, payments, migrations, and Production remain disabled.</p>
          </div>
        </div>

        <section className="mt-10 rounded-3xl border border-violet-200 bg-violet-50 p-6 lg:p-8">
          <div className="flex items-center gap-3"><Workflow className="h-5 w-5 text-violet-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-violet-800">Live activation program</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Three activation tracks, all fail-closed</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-700">Each connector must pass ten separately owned stages. Sabre and Travelport remain candidates only; the aggregator track is blocked until a provider is selected. A completed local planning review cannot create provider authority or activate a connector.</p>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {connectorActivation.tracks.map((track) => (
              <article key={track.connectorId} className="rounded-2xl border border-violet-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-slate-950">{track.label}</h3>
                  <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">Not live</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">{track.blocker}</p>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl bg-slate-50 p-3"><dt className="font-semibold uppercase tracking-wide text-slate-500">Stages</dt><dd className="mt-1 text-slate-800">{track.completedStageCount} of {track.totalStageCount}</dd></div>
                  <div className="rounded-xl bg-slate-50 p-3"><dt className="font-semibold uppercase tracking-wide text-slate-500">Connection</dt><dd className="mt-1 text-slate-800">{track.connectionState}</dd></div>
                  <div className="col-span-2 rounded-xl bg-violet-50 p-3"><dt className="font-semibold uppercase tracking-wide text-violet-700">Next required gate</dt><dd className="mt-1 leading-5 text-violet-950">{track.nextRequiredGate}</dd></div>
                </dl>
              </article>
            ))}
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <article className="rounded-2xl bg-slate-950 p-5 text-white"><h3 className="font-semibold">Activation state</h3><p className="mt-2 text-sm leading-6 text-slate-300">{connectorActivation.activeConnectorCount} of {connectorActivation.tracks.length} live · {connectorActivation.provisionedAccountCount} accounts · {connectorActivation.sandboxCertifiedConnectorCount} sandbox certified · {connectorActivation.externalRequestCount} external requests.</p></article>
            <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><h3 className="font-semibold text-emerald-950">Minimized allowlist</h3><p className="mt-2 text-sm leading-6 text-emerald-900">{carRentalConnectorActivationRecordedFields.join(" · ").replaceAll("_", " ")}</p></article>
            <article className="rounded-2xl border border-red-200 bg-red-50 p-5"><h3 className="font-semibold text-red-950">Prohibited activation data</h3><p className="mt-2 text-sm leading-6 text-red-900">{carRentalConnectorActivationProhibitedFields.join(" · ").replaceAll("_", " ")}</p></article>
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {connectorActivation.stages.map((stage, index) => (
              <article key={stage.id} className="rounded-2xl border border-violet-200 bg-white p-5">
                <div className="flex items-start gap-3">
                  <Circle className="mt-0.5 h-5 w-5 shrink-0 text-violet-500" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-400">Activation stage {index + 1} · {stage.owner}</p>
                    <h3 className="mt-1 font-semibold text-slate-950">{stage.label}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{stage.detail}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-10 rounded-3xl border border-sky-200 bg-sky-50 p-6 lg:p-8">
          <div className="flex items-center gap-3"><Network className="h-5 w-5 text-sky-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-sky-800">Connector preparation</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Sabre, Travelport, and aggregator connectors</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-700">Three local connector shells map the existing provider-neutral operation vocabulary. Every connector is offline-only, unprovisioned, capability-unverified, disconnected, and protected by two engaged traffic kill switches. No endpoint, credential, supplier account, external request, reservation action, payment action, deployment, migration, or Production authority is present.</p>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {namedConnectors.connectors.map((connector) => (
              <article key={connector.id} className="rounded-2xl border border-sky-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-slate-950">{connector.label}</h3>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{connector.category}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">{connector.summary}</p>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl bg-slate-50 p-3"><dt className="font-semibold uppercase tracking-wide text-slate-500">Connection</dt><dd className="mt-1 text-slate-800">{connector.connectionState}</dd></div>
                  <div className="rounded-xl bg-slate-50 p-3"><dt className="font-semibold uppercase tracking-wide text-slate-500">Capability</dt><dd className="mt-1 text-slate-800">{connector.capabilityVerificationState.replaceAll("_", " ")}</dd></div>
                  <div className="rounded-xl bg-slate-50 p-3"><dt className="font-semibold uppercase tracking-wide text-slate-500">Provisioning</dt><dd className="mt-1 text-slate-800">{connector.provisioningState.replaceAll("_", " ")}</dd></div>
                  <div className="rounded-xl bg-slate-50 p-3"><dt className="font-semibold uppercase tracking-wide text-slate-500">Offline intents</dt><dd className="mt-1 text-slate-800">{connector.intendedOperationKinds.length}</dd></div>
                </dl>
                <p className="mt-4 border-t border-slate-100 pt-4 text-sm leading-6 text-slate-500"><strong className="text-slate-700">Boundary:</strong> {connector.safetyBoundary}</p>
              </article>
            ))}
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <article className="rounded-2xl bg-slate-950 p-5 text-white"><h3 className="font-semibold">Runtime state</h3><p className="mt-2 text-sm leading-6 text-slate-300">{namedConnectors.provisionedConnectorCount} of {namedConnectors.connectors.length} provisioned · {namedConnectors.connectedConnectorCount} connected · {namedConnectors.externalRequestCount} external requests.</p></article>
            <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><h3 className="font-semibold text-emerald-950">Minimized allowlist</h3><p className="mt-2 text-sm leading-6 text-emerald-900">{carRentalConnectorRecordedFields.join(" · ").replaceAll("_", " ")}</p></article>
            <article className="rounded-2xl border border-red-200 bg-red-50 p-5"><h3 className="font-semibold text-red-950">Prohibited data</h3><p className="mt-2 text-sm leading-6 text-red-900">{carRentalConnectorProhibitedFields.join(" · ").replaceAll("_", " ")}</p></article>
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {namedConnectors.gates.map((gate, index) => (
              <article key={gate.id} className="rounded-2xl border border-sky-200 bg-white p-5">
                <div className="flex items-start gap-3">
                  <Circle className="mt-0.5 h-5 w-5 shrink-0 text-sky-500" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-400">Connector gate {index + 1} · {gate.owner}</p>
                    <h3 className="mt-1 font-semibold text-slate-950">{gate.label}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{gate.detail}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <p className="sr-only">Car Rentals · Phase 12</p>
          <div className="flex items-center gap-3"><Workflow className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Phase 12 controlled launch readiness</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Seven provider-neutral controlled-launch contracts</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Each contract validates minimized offline-fixture evidence only. A structurally valid record remains an internal release-design artifact and never becomes a Preview deployment, sandbox connection, supplier certification, live pilot, monitoring activation, rollback execution, reservation, refund, payment, migration, or Production approval.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {carRentalControlledLaunchContracts.map((contract) => (
              <article key={contract.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="font-semibold text-slate-950">{contract.label}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{contract.validationRule}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {contract.requiredFields.map((field) => <span key={field} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{field}</span>)}
                </div>
                <p className="mt-4 border-t border-slate-100 pt-4 text-sm leading-6 text-slate-500"><strong className="text-slate-700">Boundary:</strong> {contract.safetyBoundary}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-center gap-3"><History className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Controlled launch-readiness evidence</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Explicit acceptance, evidence, pilot, monitoring, rollback, review, and Production states</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Controlled labels, digest-only evidence, and two engaged traffic kill switches fail closed without supplier identities, endpoints, credentials, raw payloads or logs, travelers, drivers, payment data, precise locations, pilot participants, reviewer identities, live references, or Production approval.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-2xl bg-slate-950 p-6 text-white"><h3 className="font-semibold">Preview and sandbox</h3><p className="mt-3 text-sm leading-6 text-slate-300">Preview: {carRentalPreviewAcceptanceStates.join(" · ").replaceAll("_", " ")}<br />Sandbox: {carRentalSandboxEvidenceStates.join(" · ").replaceAll("_", " ")}</p></article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white"><h3 className="font-semibold">Pilot and observability</h3><p className="mt-3 text-sm leading-6 text-slate-300">Pilot: {carRentalLimitedPilotControlStates.join(" · ").replaceAll("_", " ")}<br />Observability: {carRentalObservabilityReadinessStates.join(" · ").replaceAll("_", " ")}</p></article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white"><h3 className="font-semibold">Rollback and review</h3><p className="mt-3 text-sm leading-6 text-slate-300">Rollback: {carRentalRollbackReadinessStates.join(" · ").replaceAll("_", " ")}<br />Review: {carRentalIndependentReleaseReviewStates.join(" · ").replaceAll("_", " ")}</p></article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white"><h3 className="font-semibold">Production boundary</h3><p className="mt-3 text-sm leading-6 text-slate-300">Decision: {carRentalProductionDecisionStates.join(" · ").replaceAll("_", " ")}<br />Result: {carRentalControlledLaunchResultStates.join(" · ").replaceAll("_", " ")}</p></article>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
              <h3 className="font-semibold text-emerald-950">Minimized controlled-launch field allowlist</h3>
              <p className="mt-3 text-sm leading-6 text-emerald-900">{carRentalControlledLaunchRecordedFields.join(" · ").replaceAll("_", " ")}</p>
            </article>
            <article className="rounded-2xl border border-red-200 bg-red-50 p-6">
              <h3 className="font-semibold text-red-950">Prohibited supplier, credential, payload, identity, and release data</h3>
              <p className="mt-3 text-sm leading-6 text-red-900">{carRentalControlledLaunchProhibitedFields.join(" · ").replaceAll("_", " ")}</p>
            </article>
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-center gap-3"><ClipboardCheck className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Phase 12 contract gates</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Twelve separately owned controlled-launch gates</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Every gate starts incomplete. Completing the offline checklist cannot commit or push code, deploy Preview, select or contact a supplier, create an account, accept credentials, connect to a sandbox, enable traffic, start a pilot, activate monitoring, execute rollback, transact, migrate data, or authorize Production.</p>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {controlledLaunch.gates.map((gate, index) => (
              <article key={gate.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-400">Gate {index + 1} · {gate.owner}</p>
                    <h3 className="mt-1 font-semibold text-slate-950">{gate.label}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{gate.detail}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12 border-t border-slate-200 pt-12">
          <p className="sr-only">Phase 11 commercial and compliance reference — Commercial and compliance readiness workspace</p>
          <div className="flex items-center gap-3"><BriefcaseBusiness className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Phase 11 commercial and compliance readiness</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Nine provider-neutral commercial and compliance contracts</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Each contract validates minimized offline-fixture evidence only. A structurally valid record remains an internal design artifact and never becomes a supplier relationship, executed agreement, pricing decision, insurance promise, legal opinion, support commitment, live incident, reservation, refund, payment, or Production release.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {carRentalCommercialComplianceContracts.map((contract) => (
              <article key={contract.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="font-semibold text-slate-950">{contract.label}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{contract.validationRule}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {contract.requiredFields.map((field) => <span key={field} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{field}</span>)}
                </div>
                <p className="mt-4 border-t border-slate-100 pt-4 text-sm leading-6 text-slate-500"><strong className="text-slate-700">Boundary:</strong> {contract.safetyBoundary}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-center gap-3"><Scale className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Controlled commercial-readiness evidence</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Explicit terms, disclosure, ownership, SLA, and incident states</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Controlled labels and digest-only evidence fail closed without provider identities, counterparties, signed terms, percentages, amounts, customer or driver data, payment details, credentials, legal advice, insurance documents, claims, precise locations, or live references.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-2xl bg-slate-950 p-6 text-white"><h3 className="font-semibold">Agreement and compensation</h3><p className="mt-3 text-sm leading-6 text-slate-300">Agreement: {carRentalCommercialAgreementStates.join(" · ").replaceAll("_", " ")}<br />Model: {carRentalCompensationModels.join(" · ").replaceAll("_", " ")}</p></article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white"><h3 className="font-semibold">Disclosures and protection</h3><p className="mt-3 text-sm leading-6 text-slate-300">Disclosure: {carRentalDisclosureStates.join(" · ").replaceAll("_", " ")}<br />Protection: {carRentalProtectionWordingStates.join(" · ").replaceAll("_", " ")}</p></article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white"><h3 className="font-semibold">Accessibility and consumer law</h3><p className="mt-3 text-sm leading-6 text-slate-300">Accessibility: {carRentalAccessibilityReadinessStates.join(" · ").replaceAll("_", " ")}<br />Consumer law: {carRentalConsumerLawReviewStates.join(" · ").replaceAll("_", " ")}</p></article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white"><h3 className="font-semibold">Support and response</h3><p className="mt-3 text-sm leading-6 text-slate-300">Ownership: {carRentalSupportOwnershipStates.join(" · ").replaceAll("_", " ")}<br />SLA: {carRentalServiceLevelStates.join(" · ").replaceAll("_", " ")}<br />Incident: {carRentalIncidentResponseStates.join(" · ").replaceAll("_", " ")}</p></article>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
              <h3 className="font-semibold text-emerald-950">Minimized commercial-readiness field allowlist</h3>
              <p className="mt-3 text-sm leading-6 text-emerald-900">{carRentalCommercialReadinessRecordedFields.join(" · ").replaceAll("_", " ")}</p>
              <p className="mt-3 text-sm leading-6 text-emerald-900">Result states: {carRentalCommercialReadinessResultStates.join(" · ").replaceAll("_", " ")}</p>
            </article>
            <article className="rounded-2xl border border-red-200 bg-red-50 p-6">
              <h3 className="font-semibold text-red-950">Prohibited commercial, legal, payment, and sensitive data</h3>
              <p className="mt-3 text-sm leading-6 text-red-900">{carRentalCommercialReadinessProhibitedFields.join(" · ").replaceAll("_", " ")}</p>
            </article>
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-center gap-3"><ClipboardCheck className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Phase 11 contract gates</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Twelve separately owned commercial-readiness gates</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Every gate starts incomplete. Completing the offline checklist cannot research or contact a supplier, negotiate or execute a contract, set rates, publish disclosures, promise coverage, provide legal advice, file anything, staff support, bind an SLA, open an incident, accept credentials, enable traffic, transact, migrate data, or authorize Production.</p>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {commercialCompliance.gates.map((gate, index) => (
              <article key={gate.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-400">Gate {index + 1} · {gate.owner}</p>
                    <h3 className="mt-1 font-semibold text-slate-950">{gate.label}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{gate.detail}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12 border-t border-slate-200 pt-12">
          <p className="sr-only">Phase 10 provider adapter certification reference — Provider adapter and sandbox certification workspace</p>
          <div className="flex items-center gap-3"><Network className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Phase 10 provider adapter and sandbox certification</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Nine provider-neutral offline adapter contracts</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Each contract validates minimized fixture evidence only. A structurally valid record remains an offline design artifact and never becomes a provider mapping, credential, network request, webhook receiver, sandbox result, reservation change, refund, payment, or Production release.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {carRentalProviderAdapterContracts.map((contract) => (
              <article key={contract.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="font-semibold text-slate-950">{contract.label}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{contract.validationRule}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {contract.requiredFields.map((field) => <span key={field} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{field}</span>)}
                </div>
                <p className="mt-4 border-t border-slate-100 pt-4 text-sm leading-6 text-slate-500"><strong className="text-slate-700">Boundary:</strong> {contract.safetyBoundary}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-center gap-3"><Database className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Controlled offline certification evidence</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Explicit operations, retries, webhook states, and engaged kill switches</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Operation-specific scope labels, bounded attempts and timeouts, digest-only evidence, and two independent engaged kill switches fail closed without provider, endpoint, credential, payload, identity, driver, payment, location, or live-reference data.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-2xl bg-slate-950 p-6 text-white"><h3 className="font-semibold">Allowlisted operations</h3><p className="mt-3 text-sm leading-6 text-slate-300">{carRentalAdapterOperationKinds.join(" · ").replaceAll("_", " ")}</p></article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white"><h3 className="font-semibold">Non-secret scope labels</h3><p className="mt-3 text-sm leading-6 text-slate-300">{carRentalAdapterScopeLabels.join(" · ").replaceAll("_", " ")}</p></article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white"><h3 className="font-semibold">Response and retry outcomes</h3><p className="mt-3 text-sm leading-6 text-slate-300">Response: {carRentalAdapterResponseOutcomes.join(" · ").replaceAll("_", " ")}<br />Retry: {carRentalAdapterRetryOutcomes.join(" · ").replaceAll("_", " ")}</p></article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white"><h3 className="font-semibold">Webhook and kill-switch states</h3><p className="mt-3 text-sm leading-6 text-slate-300">Webhook: {carRentalAdapterWebhookStates.join(" · ").replaceAll("_", " ")}<br />Kill switches: {carRentalAdapterKillSwitchStates.join(" · ")}</p></article>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
              <h3 className="font-semibold text-emerald-950">Minimized adapter-certification field allowlist</h3>
              <p className="mt-3 text-sm leading-6 text-emerald-900">{carRentalAdapterRecordedFields.join(" · ").replaceAll("_", " ")}</p>
            </article>
            <article className="rounded-2xl border border-red-200 bg-red-50 p-6">
              <h3 className="font-semibold text-red-950">Prohibited provider, credential, payload, and customer data</h3>
              <p className="mt-3 text-sm leading-6 text-red-900">{carRentalAdapterProhibitedFields.join(" · ").replaceAll("_", " ")}</p>
            </article>
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-center gap-3"><ClipboardCheck className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Phase 10 contract gates</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Twelve separately owned adapter-certification gates</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Every gate starts incomplete. Completing the offline design checklist cannot select or contact a provider, create an account, request or accept credentials, release either kill switch, connect to a sandbox, receive a webhook, change a reservation, issue a refund, move money, enable traffic, or authorize Production.</p>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {adapterCertification.gates.map((gate, index) => (
              <article key={gate.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-400">Gate {index + 1} · {gate.owner}</p>
                    <h3 className="mt-1 font-semibold text-slate-950">{gate.label}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{gate.detail}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12 border-t border-slate-200 pt-12">
          <p className="sr-only">Phase 9 operations and support reference</p>
          <div className="flex items-center gap-3"><History className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Phase 9 operations and customer support</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Nine provider-neutral operations and support contracts</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Each contract validates minimized case evidence, exact UTC ordering, and explicit unresolved outcomes only. A structurally valid fixture remains a local design artifact and never becomes a supplier request, service dispatch, emergency call, vehicle assignment, claim, reservation change, refund, or payment.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {carRentalOperationsSupportContracts.map((contract) => (
              <article key={contract.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="font-semibold text-slate-950">{contract.label}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{contract.validationRule}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {contract.requiredFields.map((field) => <span key={field} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{field}</span>)}
                </div>
                <p className="mt-4 border-t border-slate-100 pt-4 text-sm leading-6 text-slate-500"><strong className="text-slate-700">Boundary:</strong> {contract.safetyBoundary}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-center gap-3"><Database className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Controlled case and escalation evidence</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Explicit outcomes, ordered timestamps, and minimized fields</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Case identity, UTC ordering, terminal evidence digests, and case-specific states fail closed without traveler, license, vehicle, precise-location, payment, medical, narrative, claim-document, supplier-reference, or credential data.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-2xl bg-slate-950 p-6 text-white"><h3 className="font-semibold">Case kinds</h3><p className="mt-3 text-sm leading-6 text-slate-300">{carRentalOperationsCaseKinds.join(" · ").replaceAll("_", " ")}</p></article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white"><h3 className="font-semibold">Case states</h3><p className="mt-3 text-sm leading-6 text-slate-300">{carRentalOperationsCaseStates.join(" · ").replaceAll("_", " ")}</p></article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white"><h3 className="font-semibold">Urgency</h3><p className="mt-3 text-sm leading-6 text-slate-300">{carRentalOperationsUrgencies.join(" · ")}</p></article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white"><h3 className="font-semibold">Support outcomes</h3><p className="mt-3 text-sm leading-6 text-slate-300">{carRentalSupportOutcomes.join(" · ").replaceAll("_", " ")}</p></article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white"><h3 className="font-semibold">Counter disputes</h3><p className="mt-3 text-sm leading-6 text-slate-300">{carRentalCounterDisputeStates.join(" · ").replaceAll("_", " ")}</p></article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white"><h3 className="font-semibold">Class and upgrades</h3><p className="mt-3 text-sm leading-6 text-slate-300">Class: {carRentalVehicleClassResolutionStates.join(" · ").replaceAll("_", " ")}<br />Upgrade: {carRentalUpgradeStates.join(" · ").replaceAll("_", " ")}</p></article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white"><h3 className="font-semibold">Roadside and damage</h3><p className="mt-3 text-sm leading-6 text-slate-300">Roadside: {carRentalRoadsideAssistanceStates.join(" · ").replaceAll("_", " ")}<br />Damage: {carRentalDamageClaimStates.join(" · ").replaceAll("_", " ")}</p></article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white"><h3 className="font-semibold">Emergency escalation</h3><p className="mt-3 text-sm leading-6 text-slate-300">{carRentalEmergencyEscalationStates.join(" · ").replaceAll("_", " ")}</p></article>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
              <h3 className="font-semibold text-emerald-950">Minimized operations-support field allowlist</h3>
              <p className="mt-3 text-sm leading-6 text-emerald-900">{carRentalOperationsRecordedFields.join(" · ").replaceAll("_", " ")}</p>
            </article>
            <article className="rounded-2xl border border-red-200 bg-red-50 p-6">
              <h3 className="font-semibold text-red-950">Prohibited sensitive and operational data</h3>
              <p className="mt-3 text-sm leading-6 text-red-900">{carRentalOperationsProhibitedFields.join(" · ").replaceAll("_", " ")}</p>
            </article>
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-center gap-3"><ClipboardCheck className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Phase 9 contract gates</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Twelve separately owned operations and support gates</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Every gate starts incomplete. Completing the design checklist cannot contact a supplier or service, open a live support case, dispatch roadside or emergency assistance, replace a vehicle, fulfill an upgrade, submit a claim, change a reservation, issue a refund, move money, enable traffic, or authorize Production.</p>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {operationsSupport.gates.map((gate, index) => (
              <article key={gate.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-400">Gate {index + 1} · {gate.owner}</p>
                    <h3 className="mt-1 font-semibold text-slate-950">{gate.label}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{gate.detail}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12 border-t border-slate-200 pt-12">
          <p className="sr-only">Phase 8 payment and risk reference</p>
          <p className="sr-only">Payment and risk controls workspace</p>
          <div className="flex items-center gap-3"><Calculator className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Phase 8 payment and risk controls</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Nine provider-neutral payment and risk contracts</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Each contract validates sanitized accounting and control evidence only. A structurally valid fixture remains a local design artifact and never becomes a payment request, processor decision, supplier receipt, deposit, hold, refund, dispute, or reservation.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {carRentalPaymentRiskContracts.map((contract) => (
              <article key={contract.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="font-semibold text-slate-950">{contract.label}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{contract.validationRule}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {contract.requiredFields.map((field) => <span key={field} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{field}</span>)}
                </div>
                <p className="mt-4 border-t border-slate-100 pt-4 text-sm leading-6 text-slate-500"><strong className="text-slate-700">Boundary:</strong> {contract.safetyBoundary}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-center gap-3"><ReceiptText className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Controlled accounting and risk evidence</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Explicit models, uncertainty, and minimized fields</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Exact integer-minor-unit totals and explicit unresolved states fail closed without payment-card, bank, token, billing, identity, raw-reference, credential, supplier, or processor data.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-2xl bg-slate-950 p-6 text-white"><h3 className="font-semibold">Collection models</h3><p className="mt-3 text-sm leading-6 text-slate-300">{carRentalPaymentCollectionModels.join(" · ").replaceAll("_", " ")}</p></article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white"><h3 className="font-semibold">Deposit states</h3><p className="mt-3 text-sm leading-6 text-slate-300">{carRentalPaymentDepositStates.join(" · ").replaceAll("_", " ")}</p></article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white"><h3 className="font-semibold">Authorization holds</h3><p className="mt-3 text-sm leading-6 text-slate-300">{carRentalAuthorizationHoldStates.join(" · ").replaceAll("_", " ")}</p></article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white"><h3 className="font-semibold">Fraud review</h3><p className="mt-3 text-sm leading-6 text-slate-300">{carRentalFraudReviewStates.join(" · ").replaceAll("_", " ")}</p></article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white"><h3 className="font-semibold">Chargeback states</h3><p className="mt-3 text-sm leading-6 text-slate-300">{carRentalChargebackStates.join(" · ").replaceAll("_", " ")}</p></article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white"><h3 className="font-semibold">Refund evidence</h3><p className="mt-3 text-sm leading-6 text-slate-300">{carRentalRefundEvidenceStates.join(" · ").replaceAll("_", " ")}</p></article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white"><h3 className="font-semibold">Tax disclosure</h3><p className="mt-3 text-sm leading-6 text-slate-300">{carRentalTaxDisclosureStates.join(" · ").replaceAll("_", " ")}</p></article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white"><h3 className="font-semibold">Receipt reconciliation</h3><p className="mt-3 text-sm leading-6 text-slate-300">{carRentalReceiptReconciliationStates.join(" · ").replaceAll("_", " ")}</p></article>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
              <h3 className="font-semibold text-emerald-950">Minimized payment-risk field allowlist</h3>
              <p className="mt-3 text-sm leading-6 text-emerald-900">{carRentalPaymentRiskRecordedFields.join(" · ").replaceAll("_", " ")}</p>
            </article>
            <article className="rounded-2xl border border-red-200 bg-red-50 p-6">
              <h3 className="font-semibold text-red-950">Prohibited payment and identity data</h3>
              <p className="mt-3 text-sm leading-6 text-red-900">{carRentalPaymentRiskProhibitedFields.join(" · ").replaceAll("_", " ")}</p>
            </article>
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-center gap-3"><ClipboardCheck className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Phase 8 contract gates</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Twelve separately owned payment and risk gates</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Every gate starts incomplete. Completing the design checklist cannot contact a supplier or processor, collect payment data, reserve a vehicle, place a hold, collect a deposit, capture payment, execute a refund, act on a chargeback, enable traffic, or authorize Production.</p>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {paymentRisk.gates.map((gate, index) => (
              <article key={gate.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-400">Gate {index + 1} · {gate.owner}</p>
                    <h3 className="mt-1 font-semibold text-slate-950">{gate.label}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{gate.detail}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12 border-t border-slate-200 pt-12">
          <div className="flex items-center gap-3"><Workflow className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Phase 7 reservation lifecycle safety</p></div>
          <p className="sr-only">Phase 7 reservation lifecycle reference</p>
          <p className="sr-only">Reservation lifecycle safety workspace</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Eleven provider-neutral reservation lifecycle contracts</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Each contract validates an append-only sanitized timeline and explicit outcomes. A structurally valid fixture remains a local design artifact and never becomes a supplier reservation, modification, cancellation, refund, or confirmation.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {carRentalReservationLifecycleContracts.map((contract) => (
              <article key={contract.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="font-semibold text-slate-950">{contract.label}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{contract.validationRule}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {contract.requiredFields.map((field) => <span key={field} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{field}</span>)}
                </div>
                <p className="mt-4 border-t border-slate-100 pt-4 text-sm leading-6 text-slate-500"><strong className="text-slate-700">Boundary:</strong> {contract.safetyBoundary}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-center gap-3"><History className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Controlled lifecycle evidence</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Append-only states, outcomes, and minimized fields</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Strictly ordered UTC events, unique request fingerprints, exact integer-minor-unit refund bounds, and digest-only reconciliation fail closed without storing raw supplier references or traveler, license, credential, or payment data.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-2xl bg-slate-950 p-6 text-white">
              <h3 className="font-semibold">Lifecycle states</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{carRentalReservationLifecycleStates.join(" · ").replaceAll("_", " ")}</p>
            </article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white">
              <h3 className="font-semibold">Event kinds</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{carRentalReservationEventKinds.join(" · ").replaceAll("_", " ")}</p>
            </article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white">
              <h3 className="font-semibold">Event outcomes</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{carRentalReservationEventOutcomes.join(" · ").replaceAll("_", " ")}</p>
            </article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white">
              <h3 className="font-semibold">Reference reconciliation</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{carRentalSupplierReferenceStates.join(" · ").replaceAll("_", " ")}</p>
            </article>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
              <h3 className="font-semibold text-emerald-950">Minimized lifecycle field allowlist</h3>
              <p className="mt-3 text-sm leading-6 text-emerald-900">{carRentalReservationRecordedFields.join(" · ").replaceAll("_", " ")}</p>
            </article>
            <article className="rounded-2xl border border-red-200 bg-red-50 p-6">
              <h3 className="font-semibold text-red-950">Prohibited lifecycle data</h3>
              <p className="mt-3 text-sm leading-6 text-red-900">{carRentalReservationProhibitedFields.join(" · ").replaceAll("_", " ")}</p>
            </article>
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-center gap-3"><ClipboardCheck className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Phase 7 contract gates</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Twelve separately owned reservation lifecycle gates</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Every gate starts incomplete. Completing the design checklist cannot contact a supplier, create or change a reservation, record a live pickup or return, issue a refund, enable traffic, or authorize payment.</p>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {reservationLifecycle.gates.map((gate, index) => (
              <article key={gate.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-400">Gate {index + 1} · {gate.owner}</p>
                    <h3 className="mt-1 font-semibold text-slate-950">{gate.label}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{gate.detail}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12 border-t border-slate-200 pt-12">
          <div className="flex items-center gap-3"><UserCheck className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Phase 6 driver eligibility and privacy</p></div>
          <p className="sr-only">Phase 6 driver eligibility and privacy reference</p>
          <p className="sr-only">Driver eligibility and privacy workspace</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Eight provider-neutral eligibility and privacy contracts</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Each contract validates sanitized rule metadata and explicit outcomes without collecting real identity, license, address, contact, or biometric data. A structurally valid fixture remains non-transactional and never becomes a supplier eligibility decision.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {carRentalDriverPrivacyContracts.map((contract) => (
              <article key={contract.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="font-semibold text-slate-950">{contract.label}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{contract.validationRule}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {contract.requiredFields.map((field) => <span key={field} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{field}</span>)}
                </div>
                <p className="mt-4 border-t border-slate-100 pt-4 text-sm leading-6 text-slate-500"><strong className="text-slate-700">Boundary:</strong> {contract.safetyBoundary}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-center gap-3"><Database className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Controlled rules and privacy states</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Explicit outcomes and minimized data</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Age, license, residency, additional-driver, and geographic outcomes remain explicit. The collected-field inventory must match the minimum contract fields exactly, and overdue deletion always fails closed.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <article className="rounded-2xl bg-slate-950 p-6 text-white">
              <h3 className="font-semibold">Eligibility</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{carRentalEligibilityStates.join(" · ").replaceAll("_", " ")}</p>
            </article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white">
              <h3 className="font-semibold">License rule</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{carRentalLicenseRuleStates.join(" · ").replaceAll("_", " ")}</p>
            </article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white">
              <h3 className="font-semibold">Residency and drivers</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{carRentalRequirementStates.join(" · ").replaceAll("_", " ")}</p>
            </article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white">
              <h3 className="font-semibold">Geography</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{carRentalGeographicPermissionStates.join(" · ").replaceAll("_", " ")}</p>
            </article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white">
              <h3 className="font-semibold">Deletion</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{carRentalDeletionStates.join(" · ")}</p>
            </article>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
              <h3 className="font-semibold text-emerald-950">Minimized synthetic field allowlist</h3>
              <p className="mt-3 text-sm leading-6 text-emerald-900">{carRentalMinimizedDriverFields.join(" · ").replaceAll("_", " ")}</p>
            </article>
            <article className="rounded-2xl border border-red-200 bg-red-50 p-6">
              <h3 className="font-semibold text-red-950">Prohibited driver data</h3>
              <p className="mt-3 text-sm leading-6 text-red-900">{carRentalProhibitedDriverFields.join(" · ").replaceAll("_", " ")}</p>
            </article>
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-center gap-3"><ClipboardCheck className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Phase 6 contract gates</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Twelve separately owned eligibility and privacy gates</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Every gate starts incomplete. Completing the design checklist cannot collect driver data, verify identity or a license, issue a live eligibility decision, enable traffic, reserve a vehicle, or authorize payment.</p>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {driverPrivacy.gates.map((gate, index) => (
              <article key={gate.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-400">Gate {index + 1} · {gate.owner}</p>
                    <h3 className="mt-1 font-semibold text-slate-950">{gate.label}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{gate.detail}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12 border-t border-slate-200 pt-12">
          <div className="flex items-center gap-3"><ReceiptText className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Phase 5 quote and reprice safety</p></div>
          <p className="sr-only">Phase 5 quote and reprice reference</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Immutable quote and reprice contracts</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Each contract binds one synthetic quote version to its search, clock, availability evidence, exact totals, traveler decision, and policy snapshot. Validation fails closed without turning any local record into a supplier confirmation, reservation, or payment authority.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {carRentalQuoteRepriceContracts.map((contract) => (
              <article key={contract.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="font-semibold text-slate-950">{contract.label}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{contract.validationRule}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {contract.requiredFields.map((field) => <span key={field} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{field}</span>)}
                </div>
                <p className="mt-4 border-t border-slate-100 pt-4 text-sm leading-6 text-slate-500"><strong className="text-slate-700">Boundary:</strong> {contract.safetyBoundary}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-center gap-3"><GitCompareArrows className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Controlled quote and decision states</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Freshness, availability, consent, and policy</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Exact UTC instants and integer minor-unit totals determine quote freshness and price direction. Availability, consent, and policy changes remain explicit controlled states; unknown or incomplete evidence never silently becomes approval.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-2xl bg-slate-950 p-6 text-white">
              <h3 className="font-semibold">Availability</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{carRentalAvailabilityRecheckStates.join(" · ").replaceAll("_", " ")}</p>
            </article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white">
              <h3 className="font-semibold">Price change</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{carRentalPriceChangeKinds.join(" · ")}</p>
            </article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white">
              <h3 className="font-semibold">Traveler consent</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{carRentalPriceConsentStates.join(" · ").replaceAll("_", " ")}</p>
            </article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white">
              <h3 className="font-semibold">Policy snapshot</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{carRentalPolicyChangeStates.join(" · ")}</p>
            </article>
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-center gap-3"><ClipboardCheck className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Phase 5 contract gates</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Twelve separately owned quote and reprice gates</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Every gate starts incomplete. Even a completed review cannot ingest or reprice a supplier quote, perform a live availability recheck, capture consent, accept policy terms, enable traffic, reserve a vehicle, or authorize payment.</p>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {quoteReprice.gates.map((gate, index) => (
              <article key={gate.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-400">Gate {index + 1} · {gate.owner}</p>
                    <h3 className="mt-1 font-semibold text-slate-950">{gate.label}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{gate.detail}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12 border-t border-slate-200 pt-12">
          <div className="flex items-center gap-3"><ReceiptText className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Phase 4 pricing and policy reference</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Provider-neutral total-price contracts</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Each contract makes an amount or policy state explicit, preserves unknowns, and records what remains outside the displayed total. A valid synthetic record proves arithmetic and policy consistency only; it is not a supplier quote, reprice, reservation, protection decision, or payment authorization.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {carRentalPricingPolicyContracts.map((contract) => (
              <article key={contract.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="font-semibold text-slate-950">{contract.label}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{contract.normalizationRule}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {contract.requiredFields.map((field) => <span key={field} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{field}</span>)}
                </div>
                <p className="mt-4 border-t border-slate-100 pt-4 text-sm leading-6 text-slate-500"><strong className="text-slate-700">Boundary:</strong> {contract.safetyBoundary}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-center gap-3"><Calculator className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Controlled price and policy states</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Exact arithmetic and explicit unknowns</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">All amounts use non-negative integer minor units. The advertised total must exactly equal included line items; deposits remain outside the rental total, and optional or declined protection products cannot be priced as selected.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-2xl bg-slate-950 p-6 text-white">
              <h3 className="font-semibold">Price lines</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{carRentalPriceLineItemKinds.join(" · ").replaceAll("_", " ")}</p>
            </article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white">
              <h3 className="font-semibold">Mileage</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{carRentalMileagePolicyKinds.join(" · ")}</p>
            </article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white">
              <h3 className="font-semibold">Fuel or charging</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{carRentalFuelChargingPolicyKinds.join(" · ").replaceAll("_", " ")}</p>
            </article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white">
              <h3 className="font-semibold">Deposit and protection</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">Deposit: {carRentalDepositStates.join(" · ")}<br />Protection: {carRentalProtectionSelections.join(" · ")}</p>
            </article>
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-center gap-3"><ClipboardCheck className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Phase 4 contract gates</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Twelve separately owned pricing and policy gates</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Every gate starts incomplete. Even a completed review cannot ingest a supplier quote, accept policy terms, enable credentials or traffic, display a live total, reserve a vehicle, or authorize payment.</p>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {pricingPolicy.gates.map((gate, index) => (
              <article key={gate.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-400">Gate {index + 1} · {gate.owner}</p>
                    <h3 className="mt-1 font-semibold text-slate-950">{gate.label}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{gate.detail}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12 border-t border-slate-200 pt-12">
          <div className="flex items-center gap-3"><GitCompareArrows className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Phase 3 normalization reference</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Provider-neutral inventory contracts</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Each contract preserves source facts, explicit unknown states, and a consumer-safety boundary. A normalized record is a design artifact, not availability, a quote, or a reservable vehicle.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {carRentalInventoryContracts.map((contract) => (
              <article key={contract.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="font-semibold text-slate-950">{contract.label}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{contract.normalizationRule}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {contract.requiredFields.map((field) => <span key={field} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{field}</span>)}
                </div>
                <p className="mt-4 border-t border-slate-100 pt-4 text-sm leading-6 text-slate-500"><strong className="text-slate-700">Boundary:</strong> {contract.safetyBoundary}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-center gap-3"><Fuel className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Controlled vocabulary</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Explicit values, including unknown states</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <article className="rounded-2xl bg-slate-950 p-6 text-white">
              <h3 className="font-semibold">Transmission</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{carRentalTransmissions.join(" · ")}</p>
            </article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white">
              <h3 className="font-semibold">Fuel or powertrain</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{carRentalPowertrains.join(" · ").replace("plug_in_hybrid", "plug-in hybrid")}</p>
            </article>
            <article className="rounded-2xl bg-slate-950 p-6 text-white">
              <div className="flex items-center gap-2"><Accessibility className="h-4 w-4 text-slate-400" /><h3 className="font-semibold">Accessibility state</h3></div>
              <p className="mt-3 text-sm leading-6 text-slate-300">{carRentalAccessibilityStates.join(" · ")}</p>
            </article>
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-center gap-3"><ClipboardCheck className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Phase 3 contract gates</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Ten separately owned normalization gates</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Every gate starts incomplete. Even a completed contract review cannot create a provider mapping, ingest data, accept credentials, enable traffic, show live inventory, reserve a vehicle, or authorize payment.</p>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {normalization.gates.map((gate, index) => (
              <article key={gate.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-400">Gate {index + 1} · {gate.owner}</p>
                    <h3 className="mt-1 font-semibold text-slate-950">{gate.label}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{gate.detail}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12 border-t border-slate-200 pt-12">
          <div className="flex items-center gap-3"><Building2 className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Supply model</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Phase 2 readiness reference</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">These are distribution categories, not named providers, recommendations, partnerships, or contact authorizations.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {carRentalSupplierPaths.map((path) => (
              <article key={path.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3"><Network className="h-5 w-5 text-slate-500" /><h3 className="font-semibold text-slate-950">{path.label}</h3></div>
                <p className="mt-4 text-sm leading-6 text-slate-600">{path.fit}</p>
                <p className="mt-4 border-t border-slate-100 pt-4 text-sm leading-6 text-slate-500"><strong className="text-slate-700">Diligence:</strong> {path.diligence}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-center gap-3"><Car className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Certification scope</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Required capabilities</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {carRentalCapabilityGroups.map((group) => (
              <article key={group.id} className="rounded-2xl bg-slate-950 p-6 text-white">
                <h3 className="font-semibold">{group.label}</h3>
                <ul className="mt-5 space-y-3 text-sm leading-5 text-slate-300">
                  {group.capabilities.map((capability) => <li key={capability} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />{capability}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-center gap-3"><ClipboardCheck className="h-5 w-5 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Phase 2 activation reference</p></div>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Eleven separately owned activation gates</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Every gate starts incomplete. Recording all eleven would complete an evaluation checklist only; it would not authorize supplier contact, accounts, credentials, sandbox or Production traffic, reservations, or payments.</p>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {readiness.gates.map((gate, index) => (
              <article key={gate.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-400">Gate {index + 1} · {gate.owner}</p>
                    <h3 className="mt-1 font-semibold text-slate-950">{gate.label}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{gate.detail}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12 rounded-2xl border border-red-300 bg-red-50 p-6">
          <div className="flex items-center gap-3 text-red-950"><KeyRound className="h-5 w-5" /><h2 className="text-lg font-bold">Runtime hard stop</h2></div>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-red-900">Sabre, Travelport, and one generic aggregator connector now exist only as disabled local software contracts. No car-rental supplier has been commercially selected, contacted, provisioned, certified, or connected. No provider mapping, account, live endpoint, credential request, credential receipt, credential material, socket, job, queue, webhook receiver, external request, sandbox connection, sandbox certification, controlled pilot, monitoring activation, rollback execution, Preview deployment, or Production traffic exists. Both application and database traffic kill switches remain engaged. No processor, counter, roadside provider, insurer, claims service, police service, emergency service, medical service, or traveler is contacted or connected. No live support case is opened. No roadside or emergency assistance is dispatched. No vehicle is sourced, replaced, assigned, or upgraded. No damage claim is filed, accepted, denied, priced, or settled. No live reservation is created, confirmed, modified, cancelled, marked no-show, picked up, extended, returned, or refunded. No payment card, bank account, payment token, billing identity, raw reference, traveler identity, license, vehicle identifier, precise location, medical information, accident narrative, police report, insurance policy, raw request, raw response, raw webhook payload, raw observability log, pilot-participant identity, reviewer identity, Production approval, or credential data is collected. No personal driver data is collected or verified. No collection, capture, deposit, authorization hold, refund, chargeback, receipt, tax, fraud, claim, or money-movement action occurs. No supplier inventory, quote, or policy is ingested or repriced. Supplier or service contact, contracts, accounts, credentials, provider capability verification, external traffic, actual sandbox certification, live pilot, live inventory, rates, policies, eligibility decisions, support operations, reservations, payment activity, refunds, migrations, deployment, and Production changes remain outside this local connector preparation and require separate approval.</p>
        </section>
      </div>
    </DashboardShell>
  );
}
