"use client";
import { useEffect,useState } from "react";
type Booking={id:string;confirmation_code:string;check_in:string;check_out:string;total:number;status:string;properties?:{name?:string}|null;rooms?:{name?:string}|null;profiles?:{full_name?:string}|null};
export function AdminBookings(){
  const [items,setItems]=useState<Booking[]>([]);const [message,setMessage]=useState("Loading bookings…");
  async function load(){const response=await fetch("/api/admin/bookings");const body=await response.json();if(!response.ok)throw new Error(body.error);setItems(body.data);setMessage("");}
  useEffect(()=>{
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((error:Error)=>setMessage(error.message));
  },[]);
  async function decide(id:string,decision:"approve"|"reject"){const response=await fetch(`/api/partner/reservations/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({decision,reason:decision==="reject"?"Declined by iRatePilot administrator":""})});const body=await response.json();setMessage(response.ok?body.message:body.error);if(response.ok)await load();}
  return <section className="card mt-8 overflow-hidden">{message&&<p role="status" className="p-6 text-sm text-slate-500">{message}</p>}<div className="divide-y">{items.map((item)=><article key={item.id} className="grid gap-4 p-6 lg:grid-cols-[1fr_auto_auto] lg:items-center"><div><strong>{item.properties?.name} — {item.rooms?.name}</strong><p className="mt-1 text-sm text-slate-500">{item.profiles?.full_name||"Traveler"} · {item.check_in} to {item.check_out}</p><p className="mt-2 text-xs uppercase tracking-wider text-slate-500">{item.confirmation_code} · {item.status}</p></div><strong>${Number(item.total).toFixed(2)}</strong>{item.status==="pending"?<div className="flex gap-2"><button onClick={()=>decide(item.id,"approve")} className="btn-primary">Approve</button><button onClick={()=>decide(item.id,"reject")} className="btn-secondary">Decline</button></div>:<span className="badge">{item.status}</span>}</article>)}</div></section>;
}
