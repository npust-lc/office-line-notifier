import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest';
import {Miniflare} from 'miniflare';
import {build} from 'esbuild';
import {randomBytes,randomUUID,createHash,createHmac} from 'node:crypto';
import {migrationStatements} from './migrations';
import type {D1Database} from '@cloudflare/workers-types';

// 所有 LINE 回應及身分均為每次執行隨機產生的虛構資料。
let mf:Miniflare,db:D1Database;
const origin='http://localhost',pepper=randomBytes(32).toString('hex'),secret=randomBytes(32).toString('hex');
const digest=(v:string)=>createHash('sha256').update(v).digest('hex');
const cookie=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex'),staffCookie=randomBytes(32).toString('hex');
const authCodes=new Map<string,{nonce:string;uid:string;access:string}>();
let friend=true,upstreamFailure=false,identityOverride:any={},exchanges=0;
beforeAll(async()=>{
 const output=await build({entryPoints:['worker/index.ts'],bundle:true,format:'esm',platform:'browser',write:false});
 mf=new Miniflare({modules:true,script:output.outputFiles[0].text,compatibilityDate:'2026-07-01',d1Databases:['DB'],bindings:{ALLOWED_ORIGIN:origin,COOKIE_SECURE:'false',AUTH_PEPPER:pepper,BINDING_PEPPER:pepper,LINE_CHANNEL_ACCESS_TOKEN:secret,LINE_CHANNEL_SECRET:secret,LINE_LOGIN_CHANNEL_ID:'1234567890',LINE_LOGIN_CHANNEL_SECRET:secret,LINE_SEND_ENABLED:'false'},outboundService:async(req:any)=>{
  if(upstreamFailure)return new Response('{}',{status:503});
  if(req.url.endsWith('/v2.1/token')){
   exchanges++;const p=new URLSearchParams(await req.text()),entry=authCodes.get(p.get('code')!);
   expect(p.get('grant_type')).toBe('authorization_code');expect(p.get('redirect_uri')).toBe(origin+'/api/binding/callback');expect(p.get('code_verifier')).toMatch(/^[a-f0-9]{64}$/);
   if(!entry)return new Response('{}',{status:400});
   return Response.json({id_token:'id-'+p.get('code'),access_token:entry.access});
  }
  if(req.url.endsWith('/v2.1/verify')){
   const p=new URLSearchParams(await req.text()),entry=authCodes.get(p.get('id_token')!.slice(3))!;
   return Response.json({iss:'https://access.line.me',aud:'1234567890',exp:Math.floor(Date.now()/1000)+600,sub:entry.uid,nonce:entry.nonce,...identityOverride});
  }
  if(req.url.endsWith('/friendship/v1/status'))return Response.json({friendFlag:friend});
  if(req.url.endsWith('/v2/bot/message/reply'))return Response.json({});
  if(req.url.endsWith('/v2/bot/info'))return Response.json({basicId:'@test-office'});
  if(req.url.includes('/v2/bot/profile/'))return Response.json({userId:decodeURIComponent(req.url.split('/').at(-1))});
  throw Error('測試未允許的對外請求');
 }});
 db=await mf.getD1Database('DB') as unknown as D1Database;
 await db.batch(migrationStatements().map(sql=>db.prepare(sql)));
});
afterAll(async()=>{await mf.dispose();});
beforeEach(async()=>{
 authCodes.clear();friend=true;upstreamFailure=false;identityOverride={};exchanges=0;
 for(const table of ['binding_oauth','binding_invitations','binding_codes','audit_logs','teachers','sessions','admins','rate_limits'])await db.prepare('DELETE FROM '+table).run();
 const now=new Date().toISOString();
 for(const [id,role]of [['a','admin'],['s','staff']])await db.prepare('INSERT INTO admins VALUES(?,?,?,?,?,1,?,?)').bind(id,id+'-test','虛構測試人員',randomBytes(32).toString('hex'),role,now,now).run();
 for(const [token,actor]of [[cookie,'a'],[staffCookie,'s']])await db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)').bind(digest(token),actor,digest(csrf),csrf,Math.floor(Date.now()/1000)+3600,now).run();
});
const post=(path:string,body:any={},c='')=>mf.dispatchFetch(origin+'/api/'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'203.0.113.7',Cookie:c},body:JSON.stringify(body)});
const command=(action:string,teacher_id:string,c=cookie,token=csrf)=>mf.dispatchFetch(origin+'/api/command',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:'office_session='+c,'X-CSRF-Token':token},body:JSON.stringify({action,payload:{teacher_id}})});
const read=async(sql:string,...args:any[])=>db.prepare(sql).bind(...args).first<any>();
async function teacher(){const id=randomUUID(),now=new Date().toISOString();await db.prepare('INSERT INTO teachers(id,name,department,created_at,updated_at) VALUES(?,?,?,?,?)').bind(id,'虛構教師','測試單位',now,now).run();return id;}
async function issue(tid:string){const r=await command('invitation_issue',tid);expect(r.status).toBe(200);const data:any=await r.json();return new URL(data.invitation_link).hash.slice(1);}
async function start(token:string,uid='U'+randomBytes(16).toString('hex')){
 const r=await post('binding/start',{token});expect(r.status).toBe(200);const data:any=await r.json(),url=new URL(data.authorization_url),code=randomUUID();expect(r.headers.get('set-cookie')).toContain('HttpOnly; SameSite=Lax');
 authCodes.set(code,{nonce:url.searchParams.get('nonce')!,uid,access:randomBytes(32).toString('hex')});
 return {url,code,uid,cookie:r.headers.get('set-cookie')!.split(';')[0]};
}
async function callback(flow:Awaited<ReturnType<typeof start>>,extra=''){
 return mf.dispatchFetch(origin+'/api/binding/callback?'+new URLSearchParams({state:flow.url.searchParams.get('state')!,code:flow.code})+extra,{headers:{Cookie:flow.cookie},redirect:'manual'});
}
async function authorized(token:string,uid?:string){const f=await start(token,uid);const r=await callback(f);expect(r.status).toBe(303);expect(r.headers.get('location')).toBe(origin+'/bind');return f;}

it('專屬邀請只有管理員可讀取、產生及撤銷，拒絕缺少 Session 或 CSRF',async()=>{
 const tid=await teacher();for(const action of ['invitation_get','invitation_issue','invitation_revoke']){
  expect((await command(action,tid,'')).status).toBe(401);expect((await command(action,tid,staffCookie)).status).toBe(403);expect((await command(action,tid,cookie,'wrong')).status).toBe(403);
 }
 expect((await read('SELECT count(*) AS n FROM binding_invitations')).n).toBe(0);
});
it('邀請可重複複製，僅保存安全雜湊，超過七天仍可開啟，不因預覽消耗',async()=>{
 const tid=await teacher(),token=await issue(tid);await db.prepare("UPDATE binding_invitations SET issued_at='2020-01-01T00:00:00.000Z'").run();
 const copy:any=await(await command('invitation_get',tid)).json();expect(copy.invitation_link).toBe(origin+'/bind#'+token);
 for(let i=0;i<3;i++)expect((await post('binding/open',{token})).status).toBe(200);
 const row=await read('SELECT * FROM binding_invitations');expect(row.token_hash).toBe(digest(token));expect(JSON.stringify(row)).not.toContain(token);expect(row.used_at).toBeNull();expect(row.revoked_at).toBeNull();expect((await read('SELECT count(*) AS n FROM binding_oauth')).n).toBe(0);
});
it('公開綁定 API 拒絕跨來源、GET、缺少 Origin 及非 JSON，且不接受前端指定 LINE 身分',async()=>{
 const token=await issue(await teacher());
 for(const headers of [{Origin:'https://wrong.example','Content-Type':'application/json'},{'Content-Type':'application/json'},{Origin:origin,'Content-Type':'text/plain'}]){
  const r=await mf.dispatchFetch(origin+'/api/binding/start',{method:'POST',headers,body:JSON.stringify({token})});expect([403,415]).toContain(r.status);
 }
 expect((await mf.dispatchFetch(origin+'/api/binding/open')).status).toBe(405);
 expect((await post('binding/confirm',{line_user_id:'U'+randomBytes(16).toString('hex'),teacher_id:randomUUID()})).status).toBe(401);
});
it('授權啟用 PKCE、nonce、state、安全 Cookie，回呼前後都不會提前綁定',async()=>{
 const tid=await teacher(),f=await start(await issue(tid));expect(f.url.origin).toBe('https://access.line.me');expect(f.url.searchParams.get('scope')).toBe('openid profile');expect(f.url.searchParams.get('bot_prompt')).toBe('aggressive');expect(f.url.searchParams.get('code_challenge_method')).toBe('S256');expect(f.url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
 const state=await read('SELECT * FROM binding_oauth');expect(state.state_hash).toBe(digest(f.url.searchParams.get('state')!));
 expect(state.browser_hash).toBe(digest(f.cookie.split('=')[1]));expect((await read('SELECT line_user_id FROM teachers WHERE id=?',tid)).line_user_id).toBeNull();
 await callback(f);expect((await read('SELECT line_user_id FROM teachers WHERE id=?',tid)).line_user_id).toBeNull();
 const status:any=await(await post('binding/status',{},f.cookie)).json();expect(status).toEqual({state:'confirm',name:'虛構教師',department:'測試單位'});
 const stored=await read('SELECT * FROM binding_oauth');expect(stored.access_token_sealed).not.toContain(authCodes.get(f.code)!.access);expect(stored.verifier).toBe('');expect(stored.nonce).toBe('');
});
it('錯誤 state、不同瀏覽器及重播回呼均不能交換授權碼',async()=>{
 const f=await start(await issue(await teacher()));
 const missing=await mf.dispatchFetch(origin+'/api/binding/callback?'+new URLSearchParams({state:f.url.searchParams.get('state')!,code:f.code}),{redirect:'manual'});expect(missing.headers.get('location')).toContain('result=failed');
 const wrong=await callback({...f,url:new URL('https://access.line.me/?state='+randomBytes(32).toString('hex'))});expect(wrong.headers.get('location')).toContain('result=invalid');expect(exchanges).toBe(0);
 await callback(f);expect(exchanges).toBe(1);await callback(f);expect(exchanges).toBe(1);
});
it('取消授權只結束這次短效流程，原邀請仍可重新開啟',async()=>{
 const token=await issue(await teacher()),f=await start(token);const r=await callback(f,'&error=access_denied');expect(r.headers.get('location')).toContain('result=cancelled');expect(exchanges).toBe(0);expect((await post('binding/open',{token})).status).toBe(200);
});
it.each([{nonce:'wrong'},{aud:'wrong'},{iss:'https://wrong.example'},{exp:0},{sub:'invalid'}])('拒絕不符預期的已驗證身分欄位 %j',async(override)=>{
 const tid=await teacher(),f=await start(await issue(tid));identityOverride=override;const r=await callback(f);expect(r.headers.get('location')).toContain('result=failed');expect((await post('binding/confirm',{},f.cookie)).status).toBe(409);expect((await read('SELECT line_user_id FROM teachers')).line_user_id).toBeNull();
});
it('必須確認好友才可綁定，既有好友不依賴 follow 或 friendship_status_changed',async()=>{
 const tid=await teacher(),f=await authorized(await issue(tid));friend=false;
 const notFriend:any=await(await post('binding/confirm',{},f.cookie)).json();expect(notFriend.state).toBe('needs_friend');expect(new URL(notFriend.friend_url).hostname).toBe('line.me');expect((await read('SELECT line_user_id FROM teachers')).line_user_id).toBeNull();
 friend=true;const r=await post('binding/confirm',{},f.cookie);expect(r.status).toBe(200);expect(await r.json()).toEqual({state:'done'});expect((await read('SELECT line_user_id FROM teachers')).line_user_id).toBe(f.uid);
 expect((await read('SELECT used_at FROM binding_invitations')).used_at).toBeTruthy();expect((await read('SELECT access_token_sealed FROM binding_oauth')).access_token_sealed).toBeNull();
 expect((await post('binding/confirm',{},f.cookie)).status).toBe(200);expect((await read("SELECT count(*) AS n FROM audit_logs WHERE action='line_invitation_bound'")).n).toBe(1);
 expect((await read('SELECT count(*) AS n FROM notifications')).n).toBe(0);
});
it('同一邀請兩個 LINE 同時確認，只能綁定其中一個',async()=>{
 const tid=await teacher(),token=await issue(tid),a=await authorized(token),b=await authorized(token);
 const responses=await Promise.all([post('binding/confirm',{},a.cookie),post('binding/confirm',{},b.cookie)]);expect(responses.map(r=>r.status).sort()).toEqual([200,409]);expect([a.uid,b.uid]).toContain((await read('SELECT line_user_id FROM teachers')).line_user_id);
 expect((await read("SELECT count(*) AS n FROM audit_logs WHERE action='line_invitation_bound'")).n).toBe(1);
});
it('同一 LINE 同時確認兩位老師，不得重複綁定',async()=>{
 const uid='U'+randomBytes(16).toString('hex'),a=await authorized(await issue(await teacher()),uid),b=await authorized(await issue(await teacher()),uid);
 const responses=await Promise.all([post('binding/confirm',{},a.cookie),post('binding/confirm',{},b.cookie)]);expect(responses.map(r=>r.status).sort()).toEqual([200,409]);expect((await read('SELECT count(*) AS n FROM teachers WHERE line_user_id IS NOT NULL')).n).toBe(1);
});
it('重新產生或撤銷會使正在授權的舊邀請失效',async()=>{
 const tid=await teacher(),old=await issue(tid),f=await authorized(old),newToken=await issue(tid);expect(newToken).not.toBe(old);expect((await post('binding/open',{token:old})).status).toBe(410);expect((await post('binding/confirm',{},f.cookie)).status).toBe(410);
 const newFlow=await authorized(newToken);await command('invitation_revoke',tid);expect((await post('binding/confirm',{},newFlow.cookie)).status).toBe(409);expect((await read('SELECT line_user_id FROM teachers')).line_user_id).toBeNull();
});
it('教師停用後再啟用，舊邀請不會恢復；解除綁定後舊邀請也不能重綁',async()=>{
 const tid=await teacher(),token=await issue(tid);await db.prepare('UPDATE teachers SET active=0 WHERE id=?').bind(tid).run();await db.prepare('UPDATE teachers SET active=1 WHERE id=?').bind(tid).run();expect((await post('binding/open',{token})).status).toBe(410);
 const currentToken=await issue(tid),f=await authorized(currentToken);await post('binding/confirm',{},f.cookie);await command('unbind',tid);expect((await post('binding/open',{token:currentToken})).status).toBe(410);expect((await command('invitation_issue',tid)).status).toBe(200);
});
it('短效授權逾時不會消耗長效邀請，LINE 異常也不會誤綁',async()=>{
 const token=await issue(await teacher()),f=await authorized(token);upstreamFailure=true;expect((await post('binding/confirm',{},f.cookie)).status).toBe(502);expect((await read('SELECT line_user_id FROM teachers')).line_user_id).toBeNull();
 upstreamFailure=false;await db.prepare('UPDATE binding_oauth SET expires_at=0').run();expect((await post('binding/confirm',{},f.cookie)).status).toBe(410);expect((await post('binding/open',{token})).status).toBe(200);expect((await read('SELECT count(*) AS n FROM binding_oauth')).n).toBe(0);
});
it('邀請猜測受速率限制，過量請求不能建立授權流程',async()=>{
 await db.prepare("INSERT INTO rate_limits VALUES(?,120,?)").bind('binding-web:'+await (await import('../worker/security')).hmacDigest('203.0.113.7',pepper),Math.floor(Date.now()/1000)+600).run();
 expect((await post('binding/open',{token:'invalid'})).status).toBe(429);expect((await read('SELECT count(*) AS n FROM binding_oauth')).n).toBe(0);
});

it('備用綁定碼先完成時消耗邀請，邀請先完成時也使備用碼失效',async()=>{
 const tid=await teacher(),token=await issue(tid),f=await authorized(token),issued:any=await(await command('issue_code',tid)).json();
 const body=JSON.stringify({events:[{webhookEventId:randomUUID(),type:'message',timestamp:Date.now(),source:{type:'user',userId:f.uid},message:{id:randomUUID(),type:'text',text:issued.code},replyToken:randomUUID()}]});
 const hook=await mf.dispatchFetch(origin+'/api/line/webhook',{method:'POST',headers:{'x-line-signature':createHmac('sha256',secret).update(body).digest('base64')},body});expect(hook.status).toBe(200);expect((await read('SELECT used_at FROM binding_invitations WHERE teacher_id=?',tid)).used_at).toBeTruthy();expect((await post('binding/confirm',{},f.cookie)).status).toBe(409);
 const other=await teacher();await command('issue_code',other);const g=await authorized(await issue(other));expect((await post('binding/confirm',{},g.cookie)).status).toBe(200);expect((await read('SELECT used_at FROM binding_codes WHERE teacher_id=?',other)).used_at).toBeTruthy();
});
