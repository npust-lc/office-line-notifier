import {useEffect,useState} from 'react';
import {CheckCircle2,Link2} from 'lucide-react';
import {OfficeLogo} from './OfficeLogo';
import {mock} from './api';
import './invitations.css';

// 教師使用獨立公開入口，完全不啟動辦公室 Session、備份或資料輪詢。
export function TeacherInvitation(){
 const [token]=useState(()=>{const value=location.hash.slice(1);history.replaceState(null,'',location.pathname+location.search);return value;});
 const [state,setState]=useState('loading'),[name,setName]=useState(''),[department,setDepartment]=useState(''),[friendUrl,setFriendUrl]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const call=async(action:string,body:unknown={})=>{
  let r:Response;try{r=await fetch('/api/binding/'+action,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(40000)});}catch{throw Error('網路連線中斷，請稍後重試；若剛才已確認綁定，可重新整理查看結果。');}
  let value:any;try{value=await r.json();}catch{throw Error('服務回應異常，請稍後重試或聯絡辦公室。');}if(!r.ok)throw Error(value.error||'暫時無法完成綁定，請稍後重試');return value;
 };
 useEffect(()=>{
  let disposed=false;
  const load=async()=>{
   const result=new URLSearchParams(location.search).get('result');
   if(result)throw Error(result==='cancelled'?'已取消 LINE 授權，請從原邀請連結重新開始。':'LINE 驗證未完成或已失效，請從原邀請連結重新開始。');
   if(mock){if(!disposed){setState('ready');}return;}
   const resultData=await call(token?'open':'status',token?{token}:{});
   if(!disposed){setState(token?'ready':resultData.state);setName(resultData.name||'');setDepartment(resultData.department||'');}
  };
  void load().catch(e=>{if(!disposed){setError(e.message||'連線失敗，請從原邀請連結重新開始');setState('error');}});
  return()=>{disposed=true;};
 },[token]);
 const start=async()=>{
  setBusy(true);setError('');try{
   if(mock){setName('示範教師乙');setDepartment('學務處');setState('confirm');return;}
   const result=await call('start',{token});const url=new URL(result.authorization_url);
   if(url.origin!=='https://access.line.me')throw Error('LINE 授權網址異常');location.assign(url.toString());
  }catch(e){setError(e instanceof Error?e.message:'無法連線，請稍後重試');}finally{setBusy(false);}
 };
 const confirm=async()=>{
  setBusy(true);setError('');try{
   const result=mock?{state:'done'}:await call('confirm');setState(result.state);
   if(result.friend_url){const url=new URL(result.friend_url);if(url.origin!=='https://line.me')throw Error('官方帳號網址異常');setFriendUrl(url.toString());}
  }catch(e){setError(e instanceof Error?e.message:'連線中斷，請先按下方按鈕確認綁定結果');}finally{setBusy(false);}
 };
 return <main className="teacher-invitation"><section className="invitation-panel"><OfficeLogo/><span className="invitation-office">辦公室小幫手</span>
 {mock&&<p className="info">展示模式｜不會登入 LINE 或變更真實綁定</p>}
 {state==='loading'?<p role="status">正在確認邀請…</p>:state==='done'?<><CheckCircle2 className="invitation-success" size={44}/><h1>身分綁定成功</h1><p>日後辦公室通知將透過此 LINE 帳號傳送。</p><p className="hint">可以關閉此頁，回到 LINE 聊天室。</p></>:state==='ready'?<><Link2 size={32}/><h1>連結辦公室通知</h1><p>使用 LINE 繼續，再確認您的教師身分。</p><button className="primary" disabled={busy} onClick={()=>void start()}>{busy?'正在開啟 LINE…':'使用 LINE 繼續'}</button></>:['confirm','needs_friend'].includes(state)?<><h1>確認教師身分</h1><div className="invitation-identity"><strong>{name}</strong><span>{department||'未填寫單位'}</span></div><p>確認姓名與單位正確後，再完成綁定。</p>{state==='needs_friend'&&<div className="info"><p>請先加入辦公室官方帳號，並確認未封鎖。</p><a className="outline" href={friendUrl} target="_blank" rel="noopener noreferrer">開啟官方帳號</a><p className="hint">加入後回到本頁，再按下方確認。</p></div>}<button className="primary" disabled={busy} onClick={()=>void confirm()}>{busy?'正在確認…':state==='needs_friend'?'已加入，確認綁定':'確認綁定'+name}</button><p className="hint">不是您的資料？請關閉此頁並聯絡辦公室。</p></>:<h1>暫時無法綁定</h1>}
 {error&&<p className="error" role="alert">{error}</p>}
 <p className="invitation-footer">文件及附件請使用辦公室 Email 傳送</p></section></main>;
}
