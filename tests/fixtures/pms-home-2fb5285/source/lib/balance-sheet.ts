import {reportDecimal,type ReportCell} from './report-export';
import {readTrialBalance} from './accounting';
import {signedLedgerDecimal} from './profit-loss';
export type BalanceSheet={tenant_id:string;property_id:string;end:string;rows:{id:string;code:string;kind:'asset'|'liability'|'equity';amount_minor:string}[];assets_minor:string;liabilities_minor:string;equity_minor:string;unclosed_result_minor:string;total_equity_minor:string;liabilities_equity_minor:string;difference_minor:string};
export function balanceSheetFromLedger(value:unknown,scope:{tenant_id:string;property_id:string;start:string;end:string}):BalanceSheet{
 const ledger=readTrialBalance(value,scope);
 const signed=(a:typeof ledger.accounts[number])=>BigInt(a.closing_debit_minor)-BigInt(a.closing_credit_minor);
 const rows=ledger.accounts.filter(a=>['asset','liability','equity'].includes(a.account_kind)).map(a=>({id:a.account_id,code:a.account_code,kind:a.account_kind as 'asset'|'liability'|'equity',amount_minor:(a.account_kind==='asset'?signed(a):-signed(a)).toString()}));
 const total=(kind:string)=>rows.filter(a=>a.kind===kind).reduce((sum,a)=>sum+BigInt(a.amount_minor),0n);
 const result=ledger.accounts.filter(a=>a.account_kind==='income'||a.account_kind==='expense').reduce((sum,a)=>sum-signed(a),0n);
 const assets=total('asset'),liabilities=total('liability'),equity=total('equity'),totalEquity=equity+result,both=liabilities+totalEquity;
 if(assets!==both)throw Error('Balance sheet does not reconcile.');
 return {tenant_id:ledger.tenant_id,property_id:ledger.property_id,end:ledger.end_date_exclusive,rows,assets_minor:assets.toString(),liabilities_minor:liabilities.toString(),equity_minor:equity.toString(),unclosed_result_minor:result.toString(),total_equity_minor:totalEquity.toString(),liabilities_equity_minor:both.toString(),difference_minor:(assets-both).toString()};
}
export function balanceSheetRows(report:BalanceSheet):ReportCell[][]{
 return [['iRatePilot PMS','Balance sheet'],['Property reference',report.property_id],['Before (exclusive)',report.end],['Currency','USD'],['Basis','Posted ledger closing balances before the selected exclusive end date, including opening balances.'],['Equity result','Net balance remaining in income and expense accounts; separate from posted equity, not assumed to be current-year earnings.'],['Review','Unposted activity is excluded. Reconcile opening balances, classifications and all required postings before final financial-statement use.'],[],['Account reference','Account code','Type','Signed closing balance USD'],...report.rows.map(r=>[r.id,r.code,r.kind,reportDecimal(signedLedgerDecimal(r.amount_minor))]),[],['Assets USD',reportDecimal(signedLedgerDecimal(report.assets_minor))],['Liabilities USD',reportDecimal(signedLedgerDecimal(report.liabilities_minor))],['Posted equity USD',reportDecimal(signedLedgerDecimal(report.equity_minor))],['Unclosed income / loss USD',reportDecimal(signedLedgerDecimal(report.unclosed_result_minor))],['Total equity USD',reportDecimal(signedLedgerDecimal(report.total_equity_minor))],['Liabilities and equity USD',reportDecimal(signedLedgerDecimal(report.liabilities_equity_minor))],['Difference USD',reportDecimal(signedLedgerDecimal(report.difference_minor))]];
}
