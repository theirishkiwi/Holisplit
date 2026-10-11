/* ---- Sheets: close with the arrow, a swipe down on the top bar, the phone's back gesture, Esc, or a tap outside ---- */
let popIgnoreUntil=0;
function openScrim(){
  const sc=$('#scrim');
  if(sc.hidden){sc.hidden=false;try{history.pushState({sheet:1},'')}catch(e){}}
  return sc;
}
function close(){
  const sc=$('#scrim');if(sc.hidden)return;
  sc.hidden=true;sc.innerHTML='';
  /* step back over the entry we added; its popstate arrives shortly after and must not close a sheet opened meanwhile */
  if(history.state&&history.state.sheet){popIgnoreUntil=Date.now()+400;history.back()}
}
window.addEventListener('popstate',()=>{
  if(Date.now()<popIgnoreUntil)return;
  const sc=$('#scrim');if(!sc.hidden){sc.hidden=true;sc.innerHTML=''}  /* back gesture */
});
function enhanceSheet(sh){
  if(sh.dataset.enh)return;sh.dataset.enh=1;
  const g=document.createElement('div');g.className='grab';g.setAttribute('aria-hidden','true');sh.prepend(g);
  let y0=null,dy=0,t0=0;
  const inZone=e=>e.target.closest('.grab,.sh')&&!e.target.closest('input,select,textarea');
  sh.addEventListener('touchstart',e=>{if(sh.scrollTop>0||!inZone(e))return;y0=e.touches[0].clientY;dy=0;t0=Date.now();sh.style.transition='none'},{passive:true});
  sh.addEventListener('touchmove',e=>{if(y0==null)return;dy=Math.max(0,e.touches[0].clientY-y0);sh.style.transform=dy?`translateY(${dy}px)`:''},{passive:true});
  const end=()=>{if(y0==null)return;y0=null;const v=dy/Math.max(1,Date.now()-t0);sh.style.transition='transform .2s ease';
    if(dy>90||(dy>30&&v>0.6)){sh.style.transform='translateY(100%)';setTimeout(close,180)}else sh.style.transform=''};
  sh.addEventListener('touchend',end);sh.addEventListener('touchcancel',end);
}
new MutationObserver(()=>{const sh=$('#scrim .sheet');if(sh)enhanceSheet(sh)}).observe($('#scrim'),{childList:true});
