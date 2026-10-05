'use client';
import {useRef,useState} from 'react';
export function RemoveRoom({label,canRemove,disabled,onRemove}:{label:string;canRemove:boolean;disabled:boolean;onRemove:()=>Promise<void>}){
 const [open,setOpen]=useState(false),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');const saving=useRef(false);
 if(!canRemove)return null;
 if(!open)return <button className="text-button" type="button" disabled={disabled} aria-label={`Remove room ${label}`} onClick={()=>{setConfirmation('');setError('');setOpen(true)}}>Remove room</button>;
 return <form onSubmit={async e=>{e.preventDefault();if(saving.current||disabled||confirmation!==label)return;saving.current=true;setBusy(true);setError('');try{await onRemove();setOpen(false)}catch(e){setError(e instanceof Error?e.message:'Removal could not be confirmed. Refresh the room list before retrying.')}finally{saving.current=false;setBusy(false)}}}>
  <p>Remove room <strong>{label}</strong>? This removes the unused room from this property. Rooms with history, active stays in their room type, or excess future sellable inventory cannot be removed.</p>
  <label className="field">Type {label} to confirm<input aria-label={`Type ${label} to confirm removal`} value={confirmation} onChange={e=>setConfirmation(e.target.value)} disabled={busy||disabled} autoComplete="off"/></label>
  <div className="pilot-actions"><button className="secondary" type="submit" disabled={busy||disabled||confirmation!==label}>{busy?'Removing…':'Confirm remove room'}</button><button className="text-button" type="button" disabled={busy||disabled} onClick={()=>setOpen(false)}>Keep room</button></div>
  {error&&<p role="alert" className="pilot-error">{error}</p>}
 </form>;
}
