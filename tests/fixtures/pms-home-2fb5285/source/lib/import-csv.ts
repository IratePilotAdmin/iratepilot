import {cents,type RoomType} from './pilot';

export const importHeaders=['source_id','guest_name','room_type','arrival','departure','guests','currency','accommodation','taxes'];

const maxCsvBytes=1024*1024;
function validDate(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const parsed=new Date(`${value}T00:00:00.000Z`);
 return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
}

/** Strict CSV reader: quoted commas/newlines and escaped quotes are supported. */
export function readImportCsv(source:string,types:RoomType[]){
 if(new TextEncoder().encode(source).byteLength>maxCsvBytes)throw Error('The CSV must be 1 MB or smaller.');
 const input=source.replace(/^\uFEFF/,'');
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false;
 function field(){row.push(cell);cell='';closed=false}
 function line(){field();if(row.some(x=>x.length))rows.push(row);row=[];if(rows.length>501)throw Error('Import up to 500 reservations per batch.')}
 for(let i=0;i<input.length;i++){
  const char=input[i];
  if(quoted){if(char==='"'){if(input[i+1]==='"'){cell+='"';i++}else{quoted=false;closed=true}}else cell+=char;continue}
  if(char===','){field();continue}
  if(char==='\n'||char==='\r'){if(char==='\r'&&input[i+1]==='\n')i++;line();continue}
  if(closed)throw Error('Unexpected text after a closing quote.');
  if(char==='"'){if(cell.length)throw Error('Quotes must begin at the start of a field.');quoted=true}else cell+=char;
 }
 if(quoted)throw Error('A quoted field is missing its closing quote.');
 if(cell.length||row.length||closed)line();
 const headers=rows.shift()?.map(h=>h.trim());
 if(!headers||headers.length!==importHeaders.length||new Set(headers).size!==headers.length||importHeaders.some(h=>!headers.includes(h)))throw Error('Use the template columns exactly: '+importHeaders.join(', ')+'.');
 if(!rows.length)throw Error('Add at least one future reservation below the header.');
 const sourceIds=new Set<string>();
 return rows.map((values,index)=>{
  if(values.length!==headers.length)throw Error(`Row ${index+1} has ${values.length} fields; expected ${headers.length}.`);
  const v=Object.fromEntries(headers.map((h,i)=>[h,values[i].trim()]));
  if(!v.source_id||v.source_id.length>160)throw Error(`Row ${index+1}: source_id is required and must be 160 characters or fewer.`);
  if(sourceIds.has(v.source_id))throw Error(`Row ${index+1}: source_id is duplicated in this batch.`);
  sourceIds.add(v.source_id);
  if(!v.guest_name||v.guest_name.length>200)throw Error(`Row ${index+1}: guest_name is required and must be 200 characters or fewer.`);
  if(!validDate(v.arrival)||!validDate(v.departure)||v.arrival>=v.departure)throw Error(`Row ${index+1}: arrival and departure must be real YYYY-MM-DD dates, with departure after arrival.`);
  const nights=(Date.parse(`${v.departure}T00:00:00.000Z`)-Date.parse(`${v.arrival}T00:00:00.000Z`))/86400000;
  if(nights>30)throw Error(`Row ${index+1}: stays must be 1–30 nights.`);
  if(v.currency!=='USD')throw Error(`Row ${index+1}: this import currently accepts USD reservations only.`);
  if(!/^[1-9]\d*$/.test(v.guests)||!Number.isSafeInteger(Number(v.guests)))throw Error(`Row ${index+1}: guests must be a positive whole number.`);
  const matches=types.filter(t=>t.name.trim().toLowerCase()===v.room_type.toLowerCase());
  if(matches.length>1)throw Error(`Row ${index+1}: room type name is ambiguous. Give matching room types distinct names before importing.`);
  const room=matches[0];
  let accommodation:number,taxes:number;
  try{accommodation=cents(v.accommodation);taxes=cents(v.taxes)}catch{throw Error(`Row ${index+1}: accommodation and taxes must be nonnegative dollar amounts with at most two decimals.`)}
  return {source_id:v.source_id,guest_name:v.guest_name,room_type_id:room?.id??null,arrival:v.arrival,departure:v.departure,guests:/^[1-9]\d*$/.test(v.guests)?Number(v.guests):null,currency:v.currency,accommodation_minor:accommodation,taxes_minor:taxes};
 });
}

