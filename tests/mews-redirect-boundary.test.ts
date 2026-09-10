import {describe,expect,it,vi} from 'vitest';
import {MewsHttpTransport,testMewsSandboxConnection} from '../services/hotel-suppliers/mews';
import type {MewsFetch} from '../services/hotel-suppliers/mews';
const config={baseUrl:'https://provider.example.invalid',clientToken:'test-client',accessToken:'test-access',client:'test'};
describe('Mews credential redirect boundary',()=>{
 for(const status of [301,302,303,307,308]){
  for(const operation of ['probe','booking'] as const)it(`${operation} rejects ${status} without automatic credential forwarding`,async()=>{
   const fetcher=vi.fn<MewsFetch>(async(_url,init)=>{
    expect(init?.redirect).toBe('manual');
    return new Response(null,{status,headers:{location:'https://another.example.invalid/capture'}});
   });
   const request=operation==='probe'?testMewsSandboxConnection(config,fetcher):new MewsHttpTransport(config,fetcher).execute({propertyCode:'test',operation:'create_reservation',requestId:'test-redirect',payload:{}});
   await expect(request).rejects.toMatchObject({status});
   expect(fetcher).toHaveBeenCalledTimes(1);
   expect(new URL(String(fetcher.mock.calls[0][0])).origin).toBe(config.baseUrl);
  });
 }
});
