/* ---- Trips: switch, create, join by link ---- */
function switchTo(t){const l=prefs.trips.find(x=>x.id===t.id);if(l)l.local=null;S=fix(t);open=null;tab='exp';persist();render();setNet(syncOn()?'sync':'off');sync()}
/* ---- Reset invite link: copy the trip to a new ID, then the server turns the old ID off ---- */
function retargetPhotos(from,to){
  const keys=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith(PH))keys.push(k)}
  keys.forEach(k=>{try{const x=JSON.parse(localStorage.getItem(k));if(x.t===from){x.t=to;localStorage.setItem(k,JSON.stringify(x))}}catch(e){}});
}
/* bring a superseded local copy into the open trip: anything newer or missing wins, then forget the old copy */
function adopt(old){
  let n=0;
  ['people','expenses'].forEach(k=>(old[k]||[]).forEach(x=>{const l=S[k].find(y=>y.id===x.id);
    if(!l){S[k].push(x);n++}else if((x.u||0)>(l.u||0)){Object.assign(l,x);n++}}));
  prefs.me=prefs.me||{};if(prefs.me[old.id]&&!prefs.me[S.id])prefs.me[S.id]=prefs.me[old.id];delete prefs.me[old.id];
  retargetPhotos(old.id,S.id);
  try{localStorage.removeItem(TK(old.id))}catch(e){}
  prefs.trips=prefs.trips.filter(t=>t.id!==old.id);
  fix(S);if(n)save();else persist();render();
}
/* straight after a reset: send the new link to the group in one tap (WhatsApp or copy), while it's on your mind */
function openNewLink(encrypted){
  const msg=`${encrypted?`*${S.name}* on Holiday Split is now encrypted.`:`New link for *${S.name}* on Holiday Split (the old one no longer works).`} Use this one:\n${tripLink()}`;
  const sc=openScrim();
  sc.innerHTML=`<div class="sheet" role="dialog" aria-label="New link ready">
    <div class="sh"><button class="iconbtn" data-dismiss aria-label="Close">${ico('i-down')}</button><h3>New link ready</h3></div>
    <p class="newlink">${encrypted?'The trip is encrypted.':'The old link no longer works.'} Send the new one to the group so they can keep syncing. Their changes carry over when they open it.</p>
    <div class="invite"><a class="btn wa" id="nlWa" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">${ico('i-chat')}WhatsApp</a><button class="btn primary" id="nlCopy">${ico('i-copy')}Copy link</button></div>
    <button class="btn" data-dismiss>Done</button>
  </div>`;
  sc.onclick=e=>{
    if(e.target===sc)return close();
    if(e.target.closest('#nlCopy'))copy(tripLink(),'Link copied');
    if(e.target.closest('#nlWa'))setTimeout(close,300);
  };
}
async function resetLink(){
  if(!syncOn())return toast('This needs a connection');
  const before=S,from=S.id,hdr={'content-type':'application/json'};
  const t={...tripOut(S),id:newId(),prev:from,key:randKey(),pk:S.pk||randKey(),rev:0};
  try{
    let r=await fetch(api(t.id),{method:'PUT',headers:hdr,body:JSON.stringify(await encTrip(t))});
    if(!r.ok)throw 0;
    r=await fetch(api(from)+'/move',{method:'POST',headers:hdr,body:JSON.stringify({to:t.id})});
    if(!r.ok)throw 0;
    S=await decTrip(await r.json(),t.key);adopt(before);
    tab='ppl';render();openNewLink(!before.key);
  }catch(e){S=before;toast('Couldn\'t do that. Check your connection and try again.')}
}
