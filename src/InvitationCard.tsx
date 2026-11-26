import {useEffect,useState} from 'react';
import {Copy,Download,Link2} from 'lucide-react';
import qrcode from 'qrcode-generator';
import {command,mock} from './api';
import {BindingCard} from './BindingCard';
import './invitations.css';

export function InvitationCard({teacherId,name,onChanged}:{teacherId:string;name:string;onChanged:()=>void}){
 const [invite,setInvite]=useState<any>(null),[code,setCode]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[feedback,setFeedback]=useState(''),[replace,setReplace]=useState(false);
 useEffect(()=>{let stopped=false;void command('invitation_get',{teacher_id:teacherId}).then(r=>{if(!stopped)setInvite(r);}).catch(e=>{if(!stopped)setError(e.message);});return()=>{stopped=true;};},[teacherId]);
 const run=async(action:string)=>{setBusy(true);setError('');setFeedback('');try{const result=await command(action,{teacher_id:teacherId});if(action==='issue_code')setCode(result);else{setInvite(result);setReplace(false);setFeedback(action==='invitation_revoke'?'邀請已撤銷':'專屬邀請已產生');}onChanged();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const link=invite?.invitation_link;
 let qr='';if(link){const q=qrcode(0,'M');q.addData(link);q.make();qr='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(q.createSvgTag({cellSize:5,margin:20,scalable:true}));}
 const copy=async()=>{try{await navigator.clipboard.writeText(link);setFeedback('邀請連結已複製');}catch{setFeedback('無法自動複製，請選取下方連結後複製。');}};
 return <div className="invitation-card"><div className="modal-icon"><Link2/></div><h2>{name}的 LINE 綁定</h2>
 {!invite&&!error&&<p role="status">正在載入邀請…</p>}
 {invite?.configured===false?<p className="info">{invite.unavailable_reason||'專屬邀請尚未完成 LINE Login 設定，請先使用其他綁定方式。'}</p>:invite&&<>
 {link?<><p>私下傳給這位老師，方便時點開即可綁定。</p><img className="binding-qr" src={qr} alt={`${name}的專屬邀請 QR Code`}/><label className="invitation-link-label">專屬邀請連結<input readOnly value={link} onFocus={e=>e.currentTarget.select()}/></label><div className="binding-actions"><button className="primary" disabled={busy} onClick={()=>void copy()}><Copy size={16}/>複製邀請連結</button><a className="outline" href={qr} download="教師專屬邀請.svg"><Download size={16}/>下載 QR Code</a></div><p className="hint">綁定成功或撤銷後失效。再次開啟此視窗可複製同一連結。</p><div className="invitation-secondary"><button className="text-button" disabled={busy} onClick={()=>setReplace(true)}>重新產生</button><button className="text-button" disabled={busy} onClick={()=>void run('invitation_revoke')}>撤銷邀請</button></div>{replace&&<div className="info"><p>重新產生會使舊連結立即失效，請將新連結重新提供給老師。</p><button className="outline" disabled={busy} onClick={()=>void run('invitation_issue')}>確認重新產生</button><button className="text-button" onClick={()=>setReplace(false)}>取消</button></div>}</>:<button className="primary" disabled={busy} onClick={()=>void run('invitation_issue')}>{busy?'正在產生…':'產生專屬邀請'}</button>}
 </>}
 {mock&&<p className="hint">展示版邀請可預覽教師操作，不會連接真實 LINE。</p>}
 <details className="invitation-fallback"><summary>其他綁定方式</summary><p className="hint">老師無法使用 LINE 授權時，可在聊天室傳送一次性綁定碼。</p><button className="outline" disabled={busy} onClick={()=>void run('issue_code')}>{code?'重新產生綁定碼':'產生綁定碼'}</button>{code&&<BindingCard name={name} {...code}/>}</details>
 {error&&<p className="error" role="alert">{error}</p>}{feedback&&<p role="status">{feedback}</p>}
 </div>;
}
