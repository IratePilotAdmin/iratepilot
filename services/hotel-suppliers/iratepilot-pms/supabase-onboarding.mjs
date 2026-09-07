/** Server-only integration. Construct dedicated non-session-persisting Supabase
 * clients outside this module. Never share a cookie-mutated admin client.
 */
export function supabaseOnboardingAdapters({authClient,adminClient,eligibleUserIds,checkRateLimit}){
 if(!authClient?.auth?.getUser||!adminClient?.schema||!Array.isArray(eligibleUserIds)||typeof checkRateLimit!=='function')throw Error('Explicit auth/admin clients, pilot allowlist and rate limiter required');
 const eligible=new Set(eligibleUserIds);
 return {
  async verifyAccessToken(token){
   const {data,error}=await authClient.auth.getUser(token);
   if(error){if([400,401,403].includes(error.status))return null;throw Error('Identity provider unavailable')}
   const user=data?.user;
   return user?{id:user.id,emailVerified:typeof user.email_confirmed_at==='string'&&Number.isFinite(Date.parse(user.email_confirmed_at))}:null;
  },
  async authorizeOnboarding(userId){return eligible.has(userId)&&await checkRateLimit(userId)===true;},
  async onboard(args){
   const {data,error}=await adminClient.schema('irp_pms').rpc('onboard_hotel',args);
   if(error)return {error:{code:error.code}};
   return {data:Array.isArray(data)?data.length===1?data[0]:null:data};
  }
 };
}
