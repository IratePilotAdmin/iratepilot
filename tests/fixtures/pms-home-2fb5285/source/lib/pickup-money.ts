import {reportMoney,reportUsd} from './report-export';
/** Round nonnegative booked revenue per room to cents, without floating division. */
export function pickupAverageMinor(revenue:number|null,rooms:number|null):number|null{
 if(revenue===null||rooms===null||rooms===0)return null;
 if(!Number.isSafeInteger(revenue)||revenue<0||!Number.isSafeInteger(rooms)||rooms<0)throw Error('Invalid pickup average inputs.');
 return Number((BigInt(revenue)*2n+BigInt(rooms))/(2n*BigInt(rooms)));
}
export function pickupMoney(minor:number|null,currency:string):string{
 if(minor===null)return 'Unavailable';
 return currency==='USD'?reportUsd(minor):currency+' '+reportMoney(minor);
}
