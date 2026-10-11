/* settle-up currency sheet: pick a currency; the live rate is filled in, or type your own */
function openSettleCur(){
  const cur=sx(),sc=openScrim(),list=[S.cur,...CCS.filter(c=>c!==S.cur)];
  const st=cur?{...cur}:{cc:S.cur,rate:null,mode:'live'};
  const live=c=>!!(ISO[S.cur]&&ISO[c]);
  sc.innerHTML=`<form class="sheet" id="sxform" role="dialog" aria-label="Settle up currency">
    <div class="sh"><button type="button" class="iconbtn" data-dismiss aria-label="Close">${ico('i-down')}</button><h3>Settle up in</h3></div>
    <p class="rateinfo" style="margin-top:0">Expenses stay in ${esc(S.cur)}. Who pays who, payment links and reminders use the currency you pick.</p>
    <div class="ccpick" id="ccPick"></div>
    <div id="sxRateBox" hidden><div class="lbl"><span>Rate</span></div>
      <div class="ratebox"><b id="sxPre"></b><input id="sxrate" class="field" inputmode="decimal" autocomplete="off" aria-label="Exchange rate"></div>
      <p class="rateinfo" id="sxInfo"></p>
      <button type="button" class="btn" id="sxLive" hidden>Use today's rate</button></div>
    <p class="msg" id="sxmsg"></p>
    <div class="foot"><button class="btn primary">Save</button></div>
  </form>`;
  const draw=(msg)=>{
    const other=st.cc!==S.cur;
    $('#ccPick').innerHTML=list.map(c=>`<button type="button" class="ccopt" data-sxcc="${esc(c)}" aria-pressed="${st.cc===c}">${esc(c)}</button>`).join('');
    $('#sxRateBox').hidden=!other;if(!other)return;
    $('#sxPre').textContent=`${S.cur}1 = ${st.cc}`;
    if(document.activeElement!==$('#sxrate'))$('#sxrate').value=st.rate>0?String(+(+st.rate).toFixed(6)):'';
    $('#sxInfo').innerHTML=msg?esc(msg):(!live(st.cc)?'There\'s no live rate for this currency. Enter the rate yourself.'
      :st.mode==='manual'?'Your rate. It stays as you set it.'
      :st.fixed?`Live rate, fixed on ${shortDate(st.fixed)} when the first payment was recorded.`
      :st.rate?`Live rate from <a href="https://frankfurter.dev/" target="_blank" rel="noopener">Frankfurter</a> (central-bank rates)${st.date?', '+shortDate(st.date):''}. Updates daily until the first payment is recorded, then stays fixed.`:'');
    $('#sxLive').hidden=!(live(st.cc)&&(st.mode==='manual'||st.fixed||!st.rate));
  };
  const getLive=async()=>{
    draw('Getting today\'s rate…');
    const j=await fetchRate(st.cc);if(!$('#sxform'))return;
    if(j){Object.assign(st,{rate:j.rate,mode:'live',date:j.date,day:today()});delete st.fixed;draw()}
    else{st.mode='manual';if(!(st.rate>0)&&prefs.rates&&prefs.rates[st.cc])st.rate=+(1/prefs.rates[st.cc]).toFixed(4);
      draw('Couldn\'t get today\'s rate (no signal?). Enter it yourself, or try again later.')}
  };
  draw();
  sc.onclick=e=>{
    if(e.target===sc)return close();
    const b=e.target.closest('[data-sxcc]');
    if(b){const c=b.dataset.sxcc;if(c===st.cc)return;st.cc=c;st.rate=null;delete st.fixed;$('#sxmsg').textContent='';
      if(c!==S.cur&&live(c))getLive();else{st.mode=c===S.cur?'live':'manual';draw()}return}
    if(e.target.closest('#sxLive'))getLive();
  };
  $('#sxrate').oninput=e=>{st.rate=parseFloat(String(e.target.value).replace(',','.'))||null;st.mode='manual';delete st.fixed;draw()};
  $('#sxform').onsubmit=e=>{e.preventDefault();
    if(st.cc===S.cur){if(S.sx){S.sx=null;S.sxu=now();save()}close();render();return toast(`Settling up in ${S.cur}`)}
    if(!(st.rate>0))return $('#sxmsg').textContent='Enter the rate.';
    const nx={cc:st.cc,rate:+st.rate,mode:st.mode,date:st.date||today(),day:st.day||today()};if(st.fixed)nx.fixed=st.fixed;
    S.sx=nx;S.sxu=now();save();close();render();toast(`Settling up in ${st.cc} at ${rateTxt()}`);
  };
}
/* ---- Payments: recorded as an expense of type "pay" (from paid, to's share = amount) so balances just work ---- */
function openPay(ex,pre){
  const P=people(),isNew=!ex;
  const f={from:ex?.paidBy||pre?.from||me()||P[0].id};
  f.to=ex?.for[0]||pre?.to||(P.find(p=>p.id!==f.from)||P[0]).id;
  const sc=openScrim();
  const draw=()=>{
    $('#fromChips').innerHTML=pickRow('pfrom',f.from);$('#toChips').innerHTML=pickRow('pto',f.to);
    $('#fromName').textContent=pname(f.from);$('#toName').textContent=pname(f.to);
  };
  sc.innerHTML=`<form class="sheet" id="pform2" role="dialog" aria-label="${isNew?'Record':'Edit'} payment">
    <div class="sh"><button type="button" class="iconbtn" data-dismiss aria-label="Close">${ico('i-down')}</button><h3>${isNew?'Record payment':'Edit payment'}</h3></div>
    <input id="pamt" class="field big" inputmode="decimal" placeholder="${esc(sCc())}0.00" value="${ex?((ex.cc&&ex.cc===sCc()?ex.oamt:sAmt(ex.amt))/100).toFixed(2):pre?(sAmt(pre.amt)/100).toFixed(2):''}" autocomplete="off" aria-label="Amount">
    ${sx()?`<p class="payrate">In ${esc(sCc())} at ${esc(rateTxt())}</p>`:''}
    <div class="daterow"><label for="pdate">Date</label><input id="pdate" type="date" value="${ex?.date||today()}"></div>
    <div class="lbl"><span>From<em id="fromName"></em></span></div><div id="fromChips"></div>
    <div class="lbl"><span>To<em id="toName"></em></span></div><div id="toChips"></div>
    <p class="msg" id="pmsg2"></p>
    <div class="foot">${isNew?'':'<button type="button" class="btn danger" id="pdel">Delete</button>'}<button class="btn primary">${isNew?'Record payment':'Save'}</button></div>
    ${ex?.by?`<p class="by">Added by ${esc(pname(ex.by))}</p>`:''}
  </form>`;
  draw();
  sc.onclick=e=>{
    if(e.target===sc)return close();
    const fr=e.target.closest('[data-pfrom]');if(fr){f.from=fr.dataset.pfrom;draw();return}
    const to=e.target.closest('[data-pto]');if(to){f.to=to.dataset.pto;draw();return}
    if(e.target.id==='pdel'){close();removeExp(ex)}
  };
  $('#pform2').onsubmit=e=>{e.preventDefault();
    const a=toPence($('#pamt').value);
    if(!(a>0))return $('#pmsg2').textContent='Enter an amount.';
    if(f.from===f.to)return $('#pmsg2').textContent='Pick two different people.';
    /* typed in the settle currency; the suggested amount maps back to its exact trip amount so the balance clears */
    const tripAmt=pre&&a===sAmt(pre.amt)?pre.amt:ex&&ex.cc===sCc()&&a===ex.oamt?ex.amt:fromS(a);
    const rec={type:'pay',desc:'Payment',amt:tripAmt,date:$('#pdate').value||today(),paidBy:f.from,for:[f.to],cat:'other',...payFields(tripAmt,sx()?a:null),u:now()};
    if(isNew)fixRate();
    const p=isNew?{id:uid(),by:me()||null,...rec}:Object.assign(ex,rec);if(isNew)S.expenses.push(p);
    open?.add(rec.date);save();close();render();
    toast(isNew?'Payment recorded':'Saved',isNew?{label:'Undo',fn:()=>{p.del=true;p.u=now();save();render();toast('Payment removed')}}:null);
  };
}

