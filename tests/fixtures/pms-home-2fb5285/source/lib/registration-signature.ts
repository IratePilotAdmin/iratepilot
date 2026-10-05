/** Normalized drawing coordinates; never accept executable SVG or uploaded image data. */
export type SignaturePoint = readonly [number, number];
export type RegistrationSignature = {
  requestId: string;
  documentHash: string;
  cardHash?: string;
  signerName: string;
  intentConfirmed: true;
  strokes: SignaturePoint[][];
  method?: 'typed';
};

export const signatureLimits = {coordinate: 10000, strokes: 64, pointsPerStroke: 512, totalPoints: 4096} as const;
const hasDisallowedControl=(value:string)=>Array.from(value).some(character=>{const code=character.codePointAt(0)!;return code<=0x1f||(code>=0x7f&&code<=0x9f)||(code>=0x202a&&code<=0x202e)||(code>=0x2066&&code<=0x2069)});

/** Validates submission content only. The route must independently verify scope,
 * link expiry, current document hash and replay identity, then set the receipt time. */
export function readRegistrationSignature(value: unknown): RegistrationSignature {
  const fail = (message: string): never => {throw new Error(message)};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('Provide a registration signature.');
  const v = value as Record<string, unknown>;
  const keys = ['requestId', 'documentHash', 'signerName', 'intentConfirmed', 'strokes'];
  if (Object.keys(v).some(key => !keys.includes(key) && !['method','cardHash'].includes(key)) || keys.some(key => !Object.hasOwn(v, key))) return fail('Unexpected registration signature fields.');
  if (Object.hasOwn(v,'method') && v.method !== 'typed') return fail('Invalid signing method.');
  if (typeof v.requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v.requestId)) return fail('Provide a signature request reference.');
  if (typeof v.documentHash !== 'string' || !/^[a-f0-9]{64}$/.test(v.documentHash)) return fail('Review the registration document again.');
  if (Object.hasOwn(v,'cardHash') && (typeof v.cardHash!=='string'||!/^[a-f0-9]{64}$/.test(v.cardHash))) return fail('Review your stay details again.');
  if (typeof v.signerName !== 'string' || !v.signerName.trim() || v.signerName.length > 120 || hasDisallowedControl(v.signerName)) return fail('Enter your signing name, up to 120 characters without control characters.');
  if (v.intentConfirmed !== true) return fail('Confirm your intent to sign this registration document.');
  if (v.method === 'typed') {
    if (!Array.isArray(v.strokes) || v.strokes.length !== 0) return fail('Typed signatures cannot include drawing strokes.');
    return {requestId:v.requestId.toLowerCase(),documentHash:v.documentHash,...(typeof v.cardHash==='string'?{cardHash:v.cardHash}:{}),signerName:v.signerName.trim(),intentConfirmed:true,strokes:[],method:'typed'};
  }
  if (!Array.isArray(v.strokes) || !v.strokes.length || v.strokes.length > signatureLimits.strokes) return fail('Draw your signature before continuing.');
  let total = 0;
  let moved = false;
  const strokes: SignaturePoint[][] = [];
  for (const stroke of v.strokes) {
    if (!Array.isArray(stroke) || stroke.length < 2 || stroke.length > signatureLimits.pointsPerStroke) return fail('The signature contains an invalid stroke.');
    total += stroke.length;
    if (total > signatureLimits.totalPoints) return fail('The signature is too large. Clear it and sign again.');
    const points: SignaturePoint[] = [];
    for (const point of stroke) {
      if (!Array.isArray(point) || point.length !== 2 || !point.every(n => Number.isSafeInteger(n) && n >= 0 && n <= signatureLimits.coordinate)) return fail('The signature contains an invalid point.');
      const previous = points.at(-1);
      if (previous && (previous[0] !== point[0] || previous[1] !== point[1])) moved = true;
      points.push([point[0], point[1]]);
    }
    strokes.push(points);
  }
  if (!moved) return fail('Draw your signature before continuing.');
  return {requestId: v.requestId.toLowerCase(), documentHash: v.documentHash,...(typeof v.cardHash==='string'?{cardHash:v.cardHash}:{}), signerName: v.signerName.trim(), intentConfirmed: true, strokes};
}

/** Preserve legacy drawing arrays and explicitly identify typed receipts. */
export function signatureStorageValue(signature:RegistrationSignature):string {
  return JSON.stringify(signature.cardHash?{...(signature.method==='typed'?{method:'typed'}:{}),strokes:signature.strokes,cardHash:signature.cardHash}:signature.method==='typed'?{method:'typed',strokes:[]}:signature.strokes);
}
export function signatureStorageFields(json:string):{strokes:unknown;method?:'typed';cardHash?:string} {
  const value:unknown=JSON.parse(json);
  if(Array.isArray(value))return {strokes:value};
  if(value&&typeof value==='object'&&Object.keys(value).length===2&&'method' in value&&value.method==='typed'&&'strokes' in value&&Array.isArray(value.strokes)&&value.strokes.length===0)return {strokes:[],method:'typed'};
  if(value&&typeof value==='object'&&Object.keys(value).length===2&&'cardHash' in value&&typeof value.cardHash==='string'&&/^[a-f0-9]{64}$/.test(value.cardHash)&&'strokes' in value&&Array.isArray(value.strokes))return {strokes:value.strokes,cardHash:value.cardHash};
  if(value&&typeof value==='object'&&Object.keys(value).length===3&&'method' in value&&value.method==='typed'&&'strokes' in value&&Array.isArray(value.strokes)&&value.strokes.length===0&&'cardHash' in value&&typeof value.cardHash==='string'&&/^[a-f0-9]{64}$/.test(value.cardHash))return {strokes:[],method:'typed',cardHash:value.cardHash};
  throw Error('Invalid stored signature');
}
