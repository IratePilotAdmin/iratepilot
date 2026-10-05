/** An unconfirmed response must never discard the original drawer request. */
export async function cashierResponse<T>(request:PromiseLike<T>):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([request,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Cashier response took too long. Reload or check the saved result before retrying. A timeout does not confirm that an action failed.')),30000)})])}
 finally{clearTimeout(timer)}
}
