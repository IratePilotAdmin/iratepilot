export type CancellationDisposition={cancellation_disposition?:'no_show'|null;no_show_recorded_at?:string|null};
export function reservationStatus(row:{status:string}&CancellationDisposition){return row.status==='Cancelled'&&row.cancellation_disposition==='no_show'?'No show':row.status}
