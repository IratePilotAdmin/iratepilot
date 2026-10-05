export type OtaDistributionChannelSnapshot={
 certified:boolean;
 pending?:number;
 retrying?:number;
 dead_letter?:number;
 refresh_pending?:number;
 refresh_blocked?:number;
};

function validCount(value:unknown):value is number{
 return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
}

export function summarizeOtaDistribution(channels:OtaDistributionChannelSnapshot[]){
 const queueCountsAvailable=channels.every(channel=>
  [channel.pending,channel.retrying,channel.dead_letter,channel.refresh_pending,channel.refresh_blocked].every(validCount));
 return {
  configured:channels.length,
  certificationComplete:channels.filter(channel=>channel.certified===true).length,
  updatesWaiting:queueCountsAvailable?channels.reduce((total,channel)=>total+channel.pending!+channel.retrying!+channel.refresh_pending!,0):null,
  itemsNeedingReview:queueCountsAvailable?channels.reduce((total,channel)=>total+channel.dead_letter!+channel.refresh_blocked!,0):null,
  queueCountsAvailable,
 };
}
