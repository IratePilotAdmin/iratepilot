import type {HandoffScope} from './cashier-handoff';
export function nextFinancialMigrationRecovery(storage:Pick<Storage,'length'|'key'>,scope:HandoffScope){
 const prefixes=['irp.financial.commit.v1','irp.reconciled.post.v1','irp.reconciliation.save.v1','irp.reconciliation.ready.v1','irp.split.save.v1','irp.split.ready.v1','irp.split.post.v1','irp.unified.save.v1','irp.unified.ready.v1','irp.unified.post.v1'].map(kind=>[kind,scope.tenant,scope.property,scope.actor,''].join(':'));
 let next:{id:string;legacy:boolean}|null=null;
 for(let index=0;index<storage.length;index++){
  const key=storage.key(index),prefix=prefixes.find(value=>key?.startsWith(value));if(!key||!prefix)continue;
  const id=key.slice(prefix.length);
  if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id))throw Error('A saved migration request has an invalid batch reference. Keep it for recovery.');
  next??={id,legacy:prefix.startsWith('irp.financial.commit.v1:')};
 }
 return next;
}
