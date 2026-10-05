import {hotelRpc} from '@/lib/pilot';
// A timeout leaves the persisted request intact; retries use its original identity.
export async function lostFoundRpc<T>(name:string,args:Record<string,unknown>):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([hotelRpc<T>(name,args),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error(['found_items','found_item_moves'].includes(name)?'The item records timed out. Please retry.':'The item request timed out. Retry the same record before entering another item.')),15000);})]);}
 finally{clearTimeout(timer);}
}

