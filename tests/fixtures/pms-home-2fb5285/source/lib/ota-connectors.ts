export type OtaConnectorCapability='reservations'|'cancellations'|'availability'|'rates'|'restrictions';
export type OtaConnectorKey='iratepilot'|'booking_com'|'expedia_group'|'agoda'|'google_hotel'|'airbnb'|'open_connector';
export type OtaConnectorState='native_available'|'certification_pending';
export type OtaConnectorProductionStatus='source_only_not_deployed'|'prototype_not_deployed'|'no_provider_adapter';

export type OtaConnectorDefinition={
 key:OtaConnectorKey;
 name:string;
 connectionPrefix:string;
 capabilities:OtaConnectorCapability[];
 prototypeCapabilities:OtaConnectorCapability[];
 plannedCapabilities:OtaConnectorCapability[];
 onboarding:string;
 credentialLabel:string;
 certificationRequired:boolean;
 implementationState:OtaConnectorState;
 productionStatus:OtaConnectorProductionStatus;
 trafficEnabledByDefault:false;
};

export const otaConnectorDefinitions:OtaConnectorDefinition[]=[
 {key:'iratepilot',name:'iRatePilot OTA',connectionPrefix:'iratepilot',capabilities:['reservations','cancellations','availability','rates','restrictions'],prototypeCapabilities:[],plannedCapabilities:['reservations','cancellations','availability','rates','restrictions'],onboarding:'The signed booking receiver and outbound ARI delivery have local implementation evidence. Hosted migrations, scheduled worker, server secrets and controlled end-to-end live traffic are not verified; each property must authorize activation.',credentialLabel:'Shared signing secret',certificationRequired:false,implementationState:'native_available',productionStatus:'source_only_not_deployed',trafficEnabledByDefault:false},
 {key:'booking_com',name:'Booking.com',connectionPrefix:'booking_com',capabilities:[],prototypeCapabilities:['reservations','cancellations','availability','rates','restrictions'],plannedCapabilities:['reservations','cancellations','availability','rates','restrictions'],onboarding:'Local candidates cover standard-pricing B.XML ARI and OTA-standard inbound new, modified and cancelled reservations. New inbound reservations support one USD room or an indexed 2–20-room group with direct-agency collection, explicit room and tax/fee mappings, Payments Clarity v2, and atomic group persistence. Multi-room modifications/cancellations remain held pending verified snapshot semantics. Workers are default-off and unscheduled. Hosted migrations, partner approval, credentials, property mapping, certification and a controlled live round trip remain required.',credentialLabel:'Booking.com token API client ID and client secret',certificationRequired:true,implementationState:'certification_pending',productionStatus:'prototype_not_deployed',trafficEnabledByDefault:false},
 {key:'expedia_group',name:'Expedia Group',connectionPrefix:'expedia',capabilities:[],prototypeCapabilities:[],plannedCapabilities:['reservations','cancellations','availability','rates','restrictions'],onboarding:'Connector metadata only; no Expedia-specific adapter is implemented. New partners should confirm access to Availability & Rates and Reservation Management GraphQL with Expedia; the legacy Booking Notification API is not open to new adoption without an exception. Contract/PCI review, property authorization, sandbox testing and certification remain required.',credentialLabel:'Expedia connection secret',certificationRequired:true,implementationState:'certification_pending',productionStatus:'no_provider_adapter',trafficEnabledByDefault:false},
 {key:'agoda',name:'Agoda',connectionPrefix:'agoda',capabilities:[],prototypeCapabilities:[],plannedCapabilities:['reservations','cancellations','availability','rates','restrictions'],onboarding:'Connector metadata only; provider-specific adapter, authorization, property mapping and certification are still required.',credentialLabel:'Agoda connection secret',certificationRequired:true,implementationState:'certification_pending',productionStatus:'no_provider_adapter',trafficEnabledByDefault:false},
 {key:'google_hotel',name:'Google Hotel',connectionPrefix:'google_hotel',capabilities:[],prototypeCapabilities:[],plannedCapabilities:['reservations','cancellations','availability','rates','restrictions'],onboarding:'Connector metadata only; provider-specific adapter, eligibility, property matching and certification are still required.',credentialLabel:'Google Hotel connection secret',certificationRequired:true,implementationState:'certification_pending',productionStatus:'no_provider_adapter',trafficEnabledByDefault:false},
 {key:'airbnb',name:'Airbnb',connectionPrefix:'airbnb',capabilities:[],prototypeCapabilities:[],plannedCapabilities:['reservations','cancellations','availability','rates','restrictions'],onboarding:'Connector metadata only; provider-specific adapter, software-partner access, listing authorization and certification are still required.',credentialLabel:'Airbnb connection secret',certificationRequired:true,implementationState:'certification_pending',productionStatus:'no_provider_adapter',trafficEnabledByDefault:false},
 {key:'open_connector',name:'iRatePilot Open Connector',connectionPrefix:'open',capabilities:[],prototypeCapabilities:[],plannedCapabilities:['reservations','cancellations','availability','rates','restrictions'],onboarding:'Contract prepared for approved regional OTAs. Provider-specific adapters, partner authorization and sandbox certification are still required.',credentialLabel:'Partner signing secret',certificationRequired:true,implementationState:'certification_pending',productionStatus:'no_provider_adapter',trafficEnabledByDefault:false},
];

export function otaConnector(key:string){return otaConnectorDefinitions.find(item=>item.key===key)??otaConnectorDefinitions.at(-1)!}

export function suggestedConnectionId(key:string,propertyId:string){
 const definition=otaConnector(key),suffix=propertyId.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,40);
 return `${definition.connectionPrefix}_${suffix||'property'}`.slice(0,80);
}

export function connectorForConnectionId(connectionId:string){
 const normalized=connectionId.toLowerCase();
 return otaConnectorDefinitions.find(item=>normalized===item.connectionPrefix||normalized.startsWith(item.connectionPrefix+'_'))??otaConnectorDefinitions.at(-1)!;
}

export const otaConnectorProtocol={
 version:1,
 inboundEndpoint:'/api/ota/events',
 authentication:'HMAC-SHA256',
 signatureInput:'timestamp.connection_id.raw_body',
 maximumBodyBytes:65536,
 replayWindowSeconds:300,
 idempotency:'eventId + booking.id + sourceVersion',
} as const;
