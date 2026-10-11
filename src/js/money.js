/* ---- Money maths ---- */
const people=()=>S.people.filter(p=>!p.del);
const expenses=()=>S.expenses.filter(e=>!e.del).sort((a,b)=>b.date.localeCompare(a.date)||b.u-a.u);
const person=id=>S.people.find(p=>p.id===id)||{name:'?',c:0};
const pname=id=>person(id).name;
/* Initials: one letter, or two when another person shares the first letter (Sam/Sophie → Sa/So, Sam Lee/Sam Roe → SL/SR) */
function initials(id){
  const n=person(id).name.trim(),parts=n.split(/\s+/),up=x=>(x||'?')[0].toUpperCase();
  if(!people().some(q=>q.id!==id&&up(q.name.trim())===up(n)))return up(n);
  return parts.length>1?up(parts[0])+up(parts[parts.length-1]):up(n)+(n[1]||'').toLowerCase();
}
const av=(id,cls='')=>{const p=person(id),t=initials(id);return `<span class="av ${cls}${t.length>1?' two':''}" style="background:${COLORS[p.c%COLORS.length]}" title="${esc(p.name)}">${esc(t)}</span>`};
const stack=(ids,cls='sm')=>`<span class="stack">${ids.slice(0,5).map(id=>av(id,cls)).join('')}${ids.length>5?`<span class="av ${cls}" style="background:${CAT_COL.other}">+${ids.length-5}</span>`:''}</span>`;
const money=p=>{const n=Math.abs(p)/100;return (p<0?'−':'')+S.cur+n.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})};
/* ---- Settle-up currency: expenses stay in the trip currency; Settle up can show and pay in another, e.g. £ for a € trip.
   S.sx = {cc, rate (cc per 1 trip unit), mode:'live'|'manual', date (rate's date), day (when fetched), fixed (date of first payment)}.
   A live rate refreshes daily until the first payment is recorded, then stays fixed so everyone pays at the same rate. */
const ISO={'€':'EUR','£':'GBP','$':'USD','CHF':'CHF','zł':'PLN','Kč':'CZK','Ft':'HUF','¥':'JPY','₺':'TRY'};
const sx=()=>{const x=S.sx;return x&&x.cc&&x.cc!==S.cur&&x.rate>0?x:null};
const sCc=()=>sx()?.cc||S.cur;
const sAmt=m=>{const x=sx();return x?Math.round(m*x.rate):m};                 /* trip cents → settle cents */
const fromS=p=>{const x=sx();return x?Math.round(p/x.rate):p};               /* settle cents → trip cents */
const smoney=m=>{const p=sAmt(m),n=Math.abs(p)/100;return (p<0?'−':'')+sCc()+n.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})};
const rateTxt=(x=sx())=>x?`${S.cur}1 = ${x.cc}${(+x.rate).toFixed(4).replace(/0+$/,'').replace(/\.$/,'')}`:'';
const shortDate=d=>new Date(d+'T12:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'});
const rateMemo={};
async function getRate(from,to,date){
  const a=ISO[from],b=ISO[to];if(!a||!b||a===b||!syncAvail)return null;
  const k=`${a}:${b}:${date||''}`;if(rateMemo[k])return rateMemo[k];
  try{const r=await fetch(`/api/rate/${a}/${b}`+(date?`?date=${date}`:''),{cache:'no-store'});if(!r.ok)return null;
    const j=await r.json();if(!(j&&j.rate>0))return null;if(date&&!j.stale)rateMemo[k]=j;return j}catch(e){return null}
}
const fetchRate=cc=>getRate(S.cur,cc);
let rateBusy=false;
async function refreshRate(){
  const x=sx();if(!x||x.mode!=='live'||x.fixed||x.day===today()||rateBusy)return;
  rateBusy=true;const j=await fetchRate(x.cc);rateBusy=false;
  if(j&&S.sx===x&&!x.fixed&&x.mode==='live'){x.rate=j.rate;x.date=j.date;x.day=today();S.sxu=now();save();render()}
}
/* the first payment at a live rate fixes it */
function fixRate(){const x=sx();if(x&&x.mode==='live'&&!x.fixed){x.fixed=today();S.sxu=now()}}
/* a payment recorded in the settle currency keeps the exact trip amount, plus what was actually sent */
function payFields(amt,sent){const x=sx();return x?{cc:x.cc,oamt:sent??sAmt(amt),rate:+(1/x.rate).toFixed(6)}:{cc:null,oamt:null,rate:null}}
/* Amounts: accepts 12.50, 12,50, 1.234,56, 1,234.56, 1 200, €7. The last . or , is the decimal point only if 1–2 digits follow it */
function toPence(v){
  let s=String(v).replace(/[^\d.,]/g,'');if(!/\d/.test(s))return NaN;
  const i=Math.max(s.lastIndexOf('.'),s.lastIndexOf(',')),dec=i<0?0:s.length-i-1;
  s=dec>=1&&dec<=2?s.slice(0,i).replace(/[.,]/g,'')+'.'+s.slice(i+1):s.replace(/[.,]/g,'');
  const n=parseFloat(s);return isFinite(n)?Math.round(n*100):NaN;
}
const nextColor=()=>{const used=people().map(p=>p.c);for(let i=0;i<COLORS.length;i++)if(!used.includes(i))return i;return people().length%COLORS.length};

/* Each person's share in pence. Equal unless the expense has e.split = {m:'s'|'a', w:{id:weight}}:
   by shares (m 's', w = 1, 2, …) or by amount (m 'a', w = cents in the expense's own currency, adding up to its total).
   Either way the trip amount is shared in proportion to w, so a € expense on a £ trip splits by the amounts typed in €.
   Leftover pennies go to whoever lost the most in rounding; on a tie (always, for an equal split) the payer first, then list order. */
function shares(e){
  if(!e.for||!e.for.length)return {[e.paidBy]:e.amt};
  const ids=[...e.for].sort((x,y)=>(y===e.paidBy)-(x===e.paidBy));
  const sw=e.split&&e.split.w;let wt=id=>sw?Math.max(0,+sw[id]||0):1;
  let W=ids.reduce((s,id)=>s+wt(id),0);if(!(W>0)){wt=()=>1;W=ids.length}
  const out={},rest=[];let left=e.amt;
  ids.forEach((id,i)=>{const x=e.amt*wt(id)/W,f=Math.floor(x);out[id]=f;left-=f;rest.push([x-f,i,id])});
  rest.sort((a,b)=>b[0]-a[0]||a[1]-b[1]);
  for(let k=0;left>0;k++,left--)out[rest[k%rest.length][2]]++;
  return out;
}
const uneven=e=>!!(e.split&&e.split.w);
function balances(){
  const b={};people().forEach(p=>b[p.id]={paid:0,share:0});
  expenses().forEach(e=>{
    if(b[e.paidBy])b[e.paidBy].paid+=e.amt;
    const sh=shares(e);for(const id in sh)if(b[id])b[id].share+=sh[id];
  });
  return b;
}
/* Couples: a pair is stored on both people (p.pair) so it syncs like any other edit */
const partner=id=>{const p=person(id);if(!p.pair)return null;const q=S.people.find(x=>x.id===p.pair&&!x.del);return q&&q.pair===id?q.id:null};
const hasCouples=()=>people().some(p=>partner(p.id));
/* Joint account: the couple shares money, so they always count as one (never a debt between them). Set on both people so it syncs. */
const isJoint=id=>{const q=partner(id);return !!(q&&person(id).joint&&person(q).joint)};
/* a couple always settles with the group as one; to settle separately, unpair (it syncs, so every phone agrees) */
const byCouple=()=>hasCouples();
/* Settling units: a couple counts as one unit when settling by couple, otherwise each person is a unit */
function units(pair=byCouple()){
  const seen=new Set(),out=[];
  people().forEach(p=>{if(seen.has(p.id))return;const q=pair||isJoint(p.id)?partner(p.id):null;const ids=q?[p.id,q]:[p.id];ids.forEach(i=>seen.add(i));out.push({ids})});
  return out;
}
const uName=u=>u.ids.map(pname).join(' & ');
const uAv=(u,cls='')=>u.ids.length>1?`<span class="stack">${u.ids.map(i=>av(i,cls)).join('')}</span>`:av(u.ids[0],cls);
function plan(){
  const b=balances();
  const nets=units().map(u=>({u,paid:u.ids.reduce((s,i)=>s+b[i].paid,0),n:u.ids.reduce((s,i)=>s+b[i].paid-b[i].share,0)}));
  return {nets,t:settle(nets)};
}
/* Few transfers: repeatedly match the largest debtor with the largest creditor. Always settles everyone in at most (units - 1) payments;
   finding the absolute minimum is a much harder problem and rarely differs for holiday-sized groups */
function settle(nets){
  const cr=[],db=[];
  nets.forEach(x=>{if(x.n>0)cr.push([x.u,x.n]);else if(x.n<0)db.push([x.u,-x.n])});
  const t=[];
  while(cr.length&&db.length){
    cr.sort((x,y)=>y[1]-x[1]);db.sort((x,y)=>y[1]-x[1]);
    const m=Math.min(cr[0][1],db[0][1]);t.push([db[0][0],cr[0][0],m]);
    cr[0][1]-=m;db[0][1]-=m;if(!cr[0][1])cr.shift();if(!db[0][1])db.shift();
  }
  return t;
}
function summary(){
  const {t}=plan(),total=expenses().reduce((s,e)=>s+e.amt,0);
  let s=`*${S.name}* · ${money(total)} total\n\n`;
  s+=t.length?t.map(([f,to,m])=>`${uName(f)} → ${uName(to)}: *${smoney(m)}*`).join('\n')+(sx()?`\n_${rateTxt()}_`:''):'Everyone is square ✅';
  if(syncOn())s+=`\n\n${tripLink()}`;
  return s;
}
const fmtDate=d=>{const t=today(),yd=new Date();yd.setDate(yd.getDate()-1);const y=ymd(yd);
  return d===t?'Today':d===y?'Yesterday':new Date(d+'T12:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})};

