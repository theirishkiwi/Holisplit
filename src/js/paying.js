/* ---- Paying people: payment links and bank details, no bank linking ----
   Each person can store Monzo / Revolut / Starling handles and UK bank details (synced, and encrypted with the trip). */
const PAY_SITES={monzo:'monzo.me',revolut:'revolut.me',starling:'settleup.starlingbank.com'};
const PAY_NAMES={monzo:'Monzo',revolut:'Revolut',starling:'Starling'};
const HANDLE=/^[A-Za-z0-9._-]{2,40}$/;
/* accepts "chris", "@chris" or a pasted link like https://monzo.me/chris/5 ; '' = empty, null = not valid */
function parseHandle(v,site){
  v=String(v||'').trim();if(!v)return '';
  const i=v.toLowerCase().indexOf(site+'/');if(i>=0)v=v.slice(i+site.length+1).split(/[/?#\s]/)[0];
  v=v.replace(/^@/,'');return HANDLE.test(v)?v:null;
}
const digits=v=>String(v||'').replace(/\D/g,'');
const fmtSort=v=>{const d=digits(v);return d.length===6?`${d.slice(0,2)}-${d.slice(2,4)}-${d.slice(4)}`:''};
const hasPay=p=>!!(p&&p.pay&&Object.values(p.pay).some(Boolean));
const bankRef=payer=>`${S.name} ${first(pname(payer))}`.replace(/[^A-Za-z0-9 &.-]/g,'').trim().slice(0,18);   /* UK references max 18 chars */
/* the link for one service; Monzo is sterling-only, so the amount is only filled in when settling in £ */
function payLink(k,h,amt,payer){
  if(k==='monzo')return `https://monzo.me/${encodeURIComponent(h)}`+(sCc()==='£'?`/${(sAmt(amt)/100).toFixed(2)}?d=${encodeURIComponent(bankRef(payer))}`:'');
  return `https://${PAY_SITES[k]}/${encodeURIComponent(h)}`;
}
const payee=u=>u.ids.map(person).find(hasPay)||person(u.ids[0]);
const payerOf=u=>{const m=me();return u.ids.includes(m)?m:u.ids[0]};
function rowActs(f,to,amt,i){
  const m=me(),pays=m&&f.ids.includes(m),owed=m&&to.ids.includes(m);
  const done=(q='')=>`<button class="pill" data-settle="${i}" aria-label="Mark ${q?'as paid':'paid'}">${ico('i-check','i tiny')}Paid${q}</button>`;
  if(pays)return `<button class="pill pay" data-pay-i="${i}">Pay</button>`;
  if(owed)return `<a class="pill ico" data-remind href="https://wa.me/?text=${encodeURIComponent(remindText(f,to,amt))}" target="_blank" rel="noopener" aria-label="Remind on WhatsApp">${ico('i-chat','i tiny')}</a>${done()}`;
  /* a payment between other people: "Paid?" makes clear you'd only be recording it for them */
  return (!m&&hasPay(payee(to))?`<button class="pill pay" data-pay-i="${i}">Pay</button>`:'')+done(m?'?':'');
}
function payLines(p,amt,payer){
  const d=(p&&p.pay)||{},out=[];
  ['monzo','revolut','starling'].forEach(k=>{if(d[k])out.push(`${PAY_NAMES[k]}: ${payLink(k,d[k],amt,payer)}`)});
  if(d.sort&&d.acct)out.push(`Bank: ${d.bname?d.bname+', ':''}sort code ${fmtSort(d.sort)}, account ${d.acct}, reference "${bankRef(payer)}"`);
  return out;
}
function remindText(f,to,amt){
  const p=payee(to),payer=payerOf(f),us=to.ids.length>1?'us':'me';
  const lines=payLines(p,amt,payer);
  return `Hi ${uName(f)}, a reminder from ${S.name}: you owe ${us} ${smoney(amt)}.`+(lines.length?`\n\n${lines.join('\n')}`:'')+(syncOn()?`\n\n${tripLink()}`:'');
}
/* "Did you pay?" — remembered when you leave for a payment app, asked when you come back */
let pendingPay=null;
try{pendingPay=JSON.parse(localStorage.getItem('hs-pending-pay'))}catch(e){}
function setPending(v){pendingPay=v;try{v?localStorage.setItem('hs-pending-pay',JSON.stringify(v)):localStorage.removeItem('hs-pending-pay')}catch(e){}}
function checkPending(){
  const p=pendingPay;if(!p||document.hidden)return;
  if(p.trip!==S.id||now()-p.at<1500||now()-p.at>30*60e3){if(now()-p.at>30*60e3)setPending(null);return}
  setPending(null);close();
  const sc=openScrim();
  sc.innerHTML=`<div class="sheet" role="dialog" aria-label="Did you pay?">
    <div class="sh"><button type="button" class="iconbtn" data-dismiss aria-label="Close">${ico('i-down')}</button><h3>Did you pay ${esc(pname(p.to))}?</h3></div>
    <p class="askpay">${smoney(p.amt)} from ${esc(pname(p.from))} to ${esc(pname(p.to))}</p>
    <div class="foot"><button class="btn" data-dismiss>Not yet</button><button class="btn primary" id="yesPaid">Yes, mark as paid</button></div>
  </div>`;
  $('#yesPaid').onclick=()=>{close();addPayment(p.from,p.to,p.amt)};
}
/* back from the payment app: tab shown again, window focused, page restored, or the app restarted (checked at start-up) */
document.addEventListener('visibilitychange',checkPending);
window.addEventListener('focus',checkPending);
window.addEventListener('pageshow',e=>{if(e.persisted)checkPending()});
function addPayment(from,to,amt){
  const p={id:uid(),by:me()||null,type:'pay',desc:'Payment',amt,date:today(),paidBy:from,for:[to],cat:'other',...payFields(amt),u:now()};
  if(!p.cc){delete p.cc;delete p.oamt;delete p.rate}fixRate();
  S.expenses.push(p);open?.add(p.date);save();render();
  toast(`Marked as paid to ${pname(to)}`,{label:'Undo',fn:()=>{p.del=true;p.u=now();save();render();toast('Payment removed')}});
}
function openPayTo(f,to,amt){
  const p=payee(to),payer=payerOf(f),d=(p&&p.pay)||{},sterling=sCc()==='£',sm=smoney(amt);
  const sc=openScrim();
  const copyBtn=(v,label)=>`<button type="button" class="copy" data-copy="${esc(v)}" aria-label="Copy ${label}">${ico('i-copy')}</button>`;
  const hints={monzo:sterling?`Opens Monzo with ${sm} filled in`:`Opens Monzo. Monzo pays in £, so enter the £ amount`,
    revolut:`Opens Revolut. Enter ${sm}`,starling:`Pay by UK debit card. Enter ${sm}`};
  const opts=['monzo','revolut','starling'].filter(k=>d[k]).map(k=>`<a class="payopt" data-go href="${esc(payLink(k,d[k],amt,payer))}" target="_blank" rel="noopener"><span><b>${PAY_NAMES[k]}</b><small>${hints[k]}</small></span>${ico('i-chev')}</a>`).join('');
  const bank=d.sort&&d.acct?`<div class="bankbox"><b>Bank transfer</b>
      ${d.bname?`<div class="copyrow"><span><small>Name</small>${esc(d.bname)}</span>${copyBtn(d.bname,'name')}</div>`:''}
      <div class="copyrow"><span><small>Sort code</small>${fmtSort(d.sort)}</span>${copyBtn(digits(d.sort),'sort code')}</div>
      <div class="copyrow"><span><small>Account</small>${esc(d.acct)}</span>${copyBtn(d.acct,'account number')}</div>
      <div class="copyrow"><span><small>Reference</small>${esc(bankRef(payer))}</span>${copyBtn(bankRef(payer),'reference')}</div></div>`:'';
  const none=!opts&&!bank;
  const ask=`Hi ${first(p.name)}, how should I pay you the ${sm} for ${S.name}? You can add Monzo, Revolut, Starling or bank details in the app under Settings, Payment details.`;
  sc.innerHTML=`<div class="sheet" role="dialog" aria-label="Pay ${esc(p.name)}">
    <div class="sh"><button type="button" class="iconbtn" data-dismiss aria-label="Close">${ico('i-down')}</button><h3>Pay ${esc(p.name)}</h3></div>
    <div class="payamt"><span>${sm}</span>${copyBtn((sAmt(amt)/100).toFixed(2),'amount')}</div>${sx()?`<p class="payrate">${rateTxt()} · ${money(amt)}</p>`:''}
    ${none?`<p class="askpay">${esc(first(p.name))} hasn't added payment details yet.</p>
      <div class="invite"><button class="btn primary" data-paydetails="${p.id}">Add their details</button><a class="btn wa" href="https://wa.me/?text=${encodeURIComponent(ask)}" target="_blank" rel="noopener">${ico('i-chat')}Ask</a></div>`
      :`<div class="payopts">${opts}</div>${bank}`}
    <button class="btn primary" id="iPaid">I've paid</button>
  </div>`;
  sc.onclick=e=>{
    if(e.target===sc)return close();
    if(e.target.closest('[data-go]'))setPending({trip:S.id,from:payer,to:p.id,amt,at:now()});
    const c=e.target.closest('[data-copy]');
    if(c){copy(c.dataset.copy,'Copied');if(bank)setPending({trip:S.id,from:payer,to:p.id,amt,at:now()})}
    if(e.target.closest('#iPaid')){setPending(null);close();addPayment(payer,p.id,amt)}
  };
}
/* person menu: this is me, payment details, couple, remove */
function openPerson(id){
  const p=person(id),q=partner(id),m=me(),sc=openScrim();
  const singles=people().filter(x=>x.id!==id&&!partner(x.id));
  const inUse=expenses().filter(x=>x.paidBy===id||x.for.includes(id)).length;
  sc.innerHTML=`<div class="sheet" role="dialog" aria-label="${esc(p.name)}">
    <div class="sh"><button type="button" class="iconbtn" data-dismiss aria-label="Close">${ico('i-down')}</button><h3>${esc(p.name)}</h3>${av(id,'lg')}</div>
    <div class="set">
      ${id===m?'<div><label>This is you<small>Shown as “You” on this phone</small></label></div>':`<div><label>This is me<small>See what you owe and are owed</small></label><button class="btn primary" data-me="${id}">Set</button></div>`}
      <div><label>Payment details<small>${hasPay(p)?'Added':'How the group can pay '+esc(first(p.name))}</small></label><button class="btn" data-paydetails="${id}">${hasPay(p)?'Edit':'Add'}</button></div>
      ${q?`<div><label>Couple with ${esc(pname(q))}<small>Settle up as one</small></label><button class="btn" id="punpair">Unpair</button></div>
        <div><label for="pjoint">Joint account<small>Shared money: shown together and never owe each other</small></label><input id="pjoint" class="sw" type="checkbox" role="switch" ${isJoint(id)?'checked':''}></div>`
        :singles.length?`<div class="col"><label>Pair as a couple<small>Tap their partner. Couples settle up as one.</small></label>${`<div class="pick">${singles.map(x=>`<button type="button" class="pa" data-pairto="${x.id}" aria-label="${esc(x.name)}">${av(x.id,'lg')}<span class="pn">${esc(first(x.name))}</span></button>`).join('')}</div>`}</div>`:''}
    </div>
    <button class="btn danger" id="prm">${inUse?`In ${inUse} expense${inUse>1?'s':''}, so it can't be removed`:'Remove from trip'}</button>
  </div>`;
  if(inUse)$('#prm').disabled=true;
  if($('#pjoint'))$('#pjoint').onchange=e=>{const b=person(q),on=e.target.checked;
    if(on){p.joint=b.joint=true}else{delete p.joint;delete b.joint}p.u=b.u=now();save();render();
    toast(on?`${first(p.name)} & ${first(b.name)}: joint account`:`${first(p.name)} & ${first(b.name)}: separate money`)};
  sc.onclick=e=>{
    if(e.target===sc)return close();
    const sm=e.target.closest('[data-me]');if(sm){setMe(sm.dataset.me);close();render();toast(`You're ${first(p.name)} on this phone`);return}
    const pt=e.target.closest('[data-pairto]');
    if(pt){const b=person(pt.dataset.pairto);p.pair=b.id;b.pair=p.id;p.u=b.u=now();save();close();render();toast(`${p.name} & ${b.name} paired`);return}
    if(e.target.closest('#punpair')){const b=person(q);delete p.pair;delete b.pair;delete p.joint;delete b.joint;p.u=b.u=now();save();close();render();return}
    const rm=e.target.closest('#prm');
    if(rm&&!inUse){if(!rm.dataset.armed){rm.dataset.armed=1;rm.textContent=`Tap again to remove ${first(p.name)}`;return}
      p.del=true;p.u=now();save();close();render();toast(`Removed ${p.name}`,{label:'Undo',fn:()=>{p.del=false;p.u=now();save();render()}})}
  };
}
function openPayDetails(id){
  const p=person(id),d=p.pay||{},sc=openScrim();
  sc.innerHTML=`<form class="sheet" id="pdform" role="dialog" aria-label="Payment details">
    <div class="sh"><button type="button" class="iconbtn" data-dismiss aria-label="Close">${ico('i-down')}</button><h3>Payment details</h3></div>
    ${pickRow('pdp',id)}
    <p class="hint" style="text-align:left;margin:0">${S.key?'Only people with this trip\'s link can see these.':'This trip isn\'t encrypted. Encrypt it in Settings before adding bank details.'} Add any you use.</p>
    <label class="f2">Monzo<input id="pd_monzo" class="field" placeholder="monzo.me/yourname" value="${esc(d.monzo||'')}" autocomplete="off" autocapitalize="off"></label>
    <label class="f2">Revolut<input id="pd_revolut" class="field" placeholder="revolut.me/yourname" value="${esc(d.revolut||'')}" autocomplete="off" autocapitalize="off"></label>
    <label class="f2">Starling Settle Up<input id="pd_starling" class="field" placeholder="settleup.starlingbank.com/yourname" value="${esc(d.starling||'')}" autocomplete="off" autocapitalize="off"></label>
    <label class="f2">Name on bank account<input id="pd_bname" class="field" value="${esc(d.bname||'')}" autocomplete="off"></label>
    <div class="two2"><label class="f2">Sort code<input id="pd_sort" class="field" inputmode="numeric" placeholder="12-34-56" value="${esc(fmtSort(d.sort)||d.sort||'')}" autocomplete="off"></label>
      <label class="f2">Account number<input id="pd_acct" class="field" inputmode="numeric" placeholder="12345678" value="${esc(d.acct||'')}" autocomplete="off"></label></div>
    <p class="msg" id="pdmsg"></p>
    <button class="btn primary">Save</button>
  </form>`;
  sc.onclick=e=>{if(e.target===sc)return close();const s=e.target.closest('[data-pdp]');if(s&&s.dataset.pdp!==id)openPayDetails(s.dataset.pdp)};
  $('#pdform').onsubmit=e=>{e.preventDefault();
    const out={},err=m=>{$('#pdmsg').textContent=m;return false};
    for(const k of ['monzo','revolut','starling']){const v=parseHandle($('#pd_'+k).value,PAY_SITES[k]);if(v===null)return err(`That ${PAY_NAMES[k]} name doesn't look right. Paste your ${PAY_SITES[k]} link or just the name.`);if(v)out[k]=v}
    const sort=digits($('#pd_sort').value),acct=digits($('#pd_acct').value),bname=$('#pd_bname').value.trim();
    if(sort||acct){if(sort.length!==6)return err('A sort code has 6 digits.');if(acct.length!==8)return err('A UK account number has 8 digits.');out.sort=sort;out.acct=acct}
    if(bname)out.bname=bname.slice(0,60);
    p.pay=out;p.u=now();save();close();render();toast(hasPay(p)?`Saved ${first(p.name)}'s payment details`:'Payment details cleared');
  };
}

