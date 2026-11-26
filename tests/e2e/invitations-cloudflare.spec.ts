import {test,expect} from '@playwright/test';
import {Miniflare} from 'miniflare';
import {build} from 'esbuild';
import {spawn,type ChildProcess} from 'node:child_process';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {migrationStatements} from '../migrations';

const origin='http://localhost:5178',hash=(v:string)=>createHash('sha256').update(v).digest('hex');
let mf:Miniflare,vite:ChildProcess,invitationLink:string,adminSession='',nonce='',friend=false;
const uid='U'+randomBytes(16).toString('hex'),secret=randomBytes(32).toString('hex');
test.beforeAll(async()=>{
 const built=await build({entryPoints:['worker/index.ts'],bundle:true,format:'esm',platform:'browser',write:false});
 mf=new Miniflare({modules:true,script:built.outputFiles[0].text,compatibilityDate:'2026-07-01',d1Databases:['DB'],bindings:{ALLOWED_ORIGIN:origin,COOKIE_SECURE:'false',AUTH_PEPPER:secret,BINDING_PEPPER:secret,LINE_CHANNEL_ACCESS_TOKEN:secret,LINE_LOGIN_CHANNEL_ID:'1234567890',LINE_LOGIN_CHANNEL_SECRET:secret,LINE_SEND_ENABLED:'false'},outboundService:async(req:any)=>{
  if(req.url.endsWith('/v2.1/token'))return Response.json({access_token:secret,id_token:randomBytes(32).toString('hex')});
  if(req.url.endsWith('/v2.1/verify'))return Response.json({iss:'https://access.line.me',aud:'1234567890',sub:uid,nonce,exp:Math.floor(Date.now()/1000)+600});
  if(req.url.endsWith('/friendship/v1/status'))return Response.json({friendFlag:friend});
  if(req.url.endsWith('/v2/bot/info'))return Response.json({basicId:'@test-office'});
  if(req.url.includes('/v2/bot/profile/'))return Response.json({userId:uid});
  throw Error('未允許的 LINE 測試請求');
 }});
 const db=await mf.getD1Database('DB');await db.batch(migrationStatements().map(sql=>db.prepare(sql)));
 const now=new Date().toISOString(),token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');adminSession=token;
 await db.prepare("INSERT INTO admins VALUES('test-admin','test-only','虛構管理員',?,'admin',1,?,?)").bind(randomUUID(),now,now).run();
 await db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)').bind(hash(token),'test-admin',hash(csrf),csrf,Math.floor(Date.now()/1000)+3600,now).run();
 await db.prepare("INSERT INTO teachers(id,name,department,created_at,updated_at) VALUES('test-teacher','虛構綁定教師','測試單位',?,?)").bind(now,now).run();
 const r=await mf.dispatchFetch(origin+'/api/command',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:'office_session='+token,'X-CSRF-Token':csrf},body:JSON.stringify({action:'invitation_issue',payload:{teacher_id:'test-teacher'}})});expect(r.status).toBe(200);invitationLink=(await r.json() as any).invitation_link;
 vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','localhost','--port','5178','--strictPort'],{env:{...process.env,VITE_APP_MODE:'cloudflare',VITE_API_BASE:'/api',VITE_BASE_PATH:'/'},stdio:'ignore'});
 let ready=false;for(let i=0;i<100;i++){if(vite.exitCode!==null)throw Error('5178 測試前端提前結束');try{if((await fetch(origin)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}if(!ready)throw Error('測試前端未啟動');
});
test.afterAll(async()=>{vite?.kill();await mf?.dispose();});

test('Cloudflare 教師完整流程：無行政登入、OAuth Cookie 回呼、確認好友後綁定及重整結果',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const apiPaths:string[]=[];
 await page.route(origin+'/api/**',async route=>{const r=route.request();apiPaths.push(new URL(r.url()).pathname);const response=await mf.dispatchFetch(r.url(),{method:r.method(),headers:await r.allHeaders(),...(r.method()==='POST'?{body:r.postData()!}:{}),redirect:'manual'});await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});});
 await page.route('https://access.line.me/oauth2/v2.1/authorize?**',async route=>{const url=new URL(route.request().url());nonce=url.searchParams.get('nonce')!;const callback=origin+'/api/binding/callback?'+new URLSearchParams({state:url.searchParams.get('state')!,code:randomUUID()});await route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="UTF-8"><script>location.replace('+JSON.stringify(callback)+')</script>'});});
 await page.goto(invitationLink);await expect(page.getByRole('button',{name:'使用 LINE 繼續'})).toBeVisible();expect(await page.evaluate(()=>location.hash)).toBe('');await page.getByRole('button',{name:'使用 LINE 繼續'}).click();
 await expect(page.getByRole('heading',{name:'確認教師身分'})).toBeVisible();await expect(page.locator('.invitation-identity')).toContainText('虛構綁定教師');await expect(page.locator('.invitation-identity')).toContainText('測試單位');
 const db=await mf.getD1Database('DB');expect((await db.prepare('SELECT line_user_id FROM teachers').first<any>())!.line_user_id).toBeNull();
 await page.getByRole('button',{name:'確認綁定虛構綁定教師'}).click();await expect(page.getByRole('link',{name:'開啟官方帳號'})).toBeVisible();friend=true;await page.getByRole('button',{name:'已加入，確認綁定'}).click();
 await expect(page.getByRole('heading',{name:'身分綁定成功'})).toBeVisible();await page.reload();await expect(page.getByRole('heading',{name:'身分綁定成功'})).toBeVisible();expect((await db.prepare('SELECT line_user_id FROM teachers').first<any>())!.line_user_id).toBe(uid);
 expect(apiPaths).not.toContain('/api/session');expect(apiPaths).not.toContain('/api/data');expect(apiPaths).not.toContain('/api/changes');expect(errors).toEqual([]);
});


test('Cloudflare 僅有 0006 仍可查看後台，邀請提示 0007 未完成並可使用備用碼',async({page,context})=>{
 const db=await mf.getD1Database('DB');
 await db.batch([db.prepare('DROP TRIGGER invalidate_teacher_invitation'),db.prepare('DROP TABLE binding_oauth'),db.prepare('DROP TABLE binding_invitations'),db.prepare("UPDATE teachers SET line_user_id=NULL,bound_at=NULL WHERE id='test-teacher'")]);
 await context.addCookies([{name:'office_session',value:adminSession,url:origin,httpOnly:true,sameSite:'Lax'}]);
 await page.route(origin+'/api/**',async route=>{const r=route.request(),response=await mf.dispatchFetch(r.url(),{method:r.method(),headers:await r.allHeaders(),...(r.method()==='POST'?{body:r.postData()!}:{}),redirect:'manual'});await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});});
 await page.goto(origin);await expect(page.getByRole('heading',{name:'值班工作台',exact:true})).toBeVisible();await expect(page.getByRole('alert')).toHaveCount(0);
 await page.getByRole('button',{name:'教師名單',exact:true}).click();await page.getByRole('row').filter({hasText:'虛構綁定教師'}).getByRole('button',{name:'管理綁定'}).click();const dialog=page.getByRole('dialog');
 await expect(dialog).toContainText('0007');await expect(dialog.getByRole('button',{name:'產生專屬邀請',exact:true})).toHaveCount(0);await dialog.getByText('其他綁定方式',{exact:true}).click();await dialog.getByRole('button',{name:'產生綁定碼',exact:true}).click();await expect(dialog.locator('.code')).toHaveText(/^[A-Z2-9]{12}$/);
});
