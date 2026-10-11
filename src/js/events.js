/* ---- Events ---- */
document.querySelector('.tabs').onclick=e=>{const b=e.target.closest('button');if(b){tab=b.dataset.tab;render()}};
$('#trip').onchange=e=>{S.name=e.target.value.trim()||'Trip';S.nu=now();save();render()};
$('#clearSample').onclick=newTrip;
$('#gear').onclick=openSettings;
$('#cloud').onclick=()=>sync();
$('#retryBtn').onclick=async()=>{const b=$('#retryBtn');b.disabled=true;b.textContent='Trying…';
  if(!scanAvail)await ping();await sync();b.disabled=false;b.textContent='Retry';
  if($('#cloud').dataset.s==='offline')toast('Still offline');else toast('Back online. Synced')};

function toast(t,act){
  const el=$('#toast');el.innerHTML=`<span>${esc(t)}</span>${act?`<button type="button">${esc(act.label)}</button>`:''}`;el.hidden=false;
  if(act)el.querySelector('button').onclick=()=>{el.hidden=true;act.fn()};
  clearTimeout(toast.h);toast.h=setTimeout(()=>el.hidden=true,act?5000:2200);
}
function removeExp(ex){
  ex.del=true;ex.u=now();save();render();
  toast(isPay(ex)?'Payment deleted':'Deleted',{label:'Undo',fn:()=>{ex.del=false;ex.u=now();save();render();toast('Restored')}});
}
function copy(t,ok){navigator.clipboard.writeText(t).then(()=>toast(ok)).catch(()=>toast('Copy blocked here. Use WhatsApp instead.'))}

document.addEventListener('click',e=>{
  const dh=e.target.closest('[data-day]');if(dh){const d=dh.dataset.day;open.has(d)?open.delete(d):open.add(d);rExp();return}
  if(e.target.closest('#toggleAll')){const days=[...new Set(expenses().map(x=>x.date))];open=days.every(d=>open.has(d))?new Set():new Set(days);rExp();return}
  const ed=e.target.closest('[data-edit]');if(ed)return openSheet(S.expenses.find(x=>x.id===ed.dataset.edit));
  const py=e.target.closest('[data-pay]');if(py)return openPay(S.expenses.find(x=>x.id===py.dataset.pay));
  const mm=e.target.closest('[data-me]');if(mm){setMe(mm.dataset.me);render();if($('#scrim [data-me]'))openSettings();return}
  const fd=e.target.closest('[data-fold]');if(fd){const k=fd.dataset.fold;prefs[k]=!prefs[k];savePrefs();rBal();return}
  const mt=e.target.closest('[data-metoggle]');if(mt){prefs.meOpen=mt.getAttribute('aria-expanded')!=='true';savePrefs();rExp();return}
  const gt=e.target.closest('[data-goto]');if(gt){tab=gt.dataset.goto;render();scrollTo(0,0);return}
  const pb=e.target.closest('[data-pay-i]');if(pb){const x=lastT[+pb.dataset.payI];if(x)openPayTo(x[0],x[1],x[2]);return}
  const pr=e.target.closest('[data-person]');if(pr){openPerson(pr.dataset.person);return}
  const pdd=e.target.closest('[data-paydetails]');if(pdd){openPayDetails(pdd.dataset.paydetails);return}
  const rmd=e.target.closest('[data-remind]');if(rmd){pendingPay=null;return}
  const up2=e.target.closest('[data-unpay]');
  if(up2){const p=S.expenses.find(x=>x.id===up2.dataset.unpay);if(p){p.del=true;p.u=now();save();render();
    toast('Marked as not paid',{label:'Undo',fn:()=>{p.del=false;p.u=now();save();render();toast('Marked as paid')}})}return}
  const st=e.target.closest('[data-settle]');if(st){const x=lastT[+st.dataset.settle];if(x){const m=me(),pick=u=>u.ids.includes(m)?m:u.ids[0];openPay(null,{from:pick(x[0]),to:pick(x[1]),amt:x[2]})}return}
  if(e.target.closest('#export'))return exportCsv();
  if(e.target.closest('#dupReview'))return openDupReview();
  const lk=e.target.closest('[data-link]');if(lk){linking=linking===lk.dataset.link?null:lk.dataset.link;rPpl();return}
  const pw=e.target.closest('[data-pairwith]');
  if(pw&&linking){const a=person(linking),b=person(pw.dataset.pairwith);a.pair=b.id;b.pair=a.id;a.u=b.u=now();linking=null;save();render();toast(`${a.name} & ${b.name} paired`);return}
  const up=e.target.closest('[data-unpair]');
  if(up){const a=person(up.dataset.unpair),b=person(partner(a.id));delete a.pair;delete b.pair;delete a.joint;delete b.joint;a.u=b.u=now();save();render();return}
  const rm=e.target.closest('[data-rm]');
  if(rm){const id=rm.dataset.rm,n=expenses().filter(x=>x.paidBy===id||x.for.includes(id)).length;
    if(n){$('#pmsg').textContent=`${pname(id)} is in ${n} expense${n>1?'s':''}. Remove those first.`;return}
    const p=S.people.find(x=>x.id===id),q=partner(id);if(q){const o=person(q);delete o.pair;delete o.joint;o.u=now()}delete p.pair;delete p.joint;p.del=true;p.u=now();save();render();return}
  if(e.target.closest('#sxBtn'))return openSettleCur();
  if(e.target.closest('[data-help]'))return openHelp();
  if(e.target.closest('#copy'))copy(summary(),'Copied');
  if(e.target.closest('#copyLink'))copy(tripLink(),'Link copied');
});
document.addEventListener('submit',e=>{
  if(e.target.id!=='pform')return;e.preventDefault();
  const n=$('#pname').value.trim();if(!n)return;
  if(people().some(p=>p.name.toLowerCase()===n.toLowerCase())){$('#pmsg').textContent=`${n} is already in the group.`;return}
  if(S.sample){S=blank();open=null;persist();sync()}
  S.people.push({id:uid(),name:n,c:nextColor(),u:now()});$('#pname').value='';save();render();$('#pname').focus();
});

$('#add').onclick=()=>{if(!people().length){tab='ppl';render();$('#pmsg').textContent='Add someone first.';return}openSheet()};

function openSheet(ex){
  const P=people(),isNew=!ex;
  const lastPayer=P.some(p=>p.id===S.lastPayer)?S.lastPayer:P[0].id;
  /* cat: null = not chosen yet (grey); guessed from the description until the user picks one */
  const f={touched:{amt:!!ex,date:!!ex,desc:!!ex},cat:ex?.cat||null,catSet:!!ex,menu:false,ccMenu:false,cc:ex?.cc||S.cur,
    paidBy:ex?.paidBy||(isNew&&me())||lastPayer,for:new Set(ex?.for||P.map(p=>p.id)),
    photo:ex?.photo||0,newPhoto:null};
  const sc=openScrim();
  const pa=(p,on,attr)=>`<button type="button" class="pa" data-${attr}="${p.id}" aria-pressed="${on}" aria-label="${esc(p.name)}">${av(p.id,'lg')}<span class="pn">${esc(first(p.name))}</span></button>`;
  const foreign=()=>f.cc!==S.cur;
  const draw=()=>{
    const n=f.for.size,a=toPence($('#famt').value),c=f.cat;
    const rate=parseFloat(String($('#frate').value).replace(',','.'));
    const base=foreign()?(rate>0&&a>0?Math.round(a*rate):NaN):a;
    const cb=$('#catbtn');cb.className='catbtn'+(c?'':' none');cb.style.background=c?CAT_COL[c]:'';
    cb.innerHTML=ico('c-'+(c||'other'))+ico('i-chev','i caret');cb.setAttribute('aria-expanded',f.menu);
    $('#catmenu').hidden=!f.menu;
    $('#catmenu').innerHTML=CATS.map(k=>`<button type="button" class="cat" data-cat="${k}" aria-pressed="${k===c}" aria-label="${CAT_NAME[k]}" style="background:${CAT_COL[k]}">${ico('c-'+k)}</button>`).join('');
    $('#ccbtn').innerHTML=esc(f.cc)+ico('i-chev','i caret');$('#ccbtn').setAttribute('aria-expanded',f.ccMenu);
    $('#ccmenu').hidden=!f.ccMenu;
    $('#ccmenu').innerHTML=[S.cur,...CCS.filter(x=>x!==S.cur)].map(x=>`<button type="button" data-cc="${esc(x)}" aria-pressed="${x===f.cc}">${esc(x)}</button>`).join('');
    $('#famt').placeholder=f.cc+'0.00';
    $('#raterow').hidden=!foreign();
    $('#rlab').textContent=`${f.cc}1 = ${S.cur}`;
    $('#conv').textContent=foreign()&&base>0?`= ${money(base)}`:'';
    $('#paidChips').innerHTML=P.map(p=>pa(p,p.id===f.paidBy,'paid')).join('');
    $('#forChips').innerHTML=P.map(p=>pa(p,f.for.has(p.id),'for')).join('');
    $('#paidName').textContent=pname(f.paidBy);
    $('#forName').textContent=n===P.length?'Everyone':`${n} of ${P.length}`;
    $('#each').textContent=n&&base>0?`${money(Math.round(base/n))} each`:'';
    $('#allBtn').textContent=n===P.length?'None':'All';
    const has=f.newPhoto||(f.photo&&ex);
    $('#photoArea').hidden=!has;
    $('#photoArea').innerHTML=has?`<button type="button" class="thumb" id="thumb" aria-label="View receipt"><img id="thumbImg" alt="Receipt"></button><button type="button" class="ghost" id="rmPhoto">Remove photo</button>`:'';
    if(has){const img=$('#thumbImg');if(f.newPhoto)img.src=f.newPhoto;else photoURL(ex.id,f.photo,ex.pe).then(u=>{img.src=u}).catch(()=>{img.alt='Receipt needs signal'})}
  };
  sc.innerHTML=`<form class="sheet" id="eform" role="dialog" aria-label="${isNew?'Add':'Edit'} expense">
    <div class="sh"><button type="button" class="iconbtn" data-dismiss aria-label="Close">${ico('i-down')}</button><h3>${isNew?'New expense':'Edit expense'}</h3><button type="button" class="iconbtn" id="camBtn" aria-label="Scan or attach a receipt">${ico('i-cam')}</button></div>
    <input id="fphoto" type="file" accept="image/*" hidden>
    <div class="thumbrow" id="photoArea" hidden></div>
    <p class="scanmsg" id="scanmsg" hidden aria-live="polite"></p>
    <div class="amtrow"><button type="button" class="ccbtn" id="ccbtn" aria-label="Currency" aria-haspopup="true"></button><input id="famt" class="field big" inputmode="decimal" value="${ex?((ex.cc?ex.oamt:ex.amt)/100).toFixed(2):''}" autocomplete="off" aria-label="Amount"><div class="ccmenu" id="ccmenu" hidden></div></div>
    <div class="raterow" id="raterow" hidden><span id="rlab"></span><input id="frate" class="field" inputmode="decimal" value="${ex?.rate||lastRate(f.cc)}" autocomplete="off" aria-label="Exchange rate"><span class="conv" id="conv"></span><span class="ratenote" id="rnote"></span></div>
    <p class="cvnote" id="cvnote" hidden></p>
    <div class="descrow"><input id="fdesc" class="field" type="text" placeholder="What for?" value="${esc(ex?.desc||'')}" autocomplete="off" aria-label="Description"><button type="button" class="catbtn" id="catbtn" aria-label="Choose icon" aria-haspopup="true"></button><div class="catmenu" id="catmenu" hidden></div></div>
    <div class="daterow"><label for="fdate">Date</label><input id="fdate" type="date" value="${ex?.date||today()}"></div>
    <div class="lbl"><span>Paid by<em id="paidName"></em></span></div><div class="pick" id="paidChips"></div>
    <div class="lbl"><span>Split<em id="forName"></em></span><button type="button" id="allBtn"></button></div><div class="pick" id="forChips"></div>
    <div class="each" id="each"></div>
    <p class="msg" id="emsg"></p>
    <div class="duppanel" id="duppanel" hidden aria-live="polite"></div>
    <div class="foot">${isNew?'':'<button type="button" class="btn danger" id="del">Delete</button>'}<button class="btn primary">${isNew?'Add':'Save'}</button></div>
    ${ex?.by?`<p class="by">Added by ${esc(pname(ex.by))}</p>`:''}
  </form>`;
  draw();if(isNew)setTimeout(()=>$('#famt')?.focus(),60);
  sc.onclick=e=>{
    if(e.target===sc)return close();
    if(e.target.closest('#catbtn')){f.menu=!f.menu;f.ccMenu=false;draw();return}
    if(e.target.closest('#ccbtn')){f.ccMenu=!f.ccMenu;f.menu=false;draw();return}
    const cc=e.target.closest('[data-cc]');
    if(cc){const to=cc.dataset.cc;f.ccMenu=false;if(to===f.cc){draw();return}
      const from=f.cc,amt=toPence($('#famt').value),r0=parseFloat(String($('#frate').value).replace(',','.'));
      const base=amt>0?(from===S.cur?amt:r0>0?Math.round(amt*r0):null):null;   /* what the amount is worth in the trip currency */
      f.cc=to;if(ex&&ex.cc===f.cc){$('#frate').value=ex.rate;f.rateMode='manual'}else{$('#frate').value='';f.rateMode='auto'}
      cvnote('');draw();const seq=f.swap=(f.swap||0)+1;
      autoRate().then(()=>{if(f.swap===seq)offerConvert(from,amt,base)});return}
    if(e.target.closest('#cvKeep')){$('#famt').value=f.cv.typed;cvnote('');draw();return}
    if(e.target.closest('#cvDo')){$('#famt').value=f.cv.conv;cvnote(`Converted from ${esc(f.cv.fromTxt)}.`);draw();return}
    const ct=e.target.closest('[data-cat]');if(ct){f.cat=ct.dataset.cat;f.catSet=true;f.menu=false;draw();return}
    if(e.target.closest('#useDay')){f.rateMode='auto';autoRate();return}
    if((f.menu&&!e.target.closest('#catmenu'))||(f.ccMenu&&!e.target.closest('#ccmenu'))){f.menu=f.ccMenu=false;draw()}
    if(e.target.closest('#camBtn')){$('#fphoto').click();return}
    if(e.target.closest('#thumb')){const src=$('#thumbImg').src;if(src)viewPhoto(src);return}
    if(e.target.closest('#rmPhoto')){f.newPhoto=null;f.photo=0;draw();return}
    const pd=e.target.closest('[data-paid]');if(pd){f.paidBy=pd.dataset.paid;draw();return}
    const fr=e.target.closest('[data-for]');if(fr){const id=fr.dataset.for;f.for.has(id)?f.for.delete(id):f.for.add(id);draw();return}
    if(e.target.id==='allBtn'){f.for.size===P.length?f.for.clear():P.forEach(p=>f.for.add(p.id));draw();return}
    if(e.target.id==='del'){close();removeExp(ex)}
  };
  $('#fphoto').onchange=async e=>{const file=e.target.files[0];if(!file)return;
    try{f.newPhoto=await compress(file);draw()}catch(err){return toast('Couldn\'t read that photo')}
    scanReceipt(file,f,draw);};
  const unask=()=>{f.dupOk=false;const b=$('#duppanel');if(b)b.hidden=true};
  /* the rate for the expense's own date is filled in; typing your own rate keeps it */
  f.rateMode=ex&&ex.cc?'manual':'auto';
  const rnote=h=>{const n=$('#rnote');if(n)n.innerHTML=h};
  const autoRate=async()=>{
    if(!foreign()){rnote('');return}
    const cc=f.cc,d=$('#fdate').value||today(),when=shortDate(d);
    if(f.rateMode!=='auto'){rnote(ISO[cc]&&ISO[S.cur]?`Your rate. <button type="button" id="useDay">Use the rate for ${when}</button>`:'');return}
    if(!ISO[cc]||!ISO[S.cur]){rnote('Enter the rate yourself (no live rate for this currency).');return}
    rnote(`Getting the rate for ${when}…`);
    const j=await getRate(cc,S.cur,d);
    if(!$('#eform')||f.cc!==cc||($('#fdate').value||today())!==d||f.rateMode!=='auto')return;
    if(j&&!j.stale){$('#frate').value=String(+j.rate.toFixed(5));draw();
      rnote(`Rate for ${when} from <a href="https://frankfurter.dev/" target="_blank" rel="noopener">Frankfurter</a>`)}
    else{if(!$('#frate').value)$('#frate').value=lastRate(cc);draw();
      rnote($('#frate').value?`Couldn't get the rate for ${when} (no signal?). Using your last rate: check it, or edit the expense later.`:`Couldn't get the rate for ${when}. Enter it yourself.`)}
  };
  f.autoRate=autoRate;
  /* after a currency switch: a saved amount is converted (with "Keep" to undo); a number you just typed is kept, with "Convert" offered */
  const cvnote=h=>{const n=$('#cvnote');if(n){n.innerHTML=h;n.hidden=!h}};
  const offerConvert=(from,amt,base)=>{
    if(!$('#eform')||!(base>0))return;
    const r=parseFloat(String($('#frate').value).replace(',','.')),to=f.cc;
    const nv=to===S.cur?base:r>0?Math.round(base/r):null;if(!(nv>0)||nv===amt)return;
    f.cv={typed:(amt/100).toFixed(2),conv:(nv/100).toFixed(2),fromTxt:fmtCc(amt,from)};
    if(ex&&!f.amtTyped){$('#famt').value=f.cv.conv;draw();cvnote(`Converted from ${esc(f.cv.fromTxt)}. <button type="button" id="cvKeep">Keep ${f.cv.typed} instead</button>`)}
    else cvnote(`<button type="button" id="cvDo">Convert ${esc(f.cv.fromTxt)} to ${esc(fmtCc(nv,to))}</button>`);
  };
  $('#famt').oninput=()=>{f.touched.amt=f.amtTyped=true;unask();cvnote('');draw()};
  $('#frate').oninput=()=>{f.rateMode='manual';draw();autoRate()};
  $('#fdate').oninput=()=>{f.touched.date=true;unask();autoRate()};
  if(foreign())autoRate();                                         /* an existing expense in another currency: show where its rate came from */
  $('#fdesc').oninput=e=>{f.touched.desc=true;unask();if(!f.catSet){f.cat=matchCat(e.target.value)||null;draw()}};
  $('#eform').onsubmit=e=>{e.preventDefault();
    const a=toPence($('#famt').value),d=$('#fdesc').value.trim()||'Expense',dt=$('#fdate').value||today();
    if(!(a>0))return $('#emsg').textContent='Enter an amount.';
    if(!f.for.size)return $('#emsg').textContent='Pick who it\'s split between.';
    let amt=a,cur={cc:null,oamt:null,rate:null};
    if(foreign()){
      const r=parseFloat(String($('#frate').value).replace(',','.'));
      if(!(r>0)){$('#frate').focus();return $('#emsg').textContent=`Enter the rate: what ${f.cc}1 is in ${S.cur}.`}
      amt=Math.round(a*r);cur={cc:f.cc,oamt:a,rate:r};prefs.rates=prefs.rates||{};prefs.rates[f.cc]=r;savePrefs();
    }
    const id=isNew?uid():ex.id;
    /* duplicate check: new expenses, or edits that change amount/date/description */
    const cand={id,desc:d,amt,date:dt,cat:f.cat||matchCat(d)||null,cc:cur.cc,oamt:cur.oamt,notdup:ex?.notdup};
    const changed=isNew||ex.amt!==amt||ex.date!==dt||ex.desc!==d;
    const dups=changed&&!f.dupOk?findDups(cand):[];
    if(dups.length){
      const box=$('#duppanel');box.hidden=false;
      box.innerHTML=`<b>Possible duplicate</b>${dups.slice(0,2).map(x=>`<span>${dupLine(x.e)} <i>(${esc(x.why.toLowerCase())})</i></span>`).join('')}
        <span class="dupacts"><button type="button" class="btn" id="dupNo">${isNew?'Don\'t add':'Cancel'}</button><button type="button" class="btn primary" id="dupYes">${isNew?'Add anyway':'Save anyway'}</button></span>`;
      $('#dupNo').onclick=()=>{close();if(isNew)toast('Not added')};
      $('#dupYes').onclick=()=>{f.dupOk=dups.map(x=>x.e.id);$('#eform').requestSubmit?$('#eform').requestSubmit():$('#eform').dispatchEvent(new Event('submit',{cancelable:true}))};
      box.scrollIntoView&&box.scrollIntoView({block:'nearest'});
      return;
    }
    const notdup=Array.isArray(f.dupOk)?[...new Set([...(ex?.notdup||[]),...f.dupOk])]:(ex?.notdup||undefined);
    let photo=f.photo;
    if(f.newPhoto){photo=now();queuePhoto(id,photo,f.newPhoto)}
    const rec={desc:d,amt,date:dt,paidBy:f.paidBy,for:[...f.for],cat:f.cat||'other',photo:photo||0,pe:f.newPhoto?(S.pk?1:0):(ex?.pe||0),...cur,u:now()};
    if(notdup&&notdup.length)rec.notdup=notdup;
    if(isNew)S.expenses.push({id,by:me()||null,...rec});else Object.assign(ex,rec);
    S.lastPayer=f.paidBy;open?.add(dt);
    save();close();tab='exp';render();toast(isNew?'Added':'Saved');
  };
}
