import {env} from 'cloudflare:workers';
import {releasePreviewAccess,ReleasePreviewAccessError} from '@/lib/release-preview-access';

const reply=(body:unknown,status:number)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Vary':'Authorization','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});

/** Identity check only: not a session, capability token, or authorization for PMS operations. */
export async function GET(request:Request){
 const url=new URL(request.url);
 if(request.headers.get('sec-fetch-site')==='cross-site'||request.headers.has('origin')&&request.headers.get('origin')!==url.origin)
  return reply({error:'Open the private preview from the PMS website.'},403);
 if(url.search)return reply({error:'Preview access does not accept URL parameters.'},400);
 const settings=env as unknown as Record<string,unknown>;
 try{
  const access=await releasePreviewAccess(request.headers.get('authorization'),{enabled:settings.RELEASE_PREVIEW_ENABLED==='true',ownerId:settings.RELEASE_PREVIEW_OWNER_ID,ownerEmail:settings.RELEASE_PREVIEW_OWNER_EMAIL});
  return reply({schema_version:1,actor_id:access.actor,verified:true},200);
 }catch(error){
  return error instanceof ReleasePreviewAccessError?reply({error:error.message},error.status):reply({error:'Private preview verification is temporarily unavailable.'},503);
 }
}
