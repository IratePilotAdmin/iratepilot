export type PropertyRole='staff'|'manager'|null;
export type PropertyStaffMember={user_id:string;email:string|null;account_role:'owner'|'manager'|'staff';membership_generation:string;assigned_role:PropertyRole;effective_role:'owner'|'manager'|'staff'|null;revision:number};
export type PropertyStaffPage={tenant:string;property:string;members:PropertyStaffMember[];next:string|null};
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const record=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
export function readPropertyStaffPage(value:unknown,tenant:string,property:string,after:string|null=null):PropertyStaffPage{
 if(!record(value)||value.tenant!==tenant||value.property!==property||!Array.isArray(value.members)||value.members.length>50||(value.next!==null&&!uuid(value.next)))throw Error('Unable to verify property staff list. Refresh and try again.');
 const members:PropertyStaffMember[]=[];let previous=after?.toLowerCase()??'';
 for(const item of value.members){
  if(!record(item)||!uuid(item.user_id)||item.user_id.toLowerCase()<=previous||!uuid(item.membership_generation)||(item.email!==null&&typeof item.email!=='string')||!['owner','manager','staff'].includes(String(item.account_role))||![null,'manager','staff'].includes(item.assigned_role as PropertyRole)||!Number.isSafeInteger(item.revision)||Number(item.revision)<0)throw Error('Invalid property staff record. Refresh and try again.');
  const effective=item.account_role==='owner'?'owner':item.assigned_role===null?null:item.account_role==='manager'&&item.assigned_role==='manager'?'manager':'staff';
  if(item.effective_role!==effective)throw Error('Property access changed. Refresh the staff list.');
  members.push(item as PropertyStaffMember);previous=item.user_id.toLowerCase();
 }
 if(value.next!==null&&(members.length!==50||value.next!==members.at(-1)?.user_id))throw Error('Incomplete staff page. Refresh and try again.');
 return {tenant,property,members,next:value.next as string|null};
}
export function preparePropertyAccessChange(tenant:string,property:string,member:PropertyStaffMember,role:PropertyRole,reason:string,request:string){
 if(!uuid(tenant)||!uuid(property)||!uuid(member.user_id)||!uuid(member.membership_generation)||!uuid(request)||!Number.isSafeInteger(member.revision)||member.revision<0||member.account_role==='owner'||![null,'staff','manager'].includes(role)||role==='manager'&&member.account_role!=='manager')throw Error('Choose a permitted staff access level.');
 if(role===member.assigned_role)throw Error('Choose a different access level.');
 const trimmed=reason.trim();if(trimmed.length<4||trimmed.length>500||/[\x00-\x1f\x7f]/.test(trimmed))throw Error('Enter a reason between 4 and 500 characters.');
 return {p_tenant:tenant,p_property:property,p_user:member.user_id,p_role:role,p_revision:member.revision,p_request:request,p_reason:trimmed,p_generation:member.membership_generation};
}
