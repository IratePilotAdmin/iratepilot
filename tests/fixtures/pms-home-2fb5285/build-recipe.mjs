import {createRequire} from 'node:module';
import {resolve,relative} from 'node:path';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'pms'),out=resolve(import.meta.dirname,'home-gate-build');
const require=createRequire(resolve(import.meta.dirname,'ui-runtime/package.json')),{build}=require('esbuild');
await mkdir(out,{recursive:true});
await writeFile(resolve(out,'entry.tsx'),`import React from 'react';import {createRoot} from 'react-dom/client';import Home from ${JSON.stringify(resolve(root,'app/page.tsx'))};createRoot(document.getElementById('root')!).render(<Home/>);`);
const connection={name:'isolated-connection-only',setup(b){b.onResolve({filter:/hotel-connection$/},()=>({path:'isolated-connection',namespace:'qualification'}));b.onLoad({filter:/.*/,namespace:'qualification'},()=>({contents:"export const supabaseUrl='https://ybehrayzwzyufxbxcysq.supabase.co';export const publishableKey='sb_publishable_5qakGx4LyLTT4OnC2mO_ag_b0BY4Vjf';",loader:'ts'}));}};
const client=await build({entryPoints:[resolve(out,'entry.tsx')],outfile:resolve(out,'home.js'),bundle:true,metafile:true,platform:'browser',format:'iife',jsx:'automatic',tsconfig:resolve(root,'tsconfig.json'),nodePaths:[resolve(root,'node_modules')],alias:{'react':resolve(root,'node_modules/react'),'react-dom':resolve(root,'node_modules/react-dom'),'react-dom/server':resolve(root,'node_modules/react-dom/server.browser.js'),'next/link':resolve(root,'node_modules/vinext/dist/shims/link.js')},plugins:[connection]});
const server=await build({entryPoints:[resolve(root,'app/api/release-preview/route.ts')],outfile:resolve(out,'preview.mjs'),bundle:true,metafile:true,platform:'node',format:'esm',tsconfig:resolve(root,'tsconfig.json'),plugins:[connection,{name:'server-owned-qualification-bindings',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'cloudflare-bindings',namespace:'bindings'}));b.onLoad({filter:/.*/,namespace:'bindings'},()=>({contents:'export const env=process.env;',loader:'js'}));}}]});
const files={};for(const path of new Set([...Object.keys(client.metafile.inputs),...Object.keys(server.metafile.inputs)])){
 const absolute=resolve(path);if(!absolute.startsWith(root)||absolute.includes('node_modules'))continue;
 const content=await readFile(absolute);files[relative(root,absolute).replaceAll('\\','/')]=createHash('sha256').update(content).digest('hex');
}
await writeFile(resolve(out,'provenance.json'),JSON.stringify({candidate:'2fb5285ac74314e97a9161dd8872d7088ccb8a92',project:'ybehrayzwzyufxbxcysq',files,adaptations:['isolated public connection only','Cloudflare env mapped to server process.env','actual pinned Vinext Link shim'],limits:'Build only; no Auth credentials used or browser acceptance established.'},null,2));
console.log(JSON.stringify({status:'actual-home-build-passed',sources:Object.keys(files).length,credentials_used:false}));
