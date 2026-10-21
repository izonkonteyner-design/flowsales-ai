import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
const statusPath = process.env.FLOWSALES_LOCAL_STATUS_FILE;
if (!statusPath) throw new Error('FLOWSALES_LOCAL_STATUS_FILE must point to an isolated local Supabase status JSON');
const cfg = JSON.parse(await fs.readFile(statusPath, 'utf8'));
const url = cfg.API_URL || cfg.api_url;
if (url !== 'http://127.0.0.1:56431') throw new Error('Refusing to run against anything except this task’s isolated local Supabase');
const anon = cfg.ANON_KEY || cfg.anon_key;
const service = cfg.SERVICE_ROLE_KEY || cfg.service_role_key;
const client = key => createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const admin = client(service);
const runId = crypto.randomBytes(4).toString('hex');
const roles = ['owner','admin','manager','sales','sales_rep','viewer'];
const results = [];
async function check(name, run) { try { await run(); results.push({ name, passed: true }); } catch(error) { results.push({ name, passed: false, error: error.message }); } }
function ok(result) { if (result.error) throw new Error(result.error.message); return result.data; }
async function insert(table, row) { return ok(await admin.from(table).insert(row).select().single()); }
const subjects=[];const orgs=[];const fixtures=[];
for (let n=0;n<2;n++) {
 const org=await insert('organizations',{name:`Repair Test ${runId} ${n}`,slug:`repair-test-${runId}-${n}`,currency:'TRY',onboarding_completed_at:new Date().toISOString()});orgs.push(org);
 ok(await admin.from('organization_entitlements').upsert({organization_id:org.id,plan_key:'pro',subscription_status:'active',seat_limit:20,monthly_ai_run_limit:1000}));
 for (const role of roles) {
  const email=`repair-${runId}-${n}-${role}@flowsales-test.invalid`;const password=crypto.randomBytes(24).toString('base64url');
  const data=ok(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:`Test ${role}`}}));
  await insert('organization_members',{organization_id:org.id,user_id:data.user.id,role});
  const auth=client(anon);ok(await auth.auth.signInWithPassword({email,password}));subjects.push({org:n,role,email,password,id:data.user.id,client:auth});
 }
 const owner=subjects.find(s=>s.org===n && s.role==='owner');
 const lead=await insert('leads',{organization_id:org.id,full_name:`Synthetic Lead ${n}`,status:'new',estimated_value:100,currency:'TRY',created_by:owner.id});
 const contact=await insert('contacts',{organization_id:org.id,full_name:`Synthetic Contact ${n}`,created_by:owner.id});
 const product=await insert('products',{organization_id:org.id,name:`Synthetic Product ${n}`,sku:`REPAIR-${runId}-${n}`,base_price:100,unit_price:100,currency:'TRY',active:true});
 const quote=await insert('quotes',{organization_id:org.id,lead_id:lead.id,quote_number:`TEST-${runId}-${n}`,status:'draft',currency:'TRY',subtotal:100,total:100,grand_total:100,issue_date:new Date().toISOString().slice(0,10),created_by:owner.id});
 await insert('quote_items',{quote_id:quote.id,name:'Synthetic item',quantity:1,unit_price:100,line_total:100,tax_rate:0,sort_order:0});
 const task=await insert('tasks',{organization_id:org.id,title:'Synthetic task',due_at:new Date(Date.now()+86400000).toISOString(),priority:'medium',status:'open',created_by:owner.id});
 const account=await insert('social_media_accounts',{organization_id:org.id,platform:'instagram',platform_account_id:`synthetic-${runId}-${n}`,access_token:'synthetic-not-a-platform-token',status:'disconnected'});
 const post=await insert('social_media_posts',{organization_id:org.id,account_id:account.id,platform:'instagram',status:'draft',content:'Synthetic test only; never publish',created_by:owner.id});
 fixtures.push({lead,contact,product,quote,task,account,post});
}
const meta='id,organization_id,platform,username,status';
for (const subject of subjects) {
 const label=`org${subject.org}:${subject.role}`;const own=orgs[subject.org];const foreign=orgs[1-subject.org];const db=subject.client;
 for (const table of ['leads','contacts','products','quotes','tasks','social_media_posts']) {
  await check(`${label}:${table}:own-read-nonempty`,async()=>assert.ok(ok(await db.from(table).select('id').eq('organization_id',own.id)).length>0));
  await check(`${label}:${table}:foreign-read-empty`,async()=>assert.equal(ok(await db.from(table).select('id').eq('organization_id',foreign.id)).length,0));
 }
 await check(`${label}:account-metadata-own`,async()=>assert.equal(ok(await db.from('social_media_accounts').select(meta).eq('organization_id',own.id)).length,1));
 await check(`${label}:account-metadata-foreign`,async()=>assert.equal(ok(await db.from('social_media_accounts').select(meta).eq('organization_id',foreign.id)).length,0));
 for (const column of ['access_token','refresh_token','encrypted_access_token','encrypted_refresh_token']) await check(`${label}:deny-${column}`,async()=>assert.ok((await db.from('social_media_accounts').select(column)).error));
 await check(`${label}:deny-account-direct-write`,async()=>assert.ok((await db.from('social_media_accounts').insert({organization_id:own.id,platform:'instagram',platform_account_id:crypto.randomUUID(),access_token:'synthetic'})).error));
 await check(`${label}:deny-post-direct-write`,async()=>assert.ok((await db.from('social_media_posts').insert({organization_id:own.id,platform:'instagram',content:'forged',status:'published'})).error));
 await check(`${label}:deny-post-published-forgery`,async()=>assert.ok((await db.from('social_media_posts').update({status:'published'}).eq('id',fixtures[subject.org].post.id)).error));
 await check(`${label}:own-lead-write-policy`,async()=>{
  const id=crypto.randomUUID();const res=await db.from('leads').insert({id,organization_id:own.id,full_name:'Synthetic write check',status:'new',created_by:subject.id});
  assert.equal(!res.error,subject.role!=='viewer');await admin.from('leads').delete().eq('id',id);
 });
 await check(`${label}:foreign-lead-write-denied`,async()=>assert.ok((await db.from('leads').insert({organization_id:foreign.id,full_name:'Denied synthetic',status:'new'})).error));
 await check(`${label}:own-task-write-policy`,async()=>{
  const id=crypto.randomUUID();const res=await db.from('tasks').insert({id,organization_id:own.id,title:'Synthetic write check',due_at:new Date().toISOString(),priority:'low',created_by:subject.id});
  assert.equal(!res.error,subject.role!=='viewer');await admin.from('tasks').delete().eq('id',id);
 });
 await check(`${label}:oauth-own-role-policy`,async()=>{
  const token_hash=crypto.randomBytes(32).toString('hex');const res=await db.from('social_oauth_states').insert({token_hash,organization_id:own.id,user_id:subject.id,platform:'instagram',expires_at:new Date(Date.now()+600000).toISOString()});
  assert.equal(!res.error,['owner','admin'].includes(subject.role));await admin.from('social_oauth_states').delete().eq('token_hash',token_hash);
 });
 await check(`${label}:oauth-foreign-denied`,async()=>assert.ok((await db.from('social_oauth_states').insert({token_hash:crypto.randomBytes(32).toString('hex'),organization_id:foreign.id,user_id:subject.id,platform:'instagram',expires_at:new Date().toISOString()})).error));
 await check(`${label}:storage-own-role-policy`,async()=>{
  const storagePath=`${own.id}/${subject.id}/synthetic-${crypto.randomUUID()}.png`;
  const res=await db.storage.from('social-media-assets').upload(storagePath,new Uint8Array([137,80,78,71,13,10,26,10]),{contentType:'image/png'});
  assert.equal(!res.error,subject.role!=='viewer');await admin.storage.from('social-media-assets').remove([storagePath]);
 });
 await check(`${label}:storage-foreign-denied`,async()=>assert.ok((await db.storage.from('social-media-assets').upload(`${foreign.id}/${subject.id}/denied.png`,new Uint8Array([137,80,78,71]),{contentType:'image/png'})).error));
}
await check('service:cross-tenant-account-foreign-key',async()=>assert.ok((await admin.from('social_media_posts').insert({organization_id:orgs[0].id,account_id:fixtures[1].account.id,platform:'instagram',content:'Denied cross-tenant account'})).error));
await check('anonymous:account-access-denied',async()=>assert.ok((await client(anon).from('social_media_accounts').select(meta)).error));
await check('anonymous:oauth-access-denied',async()=>assert.ok((await client(anon).from('social_oauth_states').select('*')).error));
await check('migration-registry:0055-through-0059',async()=>{
 const rows=ok(await admin.from('deployment_migrations').select('version').in('version',['0055','0056','0057','0058','0059']));assert.equal(rows.length,5);
});
const output=path.resolve(process.env.FLOWSALES_RLS_REPORT || '../../outputs/release-rls-results.json');
await fs.writeFile(output,JSON.stringify({runId,localUrl:url,workspaces:2,roles,checks:results.length,passed:results.filter(x=>x.passed).length,failed:results.filter(x=>!x.passed).length,results},null,2));
await fs.writeFile(path.resolve(path.dirname(statusPath),'test-users.private.json'),JSON.stringify(subjects.map((s) => { const r = { ...s }; delete r.client; return r; }),null,2));
await fs.writeFile(path.resolve(path.dirname(statusPath),'rls-matrix.private.json'),JSON.stringify(subjects.filter(s=>s.role!=='sales').map(s=>({role:s.role,email:s.email,password:s.password,organizationId:orgs[s.org].id})),null,2));
console.log(JSON.stringify({workspaces:2,roles,checks:results.length,passed:results.filter(x=>x.passed).length,failed:results.filter(x=>!x.passed)}));
for (const failure of results.filter(x=>!x.passed)) console.error(JSON.stringify(failure));
if (results.some(x=>!x.passed)) process.exitCode=1;
