import type {TurnoverList} from '@/lib/turnovers';
export type CleaningCapacity={userId:string;maximumTasks:number};
// Planning only. Apply through authorized, version-checked commands after review.
export function planTurnoverAssignments(data:TurnoverList,team:CleaningCapacity[]){
 if(!data.can_manage)throw Error('Manager access is required.');
 if(!team.length||team.length>200||new Set(team.map(p=>p.userId)).size!==team.length)throw Error('Choose a unique cleaning team.');
 const eligible=new Set(data.eligible_assignees.map(p=>p.user_id));
 if(team.some(p=>!eligible.has(p.userId)||!Number.isSafeInteger(p.maximumTasks)||p.maximumTasks<1||p.maximumTasks>100))throw Error('Choose current staff with task limits from 1 to 100.');
 const loads=[...team].sort((a,b)=>a.userId.localeCompare(b.userId)).map(p=>({...p,existing:data.open_tasks.filter(t=>t.assignee_id===p.userId&&['queued','in_progress'].includes(t.state)).length,proposed:0}));
 const candidates=data.open_tasks.filter(t=>t.state==='queued'&&t.assignee_id===null&&t.due_date<=data.business_date&&t.blocked_reasons.length===0&&t.occupied_reservation_id===null).sort((a,b)=>a.due_date.localeCompare(b.due_date)||a.id.localeCompare(b.id));
 const assignments:{taskId:string;roomId:string;roomLabel:string;assigneeId:string;taskVersion:number;roomVersion:number}[]=[];
 const unallocated:string[]=[];
 for(const task of candidates){
  const available=loads.filter(p=>p.existing+p.proposed<p.maximumTasks).sort((a,b)=>(a.existing+a.proposed)*b.maximumTasks-(b.existing+b.proposed)*a.maximumTasks||a.userId.localeCompare(b.userId));
  const person=available[0];if(!person){unallocated.push(task.id);continue}
  person.proposed++;
  assignments.push({taskId:task.id,roomId:task.room_id,roomLabel:task.room_label,assigneeId:person.userId,taskVersion:task.version,roomVersion:task.room_state_version});
 }
 return {propertyId:data.property_id,businessDate:data.business_date,snapshotAt:data.generated_at,assignments,unallocated,loads};
}
