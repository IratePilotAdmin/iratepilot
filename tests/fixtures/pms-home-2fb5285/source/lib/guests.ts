export const identityFields=[
 ['date_of_birth','Date of birth',10],['document_type','Document type',40],['document_number','Document number',64],['issuing_country','Issuing country',100],['nationality','Nationality',100],['sex','Sex on document',20],['document_issued','Issue date',10],['document_expiry','Expiry date',10]
] as const;
export const isIdentityField=(key:string)=>identityFields.some(([name])=>name===key);
export const guestFields=[
 ['display_name','Display name',200],['legal_name','Legal name',200],['email','Email',254],['phone','Phone',40],['company_name','Company',200],['address_line1','Address line 1',200],['address_line2','Address line 2',200],['city','City',100],['region','State / region',100],['postal_code','Postal code',32],['country_code','Country code (2 letters)',2],...identityFields
] as const;
export type GuestField=typeof guestFields[number][0];
export type GuestData=Record<GuestField,string|null>;
export type BillingData=Omit<GuestData,'display_name'|typeof identityFields[number][0]>;
export type GuestProfile={id:string;version:number;data:GuestData;created_at:string;updated_at:string};
export type GuestSummary={id:string;version:number;display_name:string;legal_name:string|null;email:string|null;phone:string|null;company_name:string|null;updated_at:string};
export type GuestSearch={guests:GuestSummary[];query:string;limit:number;has_more:boolean};
export type GuestStaySummary={reservation_id:string;arrival:string;departure:string;status:string;guests:number|null;room_type:string|null;room_label:string|null;source:string;checked_in_at:string|null;checked_out_at:string|null};
export type GuestStayHistory={guest_id:string;stays:GuestStaySummary[];has_more:boolean;next_arrival:string|null;next_reservation:string|null};
export type StayGuest={reservation_id:string;reservation_name:string|null;recorded:boolean;version:number;guest_id:string|null;guest_profile_version:number|null;linked_profile_current_version:number|null;linked_profile_changed:boolean;contact:GuestData;billing_party:BillingData;updated_at:string|null};
export type GuestAction='save_guest_profile'|'save_reservation_guest';
export type GuestReceipt={guest_id?:string|null;reservation_id?:string;version:number;guest_profile_version?:number|null;created?:boolean;replayed?:boolean};
export type GuestRequestStatus={found:boolean;action?:GuestAction;result?:GuestReceipt};
export function guestFormData(form:FormData,prefix:string,billing=false):GuestData|BillingData{
 return Object.fromEntries(guestFields.filter(([key])=>!billing||key!=='display_name'&&!isIdentityField(key)).map(([key,,max])=>{const raw=form.get(prefix+key);let value=typeof raw==='string'?raw.trim():'';if(key==='country_code')value=value.toUpperCase();if(value.length>max||Array.from(value).some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127))throw Error('Review the length and characters in '+key.replaceAll('_',' ')+'.');return [key,value||null]})) as GuestData|BillingData;
}

export function billingFromGuest(contact:Partial<GuestData>):BillingData{
 return Object.fromEntries(guestFields.filter(([key])=>key!=='display_name'&&!isIdentityField(key)).map(([key])=>[key,key==='legal_name'?(contact.legal_name||contact.display_name||null):(contact[key]??null)])) as BillingData;
}
