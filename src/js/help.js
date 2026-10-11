/* ---- Help, What's new, About ---- */
const REPO='https://github.com/theirishkiwi/Holisplit';
/* newest first; the first entry's head is what returning users see in the banner after an update */
const NEWS=[
  {d:'2026-10-09',head:'Expenses in another currency get that day\'s rate',items:[
    'Paid in another currency? Tap the currency next to the amount (now marked ⌄). The rate for the expense\'s date is filled in for you, and you can still type your own.']},
  {d:'2026-10-08',head:'Settle up in £, a clear offline banner, and a help guide',items:[
    'Settle up in £ (or another currency) at today\'s rate. Monzo links fill in the £ amount. Tap “Settle in €” on Settle up.',
    'A banner tells you when you\'re offline. You can still add expenses, and they sync as soon as you\'re back.',
    'Help guide and What\'s new, in Settings.',
    'Couples always settle up as one (marked *). To settle separately, unpair them in Group.']},
  {d:'2026-10-07',head:'Joint accounts for couples',items:[
    'Couples who share money can turn on Joint account: shown together and never owe each other.',
    '“You\'re owed” instead of “you lent”, and tidier expense rows on smaller phones.']},
  {d:'2026-10-06',head:'Smarter receipt scanning and duplicate checks',items:[
    'Receipt scanning fills in the shop name too, even from a sideways photo.',
    'The app asks before adding an expense that looks like it\'s already there.']},
];
const LATEST=NEWS[0].d;
const HELP=[
  ['i-plus','Getting started',[
    'Name the trip at the top. Pick its currency in Settings.',
    'Add everyone in <b>Group</b>. Tap your own name and choose <b>This is me</b>, so the app shows what you owe and are owed.',
    'Invite the group from <b>Group</b>: WhatsApp or Copy link. Everyone with the link sees the same trip, kept in sync.']],
  ['c-food','Adding expenses',[
    'Tap <b>+</b>. Enter the amount, what it was for, who paid and who it\'s split between (everyone by default).',
    'Tap the icon next to “What for?” to pick a category. It\'s often guessed for you.',
    'Paid in another currency? Tap <b>€</b> next to the amount and enter the rate.',
    'Tap an expense to edit or delete it. Deleting can be undone.']],
  ['i-cam','Receipt photos',[
    'Tap the camera on a new expense. The total, date, shop and type are filled in for you. Check them before saving.',
    'Photos are read by the app\'s Cloudflare AI and not kept there. You can turn this off in Settings.',
    'If something looks already added (same amount and shop, or same amount and type that day), the app asks first.']],
  ['i-link','Couples and joint accounts',[
    'Pair two people in <b>Group</b>: they settle up as one, so there are fewer payments. Couples are marked * on Settle up.',
    'Want to settle separately? Unpair them in <b>Group</b>.',
    'Share a bank account? Turn on <b>Joint account</b> in either person\'s menu. You\'re shown together (“you\'re owed €150”) and never owe each other.']],
  ['i-pay','Settling up',[
    '<b>Settle up</b> shows the fewest payments that make everyone square.',
    '<b>Pay</b> opens Monzo, Revolut or Starling, or shows bank details. Add yours in Settings → Payment details.',
    'Owed money? <b>Remind</b> sends a WhatsApp message. <b>Paid</b> records a payment, with Undo.',
    'Tap <b>Settle in €</b> at the top of Who pays who to use another currency, e.g. £ at today\'s rate. The rate is fixed when the first payment is recorded.']],
  ['i-cloudoff','Offline',[
    'Everything works without signal. Changes are saved on your phone and sync when you\'re back online.',
    'A banner shows when you\'re offline. Tap <b>Retry</b> to try again straight away.']],
  ['i-gear','Privacy and deleting',[
    'Trips are encrypted on your phone before they\'re synced. The key is only in the trip link, so the server can\'t read names or amounts.',
    'If the link was shared too widely, reset it in Settings. The group needs the new link.',
    'Settings → <b>Delete this trip</b>. It can be restored for 30 days, or deleted permanently.']],
];
function openHelp(){
  const sc=openScrim();
  sc.innerHTML=`<div class="sheet" role="dialog" aria-label="Help">
    <div class="sh"><button type="button" class="iconbtn" data-dismiss aria-label="Close">${ico('i-down')}</button><h3>How it works</h3></div>
    ${HELP.map(([ic,t,lines],i)=>`<details class="help"${i===0?' open':''}><summary><span class="ic">${ico(ic)}</span><span>${t}</span>${ico('i-chev','i fchev')}</summary><ul>${lines.map(l=>`<li>${l}</li>`).join('')}</ul></details>`).join('')}
    <p class="about">Questions or ideas? <a href="${REPO}" target="_blank" rel="noopener">Holiday Split on GitHub</a></p>
  </div>`;
  sc.onclick=e=>{if(e.target===sc)close()};
}
function openNews(){
  prefs.news=LATEST;savePrefs();$('#news').hidden=true;
  const sc=openScrim();
  sc.innerHTML=`<div class="sheet" role="dialog" aria-label="What's new">
    <div class="sh"><button type="button" class="iconbtn" data-dismiss aria-label="Close">${ico('i-down')}</button><h3>What's new</h3></div>
    ${NEWS.map(n=>`<div class="newsd">${new Date(n.d+'T12:00').toLocaleDateString('en-GB',{day:'numeric',month:'long'})}</div><ul class="newsl">${n.items.map(i=>`<li>${i}</li>`).join('')}</ul>`).join('')}
    <p class="about"><a href="${REPO}" target="_blank" rel="noopener">Every change is on GitHub</a></p>
  </div>`;
  sc.onclick=e=>{if(e.target===sc)close()};
}
/* after an update, returning users get a one-line banner; brand-new users don't */
function checkNews(){
  if(prefs.news==null){prefs.news=prefs.cur?'':LATEST;savePrefs()}
  const show=prefs.news<LATEST;$('#news').hidden=!show;
  if(show)$('#newsText').textContent='New: '+NEWS[0].head;
}
$('#newsSee').onclick=openNews;
$('#newsX').onclick=()=>{prefs.news=LATEST;savePrefs();$('#news').hidden=true};
