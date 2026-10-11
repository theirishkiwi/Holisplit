/* ---- Receipt photos: compressed on the phone, kept locally until uploaded to /api/photo/<trip>/<expense> ---- */
const PH='hs-photo-';
/* ---- Receipt scanning: the photo is read by the app's Cloudflare AI (nothing is stored there).
   Fills total, date, shop name, category and currency, but never overwrites what you typed. ---- */
const scanOn=()=>scanAvail&&prefs.scan!==false&&syncOn();
const titleCase=t=>t===t.toUpperCase()?t.toLowerCase().replace(/(^|[\s'&.-])(\p{L})/gu,(m,a,b)=>a+b.toUpperCase()):t;
async function scanReceipt(file,f,draw){
  if(!scanOn())return;
  const msg=$('#scanmsg'),show=(h,busy)=>{const m=$('#scanmsg');if(!m)return;m.hidden=false;m.classList.toggle('busy',!!busy);m.innerHTML=h};
  if(!msg)return;
  show(`${ico('i-cam','i tiny')}Reading receipt…`,true);
  const fail=t=>show(t||'Couldn\'t read the receipt. Enter the details yourself.');
  try{
    if(S.dirty){await waitIdle();await sync()}                       /* the trip must exist on the server */
    const small=await compress(file,1120,0.8);
    const r=await fetch('/api/scan/'+S.id,{method:'POST',headers:{'content-type':'image/jpeg'},body:dataBlob(small)});
    if(!$('#eform'))return;                                          /* sheet closed meanwhile */
    if(!r.ok){const j=(await r.json().catch(()=>({})))||{},why=j.error,det=j.detail?`<small class="scanwhy">${esc(why==='unreadable'?'Read: '+j.detail:j.detail)}</small>`:'';
      if(why==='daily scan limit reached')return fail('Daily scan limit reached for this trip. Enter the details yourself.');
      if(r.status===503)return fail('Receipt reading isn\'t available right now. Enter the details yourself.'+det);
      if(why==='trip not found')return fail('This trip isn\'t saved online yet, so it can\'t read receipts. Enter the details yourself.');
      return fail('Couldn\'t read the receipt. Enter the details yourself.'+(det||`<small class="scanwhy">Error ${r.status}${why?' · '+esc(why):''}</small>`))}
    let res=await r.json();
    /* receipts are tall: a wide photo with no shop name found was probably taken sideways, so turn it and read it once more */
    if(!res.merchant){
      const d=await imgDims(small);
      if(d&&d[0]>d[1]*1.15){
        show(`${ico('i-cam','i tiny')}Turning the photo and reading again…`,true);
        const up=await turnData(small,1);
        const r2=up&&await fetch('/api/scan/'+S.id,{method:'POST',headers:{'content-type':'image/jpeg'},body:dataBlob(up)}).catch(()=>null);
        if(!$('#eform'))return;
        const res2=r2&&r2.ok?await r2.json().catch(()=>null):null;
        if(res2&&res2.merchant){
          res={...res2,total:res2.total||res.total,date:res2.date||res.date,cur:res2.cur||res.cur};
          if(f.newPhoto)f.newPhoto=(await turnData(f.newPhoto,1))||f.newPhoto;   /* keep the upright photo */
        }
      }
    }
    applyScan(res,f,draw,show);
  }catch(e){if($('#eform'))fail(navigator.onLine===false?'Scanning needs signal. Enter the details yourself.':null)}
}
function applyScan(r,f,draw,show){
  const filled=[],cur=r.cur||S.cur,amtTxt=r.total?fmtCc(Math.round(r.total*100),cur):'';
  if(r.total&&!f.touched.amt){
    if(cur!==f.cc){f.cc=cur;$('#frate').value='';f.rateMode='auto'}
    $('#famt').value=r.total.toFixed(2);filled.push(amtTxt);
  }
  if(r.date&&!f.touched.date){$('#fdate').value=r.date;filled.push(fmtDate(r.date))}
  if(f.cc!==S.cur&&f.autoRate)f.autoRate();                        /* receipt in another currency: that day's rate */
  /* "What for?": the shop name, else a short description of the purchase, else the type of place */
  const what=r.merchant?titleCase(r.merchant):r.what?titleCase(r.what).replace(/^\p{Ll}/u,c=>c.toUpperCase()):r.cat&&r.cat!=='other'?CAT_NAME[r.cat]:'';
  if(what&&!f.touched.desc&&!$('#fdesc').value.trim()){$('#fdesc').value=what;filled.push(what)}
  if(!f.catSet){const c=r.cat&&r.cat!=='other'?r.cat:matchCat($('#fdesc').value);if(c){f.cat=c;filled.push(CAT_NAME[c])}}
  draw();
  const differs=r.total&&f.touched.amt&&toPence($('#famt').value)!==Math.round(r.total*100);
  if(filled.length)show(`${ico('i-check','i tiny')}Filled from receipt: <b>${esc(filled.join(' · '))}</b>. Check before saving.`);
  else show(`Receipt total ${esc(amtTxt||'not found')}.`);
  const amtNow=toPence($('#famt').value),rateNow=parseFloat(String($('#frate').value).replace(',','.'));
  const cand={id:'_new',desc:$('#fdesc').value,date:$('#fdate').value,cat:f.cat||null,amt:f.cc!==S.cur&&rateNow>0?Math.round(amtNow*rateNow):amtNow,cc:f.cc!==S.cur?f.cc:null,oamt:f.cc!==S.cur?amtNow:null};
  const d0=amtNow>0?findDups(cand)[0]:null;
  if(d0)$('#scanmsg').insertAdjacentHTML('beforeend',`<span class="dupwarn">${ico('i-x','i tiny')}Looks like ${dupLine(d0.e)}. Check it isn't a duplicate.</span>`);
  if(differs){const m=$('#scanmsg');m.insertAdjacentHTML('beforeend',` <button type="button" class="ghost" id="useTotal">Use ${esc(amtTxt)}</button>`);
    $('#useTotal').onclick=()=>{if(cur!==f.cc){f.cc=cur;$('#frate').value='';f.rateMode='auto'}$('#famt').value=r.total.toFixed(2);draw();if(f.cc!==S.cur&&f.autoRate)f.autoRate();$('#useTotal').remove()}}
}
/* Phones often store portrait photos sideways plus an EXIF "orientation" tag. Most browsers apply it when drawing,
   some don't; read the tag and the stored size, and turn the picture upright ourselves when the browser hasn't. */
function jpegInfo(buf){
  const v=new DataView(buf);let o=2,orient=1,w=0,h=0;
  if(v.byteLength<4||v.getUint16(0)!==0xFFD8)return {orient,w,h};
  while(o+4<=v.byteLength){
    const m=v.getUint16(o),len=v.getUint16(o+2);
    if(m===0xFFE1&&o+10<v.byteLength&&v.getUint32(o+4)===0x45786966){            /* "Exif" */
      const t=o+10,le=v.getUint16(t)===0x4949,ifd=t+v.getUint32(t+4,le),n=v.getUint16(ifd,le);
      for(let i=0;i<n;i++){const e=ifd+2+i*12;if(e+10>v.byteLength)break;if(v.getUint16(e,le)===0x0112){orient=v.getUint16(e+8,le);break}}
    }
    if(m>=0xFFC0&&m<=0xFFC3){h=v.getUint16(o+5);w=v.getUint16(o+7);break}
    if((m&0xFF00)!==0xFF00||len<2)break;
    o+=2+len;
  }
  return {orient,w,h};
}
/* how many quarter turns (clockwise) are still needed after the browser has decoded the image */
function turnsNeeded(info,iw,ih){
  if(!info||info.w===info.h)return 0;
  const notApplied=iw===info.w&&ih===info.h;                                  /* still the stored (sideways) size */
  if(!notApplied)return 0;
  return info.orient===6?1:info.orient===8?3:info.orient===3?2:0;
}
function imgDims(d){return new Promise(r=>{const i=new Image();i.onload=()=>r([i.naturalWidth||i.width,i.naturalHeight||i.height]);i.onerror=()=>r(null);setTimeout(()=>r(null),3000);i.src=d})}
/* a JPEG data URL turned clockwise by quarter turns */
function turnData(d,turns,q=0.8){return new Promise(r=>{const i=new Image();
  i.onload=()=>{try{const c=document.createElement('canvas'),x=c.getContext('2d'),w=i.naturalWidth,h=i.naturalHeight;
    if(turns%2){c.width=h;c.height=w}else{c.width=w;c.height=h}
    x.translate(c.width/2,c.height/2);x.rotate(turns*Math.PI/2);x.drawImage(i,-w/2,-h/2);r(c.toDataURL('image/jpeg',q))}catch(e){r(null)}};
  i.onerror=()=>r(null);setTimeout(()=>r(null),3000);i.src=d})}
async function compress(file,max=1400,q=0.7){
  let info=null;try{info=jpegInfo(await file.slice(0,256*1024).arrayBuffer())}catch(e){}
  return new Promise((res,rej)=>{
    const img=new Image(),url=URL.createObjectURL(file);
    img.onload=()=>{
      const turns=turnsNeeded(info,img.naturalWidth||img.width,img.naturalHeight||img.height);
      const k=Math.min(1,max/Math.max(img.width,img.height)),w=Math.round(img.width*k),h=Math.round(img.height*k);
      const c=document.createElement('canvas'),x=c.getContext('2d');
      if(turns%2){c.width=h;c.height=w}else{c.width=w;c.height=h}
      x.translate(c.width/2,c.height/2);x.rotate(turns*Math.PI/2);x.drawImage(img,-w/2,-h/2,w,h);
      URL.revokeObjectURL(url);res(c.toDataURL('image/jpeg',q))};
    img.onerror=()=>{URL.revokeObjectURL(url);rej()};img.src=url;
  });
}
function queuePhoto(id,v,data){
  try{localStorage.setItem(PH+id,JSON.stringify({t:S.id,v,data,pe:S.pk?1:0}))}catch(e){toast('Phone storage is full. Photo not saved.')}
  uploadPhotos();
}
function localPhoto(id,v){try{const x=JSON.parse(localStorage.getItem(PH+id));return x&&x.v===v?x.data:null}catch(e){return null}}
const photoUrls={};
async function photoURL(id,v,pe){
  const local=localPhoto(id,v);if(local)return local;
  const k=`${S.id}/${id}?v=${v}`;if(photoUrls[k])return photoUrls[k];
  const r=await fetch(`/api/photo/${k}`);if(!r.ok)throw new Error(r.status);
  let b=new Uint8Array(await r.arrayBuffer());
  if(pe)b=await unseal(S.pk,b);
  return photoUrls[k]=URL.createObjectURL(new Blob([b],{type:'image/jpeg'}));
}
const dataBlob=d=>{const b=atob(d.split(',')[1]),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return new Blob([u],{type:'image/jpeg'})};
let uploading=false;
async function uploadPhotos(){
  if(!syncAvail||!prefs.sync||uploading)return;uploading=true;
  const keys=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith(PH))keys.push(k)}
  for(const k of keys){
    try{const x=JSON.parse(localStorage.getItem(k)),id=k.slice(PH.length),url=`/api/photo/${x.t}/${id}`;
      const tr=x.t===S.id?S:loadTrip(x.t);if(x.pe&&!(tr&&tr.pk))continue;
      const body=x.pe?new Blob([await seal(tr.pk,new Uint8Array(await dataBlob(x.data).arrayBuffer()))]):dataBlob(x.data);
      const r=await fetch(url,{method:'PUT',headers:{'content-type':x.pe?'application/octet-stream':'image/jpeg'},body});
      if(r.ok){localStorage.removeItem(k);fetch(`${url}?v=${x.v}`).catch(()=>{})}
    }catch(e){break}
  }
  uploading=false;
}
function viewPhoto(src){
  const v=document.createElement('div');v.className='viewer';
  v.innerHTML=`<img src="${src}" alt="Receipt photo. Needs signal if it hasn't loaded before."><button class="iconbtn" aria-label="Close">${ico('i-x')}</button>`;
  v.onclick=()=>v.remove();document.body.appendChild(v);
}

