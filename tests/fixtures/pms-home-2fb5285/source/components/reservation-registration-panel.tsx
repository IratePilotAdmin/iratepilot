'use client';
import {useState} from 'react';
import {ReservationRegistrationHistory} from './reservation-registration-history';
import {ReservationRegistrationIssue} from './reservation-registration-issue';
import {RegistrationAccessHistory} from './registration-access-history';
import {RegistrationDetail} from './registration-detail';
type Props={tenant:string;property:string;actor:string;reservation:string;accessToken:string;role:string};
export function ReservationRegistrationPanel(props:Props){
 if(!['owner','manager','staff'].includes(props.role))return <p>Current property staff access is required to manage registration.</p>;
 return <Panel key={[props.tenant,props.property,props.actor,props.reservation,props.role].join('/')} {...props}/>;
}
function Panel(props:Props){
 const [view,setView]=useState<'history'|'create'|'detail'>('history'),[selected,setSelected]=useState<string|null>(null),[openedCreate,setOpenedCreate]=useState(false);
 return <section aria-label="Reservation registration"><nav aria-label="Registration actions"><button aria-pressed={view==='history'} onClick={()=>setView('history')}>Registration history</button><button aria-pressed={view==='create'} onClick={()=>{setOpenedCreate(true);setView('create')}}>Create guest link</button></nav>
  <div hidden={view!=='history'}><ReservationRegistrationHistory {...props} onReview={id=>{setSelected(id);setView('detail')}}/></div>
  {openedCreate&&<div hidden={view!=='create'}><ReservationRegistrationIssue {...props}/></div>}
  {selected&&<div hidden={view!=='detail'}><button onClick={()=>setView('history')}>Back to registration history</button><RegistrationDetail {...props} registrationId={selected}/><RegistrationAccessHistory {...props} registrationId={selected}/></div>}
 </section>;
}
