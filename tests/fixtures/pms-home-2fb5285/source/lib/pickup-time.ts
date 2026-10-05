/** Preserve PostgreSQL microseconds when comparing saved capture instants. */
export function pickupInstant(value:unknown):bigint|null{
 if(typeof value!=='string')return null;
 const match=/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
 if(!match)return null;
 const [,day,hour,minute,second,fraction='',zone]=match;
 const date=Date.parse(day);
 if(!Number.isFinite(date)||new Date(date).toISOString().slice(0,10)!==day||Number(hour)>23||Number(minute)>59||Number(second)>59)return null;
 if(zone!=='Z'&&(Number(zone.slice(1,3))>23||Number(zone.slice(4))>59))return null;
 const milliseconds=Date.parse(`${day}T${hour}:${minute}:${second}${zone}`);
 return Number.isFinite(milliseconds)?BigInt(milliseconds)*1000n+BigInt(fraction.padEnd(6,'0')):null;
}
