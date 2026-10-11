/* ---- The add / edit expense form ---- */
$('#add').onclick=()=>{if(!people().length){tab='ppl';render();$('#pmsg').textContent='Add someone first.';return}openSheet()};

function openSheet(ex){
  if(ex&&tooNew(ex))return toast('Reload the app to edit this one: it was made with a newer version');
  const P=people(),isNew=!ex;
  /* edit clash: remember the version you opened; if someone else's change arrives while the form is open, say so */
  editing=ex?{id:ex.id,u:ex.u,was:eSnap(ex),check:()=>clashCheck()}:null;
  const lastPayer=P.some(p=>p.id===S.lastPayer)?S.lastPayer:P[0].id;
  /* cat: null = not chosen yet (grey); guessed from the description until the user picks one */
  const f={touched:{amt:!!ex,date:!!ex,desc:!!ex},cat:ex?.cat||null,catSet:!!ex,menu:false,ccMenu:false,cc:ex?.cc||S.cur,
    paidBy:ex?.paidBy||(isNew&&me())||lastPayer,for:new Set(ex?.for||P.map(p=>p.id)),
    photo:ex?.photo||0,newPhoto:null,
    /* split: 'eq' equally, 'sh' by shares (whole numbers), 'am' by amount (typed in the expense's currency) */
    mode:ex?.split?.m==='s'?'sh':ex?.split?.m==='a'?'am':'eq',w:{},am:{}};
  if(ex?.split?.w)for(const id in ex.split.w){if(f.mode==='sh')f.w[id]=ex.split.w[id];else f.am[id]=(ex.split.w[id]/100).toFixed(2)}
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
    $('#each').textContent=f.mode==='eq'&&n&&base>0?`${money(Math.round(base/n))} each`:'';
    drawSplit(base);
    $('#allBtn').textContent=n===P.length?'None':'All';
    const has=f.newPhoto||(f.photo&&ex);
    $('#photoArea').hidden=!has;
    $('#photoArea').innerHTML=has?`<button type="button" class="thumb" id="thumb" aria-label="View receipt"><img id="thumbImg" alt="Receipt"></button><button type="button" class="ghost" id="rmPhoto">Remove photo</button>`:'';
    if(has){const img=$('#thumbImg');if(f.newPhoto)img.src=f.newPhoto;else photoURL(ex.id,f.photo,ex.pe).then(u=>{img.src=u}).catch(()=>{img.alt='Receipt needs signal'})}
  };
  /* uneven splits: one row per person in the split; rows are rebuilt only when who's in it or the mode changes, so typing isn't interrupted */
  const wOf=id=>f.w[id]??1;
  const amOf=id=>{const v=toPence(f.am[id]??'');return v>0?v:0};
  const drawSplit=base=>{
    document.querySelectorAll('#splitMode [data-mode]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.mode===f.mode));
    const box=$('#splits'),ids=P.filter(p=>f.for.has(p.id)).map(p=>p.id),key=f.mode+f.cc+':'+ids.join(',');
    ids.forEach(id=>{if(f.w[id]===0)delete f.w[id]});   /* back in the split: one share again */
    box.hidden=f.mode==='eq'||!ids.length;
    if(f.mode==='eq'||!ids.length){f.splitKey=key;return}
    if(f.splitKey!==key){f.splitKey=key;
      box.innerHTML=ids.map(id=>`<div class="srow2">${av(id)}<span class="sn">${esc(first(pname(id)))}</span>${f.mode==='sh'
        ?`<span class="step"><button type="button" data-sw="${id}" data-d="-1" aria-label="Fewer shares for ${esc(pname(id))}">−</button><b data-wv="${id}"></b><button type="button" data-sw="${id}" data-d="1" aria-label="More shares for ${esc(pname(id))}">+</button></span><span class="sa" data-sa="${id}"></span>`
        :`<span class="amin"><span>${esc(f.cc)}</span><input inputmode="decimal" data-am="${id}" value="${esc(f.am[id]??'')}" placeholder="0.00" autocomplete="off" aria-label="${esc(pname(id))}'s amount"></span>`}</div>`).join('')
        +'<p class="ssum" id="ssum"></p>';
      box.querySelectorAll('[data-am]').forEach(i=>i.oninput=()=>{f.am[i.dataset.am]=i.value;unask();$('#emsg').textContent='';draw()});
    }
    const a=toPence($('#famt').value),sum=$('#ssum');
    if(f.mode==='sh'){
      const w={};ids.forEach(id=>w[id]=wOf(id));
      const sh=base>0?shares({amt:base,paidBy:f.paidBy,for:ids,split:{w}}):{};
      ids.forEach(id=>{box.querySelector(`[data-wv="${id}"]`).textContent=w[id];box.querySelector(`[data-sa="${id}"]`).textContent=base>0?money(sh[id]):''});
      const W=ids.reduce((s,id)=>s+w[id],0);sum.className='ssum';sum.textContent=`${W} share${W===1?'':'s'}`;
    }else{
      const got=ids.reduce((s,id)=>s+amOf(id),0),d=(a>0?a:0)-got;
      sum.className='ssum'+(a>0&&d===0?' ok':got&&d?' off':'');
      sum.textContent=!(a>0)?'Enter the total first':d===0?'Adds up':d>0?`${fmtCc(d,f.cc)} left to assign`:`${fmtCc(-d,f.cc)} too much`;
    }
  };
  const clashCheck=()=>{
    const box=$('#clash');if(!box||!editing||editing.id!==ex.id)return;
    const cur=S.expenses.find(y=>y.id===ex.id);if(!cur||cur.u===editing.u)return;
    const l=(S.log||[]).filter(z=>z.i===ex.id&&z.t>=editing.u-1).at(-1),who=l&&l.by&&l.by!==me()?esc(first(pname(l.by))):'Someone';
    const what=cur.del?'':eChanges(editing.was,eSnap(cur));
    box.hidden=false;
    box.innerHTML=cur.del?`<b>${who} just deleted this expense.</b> <span>If you save, it comes back with your changes.</span> <button type="button" class="btn" id="useTheirs">Leave it deleted</button>`
      :`<b>${who} just changed this expense${what.length?`: ${esc(what.join(', '))}`:''}.</b> <span>If you save, your version replaces theirs.</span> <button type="button" class="btn" id="useTheirs">Use theirs instead</button>`;
    box.scrollIntoView&&box.scrollIntoView({block:'nearest'});
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
    <div class="seg three splitmode" id="splitMode" role="group" aria-label="How to split"><button type="button" data-mode="eq">Equally</button><button type="button" data-mode="sh">By shares</button><button type="button" data-mode="am">By amount</button></div>
    <div class="splits" id="splits" hidden></div>
    <div class="each" id="each"></div>
    <div class="clash" id="clash" hidden role="alert"></div>
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
    const md=e.target.closest('[data-mode]');if(md){f.mode=md.dataset.mode;draw();return}
    const sw=e.target.closest('[data-sw]');if(sw){const id=sw.dataset.sw,v=Math.max(0,Math.min(99,wOf(id)+(+sw.dataset.d)));
      f.w[id]=v;if(!v)f.for.delete(id);draw();return}
    if(e.target.id==='allBtn'){f.for.size===P.length?f.for.clear():P.forEach(p=>f.for.add(p.id));draw();return}
    if(e.target.id==='del'){close();removeExp(ex)}
    if(e.target.id==='useTheirs'){const cur=S.expenses.find(y=>y.id===ex.id);close();if(cur&&!cur.del)setTimeout(()=>openSheet(cur),50);else toast('Not saved: it was deleted');return}
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
    /* uneven split: who's in it, and their shares or amounts */
    let forIds=[...f.for],split=null;
    if(f.mode==='sh'){
      const w={};forIds.forEach(id=>{if(wOf(id)>0)w[id]=wOf(id)});forIds=Object.keys(w);
      if(!forIds.length)return $('#emsg').textContent='Give someone at least one share.';
      if(new Set(Object.values(w)).size>1)split={m:'s',w};
    }else if(f.mode==='am'){
      const w={};forIds.forEach(id=>{const v=amOf(id);if(v>0)w[id]=v});forIds=Object.keys(w);
      const got=Object.values(w).reduce((s,v)=>s+v,0);
      if(got!==a)return $('#emsg').textContent=got?`The amounts add up to ${fmtCc(got,f.cc)}, not ${fmtCc(a,f.cc)}.`:'Enter how much each person\'s share is.';
      split={m:'a',w};
    }
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
    const rec={desc:d,amt,date:dt,paidBy:f.paidBy,for:forIds,cat:f.cat||'other',photo:photo||0,pe:f.newPhoto?(S.pk?1:0):(ex?.pe||0),...cur,u:now()};
    if(notdup&&notdup.length)rec.notdup=notdup;
    /* lv 2: needs a version of the app that knows uneven splits (older versions ask to reload rather than get it wrong) */
    if(split){rec.split=split;rec.lv=2}else if(ex?.split){rec.split=null;rec.lv=0}
    /* pu: the version this edit started from, eb: who edited. Lets phones spot two edits made at the same time */
    if(!isNew){rec.pu=editing&&editing.id===ex.id?editing.u:ex.u;rec.eb=me()||null;if(ex.del)rec.del=false}
    editing=null;
    if(isNew)S.expenses.push({id,by:me()||null,...rec});else Object.assign(ex,rec);
    S.lastPayer=f.paidBy;open?.add(dt);
    save();close();tab='exp';render();toast(isNew?'Added':'Saved');
  };
}
