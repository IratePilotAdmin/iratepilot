'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelClient,hotelRpc,usd,type Membership} from '@/lib/pilot';
import {CashierVarianceAction} from './cashier-variance-action';
import {readVarianceHistory} from '@/lib/cashier-variance';
export function CashierVariance({membership,session,onReviewSaved}:{membership:Membership;session:string;onReviewSaved?:()=>void}){return <History key={[membership.tenant_id,membership.property_id,session].join(':')} membership={membership} session={session} onReviewSaved={onReviewSaved}/>}
function History({membership,session,onReviewSaved}:{membership:Membership;session:string;onReviewSaved?:()=>void}){
 const [data,setData]=useState<ReturnType<typeof readVarianceHistory>|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');const alive=useRef(false),lock=useRef(false),actor=useRef('');
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 async function load(older=false){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{
  const user=await hotelClient().auth.getUser();if(user.error||!user.data.user)throw Error('Sign in to review variances.');const id=user.data.user.id;if(older&&actor.current!==id)throw Error('Sign-in changed. Refresh variance history.');
  const before=older?data?.next:null;if(older&&!before)return;
  const result=await hotelRpc('cashier_variance_history',{p_tenant:membership.tenant_id,p_property:membership.property_id,p_session:session,p_before_revision:before??null});
  const parsed=readVarianceHistory(result,{tenant:membership.tenant_id,property:membership.property_id,session,actor:id},before??null);
  const again=await hotelClient().auth.getUser();if(again.error||again.data.user?.id!==id)throw Error('Sign-in changed. Refresh variance history.');if(!alive.current)return;actor.current=id;setData(parsed);
 }catch(e){if(alive.current){setData(null);setError(e instanceof Error?e.message:'Unable to load variance history.')}}finally{lock.current=false;if(alive.current)setBusy(false)}}
 return <section className="card"><h3>Cash variance review</h3><button disabled={busy} onClick={()=>void load()}>Refresh variance history</button>{error&&<p role="alert">{error}</p>}{data&&<><p>Expected {usd(Number(data.expected))} · Counted {usd(Number(data.counted))} · Over / short {usd(Number(data.variance))}</p><p>Closing explanation: {data.closingReason}</p><p>{data.count} recorded reviews. A review does not post a journal or confirm cash recovery.</p>{data.history.length?<table className="pilot-table"><thead><tr><th>Revision</th><th>Outcome</th><th>Explanation</th><th>Reviewed at</th></tr></thead><tbody>{data.history.map(r=><tr key={r.revision}><td>{r.revision}</td><td>{r.outcome.replaceAll('_',' ')}</td><td>{r.reason}</td><td>{r.created_at}</td></tr>)}</tbody></table>:<p>No variance reviews recorded.</p>}{data.canReview&&<CashierVarianceAction key={actor.current} scope={{tenant:membership.tenant_id,property:membership.property_id,session,actor:actor.current}} revision={data.revision} onSaved={()=>{void load();onReviewSaved?.()}}/>} {data.next&&<button disabled={busy} onClick={()=>void load(true)}>Older variance reviews</button>}</>}</section>;
}