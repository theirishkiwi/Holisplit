/* Data model: every person/expense has an id and updatedAt (u); deletes are tombstones (del). Amounts in pence.
   Sync: each trip lives on the Worker at /api/trip/<id>. Phones GET to pull, PUT to push; the server merges, newest u wins. */
const $=s=>document.querySelector(s);
const uid=()=>Math.random().toString(36).slice(2,10);
const newId=()=>{const a=new Uint8Array(20);crypto.getRandomValues(a);return Array.from(a,b=>(b%36).toString(36)).join('')};
const TRIP_ID=/^[a-z0-9]{12,40}$/;
const now=()=>Date.now();
/* dates are the phone's local calendar day (toISOString would give UTC, i.e. yesterday just after midnight in Italy) */
const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const today=()=>ymd(new Date());
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ico=(id,cls='i')=>`<svg class="${cls}"><use href="#${id}"/></svg>`;

const COLORS=['#ffcfb3','#bfe6c9','#bcd8f5','#dccbf3','#f8c3cd','#b2e3df','#f6e1a6','#ccd1f7'];
const CATS=['food','groceries','drinks','transport','stay','activity','other'];
const CAT_COL={food:'#ffdcc7',groceries:'#cdeed7',drinks:'#f9d3dc',transport:'#cfe2f8',stay:'#e3d6f6',activity:'#f8e8b8',other:'#dde1ea'};
const CAT_RX={
  groceries:/super|market|grocer|shop|tesco|lidl|aldi|mercadona|carrefour|spar|co-?op|conad|eurospin|coop|esselunga|bakery/i,
  drinks:/drink|bar\b|beer|wine|pub|cocktail|coffee|caf[eé]|gin/i,
  food:/dinner|lunch|breakfast|brunch|meal|restaurant|tapas|pizza|food|snack|ice ?cream|takeaway|burger|sushi/i,
  transport:/taxi|uber|bolt|bus|train|car\b|hire|fuel|petrol|diesel|parking|flight|ferry|transfer|airport|toll|metro/i,
  stay:/hotel|airbnb|villa|apartment|hostel|room|stay|accommodation/i,
  activity:/ticket|boat|tour|museum|entry|excursion|golf|surf|kayak|show|beach|spa|park/i
};
const CAT_NAME={food:'Food',groceries:'Groceries',drinks:'Drinks',transport:'Transport',stay:'Stay',activity:'Activities',other:'Other'};
const CAT_FILL={food:'#f4a578',groceries:'#79c995',drinks:'#ec8fa5',transport:'#7fafe8',stay:'#ac94e3',activity:'#e3bf50',other:'#a3aabb'};
const PAY_COL='#d6f1e2',CCS=['€','£','$','CHF','kr','zł','Kč','Ft','¥','₺'];
const matchCat=d=>CATS.find(c=>CAT_RX[c]&&CAT_RX[c].test(d));
const guessCat=d=>matchCat(d)||'other';

function sample(){
  const P=['Chris','Sam','Alex','Jo'].map((n,i)=>({id:uid(),name:n,c:i,u:now()}));
  P[0].pair=P[1].id;P[1].pair=P[0].id;P[2].pair=P[3].id;P[3].pair=P[2].id;
  const [c,s,a,j]=P.map(p=>p.id), d=n=>{const x=new Date();x.setDate(x.getDate()-n);return ymd(x)};
  const E=[
    ['Tapas dinner',8640,d(0),c,[c,s,a,j]],
    ['Beach bar',2450,d(0),s,[c,s,a,j]],
    ['Mercadona',4215,d(1),s,[c,s,a,j]],
    ['Boat trip',6000,d(1),a,[c,a]],
    ['Taxi from airport',3800,d(2),j,[c,s,a,j]],
    ['Villa deposit',30000,d(2),c,[c,s,a,j]],
  ].map(([desc,amt,date,paidBy,f])=>({id:uid(),desc,amt,date,paidBy,for:f,cat:guessCat(desc),u:now()}));
  return {v:1,id:'sample',name:'Spain 2026',cur:'€',nu:0,sample:true,people:P,expenses:E,u:now()};
}
const blank=()=>({v:1,id:newId(),key:randKey(),pk:randKey(),name:'My trip',cur:'£',nu:now(),people:[],expenses:[],u:now(),dirty:true});
const fix=t=>{t.people=t.people||[];t.expenses=t.expenses||[];
  const used=new Set();t.expenses.forEach(e=>{if(!e.del){used.add(e.paidBy);(e.for||[]).forEach(i=>used.add(i))}});
  t.people.forEach(p=>{if(p.del&&used.has(p.id))delete p.del});
  t.people.forEach((p,i)=>{if(p.c==null)p.c=i%COLORS.length});t.expenses.forEach(e=>{if(!e.cat)e.cat=guessCat(e.desc)});if(t.nu==null)t.nu=0;return t};

