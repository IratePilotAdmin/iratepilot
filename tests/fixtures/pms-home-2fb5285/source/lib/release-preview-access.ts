import {enrolledStaffAssuranceFailure} from './enrolled-staff-assurance';
import {paymentProviderJson} from './payment-provider-json';
import {supabaseUrl,publishableKey} from './hotel-connection';

export class ReleasePreviewAccessError extends Error{
 constructor(message:string,public status:number){super(message)}
}
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
/** Server-owned configuration only. Preview access grants no property or financial authority.
 * Callers must still enforce the normal property permissions for every operation. */
export async function releasePreviewAccess(authorization:string|null,config:{enabled:unknown;ownerId:unknown;ownerEmail:unknown}){
 if(config.enabled!==true||!uuid(config.ownerId)||typeof config.ownerEmail!=='string'||config.ownerEmail!==config.ownerEmail.trim()||!/^\S+@\S+\.\S+$/.test(config.ownerEmail))
  throw new ReleasePreviewAccessError('Private preview is not available yet.',503);
 if(!authorization||!/^Bearer [^\s]+$/.test(authorization)||authorization.length>8192)
  throw new ReleasePreviewAccessError('Sign in to open the private preview.',401);
 let user:unknown;
 try{user=await paymentProviderJson(`${supabaseUrl}/auth/v1/user`,{headers:{Authorization:authorization,apikey:publishableKey},cache:'no-store'},65536,10000)}
 catch{throw new ReleasePreviewAccessError('Your sign-in could not be verified. Try again.',503)}
 if(!user||typeof user!=='object'||!uuid((user as {id?:unknown}).id))throw new ReleasePreviewAccessError('Your sign-in could not be verified. Try again.',503);
 const verified=user as {id:string;email?:unknown;email_confirmed_at?:unknown;factors?:unknown};
 if(verified.id.toLowerCase()!==config.ownerId.toLowerCase()||typeof verified.email!=='string'||verified.email.toLowerCase()!==config.ownerEmail.toLowerCase()||typeof verified.email_confirmed_at!=='string'||!Number.isFinite(Date.parse(verified.email_confirmed_at)))
  throw new ReleasePreviewAccessError('This preview is available only to its designated owner.',403);
 const assurance=enrolledStaffAssuranceFailure(authorization,verified);
 if(assurance)throw new ReleasePreviewAccessError(assurance.status===403?'Complete two-step verification to open the private preview.':assurance.message,assurance.status);
 return Object.freeze({actor:verified.id.toLowerCase()});
}

