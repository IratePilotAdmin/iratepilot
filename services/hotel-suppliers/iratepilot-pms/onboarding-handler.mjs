/** Server-only handler factory. No route is mounted automatically.
 * verifyAccessToken must validate with the identity provider (not decode a JWT).
 * authorizeOnboarding must enforce server-owned pilot admission and rate limits.
 * onboard is a privileged server RPC adapter; never expose its credentials.
 */
export function createOnboardingHandler({verifyAccessToken,authorizeOnboarding,onboard}){
 if(![verifyAccessToken,authorizeOnboarding,onboard].every(x=>typeof x==='function'))throw Error('Verified identity, admission policy and RPC adapters required');
 const reply=(status,data)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
 return async request=>{
  if(request.method!=='POST')return reply(405,{error:'method_not_allowed'});
  if((request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='application/json')return reply(415,{error:'json_required'});
  const auth=request.headers.get('authorization');
  if(!auth||!/^Bearer [^\s]{1,8192}$/.test(auth))return reply(401,{error:'authentication_required'});
  let user;
  try{user=await verifyAccessToken(auth.slice(7));}catch{return reply(503,{error:'identity_unavailable'})}
  if(!user||typeof user.id!=='string'||!uuid(user.id))return reply(401,{error:'invalid_identity'});
  if(user.emailVerified!==true)return reply(403,{error:'verified_email_required'});
  try{if(await authorizeOnboarding(user.id)!==true)return reply(403,{error:'onboarding_not_enabled'});}catch{return reply(503,{error:'admission_unavailable'})}
  let body;
  try{
   const reader=request.body?.getReader();if(!reader)return reply(400,{error:'invalid_request'});
   let size=0;const chunks=[];
   try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();return reply(413,{error:'request_too_large'})}chunks.push(value)}}finally{reader.releaseLock()}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
   body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  }catch{return reply(400,{error:'invalid_request'})}
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['requestId','organizationName','propertyName'].includes(k))||!uuid(body.requestId)||![body.organizationName,body.propertyName].every(x=>typeof x==='string'&&x.trim().length>=1&&x.trim().length<=200))return reply(400,{error:'invalid_request'});
  try{
   const result=await onboard({p_request:body.requestId,p_owner:user.id,p_tenant_name:body.organizationName.trim(),p_property_name:body.propertyName.trim()});
   if(result?.error){if(result.error.code==='P0001')return reply(409,{error:'onboarding_conflict'});return reply(503,{error:'onboarding_unavailable'})}
   const row=result?.data;
   if(row?.request_id!==body.requestId||row?.owner_id!==user.id||!uuid(row?.tenant_id)||!uuid(row?.property_id))return reply(503,{error:'invalid_setup_response'});
   return reply(200,{requestId:row.request_id,organizationId:row.tenant_id,propertyId:row.property_id});
  }catch{return reply(503,{error:'onboarding_unavailable'})}
 };
}
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);
