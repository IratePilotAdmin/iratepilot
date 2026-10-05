import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,posix} from 'node:path';
import {project} from './supervisor-queue-qualification-config.mjs';

export async function supervisorBuildOptions(root){
 const directory=resolve(root,'tests/fixtures/pms-supervisor-246');
 const provenance=JSON.parse(await readFile(resolve(directory,'provenance.json'),'utf8'));
 if(provenance.site_version!==246||provenance.site_commit!=='efe6b94765e39f4aa5e916375600666de0750441')throw Error('Reviewed supervisor source required');
 const required=['components/revenue-supervisor-queue.tsx','lib/pilot.ts','lib/pms-contract.ts','lib/hotel-auth-storage.ts','lib/revenue-supervisor.ts','lib/revenue-supervisor-journal.ts','lib/revenue-supervisor-transport.ts','lib/revenue-supervisor-read.ts'];
 if(Object.keys(provenance.files).sort().join('|')!==required.sort().join('|'))throw Error('Supervisor dependency snapshot mismatch');
 const sources=new Map();
 for(const [path,file] of Object.entries(provenance.files)){
  if(!/^[a-zA-Z0-9_.-]+\.source$/.test(file.snapshot))throw Error('Invalid supervisor snapshot path');
  const content=await readFile(resolve(directory,file.snapshot),'utf8');
  if(createHash('sha256').update(content).digest('hex')!==file.sha256)throw Error('Supervisor snapshot hash mismatch');
  sources.set(path,content);
 }
 const dependencies=resolve(root,'scripts/revenue-browser-tools/node_modules');
 return {provenance,options:{entryPoints:[resolve(root,'scripts/supervisor-browser.fixture.mjs')],jsx:'automatic',
  alias:{react:resolve(dependencies,'react'),'react-dom':resolve(dependencies,'react-dom'),'@supabase/supabase-js':resolve(dependencies,'@supabase/supabase-js')},
  plugins:[{name:'exact-supervisor-snapshot',setup(build){
   build.onResolve({filter:/^irp-supervisor-(component|pilot|journal)$/},args=>({path:args.path.endsWith('component')?'components/revenue-supervisor-queue.tsx':args.path.endsWith('pilot')?'lib/pilot.ts':'lib/revenue-supervisor-journal.ts',namespace:'supervisor-snapshot'}));
   build.onResolve({filter:/^(@\/|\.)/,namespace:'supervisor-snapshot'},args=>({path:(args.path.startsWith('@/')?args.path.slice(2):posix.normalize(posix.join(posix.dirname(args.importer),args.path)))+'.ts',namespace:'supervisor-snapshot'}));
   build.onLoad({filter:/.*/,namespace:'supervisor-snapshot'},args=>{
    if(args.path==='lib/hotel-connection.ts')return {contents:`export const supabaseUrl='https://${project}.supabase.co';export const publishableKey='sb_publishable_5qakGx4LyLTT4OnC2mO_ag_b0BY4Vjf';`,loader:'ts',resolveDir:root};
    const contents=sources.get(args.path);if(!contents)throw Error('Uncaptured supervisor dependency');
    return {contents,loader:args.path.endsWith('.tsx')?'tsx':'ts',resolveDir:root};
   });
  }}],
 }};
}
