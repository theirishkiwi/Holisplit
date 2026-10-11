/* ---- Spreadsheet export ---- */
function exportCsv(){
  const q=v=>{v=String(v??'');return /[",\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v},n=p=>(p/100).toFixed(2),P=people();
  const head=['Date','Description','Type','Category','Paid by',`Amount (${S.cur})`,'Original currency','Original amount','Rate','Split between',...P.map(p=>`${p.name} share`)];
  const rows=expenses().slice().reverse().map(e=>{const pay=isPay(e),sh=pay?{}:shares(e);
    return [e.date,pay?`${pname(e.paidBy)} paid ${pname(e.for[0])}`:e.desc,pay?'Payment':'Expense',pay?'':CAT_NAME[e.cat],pname(e.paidBy),n(e.amt),e.cc||'',e.cc?n(e.oamt):'',e.rate||'',e.for.map(pname).join('; '),...P.map(p=>sh[p.id]?n(sh[p.id]):'')]});
  const csv='﻿'+[head,...rows].map(r=>r.map(q).join(',')).join('\r\n');
  const name=(S.name.replace(/[^\w\- ]+/g,'').trim()||'trip')+'.csv';
  const file=new File([csv],name,{type:'text/csv'});
  if(navigator.canShare&&navigator.canShare({files:[file]}))return navigator.share({files:[file],title:S.name}).catch(()=>{});
  const a=document.createElement('a');a.href=URL.createObjectURL(file);a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),5000);toast('Spreadsheet saved');
}

