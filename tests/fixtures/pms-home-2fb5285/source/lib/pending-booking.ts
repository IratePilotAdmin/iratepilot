export type ManualBookingRequest={p_request:string;p_room_type:string;p_guest_name:string;p_arrival:string;p_departure:string;p_guests:number;p_accommodation_minor:number;p_taxes_minor:number};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function bookingStorageKey(kind:'manual'|'quote',actor:string,tenant:string,property:string){return 'iratepilot-pms-pending-'+kind+':'+actor+':'+tenant+':'+property}
export function pendingBookingMode(actor:string,tenant:string,property:string){
 if(sessionStorage.getItem(bookingStorageKey('manual',actor,tenant,property)))return 'reservation';
 if(sessionStorage.getItem(bookingStorageKey('quote',actor,tenant,property)))return 'quote';
 return null;
}
export function readManualBooking(key:string):ManualBookingRequest|null{
 const raw=sessionStorage.getItem(key);if(raw===null)return null;
 let v:ManualBookingRequest;try{v=JSON.parse(raw)}catch{throw Error('The saved booking request cannot be read. Have a manager reconcile this guest’s reservation before using a new request.')}
 if(!v||Object.keys(v).sort().join(',')!=='p_accommodation_minor,p_arrival,p_departure,p_guest_name,p_guests,p_request,p_room_type,p_taxes_minor'||!uuid.test(v.p_request)||!uuid.test(v.p_room_type)||typeof v.p_guest_name!=='string'||!v.p_guest_name.trim()||v.p_guest_name.length>200||!/^\d{4}-\d{2}-\d{2}$/.test(v.p_arrival)||!/^\d{4}-\d{2}-\d{2}$/.test(v.p_departure)||!Number.isSafeInteger(v.p_guests)||v.p_guests<1||v.p_guests>20||![v.p_accommodation_minor,v.p_taxes_minor].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=999999999999))throw Error('The saved booking request is incomplete. Have a manager reconcile this guest’s reservation before using a new request.');
 return v;
}
export function definitiveBookingRejection(error:unknown){const code=error&&typeof error==='object'&&'code' in error?String(error.code):'';return /^(22[A-Z0-9]{3}|23[A-Z0-9]{3}|42[A-Z0-9]{3}|P0001|PT409|PT412|40001|40P01)$/.test(code)}
