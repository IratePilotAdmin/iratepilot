import {createHmac,timingSafeEqual} from 'node:crypto';
export type NativeAriUpdate={date:string;roomTypeId:string;ratePlanId:string;available:number;rateMinor:number;currency:'USD';minimumStay:1;maximumStay:null;restrictions:[]};
export type NativeAriBatch={contractVersion:1;eventId:string;propertyId:string;connector:'iratepilot';connectionId:string;sourceVersion:number;generatedAt:string;updates:NativeAriUpdate[]};
type Config={mode?:string;signingSecrets?:string};
type Readback={outcome:'validated';persisted:false;certified:false;observations:Record<string,unknown>[]};
const maxBytes=262144,token=/^[A-Za-z0-9_-]{1,128}$/;
const exact=(value:unknown,keys:string[])=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===keys.slice().sort().join(',');
const integer=(value:unknown,min:number,max:number)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max;
function validBatch(value:unknown):value is NativeAriBatch{
 if(!exact(value,['contractVersion','eventId','propertyId','connector','connectionId','sourceVersion','generatedAt','updates']))return false;
 const b=value as NativeAriBatch;
 if(b.contractVersion!==1||b.connector!=='iratepilot'||![b.eventId,b.propertyId,b.connectionId].every(v=>typeof v==='string'&&token.test(v))||!integer(b.sourceVersion,1,Number.MAX_SAFE_INTEGER)||typeof b.generatedAt!=='string'||!Number.isFinite(Date.parse(b.generatedAt))||new Date(b.generatedAt).toISOString()!==b.generatedAt||!Array.isArray(b.updates)||b.updates.length<1||b.updates.length>366)return false;
 const seen=new Set<string>();for(const u of b.updates){if(!exact(u,['date','roomTypeId','ratePlanId','available','rateMinor','currency','minimumStay','maximumStay','restrictions'])||typeof u.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(u.date)||!Number.isFinite(Date.parse(u.date+'T00:00:00Z'))||new Date(u.date+'T00:00:00Z').toISOString().slice(0,10)!==u.date||typeof u.roomTypeId!=='string'||!token.test(u.roomTypeId)||typeof u.ratePlanId!=='string'||!token.test(u.ratePlanId)||!integer(u.available,0,500)||!integer(u.rateMinor,2500,2500000)||u.currency!=='USD'||u.minimumStay!==1||u.maximumStay!==null||!Array.isArray(u.restrictions)||u.restrictions.length!==0)return false;const key=u.date+'|'+u.roomTypeId+'|'+u.ratePlanId;if(seen.has(key))return false;seen.add(key)}return true;
}
function secretFor(raw:string|undefined,id:string){if(!raw||Buffer.byteLength(raw)>32768)return null;try{const values=JSON.parse(raw);if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).length>200||!Object.hasOwn(values,id))return null;const secret=values[id];return typeof secret==='string'&&Buffer.byteLength(secret)>=32&&Buffer.byteLength(secret)<=512?secret:null}catch{return null}}
async function boundedBody(request:Request){if(!request.body)return Buffer.alloc(0);const reader=request.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>maxBytes){await reader.cancel();throw Error('payload_too_large')}chunks.push(value)}}finally{reader.releaseLock()}return Buffer.concat(chunks)}
const reply=(status:number,body:unknown)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
export async function handleNativeAriShadow(request:Request,config:Config,validate:(batch:NativeAriBatch)=>Promise<Readback>,now=Date.now()):Promise<Response>{
 if(config.mode!=='validate_only')return reply(503,{error:'receiver_disabled'});
 if(request.method!=='POST')return reply(405,{error:'method_not_allowed'});
 if((request.headers.get('content-type')??'').split(';')[0].trim().toLowerCase()!=='application/json')return reply(415,{error:'json_required'});
 if(Number(request.headers.get('content-length')??0)>maxBytes)return reply(413,{error:'payload_too_large'});
 const id=request.headers.get('x-irp-connection')??'',timestamp=request.headers.get('x-irp-timestamp')??'',signature=request.headers.get('x-irp-signature')??'',secret=secretFor(config.signingSecrets,id);
 if(!secret||!/^[A-Za-z0-9_-]{1,80}$/.test(id)||!/^\d{1,12}$/.test(timestamp)||!Number.isSafeInteger(Number(timestamp))||Math.abs(Math.floor(now/1000)-Number(timestamp))>300||!/^[a-f0-9]{64}$/.test(signature))return reply(401,{error:'unauthorized'});
 let raw:Buffer;try{raw=await boundedBody(request)}catch{return reply(413,{error:'payload_too_large'})}
 const expected=createHmac('sha256',secret).update(`${timestamp}.${id}.`).update(raw).digest();if(!timingSafeEqual(expected,Buffer.from(signature,'hex')))return reply(401,{error:'unauthorized'});
 let batch:unknown;try{batch=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw))}catch{return reply(400,{error:'invalid_json'})}
 if(!validBatch(batch)||batch.connectionId!==id)return reply(422,{error:'invalid_ari_contract'});
 try{const result=await validate(batch);if(result?.outcome!=='validated'||result.persisted!==false||result.certified!==false||!Array.isArray(result.observations)||result.observations.length!==batch.updates.length)throw Error('invalid_readback');return reply(200,{outcome:'validated',persisted:false,certified:false,observations:result.observations,eventId:batch.eventId,sourceVersion:batch.sourceVersion,mode:'validate_only'})}catch{return reply(503,{error:'validation_unavailable'})}
}
