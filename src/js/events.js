/* ---- Events ---- */
document.querySelector('.tabs').onclick=e=>{const b=e.target.closest('button');if(b){tab=b.dataset.tab;render()}};
$('#trip').onchange=e=>{S.name=e.target.value.trim()||'Trip';S.nu=now();save();render()};
$('#clearSample').onclick=newTrip;
$('#reloadBtn').onclick=()=>location.reload();
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
