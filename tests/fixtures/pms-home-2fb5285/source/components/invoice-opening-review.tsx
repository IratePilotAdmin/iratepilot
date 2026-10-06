'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelClient,hotelRpc,usd} from '@/lib/pilot';
import {OpeningReclassificationAction} from './invoice-opening-reclassification-action';
import {OpeningItemizationAction} from './invoice-opening-action';
import {readOpeningReview} from '@/lib/invoice-opening-review';
type Props={tenant:string;property:string;reservation:string;actor:string;disabled:boolean};
export function OpeningReversalReview(props:Props){return <Preview key={[props.tenant,props.property,props.reservation,props.actor].join(':')} {...props}/>;}
function Preview({tenant,property,reservation,actor,disabled}:Props){
 const [options,setOptions]=useState<unknown>(null);
 const [preview,setPreview]=useState<ReturnType<typeof readOpeningReview>|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);const alive=useRef(false),lock=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function load(){if(lock.current||disabled)return;lock.current=true;setBusy(true);setError('');setPreview(null);setOptions(null);try{
  const user=await hotelClient().auth.getUser();if(user.error||user.data.user?.id!==actor)throw Error('Sign-in changed. Reopen this stay.');if(!alive.current)return;
  const result=await hotelRpc<unknown>('opening_reversal_review',{p_tenant:tenant,p_property:property,p_reservation:reservation});
  const again=await hotelClient().auth.getUser();if(again.error||again.data.user?.id!==actor)throw Error('Sign-in changed. Reopen this stay.');if(alive.current){setPreview(readOpeningReview(result,{tenant,property,reservation,actor}));setOptions(result);}
 }catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:'Unable to preview charges.');}finally{lock.current=false;if(alive.current)setBusy(false);}}
 return <section className="pilot-settings"><h3>Opening charge corrections</h3><p>Review reversals and the original room, tax and fee categories before itemizing a correction.</p><button disabled={busy||disabled} onClick={()=>void load()}>Review opening corrections</button>{error&&<p role="alert">{error}</p>}{preview&&<><table className="pilot-table"><thead><tr><th>Charge category</th><th>Original</th><th>Itemized corrections</th><th>Remaining</th></tr></thead><tbody>{preview.lines.map(l=><tr key={l.source_key}><td>{l.description}</td><td>{usd(Number(l.original_minor))}</td><td>{usd(Number(l.itemized_minor))}</td><td>{usd(Number(l.available_minor))}</td></tr>)}</tbody></table>{preview.reversals.length===0?<p>No opening charge reversals.</p>:<ul>{preview.reversals.map(r=><li key={r.id}>{r.reference}: {usd(Number(r.amount_minor))} — {r.itemized?'Itemized':'Needs itemization'}{r.classification_revision!==null&&<span> · Classification revision {r.classification_revision}</span>}{r.itemized&&<details><summary>View recorded category split</summary><ul>{r.itemized_lines.map(l=><li key={l.source_key}>{preview.lines.find(x=>x.source_key===l.source_key)?.description||l.source_key}: {usd(Number(l.amount_minor))}</li>)}</ul></details>}</li>)}</ul>}</>}<OpeningItemizationAction tenant={tenant} property={property} reservation={reservation} actor={actor} disabled={disabled||busy} options={options}/><OpeningReclassificationAction tenant={tenant} property={property} reservation={reservation} actor={actor} disabled={disabled||busy} options={options}/></section>;
}
