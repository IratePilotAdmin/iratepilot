type Options<T>={read:(signal:AbortSignal)=>Promise<T>;apply:(value:T)=>void;onError:(error:unknown)=>void;visible:()=>boolean;delayMs?:number;timeoutMs?:number};
/** One coordinator per actor/property. Dispose before switching either scope. */
export function createWorkspaceRefresh<T>({read,apply,onError,visible,delayMs=150,timeoutMs=15000}:Options<T>){
 let disposed=false,dirty=false,running=false;
 let timer:ReturnType<typeof setTimeout>|undefined,deadline:ReturnType<typeof setTimeout>|undefined,controller:AbortController|undefined;
 function schedule(){if(disposed||running||timer!==undefined||!dirty||!visible())return;timer=setTimeout(()=>{timer=undefined;void flush()},delayMs)}
 async function flush(){
  if(disposed||running||!dirty||!visible())return;
  dirty=false;running=true;const active=new AbortController();controller=active;
  try{
   const value=await Promise.race([Promise.resolve().then(()=>read(active.signal)),new Promise<never>((_,reject)=>{deadline=setTimeout(()=>{active.abort();reject(Error('Workspace refresh timed out. Refresh again before making changes.'))},timeoutMs)})]);
   if(!disposed&&!active.signal.aborted)apply(value);
  }catch(error){if(!disposed)onError(error)}
  finally{clearTimeout(deadline);deadline=undefined;running=false;if(controller===active)controller=undefined;schedule()}
 }
 return {
  invalidate(){if(disposed)return;dirty=true;schedule()},
  resume(){schedule()},
  dispose(){disposed=true;dirty=false;clearTimeout(timer);timer=undefined;controller?.abort();/* Keep deadline until the pending read settles; it bounds an uncooperative provider. */}
 };
}
