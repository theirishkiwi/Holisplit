/* ---- Sync ---- */
let syncAvail=false,scanAvail=false,syncing=false,again=false,kickT;
const api=id=>'/api/trip/'+id;
const syncOn=()=>syncAvail&&prefs.sync&&!S.sample&&!S.revoked;
/* ---- End-to-end encryption ----
   Each trip has a random 256-bit key that lives only in the invite link (#id.key) and on phones; the server stores
   AES-GCM ciphertext it cannot read. Photos use a second key (pk) kept inside the encrypted trip. */
const b64u=u8=>{let s='';for(let i=0;i<u8.length;i+=8192)s+=String.fromCharCode.apply(null,u8.subarray(i,i+8192));return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')};
const ub64u=t=>{t=t.replace(/-/g,'+').replace(/_/g,'/');while(t.length%4)t+='=';const b=atob(t),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u};
function randKey(){return b64u(crypto.getRandomValues(new Uint8Array(32)))}
const keyCache={};
const cryptoKey=k=>keyCache[k]||(keyCache[k]=crypto.subtle.importKey('raw',ub64u(k),'AES-GCM',false,['encrypt','decrypt']));
async function seal(k,bytes){
  const iv=crypto.getRandomValues(new Uint8Array(12)),ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await cryptoKey(k),bytes));
  const out=new Uint8Array(12+ct.length);out.set(iv);out.set(ct,12);return out;
}
async function unseal(k,bytes){bytes=new Uint8Array(bytes);return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.subarray(0,12)},await cryptoKey(k),bytes.subarray(12)))}
/* what leaves the phone: never the link key, server revision or phone-only flags */
const tripOut=t=>{const {sample,dirty,lastPayer,revoked,key,rev,...x}=t;return x};
const payload=()=>tripOut(S);
async function encTrip(t){
  const env={v:2,id:t.id,rev:t.rev||0,enc:b64u(await seal(t.key,new TextEncoder().encode(JSON.stringify(tripOut(t)))))};
  if(t.prev)env.prev=t.prev;if(t.del)env.del=t.del;return env;
}
async function decTrip(env,key){
  const t=JSON.parse(new TextDecoder().decode(await unseal(key,ub64u(env.enc))));
  t.id=env.id;t.key=key;t.rev=env.rev;if(env.prev)t.prev=env.prev;return fix(t);
}
/* true when this phone holds something the server copy lacks (a missed or lost write) */
function ahead(loc,rem){
  if(!rem)return true;if((loc.nu||0)>(rem.nu||0)||(loc.du||0)>(rem.du||0))return true;
  return ['people','expenses'].some(k=>loc[k].some(x=>{const r=(rem[k]||[]).find(y=>y.id===x.id);return !r||(x.u||0)>(r.u||0)}));
}
/* Is there a sync server? Once the app has reached it, remember that, so opening with no signal shows "offline"
   (and syncs by itself when signal returns) instead of hiding sync until the next reload. */
function ping(){return fetch('/api/ping',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(j=>{
    if(j&&j.ok){syncAvail=true;scanAvail=!!j.scan;if(!prefs.hosted){prefs.hosted=true;savePrefs()}}
    else if(!prefs.hosted)syncAvail=false;
  }).catch(()=>{if(prefs.hosted){syncAvail=true;return 'offline'}})}
const ready=ping().then(o=>{setNet(o==='offline'&&syncOn()?'offline':syncOn()?'sync':'off');if(o!=='offline')sync()});
function setNet(s){const c=$('#cloud'),on=syncOn();c.hidden=!on;c.dataset.s=s;c.setAttribute('aria-label',{ok:'Synced',sync:'Syncing',offline:'Offline. Tap to retry'}[s]||'Sync');
  c.querySelector('use').setAttribute('href',s==='offline'?'#i-cloudoff':'#i-cloud');
  $('#cloudTxt').textContent={ok:'Synced',sync:'Syncing…',offline:'Offline'}[s]||'';
  const b=$('#offline');if(!b)return;b.hidden=!(on&&s==='offline');
  if(!b.hidden)$('#offText').textContent=S.dirty?'You\'re offline. Your changes are saved on this phone and will sync when you\'re back online.':'You\'re offline. You can still add and edit expenses. They\'ll sync when you\'re back online.'}
function kick(){clearTimeout(kickT);kickT=setTimeout(sync,500)}
async function sync(){
  if(!syncOn())return;
  if(syncing){again=true;return}
  if(navigator.onLine===false){setNet('offline');return}
  syncing=true;setNet('sync');
  const trip=S,sent=seq,hdr={'content-type':'application/json'};
  const gone=async r=>{let why='';try{why=(await r.json()).error}catch(e){}
    if(why==='erased'){eraseLocal(trip.id);toast(`${trip.name} was permanently deleted`);setNet(syncOn()?'ok':'off');return}
    if(S===trip){S.revoked=true;persist();render()}setNet('off')};
  try{
    if(trip.key){
      /* encrypted: pull + merge on the phone, then push with the revision we merged from; 409 = someone else saved first */
      let r=await fetch(api(trip.id),{cache:'no-store'}),remote=null;
      if(r.status===410)return gone(r);
      if(r.ok){const env=await r.json();remote=await decTrip(env,trip.key);trip.rev=env.rev;if(S===trip)mergeIn(remote)}
      else if(r.status!==404)throw new Error(r.status);
      for(let i=0;i<4&&(trip.dirty||ahead(trip,remote));i++){
        r=await fetch(api(trip.id),{method:'PUT',headers:hdr,body:JSON.stringify(await encTrip(trip))});
        if(r.status===410)return gone(r);
        if(r.status===409){const env=(await r.json()).current;remote=await decTrip(env,trip.key);trip.rev=env.rev;if(S===trip)mergeIn(remote);continue}
        if(!r.ok)throw new Error(r.status);
        trip.rev=(await r.json()).rev;if(seq===sent)trip.dirty=false;if(S===trip)persist();break;
      }
    }else{
      const put=()=>fetch(api(trip.id),{method:'PUT',headers:hdr,body:JSON.stringify(tripOut(trip))});
      let r=trip.dirty?await put():await fetch(api(trip.id),{cache:'no-store'});
      if(r.status===404)r=await put();
      if(r.status===410)return gone(r);
      if(!r.ok)throw new Error(r.status);
      const remote=await r.json();
      if(S===trip){if(seq===sent)S.dirty=false;mergeIn(remote);if(ahead(S,remote)){S.dirty=true;again=true}}
    }
    setNet('ok');uploadPhotos();
  }catch(e){setNet('offline')}
  finally{syncing=false}
  if(again||(S.dirty&&seq!==sent)){again=false;kick()}
}
/* merge a remote copy into the open trip; newest u wins */
function mergeIn(t){
  let added=0,changed=0,clash=null;
  ['people','expenses'].forEach(k=>(t[k]||[]).forEach(x=>{
    const l=S[k].find(y=>y.id===x.id);
    if(l&&k==='expenses'&&!isPay(l))clash=clashNote(l,x)||clash;
    if(!l){S[k].push(x);changed++;if(!x.del&&k==='expenses')added++}
    else if((x.u||0)>(l.u||0)){Object.assign(l,x);changed++}
  }));
  if((t.nu||0)>(S.nu||0)){S.name=t.name;S.cur=t.cur;S.nu=t.nu;changed++}
  if(!S.pk&&t.pk)S.pk=t.pk;
  if((t.du||0)>(S.du||0)){S.del=t.del||null;S.delBy=t.delBy||null;S.du=t.du;changed++}
  if((t.sxu||0)>(S.sxu||0)){S.sx=t.sx||null;S.sxu=t.sxu;changed++}
  changed+=mergeLog(t);
  fix(S);persist();snapReset();
  if(changed){if(open&&added)expenses().forEach(e=>open.add(e.date));render();if(added)toast(`${added} new from the group`)}
  if(editing)editing.check();
  if(clash&&!$('#eform'))toast(clash,{label:'See',fn:openActivity});
}
setInterval(()=>{if(!document.hidden)sync()},30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync()});
window.addEventListener('online',()=>{if(!scanAvail||!syncAvail)ping().then(()=>sync());else sync()});
window.addEventListener('offline',()=>{if(syncOn())setNet('offline')});

