'use client';
import {useEffect,useState} from 'react';

export function PmsConnectivity(){
 const [offline,setOffline]=useState(false);
 useEffect(()=>{
  const update=()=>setOffline(!navigator.onLine);
  update();window.addEventListener('online',update);window.addEventListener('offline',update);
  if('serviceWorker' in navigator&&location.protocol==='https:'){
   // Installation can be unavailable under browser or hosting restrictions.
   // Keep the online PMS usable; never report installation as successful here.
   void navigator.serviceWorker.register('/pms-sw.js',{scope:'/',updateViaCache:'none'}).catch(()=>{});
  }
  return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};
 },[]);
 if(!offline)return null;
 return <aside className="pms-offline-notice" role="alert"><strong>You are offline.</strong> Reconnect and refresh before reviewing hotel data or taking action. Previously displayed records may be out of date. <button type="button" onClick={()=>location.reload()}>Try reconnecting</button></aside>;
}
