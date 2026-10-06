'use client';
import {useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {OperatingManual} from '@/components/operating-manual';

const screenTopics:Record<string,readonly string[]>={
 Today:['daily-checklist','shift','walk-in','check-in','departure','room-move','shift-handover'],
 Reservations:['walk-in','check-in','amend','extend','room-move','cancellation','no-show','groups'],
 'Rooms & housekeeping':['housekeeping','housekeeping-productivity','cleaning-assignments'],
 'Guest records':['guest-records'],
 'Security deposits':['security-deposit'],
 'Balance follow-up':['balance-follow-up'],
 Inventory:['inventory','rates'],
 'Rates & plans':['rates','taxes-fees'],
 'Property settings':['inventory','rates','taxes-fees','cleaning-fee'],
 'Service-day close':['service-close'],
 Reports:['cashier-open','cashier-close','service-close','property-comparison'],
 'Folio reports':['folio-correction','folio-refund','cash-payment'],
 'Company accounts':['company-billing'],
 'Switch to iRatePilot':['financial-migration','financial-migration-recovery'],
 'Property overview':['property-comparison'],
 'Lost and found':['lost-found','storage-move']
};
export function ScreenHelp({view,disabled}:{view:string;disabled:boolean}){
 const [open,setOpen]=useState(false);
 const topics=screenTopics[view];
 if(!topics)return null;
 return <div className="screen-help"><button className="text-button" disabled={disabled} onClick={()=>setOpen(true)}>Help for {view}</button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="reservation-dialog"><DialogTitle>Help for {view}</DialogTitle><DialogDescription>Read instructions while keeping your working screen open.</DialogDescription><button className="secondary" onClick={()=>setOpen(false)}>Return to {view}</button><OperatingManual key={view} topicIds={topics}/></DialogContent></Dialog></div>;
}
