// Run each final170 suite in an isolated PGlite process. No remote connections.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const suites=[['core',31],['admissions',20],['catalog-replay',8]],results=[];
if(!process.env.PGLITE_DIST)throw Error('Set PGLITE_DIST to the installed @electric-sql/pglite/dist directory');
for(const [suite,count] of suites){
 const file=fileURLToPath(new URL(`./verify-iratepilot-pms-maintenance-${suite}.mjs`,import.meta.url));
 const run=spawnSync(process.execPath,[file],{env:process.env,encoding:'utf8'});
 if(run.stdout)process.stdout.write(run.stdout);if(run.stderr)process.stderr.write(run.stderr);
 if(run.error)throw run.error;if(run.status!==0)throw Error(`${suite} suite failed with exit ${run.status}`);
 const result=JSON.parse(run.stdout.trim().split('\n').at(-1));
 assert.equal(result.check_count??result.passed,count,`${suite} expected check count`);
 results.push({suite,check_count:count,checks:result.checks});
}
console.log(JSON.stringify({passed:true,check_count:59,suites:results,scope:'Final170 source:31 core,20 admissions and8 catalog/legacy replay checks. Local serialized PGlite; SQL receiver tests do not exercise an external OTA network connection, and no native PostgreSQL contention is claimed.'}));
