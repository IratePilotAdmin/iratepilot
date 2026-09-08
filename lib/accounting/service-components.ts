/** Preserve recorded service-day categories before mapping them to GL accounts.
 * This does not choose accounts or post a journal. */
export function serviceComponents(row: {
 accommodation_minor:number;taxes_minor:number;hotel_fees_minor:number;
 ota_fees_minor:number;other_revenue_minor:number;total_minor:number;
 details:{taxes?:unknown;fees?:unknown};
}) {
 const minor=(value:unknown):bigint=>{
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||value>999999999999) throw new Error('Invalid recorded service amount');
  return BigInt(value);
 };
 const accommodation=minor(row.accommodation_minor),tax=minor(row.taxes_minor),fee=minor(row.hotel_fees_minor),ota=minor(row.ota_fees_minor),other=minor(row.other_revenue_minor),total=minor(row.total_minor);
 if(accommodation+tax+fee+ota+other!==total) throw new Error('Recorded service components do not reconcile');
 const components=new Map<string,bigint>();
 const add=(code:string,value:bigint)=>{if(value>BigInt(0))components.set(code,(components.get(code)??BigInt(0))+value);};
 add('accommodation',accommodation);add('ota_fee',ota);add('other_revenue',other);
 for(const [prefix,items,expected] of [['tax',row.details.taxes,tax],['fee',row.details.fees,fee]] as const){
  if(items!==undefined&&!Array.isArray(items)) throw new Error('Invalid recorded itemization');
  let allocated=BigInt(0);
  for(const item of (items??[]) as unknown[]){
   if(!item||typeof item!=='object'||Array.isArray(item)) throw new Error('Invalid recorded item');
   const record=item as Record<string,unknown>;
   if(typeof record.code!=='string'||! /^[a-z][a-z0-9_]{0,79}$/.test(record.code)||record.code==='unallocated') throw new Error('Invalid recorded category');
   const amount=minor(record.amount_minor);allocated+=amount;add(prefix+':'+record.code,amount);
  }
  if(allocated>expected) throw new Error('Recorded itemization exceeds its total');
  add(prefix+':unallocated',expected-allocated);
 }
 return Object.freeze([...components].sort(([a],[b])=>a.localeCompare(b)).map(([component,amount])=>Object.freeze({component,amountMinor:amount.toString()})));
}

type ServiceAccount={id:string;tenantId:string;propertyId:string;active:boolean;kind:'asset'|'liability'|'equity'|'income'|'expense'};
export function mapServiceComponents(row:Parameters<typeof serviceComponents>[0],scope:{tenantId:string;propertyId:string},receivable:ServiceAccount,mappings:Readonly<Record<string,ServiceAccount>>) {
 const components=serviceComponents(row);
 const check=(account:ServiceAccount|undefined)=>{
  if(!account||account.tenantId!==scope.tenantId||account.propertyId!==scope.propertyId||account.active!==true) throw new Error('Missing, inactive or wrong-property accounting mapping');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(account.id)) throw new Error('Invalid mapped account identity');
  return account;
 };
 check(receivable);if(receivable.kind!=='asset') throw new Error('Receivable mapping must be an asset');
 const credits=components.map(item=>{
  const account=check(Object.hasOwn(mappings,item.component)?mappings[item.component]:undefined);
  if(account.id===receivable.id) throw new Error('Revenue or tax cannot map back to the receivable account');
  if(item.component.startsWith('tax:')?account.kind!=='liability':!['income','liability'].includes(account.kind)) throw new Error('Mapped account classification is incompatible');
  return Object.freeze({...item,accountId:account.id,side:'credit' as const});
 });
 return Object.freeze({zeroAmount:row.total_minor===0,lines:Object.freeze(row.total_minor===0?[]:[Object.freeze({component:'receivable',accountId:receivable.id,side:'debit' as const,amountMinor:String(row.total_minor)}),...credits])});
}
