import {reportDecimal,type ReportCell} from './report-export';
import {readTrialBalance,type TrialBalance} from './accounting';

export type ProfitLoss={tenant_id:string;property_id:string;start:string;end:string;rows:{id:string;code:string;kind:'income'|'expense';amount_minor:string}[];income_minor:string;expense_minor:string;net_minor:string};
export function profitLossFromLedger(value:unknown,scope:{tenant_id:string;property_id:string;start:string;end:string}):ProfitLoss{
 const ledger:TrialBalance=readTrialBalance(value,scope);
 const rows=ledger.accounts.filter(a=>a.account_kind==='income'||a.account_kind==='expense').map(a=>({id:a.account_id,code:a.account_code,kind:a.account_kind as 'income'|'expense',amount_minor:(a.account_kind==='income'?BigInt(a.period_credit_minor)-BigInt(a.period_debit_minor):BigInt(a.period_debit_minor)-BigInt(a.period_credit_minor)).toString()}));
 const total=(kind:'income'|'expense')=>rows.filter(r=>r.kind===kind).reduce((n,r)=>n+BigInt(r.amount_minor),0n);
 const income=total('income'),expense=total('expense');
 return {tenant_id:ledger.tenant_id,property_id:ledger.property_id,start:ledger.start_date,end:ledger.end_date_exclusive,rows,income_minor:income.toString(),expense_minor:expense.toString(),net_minor:(income-expense).toString()};
}
export function signedLedgerDecimal(value:string){
 if(!/^(0|-?[1-9][0-9]{0,40})$/.test(value))throw Error('Invalid profit and loss amount.');
 const n=BigInt(value),digits=(n<0n?-n:n).toString().padStart(3,'0');return (n<0n?'-':'')+digits.slice(0,-2)+'.'+digits.slice(-2);
}
export function profitLossRows(report:ProfitLoss):ReportCell[][]{
 return [['iRatePilot PMS','Profit and loss'],['Property reference',report.property_id],['From',report.start],['Until (exclusive)',report.end],['Currency','USD'],['Basis','Posted ledger activity by income and expense account; unposted bookings, invoices and payments excluded.'],['Review','Account classifications and all required postings must be reconciled before using this report as final financial statements.'],[],['Account reference','Account code','Type','Net activity USD'],...report.rows.map(r=>[r.id,r.code,r.kind,reportDecimal(signedLedgerDecimal(r.amount_minor))]),[],['Income USD',reportDecimal(signedLedgerDecimal(report.income_minor))],['Expenses USD',reportDecimal(signedLedgerDecimal(report.expense_minor))],['Net income / loss USD',reportDecimal(signedLedgerDecimal(report.net_minor))]];
}
