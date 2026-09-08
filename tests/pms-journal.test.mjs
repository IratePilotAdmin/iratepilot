import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateJournal,aggregateJournalBalances} from '../lib/accounting/journal.ts';
const id='11111111-1111-4111-8111-111111111111';
const account='22222222-2222-4222-8222-222222222222';
const make=()=>({tenantId:id,propertyId:id,requestId:id,currency:'USD',postingDate:'2026-09-08',description:'Fictional stay revenue',source:{kind:'service_day_close',id,version:1},lines:[{accountId:id,side:'debit',amountMinor:'11200'},{accountId:account,side:'credit',amountMinor:'10000'},{accountId:account,side:'credit',amountMinor:'1200'}]});
test('balanced accommodation and tax split preserves exact cents and freezes copied data',()=>{
  const input=make(),journal=validateJournal(input); input.lines[0].amountMinor='1';
  assert.equal(journal.lines[0].amountMinor,'11200');
  assert(Object.isFrozen(journal)&&Object.isFrozen(journal.source)&&Object.isFrozen(journal.lines)&&Object.isFrozen(journal.lines[0]));
});
test('one-cent mismatch cannot produce a posting candidate',()=>{const input=make();input.lines[2].amountMinor='1199';assert.throws(()=>validateJournal(input),/balance/);});
test('large aggregate remains exact beyond JavaScript safe integer',()=>{const input=make();input.lines=Array.from({length:1000},(_,n)=>({accountId:id,side:n%2?'credit':'debit',amountMinor:'999999999999999'}));assert.equal(validateJournal(input).lines.length,1000);input.lines[999].amountMinor='999999999999998';assert.throws(()=>validateJournal(input),/balance/);});
test('rejects floats, coercions, zero, negative and noncanonical cents',()=>{for(const value of [11200,0,'0','-1','1.2','01','1e3',' 11200','1000000000000000']){const input=make();input.lines[0].amountMinor=value;assert.throws(()=>validateJournal(input));}});
test('rejects impossible calendar dates and unsupported currency',()=>{for(const d of ['2026-02-29','2026-04-31','2026-9-8']){const input=make();input.postingDate=d;assert.throws(()=>validateJournal(input));}const input=make();input.currency='EUR';assert.throws(()=>validateJournal(input));});
test('rejects malformed scope, source and unexpected fields',()=>{for(const alter of [x=>x.tenantId='other',x=>x.source.version=0,x=>x.source.version='1',x=>x.extra=true,x=>x.lines[0].side='both',x=>x.description='']){const input=make();alter(input);assert.throws(()=>validateJournal(input));}});
test('account totals net opposite postings without losing gross debits and credits',()=>{
  const first=make(),second=make();second.requestId=account;
  second.lines=[{accountId:id,side:'credit',amountMinor:'2000'},{accountId:account,side:'debit',amountMinor:'2000'}];
  const result=aggregateJournalBalances([first,second],{tenantId:id,propertyId:id});
  assert.equal(result.totalDebitMinor,'13200');assert.equal(result.totalCreditMinor,'13200');
  assert.deepEqual(result.accounts[0],{accountId:id,debitMinor:'11200',creditMinor:'2000',debitBalanceMinor:'9200',creditBalanceMinor:'0'});
  assert.equal(result.accounts[1].creditBalanceMinor,'9200');assert.equal(result.journalCount,2);
});
test('duplicate requests and mixed property scopes fail instead of inflating totals',()=>{
  assert.throws(()=>aggregateJournalBalances([make(),make()],{tenantId:id,propertyId:id}),/Duplicate/);
  const other=make();other.propertyId=account;
  assert.throws(()=>aggregateJournalBalances([other],{tenantId:id,propertyId:id}),/scope/);
});
test('empty selection contains no invented accounts or opening balances',()=>{
  const result=aggregateJournalBalances([],{tenantId:id,propertyId:id});
  assert.equal(result.journalCount,0);assert.equal(result.totalDebitMinor,'0');assert.deepEqual(result.accounts,[]);
});
