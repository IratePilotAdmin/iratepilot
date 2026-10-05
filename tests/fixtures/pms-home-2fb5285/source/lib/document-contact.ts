import type {GuestData} from './guests';
import {parse} from 'mrz';
function isoDate(year:number,month:string,day:string){const value=`${year}-${month}-${day}`;const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value?value:undefined}
function mrzDate(value:string|null|undefined,birth:boolean){if(!value||!/^\d{6}$/.test(value))return;let year=2000+Number(value.slice(0,2));const now=new Date().getUTCFullYear();if(birth&&year>now||!birth&&year>now+50)year-=100;return isoDate(year,value.slice(2,4),value.slice(4,6))}
function printedDate(value:string){const iso=value.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(iso)return isoDate(Number(iso[1]),iso[2],iso[3]);const us=value.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);if(us)return isoDate(Number(us[3]),us[1],us[2]);return undefined}
// Suggestions only. Never treat OCR as verified identity or infer missing values.
export function documentContact(text:string):Partial<GuestData>{
 const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 const result:Partial<GuestData>={};
 const mrz=lines.map(s=>s.replace(/\s/g,'')).find(s=>/^P[A-Z<][A-Z<]{3}[A-Z<]{5,}$/.test(s)&&s.includes('<<'));
 if(mrz){const [family,given]=mrz.slice(5).split('<<');result.legal_name=[given?.replace(/</g,' ').trim(),family.replace(/</g,' ').trim()].filter(Boolean).join(' ')}
 const labeled=(pattern:RegExp)=>{for(let i=0;i<lines.length;i++){const match=lines[i].match(pattern);if(match)return (match[1]?.trim()||lines[i+1]||'').slice(0,200)}return ''};
 {const family=labeled(/^(?:LAST NAME|SURNAME|LN|DCS)\s*[:.]?\s*(.*)$/i),given=labeled(/^(?:FIRST NAME|GIVEN NAMES?|FN|DAC)\s*[:.]?\s*(.*)$/i);const full=labeled(/^(?:FULL NAME|NAME)\s*:\s*(.+)$/i);if(family&&given)result.legal_name=given+' '+family;else if(full)result.legal_name=full}
 if(result.legal_name)result.display_name=result.legal_name;
 const address=labeled(/^(?:ADDRESS|DAG)\s*[:.]?\s*(.*)$/i);if(address)result.address_line1=address;
 const locality=lines.find(s=>/^[A-Z .'-]+,?\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?$/.test(s));
 const match=locality?.match(/^(.+?),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);if(match){result.city=match[1].replace(/,$/,'');result.region=match[2];result.postal_code=match[3]}
 // Numbered printed DL fields, distinct from the decoded barcode format.
 if(/DRIVER.?S?\s+LICENSE|DRIVER\s+LICENSE|IDENTIFICATION CARD/i.test(text)){
  const family=labeled(/^1[. ]+([A-Z][A-Z '-]+)$/),given=labeled(/^2[. ]+([A-Z][A-Z '-]+)$/);
  if(family&&given)result.legal_name=result.display_name=given+' '+family;
  const street=labeled(/^8[. ]+(\d+\s+.+)$/);if(street)result.address_line1=street;
  const number=labeled(/^(?:4d[. ]*)?(?:DLN|DL|LICENSE NUMBER)\s*[:#]?\s*([A-Z0-9-]{4,64})?$/i)||labeled(/^4d[. ]+([A-Z0-9-]{4,64})$/i);if(number)result.document_number=number;
  for(const [key,pattern] of [['date_of_birth',/^(?:3[. ]*)?DOB\s*[:.]?\s*(.*)$/i],['document_expiry',/^(?:4b[. ]*)?EXP\s*[:.]?\s*(.*)$/i],['document_issued',/^(?:4a[. ]*)?ISS\s*[:.]?\s*(.*)$/i]] as const){const value=printedDate(labeled(pattern));if(value)result[key]=value}
  const sex=labeled(/^(?:15[. ]*)?SEX\s*[:.]?\s*([MFX])\b/i);if(sex)result.sex=sex;
  if(result.document_number||result.legal_name)result.document_type='Driver license / ID';
 }
 const packed=lines.map(l=>l.replace(/\s/g,'').toUpperCase());
 for(let i=0;i<packed.length;i++){const count=packed[i].length===30?3:2;const candidate=packed.slice(i,i+count);if(![30,36,44].includes(packed[i].length)||candidate.length!==count||candidate.some(l=>l.length!==packed[i].length))continue;try{const parsed=parse(candidate,{autocorrect:true});const f=parsed.fields as Record<string,string|null>;if(!parsed.valid)continue;const name=[f.firstName,f.lastName].filter(Boolean).join(' ');if(name)result.legal_name=result.display_name=name;result.document_type=parsed.format==='TD3'?'Passport':'Identity card';if(f.documentNumber)result.document_number=f.documentNumber;if(f.issuingState)result.issuing_country=f.issuingState;if(f.nationality)result.nationality=f.nationality;if(f.sex)result.sex=f.sex;const dob=mrzDate(f.birthDate,true),expiry=mrzDate(f.expirationDate,false);if(dob)result.date_of_birth=dob;if(expiry)result.document_expiry=expiry;break}catch{/* Not a supported machine-readable document. */}}
 for(const [key,pattern] of [['document_number',/^(?:PASSPORT (?:NO\.?|NUMBER)|DOCUMENT (?:NO\.?|NUMBER)|DLN)\s*[:#]?\s*(.+)$/i],['nationality',/^NATIONALITY\s*:\s*(.+)$/i],['issuing_country',/^ISSUING COUNTRY\s*:\s*(.+)$/i],['sex',/^SEX\s*:\s*(.+)$/i]] as const){const value=labeled(pattern);if(value&&!result[key])result[key]=value}
 for(const [key,pattern] of [['date_of_birth',/^(?:DOB|DATE OF BIRTH)\s*[:.]?\s*(.+)$/i],['document_expiry',/^(?:EXP|EXPIRY|DATE OF EXPIRY)\s*[:.]?\s*(.+)$/i],['document_issued',/^(?:ISS|ISSUE DATE)\s*[:.]?\s*(.+)$/i]] as const){const value=printedDate(labeled(pattern));if(value&&!result[key])result[key]=value}
 if(text.includes('ANSI ')&&/DCS|DAC/.test(text)){
  const code=(key:string)=>text.match(new RegExp('(?:^|[\\r\\n\\t]|DL|ID)'+key+'([^\\r\\n\\t]*)'))?.[1]?.trim();
  const family=code('DCS'),first=code('DAC'),middle=code('DAD');if(family&&first)result.legal_name=result.display_name=[first,middle,family].filter(Boolean).join(' ');
  for(const [key,tag] of [['document_number','DAQ'],['address_line1','DAG'],['address_line2','DAH'],['city','DAI'],['region','DAJ'],['postal_code','DAK'],['issuing_country','DCG']] as const){const value=code(tag);if(value)result[key]=value}
  result.document_type='Driver license / ID';const country=code('DCG');if(country==='USA')result.country_code='US';if(country==='CAN')result.country_code='CA';
  for(const [key,tag] of [['date_of_birth','DBB'],['document_issued','DBD'],['document_expiry','DBA']] as const){const raw=code(tag);if(raw&&/^\d{8}$/.test(raw)&&(country==='USA'||country==='CAN')){const date=country==='USA'?isoDate(Number(raw.slice(4)),raw.slice(0,2),raw.slice(2,4)):isoDate(Number(raw.slice(0,4)),raw.slice(4,6),raw.slice(6));if(date)result[key]=date}}
  const sex=code('DBC');if(sex)result.sex=({1:'male',2:'female',9:'unspecified'} as Record<string,string>)[sex]??sex;
 }
 return result;
}
