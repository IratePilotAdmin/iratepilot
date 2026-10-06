export type SupervisorIssue={id:string;tenant_id:string;property_id:string;property_name:string;issue_key:string;priority:'critical'|'attention';title:string;detail:string;review_status:'open'|'in_review'|'acknowledged';revision:number;first_seen_at:string;observed_at:string;reviewed_at:string|null;assigned:boolean;assigned_to_me:boolean|null;reclaimable?:boolean};
export type SupervisorQueue={as_of:string;property_count:number;total:number;critical:number;acknowledged:number;offset:number;next_offset:number|null;items:SupervisorIssue[]};
export function readSupervisorQueue(value:unknown):SupervisorQueue{
 if(!value||typeof value!=='object')throw Error('Supervisor queue response missing.');const page=value as SupervisorQueue;
 if(!Number.isFinite(Date.parse(page.as_of))||![page.property_count,page.total,page.critical,page.acknowledged,page.offset].every(count=>Number.isSafeInteger(count)&&count>=0)||page.property_count>500||!Array.isArray(page.items)||page.items.length>50||page.critical>page.total||page.acknowledged>page.total||page.next_offset!==null&&page.next_offset!==page.offset+50)throw Error('Supervisor queue response is invalid.');
 const ids=new Set<string>();for(const issue of page.items){if(!issue.id||ids.has(issue.id)||!issue.tenant_id||!issue.property_id||!issue.property_name||!['critical','attention'].includes(issue.priority)||!['open','in_review','acknowledged'].includes(issue.review_status)||!Number.isSafeInteger(issue.revision)||issue.revision<1||!Number.isFinite(Date.parse(issue.first_seen_at))||!Number.isFinite(Date.parse(issue.observed_at))||typeof issue.assigned!=='boolean'||issue.reclaimable!==undefined&&(typeof issue.reclaimable!=='boolean'||issue.reclaimable&&(!issue.assigned||issue.assigned_to_me===true))||issue.assigned_to_me!==null&&typeof issue.assigned_to_me!=='boolean')throw Error('Supervisor queue contains invalid or duplicate issues.');ids.add(issue.id)}
 return page;
}

export function supervisorQueueFresh(asOf:string|null|undefined,now:number,hasError=false,online=true){
 const observed=asOf?Date.parse(asOf):NaN,age=now-observed;
 return online&&!hasError&&Number.isFinite(now)&&Number.isFinite(observed)&&age>=0&&age<5*60000;
}
