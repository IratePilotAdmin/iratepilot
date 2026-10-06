/** A timeout is an unknown outcome, never permission to issue a replacement invoice. */
export async function invoiceResponse<T>(request:PromiseLike<T>):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([request,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Invoice response took too long. Check the saved invoice result before creating another invoice.')),30000)})])}
 finally{clearTimeout(timer)}
}
