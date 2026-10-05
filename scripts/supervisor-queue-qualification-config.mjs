export const project='ybehrayzwzyufxbxcysq';
export const baseline=Object.freeze({tenant:'00000000-0000-4000-8000-000000000001',property:'00000000-0000-4000-8000-000000000002',tenantName:'Synthetic isolated HTTP qualification',propertyName:'Synthetic HTTP property'});
export const actors=Object.freeze({owner:'7e3ac7b8-3286-4fcb-aaa9-a850390d787c',manager:'fe6502af-b9a2-478d-abad-bfbec8539df6',staff:'451c631e-2e3f-4293-b78c-e1bb92087f20'});
export const hashes=Object.freeze({queue:'c4ae842e83094387889917f2600050c0',review:'ae12f9df71b5335f86614494ff07dff8',require:'7f62d01281c4f47257d179a95f34f632',observe:'7792d1b13cd5c7bcfdd9d210e28a2f5a',health:'1d5fa05f0d3181d7d850b8f13428dca2'});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function validateQueueFixture(f,now=Date.now()){
 const keys=['project_ref','purpose','tenant_id','property_id','owner_id','manager_id','staff_id','generated_at','expires_at','queue_hash','review_hash','fault'];
 if(!f||typeof f!=='object'||Array.isArray(f)||Object.keys(f).sort().join('|')!==keys.sort().join('|'))throw Error('Invalid fixture fields');
 if(f.project_ref!==project||f.purpose!=='isolated-supervisor-queue-recovery'||f.fault!=='manager-membership-demotion-after-claim')throw Error('Wrong isolated fixture purpose or target');
 for(const key of ['tenant_id','property_id','owner_id','manager_id','staff_id'])if(typeof f[key]!=='string'||!uuid.test(f[key]))throw Error('Invalid fixture identity');
 if(new Set([f.tenant_id,f.property_id,...Object.values(actors),baseline.tenant,baseline.property]).size!==7||f.tenant_id==='faa76112-c793-43db-92bd-f9faecd8d93a'||f.property_id==='7d9add80-216e-435c-86e9-58e17cdcbb6d')throw Error('Fixture must be a fresh synthetic scope');
 for(const role of Object.keys(actors))if(f[`${role}_id`]!==actors[role])throw Error('Unexpected protected test actor');
 const start=Date.parse(f.generated_at),end=Date.parse(f.expires_at);
 if(typeof f.generated_at!=='string'||typeof f.expires_at!=='string'||!Number.isFinite(start)||!Number.isFinite(end)||new Date(start).toISOString()!==f.generated_at||new Date(end).toISOString()!==f.expires_at||end-start!==30*60_000||start>now+5000||end<=now+120_000)throw Error('Generate a fresh 30-minute fixture');
 if(f.queue_hash!==hashes.queue||f.review_hash!==hashes.review)throw Error('Fixture function source mismatch');
 return f;
}
