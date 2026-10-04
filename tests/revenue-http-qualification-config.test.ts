import {expect,it} from 'vitest';
import {revenueHttpQualificationConfigSchema as schema} from '../lib/revenue-http-qualification-config';
const config={branch:{project_ref:'abcdefghijklmnopqrst',parent_project_ref:'eiqmdldjnedqgbtoozqa',is_default:false,with_data:false,name:'revenue-auth-fixture'},publishableKey:'sb_publishable_synthetic',tenantId:'00000000-0000-4000-8000-000000000001',propertyId:'00000000-0000-4000-8000-000000000002',requestId:'00000000-0000-4000-8000-000000000006',planId:'00000000-0000-4000-8000-000000000004',actors:{owner:{id:'00000000-0000-4000-8000-000000000005'},manager:{id:'00000000-0000-4000-8000-000000000008'},staff:{id:'00000000-0000-4000-8000-000000000009'}}};
it('accepts an isolated synthetic manifest',()=>{expect(schema.safeParse(config).success).toBe(true);});
it.each(['eiqmdldjnedqgbtoozqa','allliumarkejinplrggl'])('refuses known live project %s',project_ref=>{expect(schema.safeParse({...config,branch:{...config.branch,project_ref}}).success).toBe(false);});
it.each([{is_default:true},{with_data:true},{parent_project_ref:'allliumarkejinplrggl'},{name:'main'}])('refuses unsafe branch metadata %#',change=>{expect(schema.safeParse({...config,branch:{...config.branch,...change}}).success).toBe(false);});
it('refuses shared actor identity',()=>{expect(schema.safeParse({...config,actors:{...config.actors,manager:config.actors.owner}}).success).toBe(false);});
it('refuses secret client keys and real property scope',()=>{
 expect(schema.safeParse({...config,publishableKey:'sb_secret_synthetic'}).success).toBe(false);
 expect(schema.safeParse({...config,propertyId:'7d9add80-216e-435c-86e9-58e17cdcbb6d'}).success).toBe(false);
});
