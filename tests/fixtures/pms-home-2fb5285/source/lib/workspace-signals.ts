import type {SupabaseClient} from '@supabase/supabase-js';
type Scope={tenant:string;property:string};
export type WorkspaceConnection='connecting'|'connected'|'fallback';
/** Development adapter. Activate only after signal-table RLS/publication verification. */
export function subscribeWorkspaceSignals(client:SupabaseClient,scope:Scope,invalidate:()=>void,status:(state:WorkspaceConnection)=>void){
 const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
 if(!uuid.test(scope.tenant)||!uuid.test(scope.property))throw Error('Invalid workspace subscription scope.');
 let disposed=false;
 const channel=client.channel('workspace:'+crypto.randomUUID());
 const changed=(payload:{new:Record<string,unknown>})=>{
  if(disposed)return;
  const row=payload.new;
  // Treat signals only as invalidation hints. The authorized RPC supplies the data.
  if(row.tenant_id===scope.tenant&&row.property_id===scope.property)invalidate();
 };
 status('connecting');
 for(const event of ['INSERT','UPDATE'] as const)channel.on('postgres_changes',{event,schema:'public',table:'irp_pms_workspace_signals',filter:'property_id=eq.'+scope.property},changed);
 channel.subscribe(value=>{if(disposed)return;if(value==='SUBSCRIBED'){status('connected');invalidate()}else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(value)){status('fallback')}});
 return ()=>{if(disposed)return;disposed=true;void client.removeChannel(channel).catch(()=>{/* Polling remains the fallback; no late callbacks may update this scope. */})};
}

export function workspaceSignalsEnabled(value:unknown,scope:Scope):boolean{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const row=value as Record<string,unknown>;
 return row.schema_version===1&&row.tenant_id===scope.tenant&&row.property_id===scope.property&&row.enabled===true;
}
