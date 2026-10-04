import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const [pmsPath,outputPath]=process.argv.slice(2);
if(!pmsPath||!outputPath)throw Error('Usage: node scripts/build-revenue-browser-qualification.mjs PMS_CHECKOUT OUTPUT_HTML');
const root=resolve(pmsPath),require=createRequire(resolve(root,'package.json'));
const esbuild=require('esbuild');
const files={recovery:resolve(root,'lib/revenue-approval-recovery.ts'),panel:resolve(root,'components/revenue-approval-recovery-panel.tsx')};
const hashes={};for(const [key,path] of Object.entries(files))hashes[key]=createHash('sha256').update(await readFile(path)).digest('hex');
const result=await esbuild.build({entryPoints:[resolve(import.meta.dirname,'revenue-browser-qualification.tsx.fixture')],loader:{'.fixture':'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},nodePaths:[resolve(root,'node_modules')],plugins:[{name:'synthetic-only',setup(build){
 build.onResolve({filter:/^(qualification-recovery|qualification-panel|@\/lib\/revenue-approval-recovery)$/},args=>({path:args.path==='qualification-panel'?files.panel:files.recovery}));
 build.onResolve({filter:/^@\/lib\/pilot$/},()=>({path:'synthetic-pilot',namespace:'qualification'}));
 build.onLoad({filter:/.*/,namespace:'qualification'},()=>({contents:`export const usd=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value/100); export async function hotelRpc(name,args){ if(name!=='revenue_decision_status')throw Error('Unexpected synthetic RPC'); if(localStorage.getItem('qualification:status-mode')==='error')throw Error('Synthetic status unavailable'); const receipt=JSON.parse(localStorage.getItem('qualification:synthetic-ledger')||'null'); if(!receipt)return {found:false,request_id:args.p_request,tenant_id:args.p_tenant,property_id:args.p_property}; return receipt; }`,loader:'js'}));
 }}]});
const js=result.outputFiles[0].text.replaceAll('</script','<\\/script');
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated Revenue Recovery Qualification</title><style>body{font:16px system-ui;background:#f5f7fa;color:#14243b;margin:24px}main{max-width:1000px;margin:auto}button{font:inherit;padding:12px;margin:5px;background:#fff;border:1px solid #8091a6;border-radius:6px}.card{background:#fff;padding:20px;border:1px solid #b0bccb;margin-top:20px}.pilot-error{color:#a11b24}pre{overflow-wrap:anywhere;white-space:pre-wrap;font-size:12px}</style><div id="root"></div><details><summary>Production source hashes</summary><pre>${JSON.stringify(hashes,null,2)}</pre></details><script>${js}</script></html>`;
await writeFile(outputPath,html);console.log(JSON.stringify({output:resolve(outputPath),source_sha256:hashes,transport:'synthetic-only'}));
