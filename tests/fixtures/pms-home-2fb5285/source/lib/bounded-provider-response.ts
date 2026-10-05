// Server-side response reader: bound allocation before parsing provider JSON.
export async function boundedProviderResponse(response:Response,limit=65536,signal?:AbortSignal):Promise<string>{
 if(!Number.isSafeInteger(limit)||limit<1||limit>8388608)throw Error('Invalid response limit');
 // Bound bytes while reading, including chunked responses without Content-Length.
 if(!response.body)throw Error('Missing provider response');
 const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;let completed=false;
 let abort:()=>void=()=>{};
 const interrupted=signal?new Promise<never>((_,reject)=>{abort=()=>reject(Error('Response read interrupted'));signal.addEventListener('abort',abort,{once:true})}):undefined;
 try{
  if(signal?.aborted)throw Error('Response read interrupted');
  while(true){const {done,value}=await (interrupted?Promise.race([reader.read(),interrupted]):reader.read());if(done){completed=true;break}size+=value.byteLength;
   if(size>limit)throw Error('Response too large');
   chunks.push(value);
  }
 }finally{signal?.removeEventListener('abort',abort);if(!completed)void reader.cancel().catch(()=>{});reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
 return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
