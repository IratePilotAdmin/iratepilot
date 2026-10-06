// Calculation core. The scoped ledger reader and reviewed cash-account configuration
// must supply complete journals; this is not itself a production report endpoint.
export type CashFlowCategory='operating'|'investing'|'financing';
export type CashFlowJournal={id:string;lines:{account_id:string;side:'debit'|'credit';amount_minor:string}[];allocations?:{category:CashFlowCategory;amount_minor:string}[]};
export function calculateCashFlow(journals:CashFlowJournal[],cashAccounts:string[],openingMinor:string){
 const invalid=()=>{throw Error('Cash-flow inputs do not reconcile.');};
 const amount=(s:string,signed=false)=>{if(typeof s!=='string'||!(signed?/^(0|-?[1-9][0-9]{0,40})$/:/^[1-9][0-9]{0,40}$/).test(s))return invalid();return BigInt(s);};
 const opening=amount(openingMinor,true),cash=new Set(cashAccounts);
 if(cash.size===0||cash.size!==cashAccounts.length||cashAccounts.some(id=>typeof id!=='string'||!id))return invalid();
 const seen=new Set<string>(),categories={operating:0n,investing:0n,financing:0n};
 let movement=0n,unclassified=0n,unclassifiedCount=0,internalTransfers=0;
 const rows: {journal_id:string;cash_change_minor:string;status:'classified'|'unclassified'|'internal_transfer'|'noncash'}[]=[];
 for(const journal of journals){
  if(!journal.id||seen.has(journal.id)||journal.lines.length<2)return invalid();seen.add(journal.id);
  let total=0n,cashDebit=0n,cashCredit=0n;let cashLines=0;
  for(const line of journal.lines){if(!line.account_id||!['debit','credit'].includes(line.side))return invalid();const n=amount(line.amount_minor);total+=line.side==='debit'?n:-n;if(cash.has(line.account_id)){cashLines++;if(line.side==='debit')cashDebit+=n;else cashCredit+=n;}}
  if(total!==0n)return invalid();
  const net=cashDebit-cashCredit;movement+=net;
  if(!cashLines){if(journal.allocations?.length)return invalid();rows.push({journal_id:journal.id,cash_change_minor:'0',status:'noncash'});continue;}
  if(cashLines===journal.lines.length){if(net!==0n||journal.allocations?.length)return invalid();internalTransfers++;rows.push({journal_id:journal.id,cash_change_minor:'0',status:'internal_transfer'});continue;}
  if(!journal.allocations?.length){unclassified+=net;unclassifiedCount++;rows.push({journal_id:journal.id,cash_change_minor:net.toString(),status:'unclassified'});continue;}
  let allocated=0n,inflow=0n,outflow=0n;
  for(const allocation of journal.allocations){if(!['operating','investing','financing'].includes(allocation.category))return invalid();const n=amount(allocation.amount_minor,true);if(n===0n)return invalid();allocated+=n;if(n>0n)inflow+=n;else outflow-=n;categories[allocation.category]+=n;}
  if(allocated!==net||inflow>cashDebit||outflow>cashCredit)return invalid();
  rows.push({journal_id:journal.id,cash_change_minor:net.toString(),status:'classified'});
 }
 const classified=categories.operating+categories.investing+categories.financing;
 if(classified+unclassified!==movement)return invalid();
 return {opening_minor:opening.toString(),net_change_minor:movement.toString(),closing_minor:(opening+movement).toString(),categories:Object.fromEntries(Object.entries(categories).map(([k,v])=>[k,v.toString()])) as Record<CashFlowCategory,string>,unclassified_minor:unclassified.toString(),unclassified_journals:unclassifiedCount,internal_transfer_journals:internalTransfers,classification_complete:unclassifiedCount===0,rows};
}
