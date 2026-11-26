import {type Env,type Actor,HttpError,admin,id,iso,unix,audit} from './types';
import {randomToken,sha256,hmacDigest,equal} from './security';
import {limit} from './auth';
import {operationalFailure} from './errors';

const schemaUnavailable=()=>new HttpError(503,'專屬邀請資料庫尚未完成 0007 升級，請先使用其他綁定方式，並由維護人員套用 Migration 0007','INVITATION_SCHEMA_MISSING');
async function requireInvitationSchema(env:Env){
 try{
  const result=await env.DB.batch([
   env.DB.prepare('SELECT id,teacher_id,token_hash,issued_by,issued_at,revoked_at,used_at FROM binding_invitations LIMIT 0'),
   env.DB.prepare('SELECT state_hash,invitation_id,browser_hash,nonce,verifier,expires_at,claim_token,line_user_id,access_token_sealed,verified_at,completed_at FROM binding_oauth LIMIT 0'),
   env.DB.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='invalidate_teacher_invitation'")
  ]);
  if(result[2].results.length!==1)throw schemaUnavailable();
 }catch(error){if(operationalFailure(error)?.code==='DATABASE_SCHEMA_MISSING')throw schemaUnavailable();throw error;}
}
// 選用功能的清理不可使已套用 0006 的後台整頁失效；不自動建表或改動 Migration 紀錄。
export async function cleanupInvitationSessions(env:Env){
 const exists=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='binding_oauth'").first();
 if(!exists)return;
 try{await env.DB.prepare('DELETE FROM binding_oauth WHERE expires_at<=?').bind(unix()).run();}
 catch(error){if(operationalFailure(error)?.code!=='DATABASE_SCHEMA_MISSING')throw error;}
}

const validToken=/^[a-f0-9-]{36}\.[a-f0-9]{64}$/;
function configured(env:Env){
 if(!env.BINDING_PEPPER||env.BINDING_PEPPER.length<32||!/^\d+$/.test(env.LINE_LOGIN_CHANNEL_ID||'')||!env.LINE_LOGIN_CHANNEL_SECRET||!env.LINE_CHANNEL_ACCESS_TOKEN)
  throw new HttpError(503,'專屬邀請尚未完成 LINE Login 設定，請使用其他綁定方式');
 const origin=new URL(env.ALLOWED_ORIGIN);
 if(origin.origin!==env.ALLOWED_ORIGIN||!(origin.protocol==='https:'||(env.COOKIE_SECURE==='false'&&['localhost','127.0.0.1'].includes(origin.hostname))))throw new HttpError(503,'專屬邀請的正式網址設定錯誤');
}
const signedToken=async(env:Env,key:string)=>key+'.'+await hmacDigest('teacher-invitation:v1:'+key,env.BINDING_PEPPER);
const cookieName=(env:Env)=>env.COOKIE_SECURE==='false'?'office_binding':'__Host-office_binding';
const flowCookie=(env:Env,token:string)=>`${cookieName(env)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=900${env.COOKIE_SECURE==='false'?'':'; Secure'}`;
const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'};
const json=(value:unknown)=>new Response(JSON.stringify(value),{headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});
const redirect=(env:Env,error?:string)=>new Response(null,{status:303,headers:{...headers,Location:env.ALLOWED_ORIGIN+'/bind'+(error?'?result='+error:'')}});
const callbackUrl=(env:Env)=>env.ALLOWED_ORIGIN+'/api/binding/callback';
async function invitation(env:Env,token:unknown){
 if(typeof token!=='string'||!validToken.test(token))throw new HttpError(410,'邀請無效或已撤銷，請聯絡辦公室');
 const row=await env.DB.prepare(`SELECT i.*,t.active,t.line_user_id,t.name,t.department FROM binding_invitations i JOIN teachers t ON t.id=i.teacher_id WHERE i.token_hash=?`).bind(await sha256(token)).first<any>();
 if(!row||row.revoked_at||!row.active)throw new HttpError(410,'邀請無效或已撤銷，請聯絡辦公室');
 if(row.used_at||row.line_user_id)throw new HttpError(409,'這份邀請已完成綁定；如需更換 LINE 帳號，請聯絡辦公室');
 return row;
}
async function flow(req:Request,env:Env){
 const token=req.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName(env)+'='))?.slice(cookieName(env).length+1);
 if(!token||!/^[a-f0-9]{64}$/.test(token))throw new HttpError(401,'請重新開啟行政提供的邀請連結');
 const row=await env.DB.prepare(`SELECT o.*,i.teacher_id,i.used_at,i.revoked_at,t.name,t.department,t.active,t.line_user_id AS teacher_line_user_id
  FROM binding_oauth o JOIN binding_invitations i ON i.id=o.invitation_id JOIN teachers t ON t.id=i.teacher_id WHERE o.browser_hash=?`).bind(await sha256(token)).first<any>();
 if(!row||row.expires_at<=unix())throw new HttpError(410,'LINE 驗證已逾時，請從原邀請連結重新開始');
 if(row.completed_at){if(row.active&&!row.revoked_at&&row.teacher_line_user_id===row.line_user_id)return row;throw new HttpError(409,'原綁定已變更，請聯絡辦公室');}
 if(row.revoked_at||!row.active||row.used_at||row.teacher_line_user_id)throw new HttpError(409,'邀請已失效或已完成綁定，請聯絡辦公室確認');
 return row;
}
async function api(url:string,init:RequestInit){
 let r:Response;try{r=await fetch(url,{...init,signal:AbortSignal.timeout(10000)});}catch{throw new HttpError(503,'LINE 暫時無法連線，請稍後重新開啟邀請');}
 if(!r.ok){await r.body?.cancel();throw new HttpError(502,'LINE 驗證未完成，請重新開啟邀請；若持續發生請聯絡辦公室');}
 try{return await r.json() as any;}catch{throw new HttpError(502,'LINE 驗證回應異常，請重新開始');}
}
const form=(body:Record<string,string>)=>({method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body).toString()});
async function encryptionKey(env:Env){return crypto.subtle.importKey('raw',new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('binding-oauth-encryption:v1:'+env.BINDING_PEPPER))),{name:'AES-GCM'},false,['encrypt','decrypt']);}
async function seal(env:Env,value:string){const iv=crypto.getRandomValues(new Uint8Array(12)),bytes=await crypto.subtle.encrypt({name:'AES-GCM',iv},await encryptionKey(env),new TextEncoder().encode(value));return btoa(String.fromCharCode(...iv))+'.'+btoa(String.fromCharCode(...new Uint8Array(bytes)));}
async function unseal(env:Env,value:string){try{const [iv,data]=value.split('.');return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:Uint8Array.from(atob(iv),c=>c.charCodeAt(0))},await encryptionKey(env),Uint8Array.from(atob(data),c=>c.charCodeAt(0))));}catch{throw new HttpError(410,'LINE 驗證已失效，請重新開啟邀請');}}
const friendship=async(token:string)=>(await api('https://api.line.me/friendship/v1/status',{headers:{Authorization:'Bearer '+token}})).friendFlag===true;

export async function invitationCommand(env:Env,actor:Actor,action:string,p:any){
 if(!['invitation_get','invitation_issue','invitation_revoke'].includes(action))return undefined;
 admin(actor);const tid=id(p.teacher_id),db=env.DB;
 if(action==='invitation_revoke'){
  await requireInvitationSchema(env);
  await db.batch([db.prepare('UPDATE binding_invitations SET revoked_at=coalesce(revoked_at,?) WHERE teacher_id=? AND used_at IS NULL').bind(iso(),tid),audit(db,actor.id,action,tid)]);return {invitation_link:null};
 }
 const teacher=await db.prepare('SELECT * FROM teachers WHERE id=? AND active=1 AND line_user_id IS NULL').bind(tid).first();
 if(!teacher)throw new HttpError(409,'教師已綁定、停用或不存在');
 if(action==='invitation_get'){
  try{configured(env);await requireInvitationSchema(env);}catch(e){if(e instanceof HttpError&&e.status===503)return {configured:false,invitation_link:null,unavailable_reason:e.message};throw e;}
  const old=await db.prepare('SELECT * FROM binding_invitations WHERE teacher_id=? AND revoked_at IS NULL AND used_at IS NULL').bind(tid).first<any>();
  if(!old)return {configured:true,invitation_link:null};
  const token=await signedToken(env,old.id);
  if(!equal(await sha256(token),old.token_hash))return {configured:true,invitation_link:null};
  return {configured:true,invitation_link:env.ALLOWED_ORIGIN+'/bind#'+token,issued_at:old.issued_at};
 }
 configured(env);await requireInvitationSchema(env);await limit(env,'invitation-issue:'+actor.id,60,600);
 const key=crypto.randomUUID(),token=await signedToken(env,key),now=iso();
 const result=await db.batch([
  // 先移除舊流程再輪替邀請；整批交易避免舊邀請與新邀請並存。
  db.prepare('DELETE FROM binding_oauth WHERE invitation_id IN(SELECT id FROM binding_invitations WHERE teacher_id=?)').bind(tid),
  db.prepare('DELETE FROM binding_invitations WHERE teacher_id=?').bind(tid),
  db.prepare(`INSERT INTO binding_invitations(id,teacher_id,token_hash,issued_by,issued_at) SELECT ?,id,?,?,? FROM teachers WHERE id=? AND active=1 AND line_user_id IS NULL RETURNING id`).bind(key,await sha256(token),actor.id,now,tid),
  db.prepare(`INSERT INTO audit_logs(id,actor_id,action,teacher_id,created_at) SELECT ?,?,'invitation_issue',?,? WHERE EXISTS(SELECT 1 FROM binding_invitations WHERE id=?)`).bind(crypto.randomUUID(),actor.id,tid,now,key)
 ]);
 if(!result[2].results.length)throw new HttpError(409,'教師狀態已更新，請重新確認');
 return {configured:true,invitation_link:env.ALLOWED_ORIGIN+'/bind#'+token,issued_at:now};
}

export async function bindingPublic(req:Request,env:Env,action:string,body:any){
 configured(env);
 await requireInvitationSchema(env);
 await limit(env,'binding-web:'+await hmacDigest(req.headers.get('CF-Connecting-IP')||'local',env.BINDING_PEPPER),120,600);
 await env.DB.prepare('DELETE FROM binding_oauth WHERE expires_at<=?').bind(unix()).run();
 if(action==='open'){await invitation(env,body.token);return json({ready:true});}
 if(action==='start'){
  const invite=await invitation(env,body.token),state=randomToken(),browser=randomToken(),nonce=randomToken(),verifier=randomToken();
  await limit(env,'binding-start:'+invite.id,30,600);
  await env.DB.prepare('INSERT INTO binding_oauth(state_hash,invitation_id,browser_hash,nonce,verifier,expires_at) VALUES(?,?,?,?,?,?)').bind(await sha256(state),invite.id,await sha256(browser),nonce,verifier,unix()+900).run();
  const challenge=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const url=new URL('https://access.line.me/oauth2/v2.1/authorize');url.search=new URLSearchParams({response_type:'code',client_id:env.LINE_LOGIN_CHANNEL_ID!,redirect_uri:callbackUrl(env),state,scope:'openid profile',nonce,code_challenge:challenge,code_challenge_method:'S256',bot_prompt:'aggressive'}).toString();
  const response=json({authorization_url:url.toString()});response.headers.set('Set-Cookie',flowCookie(env,browser));return response;
 }
 const current=await flow(req,env);
 if(action==='status'){
  if(current.completed_at)return json({state:'done'});
  if(!current.verified_at)throw new HttpError(409,'LINE 授權尚未完成，請從原邀請重新開始');
  return json({state:'confirm',name:current.name,department:current.department});
 }
 if(action!=='confirm')throw new HttpError(404,'找不到綁定操作');
 if(current.completed_at)return json({state:'done'});
 if(!current.verified_at||!current.access_token_sealed||!current.line_user_id)throw new HttpError(409,'請先完成 LINE 授權');
 await limit(env,'binding-confirm:'+current.state_hash,20,600);
 const userToken=await unseal(env,current.access_token_sealed);
 if(!await friendship(userToken)){
  const bot=await api('https://api.line.me/v2/bot/info',{headers:{Authorization:'Bearer '+env.LINE_CHANNEL_ACCESS_TOKEN}});
  if(!/^@[a-zA-Z0-9._-]{1,64}$/.test(bot.basicId||''))throw new HttpError(503,'官方帳號設定異常，請聯絡辦公室');
  return json({state:'needs_friend',friend_url:'https://line.me/R/ti/p/'+encodeURIComponent(bot.basicId)});
 }
 // 確認此身分也能由實際 Messaging API 帳號識別，避免 Provider 配錯造成通知無法送達。
 const profile=await api('https://api.line.me/v2/bot/profile/'+encodeURIComponent(current.line_user_id),{headers:{Authorization:'Bearer '+env.LINE_CHANNEL_ACCESS_TOKEN}});
 if(profile.userId!==current.line_user_id)throw new HttpError(409,'LINE 帳號設定不一致，請聯絡辦公室');
 const now=iso(),event='invitation:'+current.state_hash,uid=current.line_user_id;
 const gate=`EXISTS(SELECT 1 FROM binding_oauth o JOIN binding_invitations i ON i.id=o.invitation_id WHERE o.state_hash=? AND o.browser_hash=? AND o.expires_at>? AND o.verified_at IS NOT NULL AND o.completed_at IS NULL AND i.revoked_at IS NULL AND i.used_at IS NULL)`;
 const result=await env.DB.batch([
  env.DB.prepare(`UPDATE teachers SET line_user_id=?,bound_at=?,bound_event_id=?,binding_event_time=?,binding_version=binding_version+1,updated_at=? WHERE id=? AND active=1 AND line_user_id IS NULL AND NOT EXISTS(SELECT 1 FROM teachers WHERE line_user_id=?) AND ${gate} RETURNING id`).bind(uid,now,event,now,now,current.teacher_id,uid,current.state_hash,current.browser_hash,unix()),
  env.DB.prepare(`INSERT INTO audit_logs(id,action,teacher_id,created_at) SELECT ?,'line_invitation_bound',id,? FROM teachers WHERE bound_event_id=? AND NOT EXISTS(SELECT 1 FROM audit_logs WHERE id=?)`).bind(event,now,event,event),
  env.DB.prepare(`UPDATE binding_oauth SET completed_at=?,access_token_sealed=NULL,verifier='',nonce='' WHERE state_hash=? AND EXISTS(SELECT 1 FROM teachers WHERE id=? AND bound_event_id=?)`).bind(now,current.state_hash,current.teacher_id,event)
 ]);
 if(!result[0].results.length){
  const applied=await env.DB.prepare('SELECT completed_at FROM binding_oauth WHERE state_hash=?').bind(current.state_hash).first<any>();
  if(!applied?.completed_at)throw new HttpError(409,'這位老師或此 LINE 已完成其他綁定，或邀請已撤銷；請聯絡辦公室');
 }
 return json({state:'done'});
}

export async function bindingCallback(req:Request,env:Env){
 configured(env);const url=new URL(req.url),state=url.searchParams.get('state');
 try{
  if(!state||!/^[a-f0-9]{64}$/.test(state))return redirect(env,'invalid');
  const current=await flow(req,env);
  if(!equal(await sha256(state),current.state_hash)||current.claim_token||current.completed_at)return redirect(env,'invalid');
  const claim=randomToken();
  const claimed=await env.DB.prepare('UPDATE binding_oauth SET claim_token=? WHERE state_hash=? AND claim_token IS NULL AND expires_at>? RETURNING state_hash').bind(claim,current.state_hash,unix()).first();
  if(!claimed)return redirect(env,'invalid');
  if(url.searchParams.has('error'))return redirect(env,'cancelled');
  const code=url.searchParams.get('code');if(!code||code.length>2048)return redirect(env,'invalid');
  const tokens=await api('https://api.line.me/oauth2/v2.1/token',form({grant_type:'authorization_code',code,redirect_uri:callbackUrl(env),client_id:env.LINE_LOGIN_CHANNEL_ID!,client_secret:env.LINE_LOGIN_CHANNEL_SECRET!,code_verifier:current.verifier}));
  if(typeof tokens.access_token!=='string'||tokens.access_token.length>16000||typeof tokens.id_token!=='string'||tokens.id_token.length>16000)throw new HttpError(502,'LINE 授權資料不完整');
  const identity=await api('https://api.line.me/oauth2/v2.1/verify',form({id_token:tokens.id_token,client_id:env.LINE_LOGIN_CHANNEL_ID!,nonce:current.nonce}));
  if(identity.iss!=='https://access.line.me'||identity.aud!==env.LINE_LOGIN_CHANNEL_ID||!Number.isFinite(identity.exp)||identity.exp<=unix()||identity.nonce!==current.nonce||!/^U[a-f0-9]{32}$/.test(identity.sub||''))throw new HttpError(401,'LINE 身分驗證失敗');
  await env.DB.prepare(`UPDATE binding_oauth SET line_user_id=?,access_token_sealed=?,verified_at=?,verifier='',nonce='' WHERE state_hash=? AND claim_token=? AND expires_at>?`).bind(identity.sub,await seal(env,tokens.access_token),iso(),current.state_hash,claim,unix()).run();
  return redirect(env);
 }catch{return redirect(env,'failed');}
}
