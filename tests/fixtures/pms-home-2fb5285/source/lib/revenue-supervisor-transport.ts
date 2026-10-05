import {hotelClient} from './pilot';
/** Pin the verified token to this command, even if another tab changes sign-in. */
export async function reviewSupervisorCommand(actor:string,args:Record<string,unknown>):Promise<{issue_id:string;request_id:string;revision:number}>{
 const client=hotelClient(),session=await client.auth.getSession();
 const token=session.data.session?.access_token;
 if(session.error||!token)throw Error('Verify your sign-in before retrying this review.');
 const verified=await client.auth.getUser(token);
 if(verified.error||verified.data.user?.id!==actor)throw Error('Your sign-in changed. The saved review is retained.');
 const current=await client.auth.getSession();
 if(current.error||current.data.session?.access_token!==token)throw Error('Your sign-in changed. The saved review is retained.');
 const {data,error}=await client.rpc('irp_pms_pilot_revenue_supervisor_review',args).setHeader('Authorization',`Bearer ${token}`);
 // Conservatively discard even a same-actor token refresh; exact retry is safe.
 const after=await client.auth.getSession();
 if(after.error||after.data.session?.access_token!==token)throw Error('Your sign-in changed. The saved review is retained.');
 if(error)throw Object.assign(Error(error.code==='PT409'?'This exception changed. Refresh before reviewing.':'Review could not be confirmed. Refresh and retry the saved request.'),{code:error.code});
 return data;
}
