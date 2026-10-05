'use client';
import {useCallback,useEffect,useState} from 'react';
import {hotelClient} from '@/lib/pilot';

type Status={testConfigurationPresent:boolean;checks:{testSecretConfigured:boolean;webhookSecretConfigured:boolean;propertyBound:boolean;paymentStoreConfigured:boolean};issues:string[];verification:{providerConnectionVerified:boolean;signedWebhookDeliveryVerified:boolean};wallets:{checkoutSupportsApplePayAndGooglePay:boolean;deviceAndAccountEligibilityRequired:boolean;deviceAcceptanceVerified:boolean}};

export function PaymentReadiness({actor,tenant,property,role}:{actor:string;tenant:string;property:string;role:string}){
 const [status,setStatus]=useState<Status|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const readStatus=useCallback(async(signal?:AbortSignal):Promise<Status>=>{
  const {data}=await hotelClient().auth.getSession();
  if(data.session?.user?.id!==actor||!data.session.access_token)throw Error('Your account changed. Reopen Connections and try again.');
  const query=new URLSearchParams({tenant,property});
  const response=await fetch(`/api/payment-readiness?${query}`,{headers:{Authorization:`Bearer ${data.session.access_token}`},cache:'no-store',signal});
  const body=await response.json() as Status|{error?:string};
  if(!response.ok)throw Error('error'in body&&body.error?body.error:'Payment setup status is unavailable.');
  return body as Status;
 },[actor,tenant,property]);
 const refresh=useCallback(async()=>{
  setBusy(true);setError('');
  try{setStatus(await readStatus())}
  catch(reason){setError(reason instanceof Error?reason.message:'Payment setup status is unavailable.')}
  finally{setBusy(false)}
 },[readStatus]);
 useEffect(()=>{const controller=new AbortController();readStatus(controller.signal).then(value=>{if(!controller.signal.aborted)setStatus(value)}).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Payment setup status is unavailable.')});return()=>controller.abort()},[readStatus]);
 if(!['owner','manager'].includes(role))return null;
 return <section className="card pilot-settings" aria-labelledby="payment-readiness-title"><div className="section-top"><div><h2 id="payment-readiness-title">Stripe payment setup</h2><p>Read-only status for this property. No keys or payment details are shown.</p></div><button type="button" className="secondary" disabled={busy} onClick={()=>void refresh()}>{busy?'Checking…':'Refresh status'}</button></div>{error&&<p role="alert" className="pilot-error">{error}</p>}{status&&<><p><span className={'pill '+(status.testConfigurationPresent?'green':'gray')}>{status.testConfigurationPresent?'Server test settings present':'Test setup needs server settings'}</span> <span className="muted">Sandbox only · USD</span></p>{status.issues.length>0&&<ul>{status.issues.map(issue=><li key={issue}>{issue}</li>)}</ul>}<p>These checks only confirm server settings. They do not verify the Stripe account, webhook delivery or a successful payment. Stripe Checkout supports Apple Pay and Google Pay when enabled for the account and supported by the guest’s device and browser; wallet availability has not been tested on a physical device. Test mode does not collect real funds.</p></>}</section>;
}
