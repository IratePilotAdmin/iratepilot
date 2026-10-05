/** Bounds the UI wait; a late read cannot replace the result of a retry. */
export async function readMembershipsWithDeadline<T>(read:()=>Promise<T>,timeoutMs=15000):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([Promise.resolve().then(read),new Promise<never>((_,reject)=>{
  timer=setTimeout(()=>reject(Error('Property memberships could not load in time. Retry when your connection is available.')),timeoutMs);
 })]);}finally{clearTimeout(timer);}
}
