import type {TurnoverList} from '@/lib/turnovers';

type Load={id:string;label:string;queued:number;cleaning:number;inspection:number;due:number;blocked:number};
export function turnoverWorkloads(data:TurnoverList):Load[]{
 const rows=new Map<string,Load>();
 const add=(id:string,label:string)=>{const row={id,label,queued:0,cleaning:0,inspection:0,due:0,blocked:0};rows.set(id,row);return row};
 for(const person of data.eligible_assignees)add(person.user_id,person.label);
 for(const task of data.open_tasks){
  const id=task.assignee_id===null?'unassigned':rows.has(task.assignee_id)&&task.assignee_current_member?task.assignee_id:'review';
  const row=rows.get(id)??add(id,id==='unassigned'?'Unassigned':'Assignment needs review');
  if(task.state==='queued')row.queued++;
  if(task.state==='in_progress')row.cleaning++;
  if(task.state==='awaiting_inspection')row.inspection++;
  if(task.due_date<=data.business_date)row.due++;
  if(task.blocked_reasons.length)row.blocked++;
 }
 return [...rows.values()];
}
export function TurnoverWorkload({data}:{data:TurnoverList}){
 if(!data.can_manage)return null;
 const rows=turnoverWorkloads(data);
 return <details><summary>Staff workload</summary><p>Current open tasks by assigned person. Due includes today and overdue work. Blocked tasks remain in their work-state counts. Refresh turnover queue to update.</p><div className="pilot-table-wrap" role="region" aria-label="Staff workload totals" tabIndex={0}><table className="pilot-table"><caption>Housekeeping assignments</caption><thead><tr>{['Assigned to','Queued','Cleaning','Awaiting inspection','Due now','Blocked'].map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id}><th scope="row">{row.label}</th><td>{row.queued}</td><td>{row.cleaning}</td><td>{row.inspection}</td><td>{row.due}</td><td>{row.blocked}</td></tr>)}</tbody></table></div>{!rows.length&&<p>No eligible team members or open tasks.</p>}<p>Review a room task and choose Assign work to change its assignment. Counts do not measure task size, shift availability or paid hours. Awaiting inspection remains attributed to the cleaning assignee, not the inspector. Automatic assignment is not enabled.</p></details>;
}
