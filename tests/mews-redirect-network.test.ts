import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {expect,it} from 'vitest';
import {MewsHttpTransport,testMewsSandboxConnection} from '../services/hotel-suppliers/mews';
import type {MewsFetch} from '../services/hotel-suppliers/mews';

it('native fetch does not deliver fictional credentials to a redirected server',async()=>{
 let destinationRequests=0,sourceRequests=0,status=307;
 const destination=createServer((_req,res)=>{destinationRequests++;res.end('{}');});
 await new Promise<void>(resolve=>destination.listen(0,'127.0.0.1',resolve));
 const target='http://127.0.0.1:'+(destination.address() as AddressInfo).port;
 const source=createServer((req,res)=>{sourceRequests++;req.resume();res.writeHead(status,{Location:target});res.end();});
 await new Promise<void>(resolve=>source.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+(source.address() as AddressInfo).port;
 const config={baseUrl:'https://provider.example.invalid',clientToken:'fictional-client',accessToken:'fictional-access',client:'local-test'};
 // Rewrite only the initial destination to our local fixture; native fetch
 // handles the response using the adapter's actual redirect option.
 const fetcher:MewsFetch=(_url,init)=>fetch(origin,init);
 try{
  for(status of [301,302,303,307,308]){
   await expect(testMewsSandboxConnection(config,fetcher)).rejects.toMatchObject({status});
   await expect(new MewsHttpTransport(config,fetcher).execute({propertyCode:'test',operation:'create_reservation',requestId:'network-'+status,payload:{}})).rejects.toMatchObject({status});
  }
  expect(sourceRequests).toBe(10);expect(destinationRequests).toBe(0);
 }finally{
  await Promise.all([source,destination].map(server=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))));
 }
});
