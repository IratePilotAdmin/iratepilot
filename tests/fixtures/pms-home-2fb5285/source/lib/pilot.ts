import type {CancellationDisposition} from '@/lib/reservation-status';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
// Public browser credential. All hotel data access is enforced by database RPCs/RLS.
import {supabaseUrl,publishableKey} from '@/lib/hotel-connection';
import {pmsContractHeaders} from '@/lib/pms-contract';
import {hotelAuthStorageKey} from '@/lib/hotel-auth-storage';
export {supabaseUrl} from '@/lib/hotel-connection';
let client:SupabaseClient|undefined;
export function hotelClient(){return client??=createClient(supabaseUrl,publishableKey,{global:{headers:{...pmsContractHeaders}},auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:hotelAuthStorageKey(supabaseUrl)}})}
export type Membership={tenant_id:string;tenant_name:string;property_id:string;property_name:string;role:string;time_zone:string};
export type RoomType={id:string;name:string;max_guests:number};
export type Room={id:string;room_type_id:string;label:string;status:string;state_version:number;open_turnover_task?:{id:string;version:number;state:'queued'|'in_progress'|'awaiting_inspection'}|null;maintenance_intervals?:{closure_id:string;start:string;end:string;end_exclusive:true}[]};
export type Booking=CancellationDisposition&{id:string;guest_name:string|null;source:string;source_booking_id:string;source_version:number;inventory_overdue?:boolean;migration_source_id?:string|null;migration_provider?:string|null;status:string;room_type_id:string|null;physical_room_id:string|null;arrival:string|null;departure:string|null;guests:number|null;guest_total_minor:number|null;accommodation_minor:number|null;taxes_minor:number|null;hotel_fees_minor?:number;ota_fees_minor?:number;package_description?:string};
export type HotelWorkspace={property:{id:string;name:string;time_zone:string;currency:string;operating_model?:'hotel'|'whole_home';operating_model_version?:number;whole_home_max_guests?:number|null};role:string;business_date:string;room_types:RoomType[];rooms:Room[];reservations:Booking[];capacity:{room_type_id:string;stay_date:string;units:number;configured_units?:number|null;physical_units?:number;closed_units?:number;effective_units?:number|null;shortfall_units?:number|null;reserved_units:number;available_units:number|null;overdue_units:number}[];activity:{id:string;action:string;created_at:string;details:unknown}[]};
export async function hotelRpc<T>(name:string,args:Record<string,unknown>={}):Promise<T>{const {data,error}=await hotelClient().rpc('irp_pms_pilot_'+name,args);if(error)throw Object.assign(Error(error.code==='PGRST202'?'This feature is not available in the connected hotel service. Ask the property owner or iRatePilot support to check activation before retrying.':error.message),{code:error.code});if(name==='workspace'&&data?.rooms)data.rooms=data.rooms.map((r:Record<string,unknown>)=>({...r,status:r.housekeeping}));if(name==='review_events')return data.events as T;return data as T}
export function usd(minor:number|null|undefined){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format((minor??0)/100)}
export function cents(value:FormDataEntryValue|null){const s=typeof value==='string'?value:'';if(!/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(s))throw Error('Enter a nonnegative amount with up to two decimal places.');const [a,b='']=s.split('.');return Number(a)*100+Number(b.padEnd(2,'0'))}

export function formText(form:FormData,key:string){const value=form.get(key);return typeof value==='string'?value:''}
