import type {SupabaseClient} from '@supabase/supabase-js';
import {z} from 'zod';
import type {ApprovalTransport} from './revenue-approval-recovery';

const uuid=z.string().uuid().transform(value=>value.toLowerCase());
const scopeSchema=z.object({p_tenant:uuid,p_property:uuid,p_request:uuid}).strict();

// Read-only candidate. Mount through the recovery controller for its reply deadline.
export function createRevenueApprovalStatusTransport(options:{
  apiUrl:string;publishableKey:string;actorId:string;tenantId:string;propertyId:string;
  auth:Pick<SupabaseClient['auth'],'getSession'|'getUser'>;fetch?:typeof fetch;
}):ApprovalTransport{
  const actor=uuid.parse(options.actorId),tenant=uuid.parse(options.tenantId),property=uuid.parse(options.propertyId);
  const url=new URL(options.apiUrl);
  if(url.protocol!=='https:'||! /^[a-z]{20}\.supabase\.co$/.test(url.hostname)
    ||url.username||url.password||url.port||url.pathname!=='/'||url.search||url.hash)
    throw new Error('Use the configured Supabase project origin');
  if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(options.publishableKey))
    throw new Error('A publishable client key is required');
  const request=options.fetch??fetch;
  async function sessionToken(){
    const {data,error}=await options.auth.getSession();
    if(error||!data.session?.access_token)throw new Error('Sign in to check saved status');
    return data.session.access_token;
  }
  async function unchanged(token:string){
    if(await sessionToken()!==token)throw new Error('Account session changed. Check saved status again.');
  }
  return {
    async apply(){throw new Error('Audited saving is not enabled');},
    async status(input){
      const scope=scopeSchema.parse(input);
      if(scope.p_tenant!==tenant||scope.p_property!==property)throw new Error('Saved-status scope mismatch');
      const token=await sessionToken();
      // Verify the captured token with Auth; never trust the session's stored user object.
      const {data,error}=await options.auth.getUser(token);
      if(error||!data.user||data.user.id.toLowerCase()!==actor)
        throw new Error('Saved-status identity could not be verified');
      await unchanged(token);
      const response=await request(new URL('/rest/v1/rpc/irp_pms_pilot_revenue_decision_status',url),{
        method:'POST',headers:{apikey:options.publishableKey,Authorization:`Bearer ${token}`,
          'Content-Type':'application/json','Accept':'application/json','Content-Profile':'public'},
        body:JSON.stringify(scope),cache:'no-store',credentials:'omit',redirect:'error',
      });
      // Service failures must never become found=false or a permission to resend.
      if(!response.ok)throw new Error(response.status===401||response.status===403
        ?'Saved-status access denied. Approval remains unresolved.'
        :'Saved-status service unavailable. Approval remains unresolved.');
      const text=await response.text();
      if(text.length>16384)throw new Error('Saved-status reply is too large');
      let value:unknown;
      try{value=JSON.parse(text);}catch{throw new Error('Invalid saved-status reply');}
      await unchanged(token);
      return value; // Controller validates found, full receipt identity and strict response shape.
    },
  };
}
