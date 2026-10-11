/* ---- Delete & restore ---- */
const waitIdle=async()=>{for(let i=0;i<100&&syncing;i++)await new Promise(r=>setTimeout(r,50))};
function leaveTo(){const t=firstLive();switchTo(t?loadTrip(t.id):fix(sample()))}
async function deleteForEveryone(){
  if(!syncOn())return toast('Deleting for everyone needs a connection');
  const trip=S;
  trip.del=now();trip.delBy=me()||null;trip.du=now();save();
  await waitIdle();await sync();
  if(S!==trip||trip.dirty){trip.del=null;trip.delBy=null;trip.du=now();save();render();return toast('Couldn\'t delete. Check your connection and try again.')}
  const id=trip.id;leaveTo();
  toast(`Deleted ${trip.name}`,{label:'Undo',fn:()=>restoreTrip(id)});
}
function removeFromPhone(){
  const trip=S,l=prefs.trips.find(t=>t.id===trip.id);
  if(trip.sample){S=fix(sample());S.id='sample';persist();render();return toast('Example trip reset')}
  if(l){l.local=now();savePrefs()}
  leaveTo();
  toast(`Removed ${trip.name} from this phone`,{label:'Undo',fn:()=>restoreTrip(trip.id)});
}
function restoreTrip(id){
  const l=prefs.trips.find(t=>t.id===id),t=loadTrip(id);
  if(!t)return toast('That trip is no longer on this phone');
  if(l)l.local=null;
  switchTo(t);
  if(S.del){S.del=null;S.delBy=null;S.du=now();save()}
  render();toast(`Restored ${S.name}`);
}
/* ---- Delete permanently: no restore. Typing DELETE is required ---- */
function eraseLocal(id){
  try{localStorage.removeItem(TK(id))}catch(e){}
  const keys=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith(PH))keys.push(k)}
  keys.forEach(k=>{try{if(JSON.parse(localStorage.getItem(k)).t===id)localStorage.removeItem(k)}catch(e){}});
  prefs.trips=prefs.trips.filter(t=>t.id!==id);if(prefs.me)delete prefs.me[id];
  if(pendingPay&&pendingPay.trip===id)setPending(null);
  savePrefs();
  if(S.id===id)leaveTo();else render();
}
async function eraseTrip(id){
  const t=loadTrip(id),name=(t&&t.name)||'Trip',forAll=!!(t&&t.del);
  if(forAll){
    await ready;
    if(!syncAvail)return toast('Deleting permanently needs a connection');
    let r;try{r=await fetch(api(id),{method:'DELETE'})}catch(e){return toast('No connection. Try again.')}
    if(r.status===409)return toast(`Someone restored ${name}, so it wasn't deleted`);
    if(!(r.ok||r.status===404||r.status===410))return toast('Couldn\'t delete. Try again.');
  }
  eraseLocal(id);toast(`${name} permanently deleted`);
}
function openErase(id){
  const t=loadTrip(id),l=prefs.trips.find(x=>x.id===id),name=(t&&t.name)||(l&&l.name)||'this trip',forAll=!!(t&&t.del);
  const sc=openScrim();
  sc.innerHTML=`<form class="sheet" id="eraseform" role="dialog" aria-label="Delete permanently">
    <div class="sh"><button type="button" class="iconbtn" data-dismiss aria-label="Cancel">${ico('i-down')}</button><h3>Delete permanently?</h3></div>
    <div class="warnbox"><b>“${esc(name)}” will be gone for good.</b>
      <span>${forAll?'This erases the trip and its receipt photos for everyone in the group, straight away. It can\'t be restored.'
        :'This removes it from this phone for good. The group\'s copy isn\'t affected; you\'d need the invite link to get it back.'}</span></div>
    <label class="f2" for="erasebox">Type DELETE to confirm<input id="erasebox" class="field" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>
    <button class="btn danger solid" id="erasego" disabled>Delete permanently</button>
    <button type="button" class="btn" data-dismiss>Cancel</button>
  </form>`;
  const ok=()=>$('#erasebox').value.trim().toLowerCase()==='delete';
  $('#erasebox').oninput=()=>{$('#erasego').disabled=!ok()};
  sc.onclick=e=>{if(e.target===sc)close()};
  $('#eraseform').onsubmit=e=>{e.preventDefault();if(!ok())return;close();eraseTrip(id)};
  setTimeout(()=>$('#erasebox')?.focus(),80);
}
function openDelete(){
  const sc=openScrim();
  const shared=!S.sample&&syncOn();
  sc.innerHTML=`<div class="sheet" role="dialog" aria-label="Delete trip">
    <div class="sh"><button class="iconbtn" id="dclose" aria-label="Cancel">${ico('i-down')}</button><h3>Delete “${esc(S.name)}”?</h3></div>
    <div class="set">
      <div class="col"><label>Remove from this phone<small>${shared?'The group keeps it. ':''}You can restore it from Settings for 30 days${shared?', or open the invite link again':''}.</small></label>
        <button class="btn" id="dlocal">Remove from this phone</button></div>
      ${shared?`<div class="col"><label>Delete for everyone<small>Removes it from every phone in the group. Anyone can restore it from the trip or from Settings for 30 days, after which it's gone for good.</small></label>
        <button class="btn danger" id="dall">Delete for everyone</button></div>`:''}
    </div>
    <button class="btn" id="dcancel">Cancel</button>
  </div>`;
  sc.onclick=e=>{
    if(e.target===sc||e.target.closest('#dclose')||e.target.closest('#dcancel'))return close();
    if(e.target.closest('#dlocal')){close();removeFromPhone();return}
    const da=e.target.closest('#dall');
    if(da){if(!da.dataset.armed){da.dataset.armed=1;da.textContent='Tap again to delete for everyone';return}close();deleteForEveryone()}
  };
}
$('#restoreBtn').onclick=()=>restoreTrip(S.id);
function newTrip(){switchTo(blank());tab='ppl';render();setTimeout(()=>$('#pname')?.focus(),50)}
const tripLink=()=>location.origin+location.pathname+'#'+S.id+(S.key?'.'+S.key:'');
async function join(id,key){
  if(id===S.id&&(!key||S.key===key))return;
  const cached=loadTrip(id);if(cached&&(!key||cached.key===key))return switchTo(cached);
  await ready;
  if(!syncAvail)return toast('Open this link in the hosted app');
  try{
    const r=await fetch(api(id),{cache:'no-store'});
    if(r.status===404||r.status===410)return toast('Trip not found. The link may have been reset.');
    if(!r.ok)throw 0;
    const env=await r.json();let t;
    if(env.v===2){
      if(!key)return toast('This link is missing its key. Ask for the full link.');
      try{t=await decTrip(env,key)}catch(e){return toast('This link\'s key doesn\'t match the trip.')}
    }else t=env;
    const old=t.prev&&loadTrip(t.prev);
    switchTo(t);
    if(old){adopt(old);toast(`${S.name} is syncing again`)}else toast(`Joined ${S.name}`);
  }catch(e){toast('No connection. Try the link again.')}
}
function checkHash(){
  const m=location.hash.slice(1).match(/^([a-z0-9]{12,40})(?:\.([A-Za-z0-9_-]{43}))?$/);
  if(!m)return;
  try{history.replaceState(null,'',location.pathname+location.search)}catch(e){}
  join(m[1],m[2]);
}

