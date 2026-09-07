/** Trusted server worker. rpc must use a service-role client; send is the signed transport. */
export async function runPostgresPmsOutboxOnce({rpc,resolveConnection,send}){
 const claim=await rpc('irp_pms_claim_event',{});
 if(claim.error)throw Error('PMS outbox claim failed.');
 if(!Array.isArray(claim.data))throw Error('Invalid claim response.');
 if(!claim.data.length)return {outcome:'idle'};
 if(claim.data.length!==1)throw Error('Unexpected claim count.');
 const row=claim.data[0];
 if(!row.event_id||!row.lease_token)throw Error('Invalid leased event.');
 let result;
 try{
  const c=await resolveConnection(row.connection_id);
  if(!c||c.id!==row.connection_id||c.tenantId!==row.tenant_id||c.propertyId!==row.pms_property_id||c.otaPropertyId!==row.property_id){result={outcome:'review-required',reason:'connection_scope_mismatch'};}
  else if(row.event_payload?.eventId!==row.event_id||row.event_payload?.booking?.id!==row.booking_id||row.event_payload?.booking?.property_id!==row.property_id||row.event_payload?.sourceVersion!==Number(row.source_version)){
   result={outcome:'review-required',reason:'event_scope_mismatch'};
  }else result=await send({endpoint:c.endpoint,event:row.event_payload,connection:c});
 }catch{result={outcome:'retry',reason:'worker_dependency_unavailable'};}
 if(!result||!['acknowledged','retry','review-required'].includes(result.outcome))result={outcome:'retry',reason:'invalid_transport_result'};
 const detail=result.receiverOutcome||result.reason||result.outcome;
 const code=typeof detail==='string'&&/^[a-z0-9_-]{1,80}$/.test(detail)?detail:'delivery_result';
 const finish=await rpc('irp_pms_finish_event',{p_event:row.event_id,p_lease:row.lease_token,p_outcome:result.outcome,p_code:code});
 if(finish.error)throw Error('PMS outbox acknowledgement failed; lease recovery must retry.');
 if(finish.data!==true)return {outcome:'lease-lost',eventId:row.event_id};
 return {outcome:result.outcome,eventId:row.event_id,receiverOutcome:result.receiverOutcome??null};
}
