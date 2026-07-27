"use client";
import { useEffect,useState } from "react";
type Notification={id:string;title:string;body:string;read_at:string|null;created_at:string};
export function AccountNotifications(){
  const [items,setItems]=useState<Notification[]>([]);const [message,setMessage]=useState("Loading notifications…");
  useEffect(()=>{fetch("/api/notifications").then(async(response)=>{const body=await response.json();if(!response.ok)throw new Error(body.error);setItems(body.data);setMessage("");}).catch((error:Error)=>setMessage(error.message));},[]);
  return <section className="card mt-8 overflow-hidden"><div className="border-b p-6"><h2 className="text-xl font-semibold">Booking notifications</h2><p className="mt-1 text-sm text-slate-500">Updates from properties and iRatePilot appear here.</p></div>{message&&<p role="status" className="p-6 text-sm text-slate-500">{message}</p>}<div className="divide-y">{items.map((item)=><article key={item.id} className="p-6"><strong>{item.title}</strong><p className="mt-2 text-sm text-slate-600">{item.body}</p><time className="mt-2 block text-xs text-slate-400">{new Date(item.created_at).toLocaleString()}</time></article>)}</div>{!message&&!items.length&&<p className="p-6 text-sm text-slate-500">No notifications yet.</p>}</section>;
}
