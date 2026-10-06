/** Call only AFTER /auth/v1/user successfully verifies this exact bearer token.
 * This parses provider-verified claims; it is NOT a JWT signature verifier.
 * Never pass request fields or user_metadata as the verified user/factors.
 */
export function enrolledStaffAssuranceFailure(authorization:string,user:{id:string;factors?:unknown}):{status:403|503;message:string}|null{
 const unavailable={status:503 as const,message:'Your verification methods could not be checked. Try again.'};
 if(user.factors!==undefined&&!Array.isArray(user.factors))return unavailable;
 if(Array.isArray(user.factors)&&user.factors.some(factor=>!factor||typeof factor!=='object'||!['verified','unverified'].includes(factor.status)))return unavailable;
 if(!Array.isArray(user.factors)||!user.factors.some(factor=>factor.status==='verified'))return null;
 let claims:Record<string,unknown>|null=null;
 try{
  if(!authorization.startsWith('Bearer '))throw Error('Invalid token');
  const parts=authorization.slice(7).split('.');
  if(parts.length!==3||!/^[A-Za-z0-9_-]+$/.test(parts[1]))throw Error('Invalid token');
  const payload=parts[1].replace(/-/g,'+').replace(/_/g,'/');
  const parsed=JSON.parse(atob(payload.padEnd(Math.ceil(payload.length/4)*4,'=')));
  if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))claims=parsed;
 }catch{claims=null;}
 if(claims?.sub!==user.id||claims?.aal!=='aal2'||typeof claims.exp!=='number'||claims.exp<=Date.now()/1000)return {status:403,message:'Complete two-step verification.'};
 return null;
}
