'use client';
import {useState,type ReactNode} from 'react';
export function HousekeepingSections({disabled,rooms,turnover,maintenance,productivity}:{disabled:boolean;rooms:ReactNode;turnover:ReactNode;maintenance:ReactNode;productivity?:ReactNode}){
 const [view,setView]=useState<'rooms'|'turnover'|'maintenance'|'productivity'>('rooms');
 const sections=[{id:'rooms',label:'Room readiness',content:rooms},{id:'turnover',label:'Turnover tasks',content:turnover},{id:'maintenance',label:'Maintenance',content:maintenance},...(productivity?[{id:'productivity' as const,label:'Productivity',content:productivity}]:[])] as const;
 const active=view==='productivity'&&!productivity?'rooms':view;
 return <div className="housekeeping-sections"><nav aria-label="Housekeeping tasks">{sections.map(s=><button key={s.id} className={active===s.id?'primary':'secondary'} aria-pressed={active===s.id} disabled={disabled} onClick={()=>setView(s.id)}>{s.label}</button>)}</nav>
 {sections.map(s=><section key={s.id} aria-label={s.label} hidden={active!==s.id} style={active!==s.id?{display:'none'}:undefined}>{s.content}</section>)}
 </div>;
}
