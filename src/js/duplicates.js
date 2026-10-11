/* ---- Duplicates: the amount must match (to the cent, or the same foreign amount), and then
   - the same shop name within 2 days, or
   - the same day, when the names don't clash and the type matches (e.g. "Groceries" vs "Eurospin").
   Different shop names, different types or different amounts are never flagged.
   "Not a duplicate" is remembered on the expense (notdup) and syncs, so nobody is asked twice. */
const DUP_GENERIC=new Set(['dinner','lunch','breakfast','brunch','coffee','coffees','drinks','food','groceries','supermarket','expense','restaurant','cafe','taxi','ticket','tickets','shop','shopping','snacks','pizza','gelato','payment','with','from','the','and','for']);
const normTxt=t=>String(t||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const shopWords=t=>normTxt(t).split(' ').filter(w=>w.length>=4&&!DUP_GENERIC.has(w)&&!/^\d+$/.test(w));
const dayGap=(a,b)=>Math.abs(new Date(a+'T12:00')-new Date(b+'T12:00'))/864e5;
const sameAmount=(a,b)=>a.amt===b.amt||(!!a.cc&&a.cc===b.cc&&a.oamt===b.oamt);
const dupCat=e=>e.cat&&e.cat!=='other'?e.cat:(matchCat(e.desc||'')||null);
/* why two expenses look like duplicates, or '' if they don't */
function dupReason(a,b){
  if(!a||!b||a.id===b.id||a.del||b.del||isPay(a)||isPay(b))return '';
  if((a.notdup||[]).includes(b.id)||(b.notdup||[]).includes(a.id))return '';
  if(!sameAmount(a,b))return '';
  const gap=dayGap(a.date,b.date);if(gap>2)return '';
  const wa=shopWords(a.desc),wb=shopWords(b.desc);
  if(wa.length&&wb.length)return wa.some(w=>wb.includes(w))?'Same amount and shop':'';
  if(gap!==0)return '';
  const ca=dupCat(a),cb=dupCat(b);
  if(ca&&cb&&ca!==cb)return '';
  if(!wa.length&&!wb.length&&normTxt(a.desc)!==normTxt(b.desc)&&!(ca&&ca===cb))return '';
  return 'Same amount, same day';
}
const findDups=c=>expenses().filter(e=>dupReason(c,e)).map(e=>({e,why:dupReason(c,e)}));
function dupPairs(){
  const E=expenses().filter(e=>!isPay(e)),out=[];
  for(let i=0;i<E.length;i++)for(let j=i+1;j<E.length;j++){const why=dupReason(E[i],E[j]);if(why)out.push({a:E[i],b:E[j],why})}
  return out;
}
const dupLine=e=>`<b>${esc(e.desc)}</b> ${money(e.amt)} · ${esc(fmtDate(e.date))} · ${e.paidBy===me()?'you paid':esc(first(pname(e.paidBy)))+' paid'}`;
function openDupReview(){
  const pairs=dupPairs(),sc=openScrim();
  if(!pairs.length){close();return toast('No possible duplicates')}
  sc.innerHTML=`<div class="sheet" role="dialog" aria-label="Possible duplicates">
    <div class="sh"><button type="button" class="iconbtn" data-dismiss aria-label="Close">${ico('i-down')}</button><h3>Possible duplicates</h3></div>
    ${pairs.map((p,i)=>`<div class="duppair"><div class="dupwhy">${esc(p.why)}</div>
      ${[p.a,p.b].map(e=>`<div class="dupone"><span class="ic" style="background:${CAT_COL[e.cat]}">${ico('c-'+e.cat)}</span><span class="main"><div class="t">${esc(e.desc)}</div><div class="who">${money(e.amt)} · ${esc(fmtDate(e.date))} · ${e.paidBy===me()?'You':esc(first(pname(e.paidBy)))} paid${e.photo?' · receipt':''}</div></span><button class="pill" data-dupdel="${e.id}">Delete</button></div>`).join('')}
      <button class="btn" data-notdup="${i}">Not duplicates</button></div>`).join('')}
  </div>`;
  sc.onclick=e=>{
    if(e.target===sc)return close();
    const nd=e.target.closest('[data-notdup]');
    if(nd){const p=pairs[+nd.dataset.notdup],keep=p.a.u>=p.b.u?p.a:p.b,other=keep===p.a?p.b:p.a;
      keep.notdup=[...(keep.notdup||[]),other.id];keep.u=now();save();render();dupPairs().length?openDupReview():close();return}
    const dd=e.target.closest('[data-dupdel]');
    if(dd){const x=S.expenses.find(y=>y.id===dd.dataset.dupdel);close();removeExp(x)}
  };
}
const lastRate=cc=>{const e=S.expenses.filter(x=>!x.del&&x.cc===cc&&x.rate).sort((a,b)=>b.u-a.u)[0];return e?e.rate:((prefs.rates||{})[cc]||'')};

