export type SupervisorCommand = {
 actor: string; tenant: string; property: string; issue: string;
 revision: number; action: 'claim'|'release'|'acknowledge'|'reopen'; request: string;
};
type Storage = Pick<globalThis.Storage,'getItem'|'setItem'|'removeItem'>;
export const supervisorJournalKey = (actor:string) => `irp-supervisor-review-v1/${actor}`;
export function readSupervisorCommand(storage:Storage,actor:string):SupervisorCommand|null {
 if(!actor)throw Error('Verify your sign-in before reviewing exceptions.');
 const raw=storage.getItem(supervisorJournalKey(actor));if(raw===null)return null;
 if(raw.length>2048)throw Error('Saved review cannot be verified. Contact support before reviewing another exception.');
 let command:SupervisorCommand;
 try{command=JSON.parse(raw);}catch{throw Error('Saved review cannot be verified. Contact support before reviewing another exception.');}
 if(!command||command.actor!==actor||!['actor','tenant','property','issue','request'].every(field=>typeof command[field as keyof SupervisorCommand]==='string'&&String(command[field as keyof SupervisorCommand]).length>0&&String(command[field as keyof SupervisorCommand]).length<=128)||!Number.isSafeInteger(command.revision)||command.revision<1||!['claim','release','acknowledge','reopen'].includes(command.action))throw Error('Saved review cannot be verified. Contact support before reviewing another exception.');
 return command;
}
export function stageSupervisorCommand(storage:Storage,command:SupervisorCommand){
 const prior=readSupervisorCommand(storage,command.actor);
 if(prior)throw Error('An earlier review needs confirmation before another can start.');
 const raw=JSON.stringify(command);storage.setItem(supervisorJournalKey(command.actor),raw);
 if(storage.getItem(supervisorJournalKey(command.actor))!==raw)throw Error('Review could not be retained on this device. No request was sent.');
}
export function clearSupervisorCommand(storage:Storage,command:SupervisorCommand){
 const current=readSupervisorCommand(storage,command.actor);
 if(!current||JSON.stringify(current)!==JSON.stringify(command))throw Error('Saved review changed. Refresh before continuing.');
 storage.removeItem(supervisorJournalKey(command.actor));
 if(storage.getItem(supervisorJournalKey(command.actor))!==null)throw Error('Review confirmation could not be cleared. Retry the same request.');
}
