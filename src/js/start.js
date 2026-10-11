document.addEventListener('click',e=>{if(e.target.closest('[data-dismiss]'))close()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#scrim').hidden)close()});
window.addEventListener('hashchange',checkHash);
/* offline: register the service worker on the hosted app only */
ready.then(()=>{if(syncAvail&&'serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{})});
render();checkHash();checkNews();setTimeout(checkPending,300);
