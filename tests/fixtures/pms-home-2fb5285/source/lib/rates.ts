import {cents,formText} from '@/lib/pilot';
export const taxKeys=['legacy','city','state','lodging'] as const;
export const feeKeys=['resort','technology'] as const;
export type TaxKey=typeof taxKeys[number];
export type FeeKey=typeof feeKeys[number];
export const taxLabels:Record<TaxKey,string>={legacy:'Existing combined tax',city:'City tax',state:'State tax',lodging:'Lodging tax'};
export const feeLabels:Record<FeeKey,string>={resort:'Resort fee',technology:'Technology fee'};
export type TaxRule={enabled:boolean;basis_points:number};
export type FeeRule={enabled:boolean;amount_minor:number;basis:'per_night'|'per_stay';taxes:TaxKey[]};
export type ChargeConfig={taxes:Record<TaxKey,TaxRule>;fees:Record<FeeKey,FeeRule>};
export type ChargeBreakdown={version:1;mode:'configured'|'legacy'|'adjusted';taxes:{code:string;label:string;basis_points:number|null;taxable_base_minor:number|null;amount_minor:number}[];fees:{code:string;label:string;basis:'per_night'|'per_stay';unit_amount_minor:number;quantity:number;amount_minor:number;taxes:TaxKey[]}[];accommodation_minor:number;taxes_minor:number;hotel_fees_minor:number;ota_fees_minor:number;total_minor:number;arrival:string;departure:string};
export type RatePlan={id:string;room_type_id:string;name:string;tax_basis_points:number;charges?:ChargeConfig|null;package_description?:string;active:boolean;version:number};
export type RateBook={plans:RatePlan[];nightly_rates:{plan_id:string;stay_date:string;amount_minor:number}[]};
export type RateQuote={property_fees_version?:number;operating_model_version?:number|null;id:string;plan_id:string;plan_version:number;room_type_id:string;arrival:string;departure:string;guests:number;accommodation_minor:number;taxes_minor:number;hotel_fees_minor?:number;package_description?:string;charge_breakdown?:ChargeBreakdown|null;total_minor:number;expires_at:string;nights:{date:string;accommodation_minor:number;taxes_minor:number;hotel_fees_minor?:number;total_minor:number}[]};
export function planCharges(plan:RatePlan|null):ChargeConfig{return plan?.charges??{taxes:{legacy:{enabled:(plan?.tax_basis_points??0)>0,basis_points:plan?.tax_basis_points??0},city:{enabled:false,basis_points:0},state:{enabled:false,basis_points:0},lodging:{enabled:false,basis_points:0}},fees:{resort:{enabled:false,amount_minor:0,basis:'per_night',taxes:[]},technology:{enabled:false,amount_minor:0,basis:'per_night',taxes:[]}}}}
export function readChargeConfig(form:FormData,initial:ChargeConfig):ChargeConfig{
 const taxes={...initial.taxes},fees={...initial.fees};
 for(const key of taxKeys){const value=form.get(key+'_rate');const bps=value===null?initial.taxes[key].basis_points:cents(value);if(bps>10000)throw Error(taxLabels[key]+' must be between 0 and 100%.');taxes[key]={enabled:form.get(key+'_enabled')==='on',basis_points:bps}}
 for(const key of feeKeys){const value=form.get(key+'_amount'),basis=formText(form,key+'_basis')||initial.fees[key].basis;if(basis!=='per_night'&&basis!=='per_stay')throw Error('Choose a fee frequency.');fees[key]={enabled:form.get(key+'_enabled')==='on',amount_minor:value===null?initial.fees[key].amount_minor:cents(value),basis,taxes:taxKeys.filter(t=>form.get(key+'_tax_'+t)==='on')}}
 return {taxes,fees};
}
export function afterDays(date:string,days:number){const value=new Date(date+'T00:00:00Z');value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10)}
