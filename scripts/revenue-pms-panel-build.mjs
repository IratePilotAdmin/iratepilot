import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

// Immutable deployed source snapshots, not hand-reimplemented UI or mocked hotelRpc.
export async function pmsPanelBuildOptions(root){
 const directory=resolve(root,'tests/fixtures/pms-recovery-panel-262');
 const provenance=JSON.parse(await readFile(resolve(directory,'provenance.json'),'utf8'));
 if(provenance.site_commit!=='a8da4fc1f7cafddf8c6d237fe4ef056489454f99'||provenance.site_version!==262)throw Error('Pinned PMS source required');
 const sources=new Map();
 for(const [path,file] of Object.entries(provenance.files)){
  if(!/^[a-zA-Z0-9_.-]+\.source$/.test(file.snapshot))throw Error('Invalid PMS snapshot path');
  const content=await readFile(resolve(directory,file.snapshot),'utf8');
  if(createHash('sha256').update(content).digest('hex')!==file.sha256)throw Error('PMS snapshot hash mismatch');
  sources.set(path,content);
 }
 const tools=resolve(root,'scripts/revenue-browser-tools/node_modules');
 return {provenance,options:{entryPoints:[resolve(root,'scripts/revenue-pms-panel.fixture.tsx')],jsx:'automatic',
  alias:{react:resolve(tools,'react'),'react-dom':resolve(tools,'react-dom'),'@supabase/supabase-js':resolve(tools,'@supabase/supabase-js'),zod:resolve(tools,'zod')},
  plugins:[{name:'pinned-pms-source',setup(build){
   build.onResolve({filter:/^(irp-pms-panel|irp-pms-pilot)$/},args=>({path:args.path==='irp-pms-panel'?'components/revenue-approval-recovery-panel.tsx':'lib/pilot.ts',namespace:'pms-snapshot'}));
   build.onResolve({filter:/^@\//,namespace:'pms-snapshot'},args=>({path:args.path.slice(2)+'.ts',namespace:'pms-snapshot'}));
   build.onLoad({filter:/.*/,namespace:'pms-snapshot'},args=>{
    if(args.path==='lib/hotel-connection.ts')return {contents:"export const supabaseUrl='https://ybehrayzwzyufxbxcysq.supabase.co';export const publishableKey='sb_publishable_5qakGx4LyLTT4OnC2mO_ag_b0BY4Vjf';",loader:'ts',resolveDir:root};
    const content=sources.get(args.path);if(!content)throw Error('Uncaptured PMS source dependency');
    return {contents:content,loader:args.path.endsWith('.tsx')?'tsx':'ts',resolveDir:root};
   });
  }}],
 }};
}
