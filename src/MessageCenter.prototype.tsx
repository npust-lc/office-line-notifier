// Throwaway prototype: compare three message-center layouts on the existing / route via ?variant=A|B|C.
// Question: where should replies, pickup information and handovers sit so a new student worker can act confidently?
import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {LayoutDashboard,Users,Send,MessagesSquare,ClipboardList,Settings,Search,Plus,Check,X,Package,StickyNote,ChevronLeft,ChevronRight,RotateCcw,PanelLeftClose,PanelLeftOpen,MessageCircle,ShieldCheck} from 'lucide-react';
import {OfficeLogo} from './OfficeLogo';
import './MessageCenter.prototype.css';

type Teacher={id:string;name:string;unit:string;pending:boolean;items:number;notes:string[];handovers:{content:string;name:string}[];messages:{out:boolean;text:string;time:string}[]};
type Variant='A'|'B'|'C';
type Tool='items'|'handover'|'notes';
const labels={A:'聊天優先',B:'工作並排',C:'單一對話'};
const descriptions={A:'教師名單與對話並列；領件、交接與備註按需開啟。',B:'教師、對話、工作清單三欄並列；回覆時也能核對領件與交接。',C:'對話占滿主要空間；教師名單可收合，領件與交接集中在下方。'};
const seed=():Teacher[]=>[
 {id:'a',name:'示範教師甲',unit:'教務處',pending:true,items:2,notes:['下午較方便聯絡。'],handovers:[{name:'值班甲（示範）',content:'老師預計下午領件，請協助確認教材已放在櫃台。'}],messages:[{out:true,text:'您的包裹與教材已送達辦公室，請撥空領取。',time:'10:10'},{out:false,text:'謝謝，我下午三點左右會到辦公室，教材也一起領取。',time:'10:14'},{out:false,text:'如果我臨時有課，能否明天再過去？',time:'10:15'}]},
 {id:'b',name:'示範教師乙',unit:'語言中心',pending:true,items:1,notes:[],handovers:[],messages:[{out:true,text:'您的信件已送達辦公室，請撥空領取。',time:'09:50'},{out:false,text:'請問辦公室今天開到幾點？',time:'10:02'}]},
 {id:'c',name:'示範教師丙',unit:'學務處',pending:false,items:0,notes:[],handovers:[],messages:[{out:false,text:'好的，已經領到了，謝謝。',time:'昨天'},{out:true,text:'收到，謝謝您。',time:'昨天'}]},
 {id:'d',name:'示範教師丁',unit:'通識教育中心',pending:false,items:0,notes:[],handovers:[],messages:[{out:true,text:'辦公室有事項需要與您聯繫，方便時請回覆。',time:'昨天'}]},
 {id:'e',name:'示範教師戊',unit:'研發處',pending:false,items:0,notes:[],handovers:[],messages:[]}
];
type Model=ReturnType<typeof useModel>;
function useModel(){
 const [teachers,setTeachers]=useState(seed),[selected,setSelected]=useState('a'),[filter,setFilter]=useState('pending'),[query,setQuery]=useState(''),[draft,setDraft]=useState(''),[tool,setTool]=useState<Tool|null>(null),[handover,setHandover]=useState(false),[author,setAuthor]=useState(''),[content,setContent]=useState(''),[last,setLast]=useState('已載入示範情境'),[listOpen,setListOpen]=useState(false);
 const current=teachers.find(t=>t.id===selected)!;
 const update=(fn:(t:Teacher)=>Teacher)=>setTeachers(all=>all.map(t=>t.id===selected?fn(t):t));
 const select=(id:string)=>{setSelected(id);setDraft('');setTool(null);setListOpen(false);setLast('已切換教師');};
 const send=()=>{if(!draft.trim())return;update(t=>({...t,pending:false,messages:[...t.messages,{out:true,text:draft.trim(),time:'剛剛'}]}));setDraft('');setLast('模擬回覆已送出，對話改為已回覆');};
 const receive=()=>{update(t=>({...t,pending:true,messages:[...t.messages,{out:false,text:'不好意思，剛剛又想到一件事，想再請辦公室幫忙確認。',time:'剛剛'}]}));setLast('模擬收到教師新訊息，對話改為待回覆');};
 const complete=()=>{update(t=>({...t,items:Math.max(0,t.items-1)}));setLast('已模擬登記一件物品領取');};
 const save=()=>{if(!author.trim()||!content.trim())return;update(t=>({...t,handovers:[...t.handovers,{name:author.trim(),content:content.trim()}]}));setAuthor('');setContent('');setHandover(false);setTool('handover');setLast('交接已加入此位教師的工作資訊');};
 const reset=()=>{setTeachers(seed());setSelected('a');setDraft('');setTool(null);setLast('已重設全部示範資料');setHandover(false);};
 return {teachers,current,selected,filter,setFilter,query,setQuery,draft,setDraft,tool,setTool,handover,setHandover,author,setAuthor,content,setContent,last,setLast,listOpen,setListOpen,update,select,send,receive,complete,save,reset};
}
function TeacherList({m,compact=false}:{m:Model;compact?:boolean}){
 const rows=m.teachers.filter(t=>(m.filter==='all'||t.pending)&&(t.name+t.unit).includes(m.query));
 return <section className={'proto-teachers'+(compact?' compact':'')} aria-label="教師對話名單"><div className="proto-list-head"><h2>對話 <span className="count">{m.teachers.filter(t=>t.pending).length}</span></h2><div className="search"><Search size={15}/><input aria-label="搜尋示範教師" placeholder="搜尋姓名、單位" value={m.query} onChange={e=>m.setQuery(e.target.value)}/></div><div className="proto-tabs"><button aria-pressed={m.filter==='pending'} onClick={()=>m.setFilter('pending')}>待回覆</button><button aria-pressed={m.filter==='all'} onClick={()=>m.setFilter('all')}>全部對話</button></div></div><div className="proto-teacher-list">{rows.map(t=><button key={t.id} className={t.id===m.selected?'selected':''} onClick={()=>m.select(t.id)}><span className="avatar soft">{t.name.at(-1)}</span><span><b>{t.name}</b><small>{t.messages.at(-1)?.text||t.unit}</small><em>{t.pending?'待回覆':'已回覆'}</em></span></button>)}{!rows.length&&<p className="empty">目前沒有待回覆的對話。<button className="text-button" onClick={()=>m.setFilter('all')}>查看全部對話</button></p>}</div></section>;
}
function Heading({m,focus=false}:{m:Model;focus?:boolean}){
 return <div className="proto-chat-head">{focus&&<button className="outline" aria-label="開關教師名單" onClick={()=>m.setListOpen(!m.listOpen)}>{m.listOpen?<PanelLeftClose size={17}/>:<PanelLeftOpen size={17}/>}教師</button>}<div className="proto-teacher-title"><b>{m.current.name}</b><small>{m.current.unit}</small></div><span className={'badge '+(m.current.pending?'orange':'green')}>{m.current.pending?'待回覆':'已回覆'}</span><button className="text-button" onClick={()=>{m.update(t=>({...t,pending:!t.pending}));m.setLast('已手動調整對話狀態');}}>調整狀態</button></div>;
}
function Feed({m}:{m:Model}){
 return <div className="proto-feed" aria-label="示範聊天內容"><div className="chat-day"><span>今天</span></div>{m.current.messages.map((message,index)=><div className={'proto-bubble '+(message.out?'out':'')} key={index}><p>{message.text}</p><small>{message.out?'辦公室 · ':''}{message.time}</small></div>)}{!m.current.messages.length&&<p className="empty">目前沒有對話</p>}</div>;
}
function Composer({m}:{m:Model}){
 return <div className="proto-composer"><div className="proto-composer-tools"><button className="text-button" onClick={()=>m.setDraft(m.draft+(m.draft?'\n':'')+'歡迎於辦公時間前來領取，謝謝！')}>常用回覆</button><small>文件及附件請使用辦公室 Email 傳送</small></div><form onSubmit={e=>{e.preventDefault();m.send();}}><textarea aria-label="原型回覆老師" value={m.draft} placeholder="輸入回覆…" rows={2} onChange={e=>m.setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)&&!e.nativeEvent.isComposing){e.preventDefault();m.send();}}}/><button className="primary" disabled={!m.draft.trim()}><Send size={16}/>送出</button></form></div>;
}
function Tools({m,always=false}:{m:Model;always?:boolean}){
 const active=always?null:m.tool;
 const details=(type:Tool)=><section className="proto-tool-section" key={type}><h3>{type==='items'?'待領取物品':type==='handover'?'交接事項':'內部備註'}<span className="count">{type==='items'?m.current.items:type==='handover'?m.current.handovers.length:m.current.notes.length}</span></h3>{type==='items'?<>{Array.from({length:m.current.items},(_,i)=><article key={i}><Package size={18}/><div><b>{i?'教材':'包裹'}</b><small>今日登記 · 辦公室櫃台</small></div><button className="outline" onClick={m.complete}>領取</button></article>)}{!m.current.items&&<p className="muted">目前沒有待領物品</p>}</>:type==='handover'?<>{m.current.handovers.map((h,i)=><article key={i}><div><p>{h.content}</p><small>交接人：{h.name}</small></div></article>)}{!m.current.handovers.length&&<p className="muted">目前沒有交接事項</p>}<button className="outline full" onClick={()=>m.setHandover(true)}><Plus size={15}/>新增交接</button></>:<>{m.current.notes.map((n,i)=><p key={i}>{n}</p>)}{!m.current.notes.length&&<p className="muted">目前沒有備註</p>}</>}</section>;
 return <div className={'proto-work '+(always?'always':'')}><div className="proto-work-head"><b>這位老師的工作資訊</b>{!always&&<button aria-label="關閉工作資訊" onClick={()=>m.setTool(null)}><X size={17}/></button>}</div>{always?<>{details('items')}{details('handover')}{details('notes')}</>:active&&details(active)}</div>;
}
function ToolButtons({m}:{m:Model}){
 return <div className="proto-tool-buttons"><button className={m.tool==='items'?'active':''} onClick={()=>m.setTool(m.tool==='items'?null:'items')}><Package size={17}/>領件 <span className="count">{m.current.items}</span></button><button className={m.tool==='handover'?'active':''} onClick={()=>m.setTool(m.tool==='handover'?null:'handover')}><ClipboardList size={17}/>交接 <span className="count">{m.current.handovers.length}</span></button><button className={m.tool==='notes'?'active':''} onClick={()=>m.setTool(m.tool==='notes'?null:'notes')}><StickyNote size={17}/>備註</button><button onClick={()=>m.setHandover(true)}><Plus size={17}/>新增交接</button></div>;
}
export function VariantA({m}:{m:Model}){
 return <section className="proto-panel proto-A"><TeacherList m={m}/><div className="proto-dialogue"><Heading m={m}/><ToolButtons m={m}/><Feed m={m}/><Composer m={m}/></div>{m.tool&&<div className="proto-drawer"><Tools m={m}/></div>}</section>;
}
export function VariantB({m}:{m:Model}){
 return <section className="proto-panel proto-B"><TeacherList m={m}/><div className="proto-dialogue"><Heading m={m}/><Feed m={m}/><Composer m={m}/></div><Tools m={m} always/></section>;
}
export function VariantC({m}:{m:Model}){
 return <section className={'proto-panel proto-C'+(m.listOpen?' list-open':'')}><div className="proto-focus"><Heading m={m} focus/><div className="proto-focus-layout">{m.listOpen&&<TeacherList m={m} compact/>}<div className="proto-focus-chat"><Feed m={m}/><Composer m={m}/></div></div><div className="proto-bottom-work"><ToolButtons m={m}/>{m.tool&&<Tools m={m}/>}</div></div></section>;
}
function Prototype(){
 const m=useModel(),initial=new URLSearchParams(location.search).get('variant');
 const [variant,setVariant]=useState<Variant>(initial==='B'||initial==='C'?initial:'A');
 const change=(next:Variant)=>{setVariant(next);m.setTool(null);const url=new URL(location.href);url.searchParams.set('variant',next);history.replaceState(null,'',url);};
 useEffect(()=>{const key=(event:KeyboardEvent)=>{const el=event.target as HTMLElement;if(el.closest('input,textarea,select,[contenteditable="true"]')||event.altKey||event.ctrlKey||event.metaKey)return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();const keys:Variant[]=['A','B','C'];change(keys[(keys.indexOf(variant)+(event.key==='ArrowRight'?1:2))%3]);}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[variant]);
 const keys:Variant[]=['A','B','C'];
 return <div className="app proto-app"><aside><div className="brand"><OfficeLogo/><span>辦公室小幫手</span></div><div className="nav-label">每天會用到</div><nav>{[[LayoutDashboard,'值班工作台'],[MessagesSquare,'訊息中心'],[Send,'發送通知'],[ClipboardList,'通知紀錄'],[Users,'教師名單'],[Settings,'系統管理']].map(([Icon,label]:any)=><button key={label} className={label==='訊息中心'?'selected':''} disabled={label!=='訊息中心'} title={label==='訊息中心'?'目前比較的頁面':'原型聚焦訊息中心'}><Icon size={20}/>{label}</button>)}</nav><div className="sidebar-bottom"><small>版面比較原型 · 示範資料</small></div></aside><main><header><b>訊息中心</b><span className="secure"><ShieldCheck size={14}/>原型預覽</span></header><div className="content"><div className="proto-intro"><div><span className="proto-kicker">版面比較 · {variant} / 3</span><h1>{labels[variant]}</h1><p>{descriptions[variant]}</p></div><button className="outline" onClick={m.reset}><RotateCcw size={15}/>重設情境</button></div><p className="proto-context">想驗證：回覆老師時，領件與交接放在哪裡最順手？所有操作僅暫存於此頁，重新整理會重設。</p>{variant==='A'?<VariantA m={m}/>:variant==='B'?<VariantB m={m}/>:<VariantC m={m}/>}<section className="proto-state" aria-label="目前原型狀態"><div><b>目前狀態</b><span>版面 {variant} · {m.current.name}</span><span>{m.current.pending?'待回覆':'已回覆'}</span><span>待領 {m.current.items} 件</span><span>交接 {m.current.handovers.length} 筆</span><span>草稿 {m.draft.length} 字</span></div><div><small role="status">{m.last}</small><button className="text-button" onClick={m.receive}><MessageCircle size={14}/>模擬老師新訊息</button></div></section></div></main>{import.meta.env.DEV&&<div className="proto-switcher" aria-label="原型版面切換"><button aria-label="上一個版面" onClick={()=>change(keys[(keys.indexOf(variant)+2)%3])}><ChevronLeft size={20}/></button><div><b>{variant} · {labels[variant]}</b><small>← → 切換版面 · 共 3 版</small></div><button aria-label="下一個版面" onClick={()=>change(keys[(keys.indexOf(variant)+1)%3])}><ChevronRight size={20}/></button></div>}{m.handover&&<div className="modal-backdrop"><div className="modal" role="dialog" aria-label="新增示範交接"><button className="modal-close" aria-label="關閉交接" onClick={()=>m.setHandover(false)}><X size={20}/></button><h2>新增交接</h2><p>{m.current.name}</p><form onSubmit={e=>{e.preventDefault();m.save();}}><label>交接人<input required value={m.author} onChange={e=>m.setAuthor(e.target.value)}/></label><label>交接內容<textarea required rows={4} value={m.content} onChange={e=>m.setContent(e.target.value)}/></label><button className="primary full" disabled={!m.author.trim()||!m.content.trim()}>儲存示範交接</button></form></div></div>}</div>;
}
export function mount(){createRoot(document.getElementById('root')!).render(<Prototype/>);}
