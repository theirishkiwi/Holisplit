/* ---- Views ---- */
let tab='exp',open=null,linking=null;
function render(){
  if(document.activeElement!==$('#trip'))$('#trip').value=S.name;
  $('#tripsub').textContent=tripSub();
  $('#sample').hidden=!S.sample;$('#revoked').hidden=!S.revoked;
  document.querySelectorAll('.tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===tab));
  ['exp','bal','ppl'].forEach(id=>$('#'+id).hidden=id!==tab);
  $('#add').hidden=tab!=='exp'||!!S.del;
  $('#deleted').hidden=!S.del;if(S.del)$('#delText').textContent=`${S.delBy?pname(S.delBy)+' deleted':'Deleted'} this trip. It's removed in ${daysLeft(S)} day${daysLeft(S)===1?'':'s'}.`;
  ({exp:rExp,bal:rBal,ppl:rPpl})[tab]();
}
/* ---- Me: who is using this phone (per trip, stored on the phone only) ---- */
const me=()=>{const id=(prefs.me||{})[S.id];return id&&people().some(p=>p.id===id)?id:null};
function setMe(id){prefs.me=prefs.me||{};prefs.me[S.id]=id;savePrefs()}
const isPay=e=>e.type==='pay';
const spend=()=>expenses().filter(e=>!isPay(e));
const first=n=>String(n).trim().split(/\s+/)[0];
const fmtCc=(p,cc)=>cc+(p/100).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
const pickRow=(attr,sel)=>`<div class="pick">${people().map(p=>`<button type="button" class="pa" data-${attr}="${p.id}" aria-pressed="${p.id===sel}" aria-label="${esc(p.name)}">${av(p.id,'lg')}<span class="pn">${esc(first(p.name))}</span></button>`).join('')}</div>`;
function myLine(e){
  const m=me();if(!m)return '';
  /* joint-account couples: count the two of you together, so your partner paying is never a debt */
  const q=isJoint(m)?partner(m):null,us=q?[m,q]:[m];
  if(isPay(e))return us.includes(e.paidBy)?`<span class="mine none">${q&&e.paidBy===q?esc(first(pname(q)))+' paid':'you paid'}</span>`:e.for.some(i=>us.includes(i))?'<span class="mine none">you received</span>':'';
  const sh=shares(e),share=us.reduce((s,i)=>s+(sh[i]||0),0),paid=us.includes(e.paidBy)?e.amt:0,n=paid-share;
  if(!paid&&!share)return '<span class="mine none">not involved</span>';
  if(n>0)return `<span class="mine pos">you're owed <span class="ma">${money(n)}</span></span>`;
  if(n<0)return `<span class="mine neg">you owe <span class="ma">${money(-n)}</span></span>`;
  return `<span class="mine none">just yours</span>`;
}
function meCard(){
  const m=me();
  if(!m)return `<div class="mecard"><div class="mehead">Who are you on this phone?</div>${pickRow('me',null)}</div>`;
  const {t}=plan(),mine=x=>x.ids.includes(m);
  const my=units().find(mine),other=my.ids.find(i=>i!==m);
  const who=other?`You & ${esc(pname(other))}`:'You',are=other?`${who} are`:"You're",obj=other?`you & ${esc(pname(other))}`:'you';
  const out=t.filter(x=>mine(x[0])),inn=t.filter(x=>mine(x[1]));
  const owe=out.reduce((s,x)=>s+x[2],0),owed=inn.reduce((s,x)=>s+x[2],0);
  /* one summary line (tap to expand/collapse), then each balance in smaller grey text with the amount in colour */
  const head=owe?`${who} owe <b class="neg">${smoney(owe)}</b>`:owed?`${are} owed <b class="pos">${smoney(owed)}</b>`:`${are} all square`;
  const lines=[...out.map(x=>`${who} owe ${esc(uName(x[1]))} <b class="neg">${smoney(x[2])}</b>`),
               ...inn.map(x=>`${esc(uName(x[0]))} owe${x[0].ids.length>1?'':'s'} ${obj} <b class="pos">${smoney(x[2])}</b>`)];
  const shown=lines.slice(0,3),more=lines.length-shown.length,openMe=prefs.meOpen!==false&&lines.length>0;
  return `<div class="mecard">
    <button class="mehead2" ${lines.length?`data-metoggle aria-expanded="${openMe}"`:'data-goto="bal"'}><span>${head}</span>${lines.length?ico('i-chev','i mechev'):''}</button>
    ${openMe?`<div class="melist">${shown.map(l=>`<button data-goto="bal">${l}</button>`).join('')}${more?`<button data-goto="bal" class="memore">Plus ${more} more balance${more>1?'s':''}</button>`:''}</div>`:''}
  </div>`;
}
function rExp(){
  const E=expenses();
  const how='<br><button class="linkbtn" data-help>How it works</button>';
  if(!people().length){$('#exp').innerHTML=`<p class="empty">Add your group first.${how}</p>`;return}
  let h=meCard();
  if(!E.length){$('#exp').innerHTML=h+`<p class="empty">No expenses yet.${how}</p>`;return}
  const days=[...new Set(E.map(e=>e.date))];
  if(!open)open=new Set([days[0]]);
  const all=days.every(d=>open.has(d));
  const dp=dupPairs().length;
  if(dp)h+=`<button class="dupnote" id="dupReview"><span>${dp} possible duplicate${dp>1?'s':''}</span><b>Review</b></button>`;
  h+=`<div class="bar"><span class="tot">Trip total <b>${money(spend().reduce((s,e)=>s+e.amt,0))}</b></span>${days.length>1?`<button class="ghost" id="toggleAll">${ico(all?'i-collapse':'i-expand')}${all?'Collapse all':'Expand all'}</button>`:''}</div>`;
  const everyone=people().length;
  days.forEach(d=>{
    const de=E.filter(e=>e.date===d),isOpen=open.has(d);
    h+=`<div class="day${isOpen?' open':''}"><button class="dayh" data-day="${d}" aria-expanded="${isOpen}"><span class="d">${fmtDate(d)}</span><span class="s">${money(de.filter(e=>!isPay(e)).reduce((s,e)=>s+e.amt,0))}</span>${ico('i-chev')}</button>`;
    if(isOpen)h+='<ul class="items">'+de.map(e=>isPay(e)
      ?`<li><button class="row" data-pay="${e.id}"><span class="ic" style="background:${PAY_COL}">${ico('i-pay')}</span><span class="main"><div class="t">${esc(pname(e.paidBy))} paid ${esc(pname(e.for[0]))}</div><div class="who">${av(e.paidBy,'sm')}${ico('i-arrow')}${av(e.for[0],'sm')}<span>Payment</span></div></span><span class="rt"><span class="amt">${e.cc?fmtCc(e.oamt,e.cc):money(e.amt)}</span>${myLine(e)}</span></button></li>`
      :`<li><button class="row" data-edit="${e.id}"><span class="ic" style="background:${CAT_COL[e.cat]}">${ico('c-'+e.cat)}</span><span class="main"><div class="t">${esc(e.desc)}</div><div class="who"><span>${e.paidBy===me()?'You':esc(first(pname(e.paidBy)))} paid</span><span class="sep">·</span>${e.for.length===everyone?'<span>everyone</span>':stack(e.for)}${e.cc?`<span class="orig">${fmtCc(e.oamt,e.cc)}</span>`:''}${e.photo?ico('i-cam','i tiny'):''}</div></span><span class="rt"><span class="amt">${money(e.amt)}</span>${myLine(e)}</span></button></li>`).join('')+'</ul>';
    h+='</div>';
  });
  $('#exp').innerHTML=h;
}
/* "3–6 Oct · 5 people" */
function tripSub(){
  const ds=spend().map(e=>e.date).sort(),n=people().length,ppl=n?`${n} ${n===1?'person':'people'}`:'';
  if(!ds.length)return ppl;
  const d=x=>new Date(x+'T12:00'),a=d(ds[0]),b=d(ds[ds.length-1]),mon=x=>x.toLocaleDateString('en-GB',{month:'short'});
  const range=ds[0]===ds[ds.length-1]?`${a.getDate()} ${mon(a)}`:mon(a)===mon(b)&&a.getFullYear()===b.getFullYear()?`${a.getDate()}–${b.getDate()} ${mon(b)}`:`${a.getDate()} ${mon(a)} – ${b.getDate()} ${mon(b)}`;
  return [range,ppl].filter(Boolean).join(' · ');
}
let lastT=[];
function rBal(){
  const {nets,t}=plan();lastT=t;
  let h='';
  /* couples are marked * and explained under the list */
  const fn=u=>u.ids.map(i=>i===me()?'You':first(pname(i))).join(' & ')+(u.ids.length>1?'*':'');
  /* couples (or long names) need room: names on the first line, amount + button on the second */
  const roomy=t.some(([f,to])=>f.ids.length>1||to.ids.length>1||(fn(f)+fn(to)).length>10);
  const trow=([f,to,m],i)=>roomy
    ?`<div class="row srow two"><span class="flow">${uAv(f,'sm')}<span class="nm">${esc(fn(f))}</span>${ico('i-arrow')}${uAv(to,'sm')}<span class="nm">${esc(fn(to))}</span></span><span class="line2"><span class="amt">${smoney(m)}</span><span class="acts">${rowActs(f,to,m,i)}</span></span></div>`
    :`<div class="row srow"><span class="flow">${uAv(f,'sm')}<span class="nm">${esc(fn(f))}</span>${ico('i-arrow')}${uAv(to,'sm')}<span class="nm">${esc(fn(to))}</span></span><span class="amt">${smoney(m)}</span><span class="acts">${rowActs(f,to,m,i)}</span></div>`;
  const mu=me(),mineI=t.map((x,i)=>i).filter(i=>!mu||t[i][0].ids.includes(mu)||t[i][1].ids.includes(mu)),otherI=t.map((x,i)=>i).filter(i=>!mineI.includes(i));
  refreshRate();
  const x=sx(),sxBar=`<button class="sxbar" id="sxBtn">${x?`<span>Settle in <b>${esc(x.cc)}</b> · ${esc(rateTxt(x))}</span><small>${x.mode==='manual'?'your rate':x.fixed?'fixed '+shortDate(x.fixed):'live · '+shortDate(x.date||today())}</small>`:`<span>Settle in <b>${esc(S.cur)}</b></span><small>Use another currency</small>`}${ico('i-chev','i rowchev')}</button>`;
  h+=`<div class="h2row"><h2>Who pays who</h2>${t.length?`<span class="h2acts"><button class="iconbtn sm" id="copy" aria-label="Copy summary">${ico('i-copy')}</button><a class="iconbtn sm wa" href="https://wa.me/?text=${encodeURIComponent(summary())}" target="_blank" rel="noopener" aria-label="Share on WhatsApp">${ico('i-chat')}</a></span>`:''}</div>${t.length||x?sxBar:''}<div class="card">`;
  if(!t.length)h+='<div class="square">Everyone is square</div>';
  else{
    h+=mineI.map(i=>trow(t[i],i)).join('')||'<div class="square sm">Nothing for you to pay or receive</div>';
    if(otherI.length){const op=!!prefs.othersOpen;
      h+=`<button class="fold" data-fold="othersOpen" aria-expanded="${op}">Other payments (${otherI.length})${ico('i-chev','i fchev')}</button>`;
      if(op)h+=otherI.map(i=>trow(t[i],i)).join('');}
  }
  h+='</div>';
  if(t.some(([f,to])=>f.ids.length>1||to.ids.length>1))
    h+=`<p class="cnote">* Couples settle up as one. Want to settle separately? <button class="linkbtn" data-goto="ppl">Unpair them in Group</button></p>`;
  /* nudge: you're owed money but haven't said how to be paid */
  const m0=me();
  if(m0&&!hasPay(person(m0))&&t.some(x=>x[1].ids.includes(m0)))
    h+=`<div class="nudge"><span>Add your payment details so the group can pay you in one tap.</span><button class="btn primary" data-paydetails="${m0}">Add</button></div>`;
  /* recorded payments: tap the ✓ to mark as not paid (Undo puts it back) */
  const pays=expenses().filter(isPay);
  if(pays.length)h+='<h2>Paid</h2><div class="card">'+pays.map(e=>`<div class="row"><span class="flow">${av(e.paidBy)}<span>${esc(pname(e.paidBy))}</span>${ico('i-arrow')}${av(e.for[0])}<span>${esc(pname(e.for[0]))}</span></span><span class="rt"><span class="amt">${e.cc?fmtCc(e.oamt,e.cc):money(e.amt)}</span><button class="paidtoggle" data-unpay="${e.id}" aria-pressed="true" aria-label="Paid. Tap to mark as not paid">${ico('i-check','i tiny')}Paid</button></span></div>`).join('')+'</div>';
  const bo=!!prefs.balOpen;
  h+=`<button class="foldh" data-fold="balOpen" aria-expanded="${bo}"><h2>Balances</h2>${ico('i-chev','i fchev')}</button>`;
  if(bo){h+='<div class="card">';
    nets.forEach(({u,paid,n})=>{
      h+=`<div class="row">${uAv(u)}<span class="main"><div class="t">${esc(uName(u))}</div><div class="who">Paid ${money(paid)}</div></span><span class="amt ${n>0?'pos':n<0?'neg':''}">${n>0?'+':''}${smoney(n)}</span></div>`});
    h+='</div>';}
  /* trip summary: spend by category and by person (payments excluded) */
  const sp=spend();
  if(sp.length){
    const bc={};sp.forEach(e=>bc[e.cat]=(bc[e.cat]||0)+e.amt);
    const cats=Object.entries(bc).sort((a,b)=>b[1]-a[1]);
    const bp={};people().forEach(p=>bp[p.id]=0);sp.forEach(e=>{const sh=shares(e);for(const id in sh)if(id in bp)bp[id]+=sh[id]});
    const ppl=Object.entries(bp).sort((a,b)=>b[1]-a[1]);
    const m1=cats[0][1]||1,m2=Math.max(1,...ppl.map(x=>x[1]));
    h+='<h2>Spending by category</h2><div class="card sums">'+cats.map(([c,v])=>`<div class="sumrow"><span class="ic" style="background:${CAT_COL[c]}">${ico('c-'+c)}</span><span class="lab">${CAT_NAME[c]}</span><span class="v">${money(v)}</span><span class="track"><span class="fill" style="width:${(v/m1*100).toFixed(1)}%;background:${CAT_FILL[c]}"></span></span></div>`).join('')+'</div>';
    h+='<h2>Spent on each person</h2><div class="card sums">'+ppl.map(([id,v])=>`<div class="sumrow">${av(id)}<span class="lab">${esc(pname(id))}</span><span class="v">${money(v)}</span><span class="track"><span class="fill" style="width:${(v/m2*100).toFixed(1)}%;background:${COLORS[person(id).c%COLORS.length]}"></span></span></div>`).join('')+'</div>';
    h+=`<button class="btn wide" id="export">${ico('i-dl')}Export spreadsheet</button>`;
  }
  $('#bal').innerHTML=h;
}

function rPpl(){
  const typed=$('#pname')?.value||'',focused=document.activeElement?.id==='pname';
  let h='<form class="addp" id="pform"><input id="pname" class="field" type="text" placeholder="Add a name" autocomplete="off" aria-label="Name"><button class="btn primary" aria-label="Add">'+ico('i-plus')+'</button></form><p class="msg" id="pmsg"></p>';
  if(people().length){
    const singles=people().filter(p=>!partner(p.id));
    if(linking&&(!singles.some(p=>p.id===linking)||singles.length<2))linking=null;
    h+=linking?`<p class="pickhint">Tap ${esc(pname(linking))}'s partner</p>`:'';
    h+='<div class="card" style="margin-top:12px">';
    const m=me();
    people().forEach(p=>{const q=partner(p.id),tags=[p.id===m?'<span class="tag">You</span>':'',q?`<span>Couple with ${esc(first(pname(q)))}${isJoint(p.id)?' · joint account':''}</span>`:'',hasPay(p)?`<span class="okpay">${ico('i-check','i tiny')}Payment details</span>`:''].filter(Boolean);
      h+=`<button class="row" data-person="${p.id}">${av(p.id,'lg')}<span class="main"><div class="t">${esc(p.name)}</div>${tags.length?`<div class="who">${tags.join('<span class="sep">·</span>')}</div>`:''}</span>${ico('i-chev','i rowchev')}</button>`});
    h+='</div>';
  }
  else h+='<p class="empty">Who\'s on the trip?</p>';
  if(syncOn()){
    const msg=`Join *${S.name}* on Holiday Split:\n${tripLink()}`;
    h+=`<h2>Invite the group</h2><div class="invite"><a class="btn wa" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">${ico('i-chat')}WhatsApp</a><button class="btn primary" id="copyLink">${ico('i-copy')}Copy link</button></div><p class="hint">Everyone who opens the link sees the same trip, kept in sync.</p>`;
  }
  $('#ppl').innerHTML=h;
  if(typed)$('#pname').value=typed;if(focused)$('#pname').focus();
}

