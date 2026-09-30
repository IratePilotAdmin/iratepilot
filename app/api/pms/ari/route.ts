import {createAdminClient} from '@/lib/supabase/admin';
import {handleNativeAriShadow} from '@/lib/native-ari-shadow-receiver';
export const runtime='nodejs';
export async function POST(request:Request){
 return handleNativeAriShadow(request,{mode:process.env.IRP_NATIVE_ARI_RECEIVER_MODE,signingSecrets:process.env.IRP_NATIVE_ARI_RECEIVER_SIGNING_SECRETS},async batch=>{
  const {data,error}=await createAdminClient().rpc('irp_pms_validate_native_ari',{p_connection:batch.connectionId,p_property:batch.propertyId,p_updates:batch.updates});
  if(error)throw Error('validation_unavailable');return data;
 });
}
export async function GET(){return Response.json({mode:process.env.IRP_NATIVE_ARI_RECEIVER_MODE==='validate_only'?'validate_only':'disabled',writebackEnabled:false,certified:false},{headers:{'Cache-Control':'no-store'}})}
