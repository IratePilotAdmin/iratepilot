import type {GuestData} from './guests';

const usefulFields:ReadonlyArray<keyof GuestData>=['legal_name','document_number','address_line1','date_of_birth','document_expiry'];

// OCR output is only a suggestion shown for staff review; it is never proof of identity.
export function documentScanHasSuggestions(contact:Partial<GuestData>,confidence:number){
 if(!Number.isFinite(confidence)||confidence<20)return false;
 return usefulFields.some(key=>typeof contact[key]==='string'&&Boolean((contact[key] as string).trim()));
}
