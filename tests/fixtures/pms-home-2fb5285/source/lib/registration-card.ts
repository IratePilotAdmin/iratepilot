export type RegistrationCard={propertyName:string;guestName:string;arrival:string;departure:string;roomType:string;guests:number};

const date=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(`${value}T00:00:00Z`))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
const safeText=(value:string)=>!Array.from(value).some(character=>{const code=character.codePointAt(0)!;return code<=0x1f||(code>=0x7f&&code<=0x9f)||(code>=0x202a&&code<=0x202e)||(code>=0x2066&&code<=0x2069)});
const label=(value:unknown,max:number):value is string=>typeof value==='string'&&value.trim().length>0&&value.trim().length<=max&&safeText(value);

/** Guest-visible, immutable summary; intentionally excludes assigned room, price, contact and identity fields. */
export function readRegistrationCard(value:unknown):RegistrationCard{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Stay details could not be verified. Contact the property.');
 const v=value as Record<string,unknown>,keys=['propertyName','guestName','arrival','departure','roomType','guests'];
 if(Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k))||!label(v.propertyName,200)||!label(v.guestName,120)||!date(v.arrival)||!date(v.departure)||v.departure<=v.arrival||!label(v.roomType,120)||!Number.isSafeInteger(v.guests)||Number(v.guests)<1||Number(v.guests)>100)throw Error('Stay details could not be verified. Contact the property.');
 return {propertyName:(v.propertyName as string).trim(),guestName:(v.guestName as string).trim(),arrival:v.arrival as string,departure:v.departure as string,roomType:(v.roomType as string).trim(),guests:v.guests as number};
}

export async function registrationCardHash(value:RegistrationCard){
 const canonical=JSON.stringify(readRegistrationCard(value));
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical))),n=>n.toString(16).padStart(2,'0')).join('');
}
