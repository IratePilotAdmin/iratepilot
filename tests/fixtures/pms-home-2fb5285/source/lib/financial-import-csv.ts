export const financialImportHeaders=['source_item_id','source_reservation_id','category','amount','currency','source_reference','source_date','due_on','debtor_name','debtor_address','debtor_email','debtor_tax_id'];
export type FinancialImportRow={source_item_id:string;source_reservation_id:string;category:'receivable'|'prepayment'|'security';amount_minor:string;currency:'USD';source_reference:string;source_date:string;due_on?:string;debtor?:Record<string,string>};

export function readFinancialImportCsv(source:string):FinancialImportRow[]{
 if(new TextEncoder().encode(source).length>1048576)throw Error('The financial CSV must be 1 MB or smaller.');
 const input=source.replace(/^\uFEFF/,''),rows:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false;
 function field(){row.push(cell);cell='';closed=false}
 function line(){field();if(row.some(value=>value.length))rows.push(row);row=[];if(rows.length>501)throw Error('Import up to 500 financial items per batch.')}
 for(let i=0;i<input.length;i++){
  const char=input[i];
  if(quoted){if(char==='"'){if(input[i+1]==='"'){cell+='"';i++}else{quoted=false;closed=true}}else cell+=char;continue}
  if(char===','){field();continue}if(char==='\n'||char==='\r'){if(char==='\r'&&input[i+1]==='\n')i++;line();continue}
  if(closed)throw Error('Unexpected text after a closing quote.');
  if(char==='"'){if(cell.length)throw Error('Quotes must begin at the start of a field.');quoted=true}else cell+=char;
 }
 if(quoted)throw Error('A quoted field is missing its closing quote.');if(cell.length||row.length||closed)line();
 const headers=rows.shift()?.map(value=>value.trim());
 if(!headers||headers.length!==financialImportHeaders.length||new Set(headers).size!==headers.length||financialImportHeaders.some(h=>!headers.includes(h)))throw Error('Use the financial import template columns exactly.');
 if(!rows.length)throw Error('Add at least one financial item.');
 const seen=new Set<string>();
 return rows.map((values,index)=>{
  const fail=(message:string):never=>{throw Error(`Row ${index+1}: ${message}`)};
  if(values.length!==headers.length)fail('Incorrect number of columns.');
  const v=Object.fromEntries(headers.map((h,i)=>[h,values[i].trim()]));
  for(const key of ['source_item_id','source_reservation_id','source_reference'])if(!v[key]||v[key].length>128||/[\x00-\x1f\x7f]/.test(v[key]))fail(`Check ${key.replaceAll('_',' ')}.`);
  if(seen.has(v.source_item_id))fail('Source item ID appears more than once.');seen.add(v.source_item_id);
  if(!['receivable','prepayment','security'].includes(v.category))fail('Category must be receivable, prepayment, or security.');
  if(v.currency!=='USD')fail('Currency must be USD.');
  if(!/^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$/.test(v.amount))fail('Use a positive dollar amount with at most two decimal places.');
  const [whole,fraction='']=v.amount.split('.'),amount=BigInt(whole)*BigInt(100)+BigInt(fraction.padEnd(2,'0'));
  if(amount<BigInt(1)||amount>BigInt(999999999999))fail('Amount is outside the supported range.');
  const validDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
  if(!validDate(v.source_date))fail('Use a valid source date in YYYY-MM-DD format.');
  const result:FinancialImportRow={source_item_id:v.source_item_id,source_reservation_id:v.source_reservation_id,category:v.category as FinancialImportRow['category'],amount_minor:amount.toString(),currency:'USD',source_reference:v.source_reference,source_date:v.source_date};
  if(v.category==='receivable'){
   if(!validDate(v.due_on)||v.due_on<v.source_date)fail('Due date must be on or after the source date.');
   if(!v.debtor_name)fail('Enter the original debtor name.');
   const debtor:Record<string,string>={};for(const key of ['name','address','email','tax_id']){const value=v['debtor_'+key];if(value){if(value.length>500||/[\x00-\x1f\x7f]/.test(value))fail('Check the original debtor details.');debtor[key]=value}}
   result.due_on=v.due_on;result.debtor=debtor;
  }else if(v.due_on||['name','address','email','tax_id'].some(key=>v['debtor_'+key]))fail('Due date and debtor fields apply only to receivables.');
  return result;
 });
}
