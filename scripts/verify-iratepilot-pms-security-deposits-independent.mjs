// Independent contract-driven172 checks. Local PGlite only; never connects to Supabase.
// Final evidence is emitted only after every independent check passes.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

if (!process.env.PGLITE_DIST) throw Error('Set PGLITE_DIST to the installed local @electric-sql/pglite/dist directory');
const { PGlite } = await import(pathToFileURL(resolve(process.env.PGLITE_DIST,'index.js')));
const { pgcrypto } = await import(pathToFileURL(resolve(process.env.PGLITE_DIST,'contrib/pgcrypto.js')));
const baseline = resolve(process.env.DEPOSIT_BASELINE_DIR||resolve(import.meta.dirname,'../supabase/migrations'));
const sourcePath = resolve(process.env.DEPOSIT_SQL||resolve(baseline,'202609070172_iratepilot_pms_security_deposits.sql'));
const source = await readFile(sourcePath);
const sourceHash = createHash('sha256').update(source).digest('hex');
const db = new PGlite({extensions:{pgcrypto}}), checks = [];
const q = async (sql,args=[]) => (await db.query(sql,args)).rows;
const val = async (sql,args=[]) => Object.values((await q(sql,args))[0])[0];
const check = async (name,fn) => { await fn(); checks.push(name); console.log('PASS',name); };
const fails = async (fn,code,pattern) => { let error; try { await fn(); } catch(e) { error=e; } assert.ok(error,'Expected rejection'); if(code) assert.equal(error.code,code,error.message); if(pattern) assert.match(error.message,pattern); return error; };
let actor=null;
const admin = async () => { await db.exec('RESET ROLE'); actor=null; };
const as = async id => { await admin(); await q("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]); await db.exec('SET ROLE authenticated'); actor=id; };
const snapshot = async (filter=()=>true) => { const previousActor=actor; await admin(); try { const result={}; for(const {tablename} of await q("SELECT tablename FROM pg_tables WHERE schemaname='irp_pms' ORDER BY tablename")) if(filter(tablename)) result[tablename]=await val(`SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]'::jsonb) FROM irp_pms."${tablename}" x`); return result; } finally { if(previousActor) await as(previousActor); } };
const catalog = async () => q("SELECT p.oid::integer oid,n.nspname schema,n.nspname||'.'||p.proname name,pg_get_function_identity_arguments(p.oid) arguments,pg_get_functiondef(p.oid) definition,p.proowner::integer owner,p.proacl::text acl,p.prosecdef definer,p.provolatile volatility,p.proconfig settings,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') service FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='irp_pms' OR (n.nspname='public' AND p.proname LIKE 'irp_pms%') ORDER BY p.oid");
const relations = async () => q("SELECT c.oid::integer oid,c.relname name,c.relowner::integer owner,c.relacl::text acl,c.relrowsecurity rls,c.relforcerowsecurity forced_rls,(SELECT jsonb_agg(jsonb_build_object('num',a.attnum,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'generated',a.attgenerated,'identity',a.attidentity,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) columns,(SELECT coalesce(jsonb_agg(pg_get_triggerdef(t.oid) ORDER BY t.tgname),'[]'::jsonb) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal) user_triggers,(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.policyname),'[]'::jsonb) FROM pg_policies p WHERE p.schemaname='irp_pms' AND p.tablename=c.relname) policies FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='irp_pms' AND c.relkind='r' ORDER BY c.oid");
const owner=randomUUID(),manager=randomUUID(),staff=randomUUID(),outsider=randomUUID(),tenant=randomUUID(),foreignTenant=randomUUID();
const hotel={tenant,property:randomUUID(),type:randomUUID(),room:randomUUID(),reservation:randomUUID(),unknown:randomUUID()};
const home={tenant,property:randomUUID(),type:randomUUID(),room:randomUUID(),reservation:randomUUID()};
const foreign={tenant:foreignTenant,property:randomUUID(),type:randomUUID(),room:randomUUID(),reservation:randomUUID()};
const detail = scope => val('SELECT public.irp_pms_pilot_security_deposit($1,$2,$3)',[scope.tenant,scope.property,scope.reservation]);
const register = scope => val('SELECT public.irp_pms_pilot_security_deposit_register($1,$2)',[scope.tenant,scope.property]);
const status = (scope,request) => val('SELECT public.irp_pms_pilot_security_deposit_request_status($1,$2,$3)',[scope.tenant,scope.property,request]);
const activity = (scope,start,end) => val('SELECT public.irp_pms_pilot_security_deposit_activity($1,$2,$3,$4)',[scope.tenant,scope.property,start,end]);
const command = async (scope,kind='external_receipt',amount=10000,changes={}) => { const review=await detail(scope); return {tenant:scope.tenant,property:scope.property,reservation:scope.reservation,request:randomUUID(),version:review.version,zone:review.recording_time_zone,date:review.recording_date,kind,amount,method:kind==='receipt_reduction'?null:'cash',reference:'Synthetic external record',reason:'Independent fictional security funds',target:null,confirmed:true,...changes}; };
const post = c => val('SELECT public.irp_pms_pilot_record_security_deposit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',[c.tenant,c.property,c.reservation,c.request,c.version,c.zone,c.date,c.kind,c.amount,c.method,c.reference,c.reason,c.target,c.confirmed]);
const canonical = c => ({reservation_id:c.reservation,expected_version:c.version,expected_recording_time_zone:c.zone,expected_recording_date:c.date,kind:c.kind,amount_minor:c.amount,method:c.method,reference:c.reference,reason:c.reason,target_event_id:c.target,confirmed:c.confirmed});
const retire = (c,reason='Stop retrying independent fictional request',payload=canonical(c)) => val('SELECT public.irp_pms_pilot_retire_security_deposit_request($1,$2,$3,$4,$5,$6)',[c.tenant,c.property,c.reservation,c.request,payload,reason]);
const unchangedFailure = async (fn,code,pattern) => { const before=await snapshot(); await fails(fn,code,pattern); assert.deepEqual(await snapshot(),before,'Rejected command left persisted rows'); };
const depositOnly = name => name.startsWith('security_deposit_');
const insertRow = async (table,data) => {
  assert.ok(['security_deposit_books','security_deposit_events','security_deposit_requests'].includes(table));
  const columns=(await q("SELECT column_name FROM information_schema.columns WHERE table_schema='irp_pms' AND table_name=$1 AND is_generated='NEVER' ORDER BY ordinal_position",[table])).map(row=>'"'+row.column_name+'"').join(',');
  return q(`INSERT INTO irp_pms.${table}(${columns}) SELECT ${columns} FROM jsonb_populate_record(NULL::irp_pms.${table},$1)`,[data]);
};
const storageFailure = async (fn,pattern) => {
  await admin(); const before=await snapshot(); let error;
  await db.exec('BEGIN');
  try { await fn(); await db.exec('SET CONSTRAINTS ALL IMMEDIATE'); } catch(e) { error=e; } finally { await db.exec('ROLLBACK'); }
  assert.ok(error,'Malformed storage unexpectedly committed'); if(pattern) assert.match(error.message,pattern);
  assert.deepEqual(await snapshot(),before,'Rejected deferred storage mutation persisted rows'); await as(owner);
  return error;
};
let day,end,initialCatalog,initialRelations,initialRows,firstCommand,firstResult;

try {
  await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;");
  const installed=(await readdir(baseline)).filter(name=>/^202609070(14[2-7]|149|15[0-6]|158|159|16[0-9]|170|171)_iratepilot_pms_/.test(name)).sort();
  assert.equal(installed.length,28);
  for(const name of installed) await db.exec(await readFile(resolve(baseline,name),'utf8'));
  for(const user of [owner,manager,staff,outsider]) await q('INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,$2,now())',[user,user+'@example.invalid']);
  for(const id of [tenant,foreignTenant]) await q("INSERT INTO irp_pms.tenants(id,name) VALUES($1,'Independent deposit fixtures')",[id]);
  for(const [t,user,role] of [[tenant,owner,'owner'],[tenant,manager,'manager'],[tenant,staff,'staff'],[foreignTenant,owner,'owner'],[foreignTenant,outsider,'owner']]) await q('INSERT INTO irp_pms.memberships(tenant_id,user_id,role) VALUES($1,$2,$3)',[t,user,role]);
  day=await val("SELECT (clock_timestamp() AT TIME ZONE 'America/Chicago')::date::text");
  end=await val('SELECT ($1::date+2)::text',[day]);
  for(const scope of [hotel,home,foreign]) {
    await db.exec('BEGIN');
    await q("INSERT INTO irp_pms.properties(tenant_id,id,name,currency,time_zone,operating_model,whole_home_max_guests) VALUES($1,$2,'Independent synthetic property','USD','America/Chicago',$3,$4)",[scope.tenant,scope.property,scope===home?'whole_home':'hotel',scope===home?4:null]);
    await q("INSERT INTO irp_pms.room_types(tenant_id,property_id,id,name,max_guests) VALUES($1,$2,$3,'Independent sellable unit',4)",[scope.tenant,scope.property,scope.type]);
    await q("INSERT INTO irp_pms.rooms(tenant_id,property_id,id,room_type_id,label,housekeeping) VALUES($1,$2,$3,$4,'SYNTHETIC-UNIT','Clean')",[scope.tenant,scope.property,scope.room,scope.type]);
    await q("INSERT INTO irp_pms.reservations(tenant_id,property_id,id,source,source_booking_id,source_version,payload_hash,status,room_type_id,arrival,departure,guests,accommodation_minor,taxes_minor,ota_fees_minor,guest_total_minor,guest_name) VALUES($1,$2,$3::uuid,'direct',$3::uuid::text,1,repeat('a',64),'Confirmed',$4,$5,$6,1,10000,0,0,10000,'TEST SECURITY FUNDS')",[scope.tenant,scope.property,scope.reservation,scope.type,day,end]);
    await db.exec('COMMIT');
  }
  await q("INSERT INTO irp_pms.reservations(tenant_id,property_id,id,source,source_booking_id,source_version,payload_hash,status,guest_name) VALUES($1,$2,$3::uuid,'iratepilot-ota',$3::uuid::text,1,repeat('b',64),'Cancelled',NULL)",[tenant,hotel.property,hotel.unknown]);
  await as(owner);
  await val("SELECT public.irp_pms_pilot_post_folio($1,$2,$3,$4,'charge',10,'BASELINE TEST CHARGE','Preserved pre-existing fictional charge',NULL)",[tenant,hotel.property,hotel.reservation,randomUUID()]);
  await admin(); initialRows=await snapshot(); initialCatalog=await catalog(); initialRelations=await relations();

  await check('172 installation creates no books and preserves every prior PMS row and every old function identity',async()=>{
    await db.exec(source.toString('utf8'));
    const after=await snapshot();
    for(const [name,rows] of Object.entries(initialRows)) assert.deepEqual(after[name],rows,name+' changed during installation');
    assert.deepEqual(Object.keys(after).filter(name=>!Object.hasOwn(initialRows,name)).sort(),['security_deposit_books','security_deposit_events','security_deposit_requests']);
    for(const name of Object.keys(after).filter(depositOnly)) assert.deepEqual(after[name],[]);
    const current=await catalog();
    for(const prior of initialCatalog) assert.deepEqual(current.find(row=>row.oid===prior.oid),prior,prior.name+' changed');
    const currentRelations=await relations();
    for(const prior of initialRelations) assert.deepEqual(currentRelations.find(row=>row.oid===prior.oid),prior,prior.name+' columns/security/user triggers changed');
    const added=current.filter(row=>!initialCatalog.some(old=>old.oid===row.oid));
    assert.equal(added.filter(row=>row.schema==='public').length,6);
    for(const row of added) { assert.equal(row.anon,false,row.name); assert.equal(row.service,false,row.name); assert.equal(row.authenticated,row.schema==='public',row.name); assert.deepEqual(row.settings,['search_path=pg_catalog']); if(row.schema==='public') assert.equal(row.definer,true); }
  });
  await as(owner);
  await check('All four read APIs are pure and preserve absent book versus explicit zero distinctions',async()=>{
    const before=await snapshot();
    const data=await detail(hotel); assert.equal(data.book,null); assert.equal(data.version,0); assert.equal(data.totals,null); assert.deepEqual(data.events,[]); assert.deepEqual(data.refundable_receipts,[]);
    assert.deepEqual((await register(hotel)).rows,[]); assert.deepEqual((await activity(hotel,day,end)).rows,[]); assert.deepEqual(await status(hotel,randomUUID()),{found:false});
    assert.deepEqual(await snapshot(),before);
    await unchangedFailure(()=>detail({...hotel,reservation:randomUUID()}));
  });
  await check('Receipt refund and record reduction conserve held funds without changing old financial or operational rows',async()=>{
    const before=await snapshot(name=>!depositOnly(name)&&name!=='activity');
    firstCommand=await command(hotel); firstResult=await post(firstCommand);
    assert.equal(firstResult.expected_version,0); assert.equal(firstResult.book.version,1); assert.equal(firstResult.book.totals.held_minor,10000);
    await post(await command(hotel,'external_refund',3000,{method:'bank_transfer',target:firstResult.event.id}));
    await post(await command(hotel,'receipt_reduction',1000,{target:firstResult.event.id}));
    const data=await detail(hotel); assert.deepEqual(data.totals,{received_minor:10000,refunded_minor:3000,reduced_minor:1000,held_minor:6000});
    assert.equal(data.events.length,3); assert.equal(data.events[1].recorded_method,'bank_transfer'); assert.equal(data.events[2].recorded_method,null);
    assert.deepEqual(await snapshot(name=>!depositOnly(name)&&name!=='activity'),before);
  });
  await check('Per-target exhaustion is atomic and exhausted receipt rows survive in the explicit zero book',async()=>{
    await unchangedFailure(()=>command(hotel,'external_refund',6001,{target:firstResult.event.id}).then(post));
    await post(await command(hotel,'external_refund',6000,{target:firstResult.event.id}));
    const data=await detail(hotel); assert.equal(data.totals.held_minor,0); assert.equal(data.version,4); assert.equal(data.refundable_receipts.length,1); assert.equal(data.refundable_receipts[0].remaining_minor,0);
    const report=await register(hotel); assert.equal(report.rows.length,1); assert.equal(report.summary.zero_held_count,1);
    await post(await command(hotel,'external_receipt',2500)); assert.equal((await detail(hotel)).book.id,data.book.id); assert.equal((await detail(hotel)).version,5);
  });
  await check('Historical creation receipt stays immutable after later returns and exact replay adds no rows',async()=>{
    const before=await snapshot(); const found=await status(hotel,firstCommand.request); assert.equal(found.found,true); assert.deepEqual(found.result,firstResult);
    const replay=await post(firstCommand); assert.deepEqual(replay,{...firstResult,replayed:true}); assert.deepEqual(await snapshot(),before);
    assert.equal(found.result.book.totals.held_minor,10000); assert.equal((await detail(hotel)).totals.held_minor,2500);
  });
  await check('Malformed amounts kinds methods targets confirmation and identity cannot leave partial records',async()=>{
    const base=await command(hotel);
    for(const change of [{amount:0},{amount:-1},{amount:1000000000000},{amount:null},{kind:null},{kind:'authorization_hold'},{method:null},{method:'wire'},{target:firstResult.event.id},{confirmed:false},{confirmed:null},{reference:'x'},{reference:'test\ncontrol'},{reason:'x'},{reason:'test\tcontrol'},{zone:''}]) await unchangedFailure(()=>post({...base,request:randomUUID(),...change}));
    await unchangedFailure(()=>post({...base,kind:'external_refund',target:null}));
    await unchangedFailure(()=>post({...base,kind:'receipt_reduction',target:firstResult.event.id,method:'cash'}));
    for(const change of [{amount:9999},{method:'card'},{reason:'Changed original reason'},{reservation:hotel.unknown},{kind:'external_refund',target:firstResult.event.id}]) await unchangedFailure(()=>post({...firstCommand,...change}));
  });
  await check('Whole-home and foreign-scope targets cannot consume another book even with the same actor',async()=>{
    const homeReceipt=await post(await command(home,'external_receipt',7000));
    await post(await command(foreign,'external_receipt',8000));
    await unchangedFailure(()=>command(hotel,'external_refund',1,{target:homeReceipt.event.id}).then(post));
    const data=await detail(hotel); const nonReceipt=data.events.find(row=>row.kind==='external_refund');
    await unchangedFailure(()=>command(hotel,'external_refund',1,{target:nonReceipt.id}).then(post));
    assert.equal((await detail(home)).totals.held_minor,7000);
    await as(staff); await unchangedFailure(()=>detail(foreign)); await as(owner);
  });
  await check('Cancelled source records with unknown charges can hold independent exact security funds',async()=>{
    const unknown={...hotel,reservation:hotel.unknown}; const data=await detail(unknown); assert.equal(data.book,null); assert.equal(data.reservation.guest_name,null); assert.equal(data.reservation.arrival,null);
    await post(await command(unknown,'external_receipt',100));
    const folio=await val('SELECT public.irp_pms_pilot_folio($1,$2,$3)',[tenant,hotel.property,hotel.unknown]); assert.equal(folio.available,false);
    const row=(await register(hotel)).rows.find(row=>row.reservation.id===hotel.unknown); assert.equal(row.financial_review_required,true); assert.equal(row.book.totals.held_minor,100);
  });
  await check('Frozen book zone survives property changes and stale date-only failures retain exact historical receipts',async()=>{
    const prior=await detail(hotel); await val("SELECT public.irp_pms_pilot_configure_property($1,$2,'Independent zone change','Pacific/Kiritimati')",[tenant,hotel.property]);
    const after=await detail(hotel); assert.equal(after.property_time_zone,'Pacific/Kiritimati'); assert.equal(after.book.recording_time_zone,prior.book.recording_time_zone); assert.equal(after.recording_time_zone,prior.recording_time_zone);
    const next=await command(hotel,'external_receipt',1); await unchangedFailure(()=>post({...next,zone:'Pacific/Kiritimati'}),'PT409');
    const invalidDate=await val('SELECT ($1::date-1)::text',[next.date]); await unchangedFailure(()=>post({...next,date:invalidDate}),'PT412');
    await post(next); assert.deepEqual((await status(hotel,firstCommand.request)).result,firstResult);
    const todayRows=(await activity(hotel,prior.recording_date,await val('SELECT ($1::date+1)::text',[prior.recording_date]))).rows;
    assert.ok(todayRows.some(row=>row.event.id===firstResult.event.id)); assert.equal(todayRows.find(row=>row.event.id===firstResult.event.id).event.recording_time_zone,'America/Chicago');
  });
  await check('Manager downgrade permits own receipt lookup but not new or exact-replayed financial mutation',async()=>{
    await as(manager); const savedCommand=await command(home,'external_receipt',100); const saved=await post(savedCommand);
    await as(owner); await val('SELECT public.irp_pms_pilot_save_member($1,$2,$3,$4,$5)',[tenant,hotel.property,randomUUID(),manager+'@example.invalid','staff']);
    await as(manager); assert.deepEqual((await status(home,savedCommand.request)).result,saved); await unchangedFailure(()=>post(savedCommand));
    await as(staff); assert.deepEqual(await status(home,savedCommand.request),{found:false}); await unchangedFailure(()=>command(home).then(post));
    await as(owner); await val('SELECT public.irp_pms_pilot_remove_member($1,$2,$3,$4)',[tenant,hotel.property,randomUUID(),manager]);
    await as(manager); await unchangedFailure(()=>status(home,savedCommand.request)); await unchangedFailure(()=>post(savedCommand)); await as(owner);
  });
  await check('Explicit repeated references remain separate records while stale book reviews cannot commit',async()=>{
    const old=await command(home,'external_receipt',1); await post(await command(home,'external_receipt',1)); await unchangedFailure(()=>post(old),'PT409');
    assert.equal((await status(home,old.request)).found,false);
    const a=await post(await command(home,'external_receipt',2,{reference:'Same external batch reference'})); const b=await post(await command(home,'external_receipt',3,{reference:'Same external batch reference'}));
    assert.notEqual(a.event.id,b.event.id); assert.equal(a.event.reference,b.event.reference);
  });
  await check('Retirement of an uncertain equal-version command fences posting without changing books or financial events',async()=>{
    const c=await command(home,'external_receipt',400),before=await snapshot(name=>name!=='security_deposit_requests'&&name!=='activity');
    const result=await retire(c); assert.equal(result.outcome,'retired'); assert.equal(result.action,'retire_security_deposit_request'); assert.deepEqual(result.command,canonical(c));
    for(const field of ['book_version_changed','financial_changed','folio_changed','revenue_changed']) assert.equal(result[field],false);
    assert.equal(Object.hasOwn(result,'book'),false); assert.equal(Object.hasOwn(result,'event'),false);
    assert.deepEqual(await snapshot(name=>name!=='security_deposit_requests'&&name!=='activity'),before);
    const after=await snapshot(); assert.deepEqual((await status(home,c.request)).result,result); assert.deepEqual(await retire(c),{...result,replayed:true}); assert.deepEqual(await post(c),{...result,replayed:true}); assert.deepEqual(await snapshot(),after);
    await unchangedFailure(()=>retire(c,'Changed retirement reason'));
    await unchangedFailure(()=>retire({...c,amount:401}));
    await unchangedFailure(()=>post({...c,amount:401}));
    await as(staff); await unchangedFailure(()=>retire(c)); assert.deepEqual(await status(home,c.request),{found:false}); await as(owner);
  });
  await check('Retirement discovers an already recorded outcome and never changes its original accepted history',async()=>{
    const before=await snapshot(); const result=await retire(firstCommand); assert.deepEqual(result,{...firstResult,replayed:true}); assert.deepEqual(await snapshot(),before);
    const c=await command(home); const payload=canonical(c);
    for(const invalid of [{...payload,unknown_key:true},{...payload,reservation_id:hotel.reservation},{...payload,confirmed:false},{...payload,amount_minor:1.5},{...payload,target_event_id:firstResult.event.id}]) await unchangedFailure(()=>retire(c,undefined,invalid));
    const missing={...payload}; delete missing.method; await unchangedFailure(()=>retire(c,undefined,missing));
  });
  await check('Injected event receipt and audit insertion failures roll back first-book creation and retirement fences',async()=>{
    const fresh={...hotel,reservation:randomUUID()}; await admin();
    await q("INSERT INTO irp_pms.reservations(tenant_id,property_id,id,source,source_booking_id,source_version,payload_hash,status,guest_name) VALUES($1,$2,$3::uuid,'iratepilot-ota',$3::uuid::text,1,repeat('c',64),'Cancelled','UNPOSTED FAILURE FIXTURE')",[tenant,hotel.property,fresh.reservation]);
    await db.exec("CREATE FUNCTION irp_pms.independent_deposit_insert_failure() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'Independent injected deposit insertion failure'; END $$;");
    for(const table of ['security_deposit_events','security_deposit_requests','activity']) {
      await db.exec(`CREATE TRIGGER independent_deposit_insert_failure BEFORE INSERT ON irp_pms.${table} FOR EACH ROW EXECUTE FUNCTION irp_pms.independent_deposit_insert_failure()`);
      await as(owner); const c=await command(fresh);
      await unchangedFailure(()=>post(c),'P0001',/Independent injected deposit insertion failure/);
      if(table!=='security_deposit_events') await unchangedFailure(()=>retire(c),'P0001',/Independent injected deposit insertion failure/);
      await admin(); await db.exec(`DROP TRIGGER independent_deposit_insert_failure ON irp_pms.${table}`);
    }
    await db.exec('DROP FUNCTION irp_pms.independent_deposit_insert_failure()'); await as(owner);
    assert.equal((await detail(fresh)).book,null);
  });
  await check('Recorded and retired outcomes each have exactly one matching audit with original actor and timestamp',async()=>{
    await admin();
    const events=await q('SELECT to_jsonb(e) event FROM irp_pms.security_deposit_events e');
    const requests=await q('SELECT to_jsonb(r) request FROM irp_pms.security_deposit_requests r');
    const audits=await q("SELECT to_jsonb(a) audit FROM irp_pms.activity a WHERE action IN('security_deposit_recorded','security_deposit_request_retired')");
    assert.equal(requests.filter(row=>row.request.outcome==='recorded').length,events.length);
    assert.equal(audits.length,requests.length);
    for(const {request} of requests) {
      const matches=audits.map(row=>row.audit).filter(a=>a.tenant_id===request.tenant_id&&a.property_id===request.property_id&&a.details.request_id===request.request_id);
      assert.equal(matches.length,1); const audit=matches[0]; assert.equal(audit.actor_id,request.actor_id); assert.equal(audit.target_id,request.reservation_id);
      assert.equal(audit.created_at,request.recorded_at);
      if(request.outcome==='recorded') {
        const event=events.map(row=>row.event).find(e=>e.id===request.event_id&&e.book_id===request.book_id); assert.ok(event);
        assert.equal(audit.action,'security_deposit_recorded'); assert.equal(event.recorded_at,request.recorded_at);
        assert.deepEqual(audit.details,{book_id:event.book_id,event_id:event.id,request_id:request.request_id,kind:event.kind,amount_minor:event.amount_minor,version:event.to_version,recording_mode:'external_only',purpose:'refundable_security'});
      } else {
        assert.equal(request.outcome,'retired'); assert.equal(audit.action,'security_deposit_request_retired'); assert.equal(request.book_id,null); assert.equal(request.event_id,null);
        assert.deepEqual(audit.details,{request_id:request.request_id,purpose:'refundable_security',financial_changed:false,book_version_changed:false});
      }
    }
    await as(owner);
  });
  await check('Private storage rejects empty books mismatched creation context and identity or immutable-history edits',async()=>{
    await admin();
    const current=await val('SELECT to_jsonb(b) FROM irp_pms.security_deposit_books b WHERE tenant_id=$1 AND property_id=$2 AND reservation_id=$3',[tenant,hotel.property,hotel.reservation]);
    const unused=randomUUID();
    await q("INSERT INTO irp_pms.reservations(tenant_id,property_id,id,source,source_booking_id,source_version,payload_hash,status) VALUES($1,$2,$3::uuid,'iratepilot-ota',$3::uuid::text,1,repeat('d',64),'Cancelled')",[tenant,hotel.property,unused]);
    const timestamp=await val('SELECT clock_timestamp()::text');
    const empty={...current,id:randomUUID(),reservation_id:unused,version:1,recording_time_zone:'Pacific/Kiritimati',received_minor:500,refunded_minor:0,reduced_minor:0,created_at:timestamp,updated_at:timestamp};
    await storageFailure(()=>insertRow('security_deposit_books',empty),/complete contiguous event history/);
    await storageFailure(()=>insertRow('security_deposit_books',{...empty,creation_operating_model:'whole_home'}),/context/);
    await storageFailure(()=>q("UPDATE irp_pms.security_deposit_books SET version=version+1,recording_time_zone='UTC' WHERE tenant_id=$1 AND property_id=$2 AND id=$3",[tenant,hotel.property,current.id]),/immutable/);
    for(const table of ['security_deposit_books','security_deposit_events','security_deposit_requests']) await storageFailure(()=>q(`DELETE FROM irp_pms.${table} WHERE tenant_id=$1 AND property_id=$2`,[tenant,hotel.property]),/immutable|cannot be deleted/);
    for(const table of ['security_deposit_events','security_deposit_requests']) await storageFailure(()=>q(`UPDATE irp_pms.${table} SET reservation_id=reservation_id WHERE tenant_id=$1 AND property_id=$2`,[tenant,hotel.property]),/immutable/);
  });
  await check('Deferred recorded outcomes reject missing fields forged event identity and false historical-prefix totals',async()=>{
    const append=async({changeEvent=e=>e,changeRequest=r=>r,omitRequest=false}={})=>{
      const book=await val('SELECT to_jsonb(b) FROM irp_pms.security_deposit_books b WHERE tenant_id=$1 AND property_id=$2 AND reservation_id=$3',[tenant,hotel.property,hotel.reservation]);
      const prior=await val('SELECT to_jsonb(e) FROM irp_pms.security_deposit_events e WHERE tenant_id=$1 AND property_id=$2 AND book_id=$3 ORDER BY to_version DESC LIMIT 1',[tenant,hotel.property,book.id]);
      const timestamp=await val('SELECT clock_timestamp()::text'),date=await val('SELECT ($1::timestamptz AT TIME ZONE $2)::date::text',[timestamp,book.recording_time_zone]);
      await q('UPDATE irp_pms.security_deposit_books SET version=version+1,received_minor=received_minor+7,updated_at=$4 WHERE tenant_id=$1 AND property_id=$2 AND id=$3',[tenant,hotel.property,book.id,timestamp]);
      const event=changeEvent({...prior,id:randomUUID(),request_id:randomUUID(),kind:'external_receipt',amount_minor:7,target_event_id:null,recorded_method:'cash',reference:'Storage prefix fixture',reason:'Independent deferred-prefix proof',actor_id:owner,recorded_at:timestamp,recording_date:date,from_version:book.version,to_version:book.version+1});
      await insertRow('security_deposit_events',event);
      if(omitRequest)return;
      const result=await val('SELECT irp_pms.security_deposit_result_json($1,$2,$3)',[tenant,hotel.property,event.id]);
      const command={reservation_id:hotel.reservation,expected_version:book.version,expected_recording_time_zone:book.recording_time_zone,expected_recording_date:date,kind:'external_receipt',amount_minor:7,method:'cash',reference:event.reference,reason:event.reason,target_event_id:null,confirmed:true};
      await insertRow('security_deposit_requests',changeRequest({tenant_id:tenant,property_id:hotel.property,request_id:event.request_id,reservation_id:hotel.reservation,actor_id:owner,outcome:'recorded',book_id:book.id,event_id:event.id,retirement_reason:null,command,result,recorded_at:timestamp}));
    };
    await storageFailure(()=>append({omitRequest:true}),/recorded request|foreign key/);
    for(const changeEvent of [e=>({...e,recorded_method:null}),e=>({...e,from_version:null}),e=>({...e,to_version:e.to_version+1}),e=>({...e,reservation_id:home.reservation}),e=>({...e,recording_time_zone:'UTC'}),e=>({...e,recording_date:'2000-01-01'})]) await storageFailure(()=>append({changeEvent}));
    for(const changeRequest of [r=>({...r,result:{}}),r=>({...r,result:{...r.result,folio_changed:null}}),r=>({...r,result:{...r.result,event:{...r.result.event,id:randomUUID()}}}),r=>({...r,result:{...r.result,book:{...r.result.book,totals:{...r.result.book.totals,held_minor:r.result.book.totals.held_minor+1}}}}),r=>({...r,event_id:null}),r=>({...r,outcome:'retired',book_id:null,event_id:null,retirement_reason:'Forged retired financial event'})]) await storageFailure(()=>append({changeRequest}));
    // Positive control: the same fully paired append passes forced deferred checks, then rolls back.
    await admin(); const before=await snapshot(); await db.exec('BEGIN');
    try { await append(); await db.exec('SET CONSTRAINTS ALL IMMEDIATE'); } finally { await db.exec('ROLLBACK'); }
    assert.deepEqual(await snapshot(),before); await as(owner);
  });
  await check('Retired storage cannot forge financial fields actor identity or recorded-outcome linkage',async()=>{
    await admin(); const old=await val("SELECT to_jsonb(r) FROM irp_pms.security_deposit_requests r WHERE outcome='retired' LIMIT 1"); assert.ok(old);
    const fresh=()=>{const row=structuredClone(old);row.request_id=randomUUID();row.result.request_id=row.request_id;return row;};
    for(const change of [r=>({...r,result:{...r.result,financial_changed:true}}),r=>({...r,result:{...r.result,book:{version:0}}}),r=>({...r,result:{...r.result,retired_by:staff}}),r=>({...r,retirement_reason:null}),r=>({...r,outcome:'recorded'}),r=>({...r,event_id:firstResult.event.id}),r=>({...r,command:{...r.command,unexpected:true}})]) await storageFailure(()=>insertRow('security_deposit_requests',change(fresh())));
  });
  await check('Application and service roles cannot write private deposit storage or execute new service RPCs',async()=>{
    for(const role of ['authenticated','service_role','anon']) {
      await admin(); await db.exec('SET ROLE '+role);
      for(const table of ['security_deposit_books','security_deposit_events','security_deposit_requests']) await fails(()=>db.exec('DELETE FROM irp_pms.'+table+' WHERE false'),'42501');
      if(role!=='authenticated') await fails(()=>detail(hotel),'42501');
    }
    await as(owner);
  });
  const result={passed:true,local_only:true,source:sourcePath,source_sha256:sourceHash,check_count:checks.length,checks,scope:'Exact172 SQL on the frozen28 installed predecessor migrations in single-session PGlite; fictional data only. Native concurrency, hosted transport and real money are not tested.'};
  const resultPath=process.env.DEPOSIT_INDEPENDENT_RESULT||resolve(process.cwd(),'security-deposits-independent-result.json');
  await writeFile(resultPath,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
} finally { await db.close(); }
