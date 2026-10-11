/* ---- Activity: who added, changed or deleted what, and when ----
   Every edit goes through save(), which compares the trip with how it looked at the last save and writes one entry per
   change to S.log. The log syncs with the trip (encrypted like everything else); phones merge logs by entry id.
   Entry: {id, t (time), by (person id of whoever made the change, or null), k ('e' expense, 'p' payment, 'g' group, 't' trip),
           a ('add' | 'edit' | 'del' | 'back'), i (item id), d (what, as it was then), m (amount in trip cents), x (list of changes)} */
const LOG_MAX=300;
let snap={trip:null,m:new Map()};
const snapKey=(k,id)=>k+':'+id;
const eSnap=e=>({desc:e.desc,amt:e.amt,cc:e.cc||null,oamt:e.oamt||null,date:e.date,paidBy:e.paidBy,for:[...(e.for||[])].sort().join(','),
  split:e.split&&e.split.w?JSON.stringify(e.split):'',photo:!!e.photo,del:!!e.del,type:e.type||''});
const pSnap=p=>({name:p.name,del:!!p.del});
/* how the trip looks now; taken again after every save and every merge from the group */
function snapReset(){
  const m=new Map();
  S.expenses.forEach(e=>m.set(snapKey('e',e.id),eSnap(e)));
  S.people.forEach(p=>m.set(snapKey('p',p.id),pSnap(p)));
  m.set('trip',{name:S.name,sx:sx()?`${sx().cc}`:''});
  snap={trip:S,m};
}
const amtTxt=s=>s.cc?fmtCc(s.oamt,s.cc):money(s.amt);
const splitTxt=s=>s.split?'uneven':s.for.split(',').length===people().length?'everyone':s.for.split(',').map(pname).map(first).join(', ');
function eChanges(a,b){
  const x=[];
  if(a.desc!==b.desc)x.push(`name ${a.desc} → ${b.desc}`);
  if(a.amt!==b.amt||a.cc!==b.cc||a.oamt!==b.oamt)x.push(`amount ${amtTxt(a)} → ${amtTxt(b)}`);
  if(a.paidBy!==b.paidBy)x.push(`paid by ${first(pname(a.paidBy))} → ${first(pname(b.paidBy))}`);
  if(a.for!==b.for||a.split!==b.split)x.push(a.split||b.split?`split ${splitTxt(a)} → ${splitTxt(b)}`:`split between ${splitTxt(a)} → ${splitTxt(b)}`);
  if(a.date!==b.date)x.push(`date ${shortDate(a.date)} → ${shortDate(b.date)}`);
  if(a.photo!==b.photo)x.push(b.photo?'receipt added':'receipt removed');
  return x;
}
/* called by save(): write what changed since the last save */
function logChanges(){
  if(S.sample)return;
  if(snap.trip!==S){snapReset();return}
  /* setting up (naming the trip, adding people) isn't news: the log starts with the first expense */
  if(!S.log&&!S.expenses.some(e=>!e.del)){snapReset();return}
  const out=[],by=me()||null,t=now(),add=(k,a,i,d,m,x)=>out.push({id:uid(),t,by,k,a,i,d,m:m??null,...(x&&x.length?{x}:{})});
  S.expenses.forEach(e=>{
    const was=snap.m.get(snapKey('e',e.id)),is=eSnap(e),k=isPay(e)?'p':'e',d=k==='p'?`${pname(e.paidBy)} → ${pname(e.for[0])}`:e.desc;
    if(!was){if(!e.del)add(k,'add',e.id,d,e.amt);return}
    if(was.del!==is.del)return add(k,is.del?'del':'back',e.id,d,e.amt);
    if(is.del)return;
    const x=eChanges(was,is);if(x.length)add(k,'edit',e.id,d,e.amt,x);
  });
  S.people.forEach(p=>{
    const was=snap.m.get(snapKey('p',p.id));
    if(!was){if(!p.del)add('g','add',p.id,p.name);return}
    if(was.del!==!!p.del)return add('g',p.del?'del':'back',p.id,p.name);
    if(was.name!==p.name)add('g','edit',p.id,p.name,null,[`${was.name} → ${p.name}`]);
  });
  const tw=snap.m.get('trip'),cc=sx()?sx().cc:'';
  if(tw.name!==S.name)add('t','edit','name',S.name,null,[`name ${tw.name} → ${S.name}`]);
  if(tw.sx!==cc)add('t','edit','sx',S.name,null,[cc?`settle up in ${cc}`:`settle up in ${S.cur} again`]);
  if(out.length){S.log=trimLog([...(S.log||[]),...out])}
  snapReset();
}
const trimLog=l=>l.sort((a,b)=>a.t-b.t).slice(-LOG_MAX);
/* entries from another phone: add the ones this phone hasn't got */
function mergeLog(t){
  if(!Array.isArray(t.log))return 0;
  const have=new Set((S.log||[]).map(x=>x.id)),add=t.log.filter(x=>x&&x.id&&!have.has(x.id));
  if(add.length)S.log=trimLog([...(S.log||[]),...add]);
  return add.length;
}

/* ---- The Activity sheet, and the dot on its button for changes made by others since you last looked ---- */
const seenAt=()=>(prefs.seen||{})[S.id]||0;
const unseen=()=>(S.log||[]).filter(x=>x.t>seenAt()&&x.by!==me()).length;
function drawActDot(){const b=$('#actBtn');if(b){b.hidden=!!S.sample||!(S.log||[]).length;b.classList.toggle('dot',unseen()>0)}}
function actLine(x){
  const who=x.by&&x.by===me()?'You':x.by?esc(first(pname(x.by))):'Someone';
  const what=`<b>${esc(x.d)}</b>`,amt=x.m!=null?` <span class="am">${money(x.m)}</span>`:'';
  const t={
    e:{add:`added ${what}${amt}`,edit:`changed ${what}`,del:`deleted ${what}${amt}`,back:`restored ${what}${amt}`},
    p:{add:`recorded a payment: ${what}${amt}`,edit:`changed a payment: ${what}`,del:`removed a payment: ${what}${amt}`,back:`restored a payment: ${what}${amt}`},
    g:{add:`added ${what} to the group`,edit:`renamed someone`,del:`removed ${what} from the group`,back:`brought ${what} back to the group`},
    t:{edit:`changed the trip`},
  }[x.k]?.[x.a]||'made a change';
  return `${who} ${t}`;
}
function openActivity(){
  const L=(S.log||[]).slice().reverse(),seen=seenAt(),m=me();
  prefs.seen=prefs.seen||{};prefs.seen[S.id]=now();savePrefs();drawActDot();
  const live=id=>S.expenses.some(e=>e.id===id&&!e.del);
  let h='',day='';
  L.forEach(x=>{
    const d=ymd(new Date(x.t));
    if(d!==day){if(day)h+='</ul>';day=d;h+=`<h2>${fmtDate(d)}</h2><ul class="actlist">`}
    const tag=(x.k==='e'||x.k==='p')&&live(x.i)?`button data-act="${x.i}"`:'div';
    h+=`<li><${tag} class="actrow${x.t>seen&&x.by!==m?' new':''}">${x.by?av(x.by,'sm'):'<span class="av sm"></span>'}<span class="at"><span>${actLine(x)}</span>${x.x?`<small>${x.x.map(esc).join(' · ')}</small>`:''}</span><time>${new Date(x.t).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</time></${tag.split(' ')[0]}></li>`;
  });
  if(day)h+='</ul>';
  const sc=openScrim();
  sc.innerHTML=`<div class="sheet" role="dialog" aria-label="Activity">
    <div class="sh"><button type="button" class="iconbtn" data-dismiss aria-label="Close">${ico('i-down')}</button><h3>Activity</h3></div>
    ${h||'<p class="empty">Nothing yet. Changes anyone in the group makes show up here.</p>'}
  </div>`;
  sc.onclick=e=>{
    if(e.target===sc)return close();
    const a=e.target.closest('[data-act]');if(!a)return;
    const ex=S.expenses.find(y=>y.id===a.dataset.act);if(!ex)return;
    close();setTimeout(()=>isPay(ex)?openPay(ex):openSheet(ex),50);
  };
}

/* ---- Edit clashes ----
   While the edit form is open, a change from the group to the same expense shows a warning in the form (clashCheck in expense-form.js).
   Two edits made apart (e.g. both offline) are spotted when they meet: each edit records the version it started from (pu),
   so if neither started from the other, both people are told whose version was kept. */
let editing=null;
function clashNote(l,x){
  const m=me();if(!m||!x.pu&&!l.pu)return null;
  if((x.u||0)>(l.u||0)&&x.pu!=null&&l.eb===m&&x.eb!==m&&(l.u||0)>x.pu)return `${x.eb?first(pname(x.eb)):'Someone'} changed ${l.desc} at the same time as you. Their version was kept.`;
  if((l.u||0)>(x.u||0)&&l.pu!=null&&l.eb===m&&x.eb&&x.eb!==m&&(x.u||0)>l.pu)return `${first(pname(x.eb))} changed ${l.desc} at the same time as you. Your version was kept.`;
  return null;
}
