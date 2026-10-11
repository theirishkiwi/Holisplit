/* ---- Local storage: one key per trip, plus device prefs (current trip, trip list, sync on/off) ---- */
const TK=id=>'hs-trip-'+id, PKEY='holiday-split-prefs';
let prefs={sync:true,cur:null,trips:[]};
try{Object.assign(prefs,JSON.parse(localStorage.getItem(PKEY))||{})}catch(e){}
const savePrefs=()=>{try{localStorage.setItem(PKEY,JSON.stringify(prefs))}catch(e){}};
const loadTrip=id=>{try{const t=JSON.parse(localStorage.getItem(TK(id)));return t&&t.v?fix(t):null}catch(e){return null}};
function persist(){
  try{localStorage.setItem(TK(S.id),JSON.stringify(S))}catch(e){}
  if(!S.sample){const l=prefs.trips.find(t=>t.id===S.id);if(l){l.name=S.name;l.del=S.del||null}else prefs.trips.unshift({id:S.id,name:S.name,del:S.del||null})}
  prefs.cur=S.id;savePrefs();
}
/* Deleted trips: kept for 30 days so they can be restored, then removed from the phone (and expire on the server) */
const KEEP_DELETED=30*864e5;
const goneAt=t=>t.del||t.local||0;
const daysLeft=t=>Math.max(0,Math.ceil((goneAt(t)+KEEP_DELETED-now())/864e5));
function purgeDeleted(){
  prefs.trips=prefs.trips.filter(t=>{if(goneAt(t)&&now()-goneAt(t)>KEEP_DELETED){try{localStorage.removeItem(TK(t.id))}catch(e){}return false}return true});
  savePrefs();
}
/* migrate the earlier single-trip save */
try{const old=JSON.parse(localStorage.getItem('holiday-split-v1'));
  if(old&&old.v){if(old.sample)old.id='sample';else if(!TRIP_ID.test(old.id)){old.id=newId();old.dirty=true}
    fix(old);localStorage.setItem(TK(old.id),JSON.stringify(old));if(!old.sample)prefs.trips.unshift({id:old.id,name:old.name});prefs.cur=old.id;savePrefs()}
  localStorage.removeItem('holiday-split-v1')}catch(e){}

purgeDeleted();
const firstLive=()=>prefs.trips.find(t=>!goneAt(t)&&loadTrip(t.id));
let S=(prefs.cur&&!(prefs.trips.find(t=>t.id===prefs.cur)||{}).local&&loadTrip(prefs.cur))||fix(sample());

/* every user edit goes through save(): marks the trip as needing a push */
let seq=0;
const save=()=>{S.u=now();S.dirty=true;seq++;persist();kick()};

