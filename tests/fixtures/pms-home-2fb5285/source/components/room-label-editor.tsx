'use client';
import {useRef,useState} from 'react';
export function RoomLabelEditor({label,canEdit,disabled,onSave}:{label:string;canEdit:boolean;disabled:boolean;onSave:(label:string)=>Promise<void>}){
 const [editing,setEditing]=useState(false),[draft,setDraft]=useState(label),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const saving=useRef(false);
 if(!canEdit)return null;
 if(!editing)return <button className="text-button" type="button" disabled={disabled} aria-label={`Edit room label ${label}`} onClick={()=>{setDraft(label);setError('');setEditing(true)}}>Edit room label</button>;
 return <form className="room-label-editor" onSubmit={async e=>{e.preventDefault();if(saving.current||disabled)return;const next=draft.trim();if(!next||next.length>40){setError('Enter a room label between 1 and 40 characters.');return}if(next===label){setEditing(false);return}saving.current=true;setBusy(true);setError('');try{await onSave(next);setEditing(false)}catch(e){setError(e instanceof Error?e.message:'Room label could not be saved. Refresh to check the saved label before retrying.')}finally{saving.current=false;setBusy(false)}}}>
  <label className="field">Room number / label<input aria-label={`Room label for ${label}`} value={draft} maxLength={40} required disabled={busy||disabled} onChange={e=>setDraft(e.target.value)}/></label>
  <div className="pilot-actions"><button type="submit" className="primary" disabled={busy||disabled}>{busy?'Saving…':'Save room label'}</button><button type="button" className="secondary" disabled={busy||disabled} onClick={()=>{setEditing(false);setError('')}}>Cancel</button></div>
  {error&&<p role="alert" className="pilot-error">{error}</p>}
 </form>;
}
