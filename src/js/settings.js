function openSettings(){
  const sc=openScrim();
  const status=!syncAvail?'Sync works in the hosted app only':S.sample?'The example trip isn\'t synced':({ok:'Synced',sync:'Syncing…',offline:'Offline. Changes sync when you\'re back online.'}[$('#cloud').dataset.s]||'')+(S.key?' · encrypted':'');
  const live=prefs.trips.filter(t=>!goneAt(t)),gone=prefs.trips.filter(t=>goneAt(t));
  const trips=live.map(t=>`<button class="trip" data-trip="${esc(t.id)}"><span>${esc(t.id===S.id?S.name:t.name)}</span>${t.id===S.id?ico('i-check'):''}</button>`).join('')+(S.del?`<button class="trip" data-trip="${esc(S.id)}"><span>${esc(S.name)} (deleted)</span>${ico('i-check')}</button>`:'');
  const deleted=gone.map(t=>`<div><label>${esc(t.name)}<small>${t.del?'Deleted for everyone':'Removed from this phone'} · ${daysLeft(t)} day${daysLeft(t)===1?'':'s'} left</small></label><span class="acts2"><button class="btn primary" data-restore="${esc(t.id)}">Restore</button><button class="btn danger" data-erase="${esc(t.id)}" aria-label="Delete ${esc(t.name)} permanently">Delete</button></span></div>`).join('');
  sc.innerHTML=`<div class="sheet" role="dialog" aria-label="Settings">
    <div class="sh"><button class="iconbtn" id="sclose" aria-label="Close">${ico('i-down')}</button><h3>Settings</h3></div>
    ${people().length?`<div class="set"><div class="col"><label>You are<small>Shows what you owe and are owed on this phone</small></label>${pickRow('me',me())}</div></div>`:''}
    <div class="set">
      <div><label for="scur">Trip currency</label><input id="scur" class="field cur" type="text" maxlength="3" value="${esc(S.cur)}"></div>
      ${scanAvail?`<div><label for="sscan">Read receipt photos<small>Fills in total, date and type from a receipt photo. Read by the app's Cloudflare AI, not stored.</small></label><input id="sscan" class="sw" type="checkbox" role="switch" ${prefs.scan!==false?'checked':''}></div>`:''}
      <div><label for="ssync">Sync with group<small class="status">${status}</small></label><input id="ssync" class="sw" type="checkbox" role="switch" ${prefs.sync?'checked':''} ${syncAvail?'':'disabled'}></div>
    </div>
    ${people().length?`<div class="set"><div><label>Payment details<small>How the group pays you: Monzo, Revolut, Starling or bank</small></label><button class="btn primary" data-paydetails="${me()||people()[0].id}">Edit</button></div></div>`:''}
    <div class="set"><div class="col"><label for="simp">Import expenses<small>Paste import text into this trip</small></label>
      <textarea id="simp" class="field" rows="3" placeholder="Paste here" autocomplete="off"></textarea>
      <button class="btn primary" id="simpgo">Import</button></div></div>
    <h2 style="margin:4px 4px -6px">Trips</h2>
    <div class="set">${trips}<button class="trip newt" id="snew">${ico('i-plus')}New trip</button></div>
    ${deleted?`<h2 style="margin:4px 4px -6px">Recently deleted</h2><div class="set">${deleted}</div>`:''}
    <div class="set">
      <div><label>Help<small>How everything works</small></label><button class="btn" id="shelp">Open</button></div>
      <div><label>What's new<small>${esc(NEWS[0].head)}</small></label><button class="btn" id="snews">See</button></div>
    </div>
    <h2 style="margin:4px 4px -6px">Link and deleting</h2>
    <div class="set">
      ${syncOn()?(S.key?`<div><label>Reset invite link<small>If the link has gone to the wrong people. Everyone gets a new link.</small></label><button class="btn danger" id="sreset">Reset…</button></div>`
        :`<div><label>Encrypt this trip<small>So only people with the link can read it. Everyone gets a new link.</small></label><button class="btn" id="sreset">Encrypt…</button></div>`):''}
      <div><label>Delete this trip<small>From this phone or for everyone. It can be restored for 30 days.</small></label><button class="btn danger" id="sdel">Delete…</button></div>
    </div>
    <p class="about">Holiday Split · <a href="${REPO}" target="_blank" rel="noopener">Open source on GitHub</a><br>Updated ${new Date(LATEST+'T12:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</p>
  </div>`;
  sc.onclick=e=>{
    if(e.target===sc||e.target.closest('#sclose'))return close();
    const tr=e.target.closest('[data-trip]');
    if(tr){close();const id=tr.dataset.trip;if(id!==S.id){const t=loadTrip(id);t?switchTo(t):join(id)}return}
    if(e.target.closest('#snew')){close();newTrip()}
    if(e.target.closest('#sdel')){openDelete();return}
    if(e.target.closest('#shelp')){close();setTimeout(openHelp,0);return}
    if(e.target.closest('#snews')){close();setTimeout(openNews,0);return}
    const rr=e.target.closest('[data-restore]');if(rr){close();restoreTrip(rr.dataset.restore);return}
    const er=e.target.closest('[data-erase]');if(er){openErase(er.dataset.erase);return}
    if(e.target.closest('#sreset')){openReset();return}
    if(e.target.closest('#simpgo')){const t=$('#simp').value;if(importData(t))close()}
  };
  $('#scur').onchange=e=>{S.cur=e.target.value.trim()||'£';S.nu=now();save();render()};
  if($('#sscan'))$('#sscan').onchange=e=>{prefs.scan=e.target.checked;savePrefs()};
  $('#ssync').onchange=e=>{prefs.sync=e.target.checked;savePrefs();setNet(syncOn()?'sync':'off');render();sync()};
}
/* Reset (or first encrypt) the invite link: its own screen, so it can't be tapped by accident */
function openReset(){
  const enc=!!S.key,sc=openScrim();
  sc.innerHTML=`<div class="sheet" role="dialog" aria-label="${enc?'Reset invite link':'Encrypt trip'}">
    <div class="sh"><button class="iconbtn" id="rclose" aria-label="Cancel">${ico('i-down')}</button><h3>${enc?'Reset the invite link?':'Encrypt this trip?'}</h3></div>
    <div class="warnbox">${enc
      ?'<b>The current link stops working.</b><span>Anyone using it, including your group, is cut off until they open the new link. Nothing in the trip is lost: expenses, payments and photos all carry over.</span><span>Use this if the link was shared with people who shouldn\'t have it.</span>'
      :'<b>Everyone gets a new link.</b><span>The trip is encrypted on your phone, so only people with the new link can read it. Nothing in the trip is lost. Share the new link with the group afterwards.</span>'}</div>
    <div class="foot"><button class="btn" id="rcancel">Cancel</button><button class="btn ${enc?'danger':'primary'}" id="rgo">${enc?'Reset link':'Encrypt'}</button></div>
  </div>`;
  sc.onclick=e=>{
    if(e.target===sc||e.target.closest('#rclose')||e.target.closest('#rcancel'))return close();
    if(e.target.closest('#rgo')){close();resetLink()}
  };
}
/* Import: {"people":[names],"expenses":[[id,date,desc,amount,payerName,cat?,[forNames]?]]}.
   People match by name; missing people are added. No "for" list = split between everyone. Same id = skipped, so re-importing is safe. */
function importData(txt){
  let d;
  try{d=JSON.parse(txt.slice(txt.indexOf('{'),txt.lastIndexOf('}')+1))}catch(e){}
  if(!d||!Array.isArray(d.expenses)){toast('That isn\'t import text');return false}
  if(S.sample){S=blank();open=null;snapReset()}
  const find=n=>people().find(p=>p.name.trim().toLowerCase()===String(n).trim().toLowerCase());
  const ensure=n=>find(n)||(S.people.push({id:uid(),name:String(n).trim(),c:nextColor(),u:now()}),find(n));
  (d.people||[]).forEach(ensure);
  if(d.cur&&!expenses().length){S.cur=d.cur;S.nu=now()}
  let added=0;
  d.expenses.forEach(([id,date,desc,amt,payer,cat,forNames])=>{
    id=String(id);if(S.expenses.some(e=>e.id===id)||!(amt>0))return;
    const f=Array.isArray(forNames)&&forNames.length?forNames.map(n=>ensure(n).id):people().map(p=>p.id);
    S.expenses.push({id,desc:String(desc),amt:Math.round(amt*100),date:date||today(),paidBy:ensure(payer).id,for:f,cat:CATS.includes(cat)?cat:guessCat(desc),u:now()});
    added++;
  });
  save();tab='exp';open=null;render();
  toast(added?`Imported ${added} expense${added>1?'s':''}`:'Nothing new to import');
  return true;
}
