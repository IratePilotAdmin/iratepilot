// Local qualification packaging only. Uses the existing pinned private PMS runtime;
// never copies credentials or changes application source. CI verifies resulting hashes.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const fixture=resolve('tests/fixtures/pms-home-2fb5285'),root=resolve(fixture,'source');
const runtime=resolve('../pms/node_modules');
const require=createRequire(resolve('../ui-runtime/package.json'));
const {build}=require('esbuild');
if(require('esbuild/package.json').version!=='0.28.2')throw Error('Pinned esbuild required');
for(const [name,version] of Object.entries({react:'19.2.6','react-dom':'19.2.6','@supabase/supabase-js':'2.111.0',vinext:'1.0.0-beta.5'})){
 if(JSON.parse(await readFile(resolve(runtime,name,'package.json'),'utf8')).version!==version)throw Error('Pinned PMS runtime required');
}
const provenance=JSON.parse(await readFile(resolve(fixture,'provenance.json'),'utf8'));
const connection={name:'isolated-connection-only',setup(b){b.onResolve({filter:/hotel-connection$/},()=>({path:'isolated-connection',namespace:'qualification'}));b.onLoad({filter:/.*/,namespace:'qualification'},()=>({contents:"export const supabaseUrl='https://ybehrayzwzyufxbxcysq.supabase.co';export const publishableKey='sb_publishable_5qakGx4LyLTT4OnC2mO_ag_b0BY4Vjf';",loader:'ts'}));}};
const options={bundle:true,jsx:'automatic',nodePaths:[runtime],tsconfigRaw:{compilerOptions:{target:'ES2020',paths:{'@/*':[root+'/*']}}},plugins:[connection]};
await build({...options,stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Home from './app/page';createRoot(document.getElementById('root')).render(<Home/>);`,resolveDir:root,loader:'tsx'},outfile:resolve(fixture,'home.js'),platform:'browser',format:'iife',alias:{react:resolve(runtime,'react'),'react-dom':resolve(runtime,'react-dom'),'react-dom/server':resolve(runtime,'react-dom/server.browser.js'),'next/link':resolve(runtime,'vinext/dist/shims/link.js')}});
await build({...options,entryPoints:[resolve(root,'app/api/release-preview/route.ts')],outfile:resolve(fixture,'preview.mjs'),platform:'node',format:'esm',plugins:[connection,{name:'server-owned-qualification-bindings',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'cloudflare-bindings',namespace:'bindings'}));b.onLoad({filter:/.*/,namespace:'bindings'},()=>({contents:'export const env=process.env;',loader:'js'}));}}]});
const digest=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
for(const name of Object.keys(provenance.files))provenance.files[name]=await digest(resolve(root,name));
for(const name of Object.keys(provenance.assets))provenance.assets[name]=await digest(resolve(fixture,name));
provenance.source_patches=[{commit:'edc0680',file:'lib/accounting.ts',reason:'Preserve upstream accounting dollar-stripping correction; rebuilt capture is based on 2fb5285 with this patch.'}];
provenance.build.origin='Locally rebuilt captured Home sources, preserving edc0680 accounting correction. CI verifies source and asset hashes. Not a build of the current private PMS.';
await writeFile(resolve(fixture,'provenance.json'),JSON.stringify(provenance,null,2)+'\n');
console.log(JSON.stringify({status:'home-qualification-assets-rebuilt',sources:Object.keys(provenance.files).length,credentials_used:false}));
