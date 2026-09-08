/** Pure journal validation. Authorization, account lookup, period locks and durable
 * duplicate prevention belong to the posting transaction, not this function. */
export type JournalLine = Readonly<{accountId: string; side: 'debit' | 'credit'; amountMinor: string}>;
export type Journal = Readonly<{
  tenantId: string; propertyId: string; requestId: string; currency: 'USD';
  postingDate: string; description: string;
  source: Readonly<{kind: string; id: string; version: number}>;
  lines: readonly JournalLine[];
}>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected journal object');
  const item = value as Record<string, unknown>;
  if (Object.keys(item).sort().join('|') !== [...keys].sort().join('|')) throw new Error('Unexpected journal fields');
  return item;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !uuid.test(value)) throw new Error('Invalid journal identifier');
  return value.toLowerCase();
}
function label(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.length || value !== value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) throw new Error('Invalid journal text');
  return value;
}
function date(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '9999-12-31') throw new Error('Invalid posting date');
  const parsed = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== value) throw new Error('Invalid posting date');
  return value;
}
export function validateJournal(value: unknown): Journal {
  const input=object(value,['tenantId','propertyId','requestId','currency','postingDate','description','source','lines']);
  if (input.currency !== 'USD') throw new Error('Unsupported journal currency');
  const source=object(input.source,['kind','id','version']);
  if (!Number.isSafeInteger(source.version) || (source.version as number) < 1) throw new Error('Invalid source version');
  if (!Array.isArray(input.lines) || input.lines.length < 2 || input.lines.length > 1000) throw new Error('Journal requires 2–1000 lines');
  let debit=BigInt(0),credit=BigInt(0);
  const lines=input.lines.map(raw=>{
    const line=object(raw,['accountId','side','amountMinor']);
    if (line.side !== 'debit' && line.side !== 'credit') throw new Error('Invalid journal side');
    if (typeof line.amountMinor !== 'string' || !/^[1-9]\d{0,14}$/.test(line.amountMinor)) throw new Error('Amount must be a positive canonical integer string');
    const amount=BigInt(line.amountMinor);
    if (line.side==='debit') debit+=amount; else credit+=amount;
    return Object.freeze({accountId:id(line.accountId),side:line.side,amountMinor:line.amountMinor});
  });
  if (debit!==credit) throw new Error('Journal debits and credits do not balance');
  return Object.freeze({tenantId:id(input.tenantId),propertyId:id(input.propertyId),requestId:id(input.requestId),currency:'USD',postingDate:date(input.postingDate),description:label(input.description,500),source:Object.freeze({kind:label(source.kind,80),id:id(source.id),version:source.version as number}),lines:Object.freeze(lines)});
}

/** Totals of the supplied journals only. The database reader must establish
 * completeness and posted status before presenting these as a trial balance. */
export function aggregateJournalBalances(values: readonly unknown[], scope: {tenantId:string;propertyId:string}) {
  const tenantId=id(scope.tenantId),propertyId=id(scope.propertyId);
  const seen=new Set<string>();
  const accounts=new Map<string,{debit:bigint;credit:bigint}>();
  let totalDebit=BigInt(0),totalCredit=BigInt(0);
  for(const value of values) {
    const journal=validateJournal(value);
    if(journal.tenantId!==tenantId||journal.propertyId!==propertyId) throw new Error('Journal scope mismatch');
    if(seen.has(journal.requestId)) throw new Error('Duplicate journal request');
    seen.add(journal.requestId);
    for(const line of journal.lines) {
      const balance=accounts.get(line.accountId)??{debit:BigInt(0),credit:BigInt(0)};
      const amount=BigInt(line.amountMinor);
      if(line.side==='debit'){balance.debit+=amount;totalDebit+=amount;}
      else {balance.credit+=amount;totalCredit+=amount;}
      accounts.set(line.accountId,balance);
    }
  }
  return Object.freeze({tenantId,propertyId,currency:'USD' as const,journalCount:seen.size,
    totalDebitMinor:totalDebit.toString(),totalCreditMinor:totalCredit.toString(),
    accounts:Object.freeze([...accounts].sort(([a],[b])=>a.localeCompare(b)).map(([accountId,b])=>Object.freeze({
      accountId,debitMinor:b.debit.toString(),creditMinor:b.credit.toString(),
      debitBalanceMinor:(b.debit>b.credit?b.debit-b.credit:BigInt(0)).toString(),
      creditBalanceMinor:(b.credit>b.debit?b.credit-b.debit:BigInt(0)).toString()
    })))
  });
}
