export type RegistrationDocument = {version:1;title:string;body:string};
export function readRegistrationDocument(value:unknown):RegistrationDocument {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Provide registration document text.');
  const v=value as Record<string,unknown>;
  if(v.version!==1||Object.keys(v).some(k=>!['version','title','body'].includes(k)))throw new Error('Unsupported registration document.');
  if(typeof v.title!=='string'||!v.title.trim()||v.title.length>200||/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(v.title))throw new Error('Provide a document title up to 200 characters without controls.');
  if(typeof v.body!=='string'||!v.body.trim()||v.body.length>20000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(v.body))throw new Error('Provide document text up to 20000 characters without unsupported controls.');
  // Preserve text exactly, including line breaks; the guest must see the signed version.
  return {version:1,title:v.title,body:v.body};
}
export async function registrationDocumentHash(value:RegistrationDocument){
  const document=readRegistrationDocument(value);
  const bytes=new TextEncoder().encode(JSON.stringify([document.version,document.title,document.body]));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
}
/** Verifies stored content before displaying it. Rendering must use escaped text,
 * not raw HTML. Publishing authorization belongs to the server endpoint. */
export async function verifyRegistrationDocument(value:unknown,expectedHash:string){
  const document=readRegistrationDocument(value);
  if(!/^[a-f0-9]{64}$/.test(expectedHash)||await registrationDocumentHash(document)!==expectedHash)throw new Error('Registration document integrity check failed. Contact the property.');
  return document;
}
