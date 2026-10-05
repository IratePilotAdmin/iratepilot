import {boundedProviderResponse} from './bounded-provider-response';
import {registrationDocumentHash,type RegistrationDocument} from './registration-document';

type Scope={tenant:string;property:string;accessToken:string};
type Action={action:'access_history';registrationId:string;after:{at:number;id:string}|null}|{action:'history';reservation:string;after:string|null}|{action:'documents';after:string|null}|{action:'publish';document:RegistrationDocument}|{action:'issue';requestId:string;reservation:string;documentHash:string}|{action:'review';registrationId:string}|{action:'revoke';registrationId:string;reason:string};
export async function registrationStaffRequest(scope:Scope,action:Action):Promise<unknown>{
 if(!scope.accessToken||scope.accessToken.length>8185)throw Error('Sign in again.');
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  return await Promise.race([(async()=>{
   const response=await fetch('/api/staff-registration',{method:'POST',mode:'same-origin',credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json',Authorization:'Bearer '+scope.accessToken},body:JSON.stringify({...action,tenant:scope.tenant,property:scope.property}),signal:controller.signal});
   if(!response.ok){void response.body?.cancel().catch(()=>{});throw Error(response.status===401||response.status===403?'Your staff access could not be confirmed. Sign in and check the selected property.':response.status===409?'Registration changed or already exists. Review its current status before continuing.':response.status===429?'Too many requests. Wait before retrying.':'Registration could not be confirmed. Please retry.')}
   if(response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw Error('Registration returned an unexpected response.');
   return JSON.parse(await boundedProviderResponse(response,250000));
  })(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Registration could not be confirmed in time. Retry the same action.'))},25000)})]);
 }finally{if(timer!==undefined)clearTimeout(timer);controller.abort()}
}
export async function publishRegistrationFromBrowser(scope:Scope,document:RegistrationDocument){
 const expected=await registrationDocumentHash(document),result=await registrationStaffRequest(scope,{action:'publish',document});
 if(!result||typeof result!=='object')throw Error('The published document could not be verified.');
 const r=result as {documentHash:string;publishedBy:string;publishedAt:number};
 if(r.documentHash!==expected||typeof r.publishedBy!=='string'||!r.publishedBy||!Number.isSafeInteger(r.publishedAt)||r.publishedAt<=0)throw Error('The published document could not be verified.');
 return r;
}
