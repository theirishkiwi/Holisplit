/* ---- Notifications: tell this phone when someone else adds an expense or records a payment ----
   Per phone and per trip, stored on the phone (prefs.notif[tripId] = {on, scope:'all'|'me'}). */
const notif=()=>{prefs.notif=prefs.notif||{};return prefs.notif[S.id]=prefs.notif[S.id]||{on:false,scope:'all'}};
const isIOS=()=>/iPhone|iPad|iPod/.test(navigator.userAgent);
const installed=()=>navigator.standalone===true||matchMedia('(display-mode: standalone)').matches;
const pushAvail=()=>'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
function notifBlock(){
  if(!syncOn()||!people().length)return '';
  const n=notif();
  if(!pushAvail()||(isIOS()&&!installed()))return `<div class="set"><div class="col"><label>Notifications<small>${isIOS()&&!installed()
    ?'On iPhone, add Holiday Split to your Home Screen first: tap Share, then <b>Add to Home Screen</b>. Then open it from there and turn notifications on here.'
    :'This browser can\'t show notifications.'}</small></label></div></div>`;
  const blocked=Notification.permission==='denied';
  return `<div class="set">
    <div><label for="snotif">Notifications<small>${blocked?'Blocked for this app in your phone\'s settings. Allow notifications there to turn them on.':'When someone else adds an expense or records a payment'}</small></label><input id="snotif" class="sw" type="checkbox" role="switch" ${n.on&&!blocked?'checked':''} ${blocked?'disabled':''}></div>
    ${n.on&&!blocked?`<div class="col"><label>Notify me about</label><div class="seg nf"><button type="button" data-nf="all" aria-pressed="${n.scope!=='me'}">Everything</button><button type="button" data-nf="me" aria-pressed="${n.scope==='me'}">Just what involves me</button></div></div>`:''}
  </div>`;
}
/* turning on asks the phone for permission (it must come from a tap); the sign-up with the server comes next */
async function setNotif(on){
  const n=notif();
  if(on&&Notification.permission!=='granted'){
    let p='default';try{p=await Notification.requestPermission()}catch(e){}
    if(p!=='granted'){n.on=false;savePrefs();openSettings();return toast(p==='denied'?'Notifications are blocked for this app in your phone\'s settings':'Notifications not turned on')}
  }
  n.on=on;savePrefs();openSettings();
  toast(on?'Notifications on for this trip':'Notifications off');
}
