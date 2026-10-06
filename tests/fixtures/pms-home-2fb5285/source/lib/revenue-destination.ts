export type DestinationObservation={connectionId:string;pmsPlanId:string;pmsPlanVersion:number;destinationPropertyId:string;destinationRoomId:string;destinationPlanCode:string;destinationPlanName:string;currency:string;cancellationPolicyVersion:string|null;observedAt:string;status:'observed'|'source_changed'|'observation_expired'|'currency_mismatch'};
export type DestinationMappings={schemaVersion:1;tenantId:string;propertyId:string;certified:false;writebackEnabled:false;observations:DestinationObservation[]};
export function readDestinationMappings(value:unknown,tenant:string,property:string):DestinationMappings{
 if(!value||typeof value!=='object')throw Error('Destination evidence is unavailable.');const feed=value as DestinationMappings;
 if(feed.schemaVersion!==1||feed.tenantId!==tenant||feed.propertyId!==property||feed.certified!==false||feed.writebackEnabled!==false||!Array.isArray(feed.observations)||feed.observations.length>10000)throw Error('Destination evidence scope or safety state is invalid.');
 const identities=new Set<string>(),rooms=new Set<string>();for(const row of feed.observations){const key=row.connectionId+'|'+row.pmsPlanId,target=row.connectionId+'|'+row.destinationRoomId;
 if(!row.connectionId||!row.pmsPlanId||!row.destinationPropertyId||!row.destinationRoomId||identities.has(key)||rooms.has(target)||!Number.isSafeInteger(row.pmsPlanVersion)||row.pmsPlanVersion<1||!Number.isFinite(Date.parse(row.observedAt))||!/^[A-Za-z0-9_-]{1,128}$/.test(row.destinationPlanCode)||!/^[A-Z]{3}$/.test(row.currency)||!['observed','source_changed','observation_expired','currency_mismatch'].includes(row.status))throw Error('Destination evidence contains invalid or duplicate identities.');identities.add(key);rooms.add(target)}
 return feed;
}
