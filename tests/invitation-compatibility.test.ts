import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest';
import {Miniflare} from 'miniflare';
import {build} from 'esbuild';
import {readFileSync,readdirSync} from 'node:fs';
import {randomBytes,createHash} from 'node:crypto';
import {splitMigration} from './migrations';
import type {D1Database} from '@cloudflare/workers-types';

let mf:Miniflare,db:D1Database;
const origin='http://localhost',secret=randomBytes(32).toString('hex'),token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
beforeAll(async()=>{
 const built=await build({entryPoints:['worker/index.ts'],bundle:true,write:false,format:'esm',platform:'browser'});
 mf=new Miniflare({modules:true,script:built.outputFiles[0].text,compatibilityDate:'2026-07-01',d1Databases:['DB'],bindings:{ALLOWED_ORIGIN:origin,COOKIE_SECURE:'false',AUTH_PEPPER:secret,BINDING_PEPPER:secret,LINE_LOGIN_CHANNEL_ID:'1234567890',LINE_LOGIN_CHANNEL_SECRET:secret,LINE_CHANNEL_ACCESS_TOKEN:secret,LINE_SEND_ENABLED:'false'},outboundService:async()=>{throw Error('相容測試不得呼叫真實 LINE');}});
 db=await mf.getD1Database('DB') as unknown as D1Database;
 const sql=readdirSync('migrations').filter(n=>n.endsWith('.sql')&&n<'0007').sort().flatMap(n=>splitMigration(readFileSync('migrations/'+n,'utf8')));await db.batch(sql.map(s=>db.prepare(s)));
 const now=new Date().toISOString();await db.prepare("INSERT INTO admins VALUES('compat-admin','compat-admin','虛構管理員',?,'admin',1,?,?)").bind(randomBytes(32).toString('hex'),now,now).run();
 await db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)').bind(hash(token),'compat-admin',hash(csrf),csrf,Math.floor(Date.now()/1000)+3600,now).run();
 await db.prepare("INSERT INTO teachers(id,name,department,created_at,updated_at) VALUES('compat-teacher','虛構既有教師','測試單位',?,?)").bind(now,now).run();
 await db.prepare("INSERT INTO messages(id,teacher_id,direction,content,created_at) VALUES('compat-message','compat-teacher','in','虛構既有聊天',?)").bind(now).run();
});
beforeEach(async()=>{
 await db.batch([db.prepare('DROP TRIGGER IF EXISTS invalidate_teacher_invitation'),db.prepare('DROP TABLE IF EXISTS binding_oauth'),db.prepare('DROP TABLE IF EXISTS binding_invitations')]);
});
afterAll(async()=>{await mf.dispose();});
const request=(path:string,body?:any,cookie='office_session='+token)=>mf.dispatchFetch(origin+'/api/'+path,{method:body?'POST':'GET',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json','X-CSRF-Token':csrf},...(body?{body:JSON.stringify(body)}:{})});
const command=(action:string)=>request('command',{action,payload:{teacher_id:'compat-teacher'}});
const apply=()=>db.batch(splitMigration(readFileSync('migrations/0007_teacher_invitations.sql','utf8')).map(s=>db.prepare(s)));

it('只有 0006 時仍可載入後台、教師與既有聊天，新功能缺表不能拖垮整頁',async()=>{
 const response=await request('data');expect(response.status).toBe(200);const data:any=await response.json();expect(data.teachers[0].name).toBe('虛構既有教師');expect(data.messages[0].content).toBe('虛構既有聊天');
});
it('舊資料庫仍要求 Session，不能因新表缺少而跳過登入',async()=>{expect((await request('data',undefined,'')).status).toBe(401);});
it('缺少 0007 時只停用邀請，提供原因並保留備用碼',async()=>{
 const result:any=await(await command('invitation_get')).json();expect(result.configured).toBe(false);expect(result.unavailable_reason).toContain('0007');
 const code=await command('issue_code');expect(code.status).toBe(200);expect((await code.json() as any).code).toMatch(/^[A-Z2-9]{12}$/);
});
it('缺少新表時不能建立邀請或開始授權，錯誤不洩漏 SQL 或憑證',async()=>{
 for(const response of [await command('invitation_issue'),await request('binding/start',{token:'invalid'})]){expect(response.status).toBe(503);const data:any=await response.json();expect(data.code).toBe('INVITATION_SCHEMA_MISSING');expect(JSON.stringify(data)).not.toContain(secret);expect(JSON.stringify(data)).not.toContain('SELECT');}
});
it('補上 0007 後不用清除教師、訊息或 Session 即可恢復邀請',async()=>{
 await apply();expect((await request('data')).status).toBe(200);expect((await command('invitation_issue')).status).toBe(200);const data:any=await(await request('data')).json();expect(data.teachers).toHaveLength(1);expect(data.messages).toHaveLength(1);
});
it('只有表但觸發器缺漏時，邀請維持停用，避免繞過一次性保護',async()=>{
 await apply();await db.prepare('DROP TRIGGER invalidate_teacher_invitation').run();const response=await command('invitation_issue');expect(response.status).toBe(503);expect((await response.json() as any).code).toBe('INVITATION_SCHEMA_MISSING');expect((await request('data')).status).toBe(200);
});
