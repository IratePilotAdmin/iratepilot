import {financialMigrationDetailRows,financialMigrationCorrectionRows,type readFinancialMigrationDetail} from './financial-migration-detail';

// All report values are assigned as text, never interpreted as markup.
export function openFinancialMigrationPrint(detail:ReturnType<typeof readFinancialMigrationDetail>,download=false):void {
 const popup=download?{document:document.implementation.createHTMLDocument(''),print:()=>{},close:()=>{},focus:()=>{},opener:null}:window.open('','_blank');
 if(!popup)throw Error('Allow a new browser tab to open the printable batch report.');
 try{
  popup.opener=null;
  const append=(parent:Node,...children:Node[])=>{for(const child of children)parent.appendChild(child);};
  const doc=popup.document;doc.title='iRatePilot - Financial migration report';
  const encoding=doc.createElement('meta');encoding.setAttribute('charset','utf-8');append(doc.head,encoding);
  const style=doc.createElement('style');style.textContent=`
   *{box-sizing:border-box}body{font:14px/1.45 Arial,sans-serif;color:#172c43;background:#fff;margin:28px auto;padding:0 24px;max-width:1100px}
   h1{font-size:24px;margin:0 0 8px}h2{font-size:18px;margin:24px 0 10px}h3{font-size:14px;margin:0 0 10px}
   p{margin:8px 0}dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px 24px;margin:0}dl>div{min-width:0;break-inside:avoid}dt{font-weight:700;font-size:12px;color:#41556b}dd{margin:2px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}
   header{border-bottom:2px solid #172c43;padding-bottom:16px}article{border:1px solid #cbd5df;padding:14px;margin:12px 0;break-inside:avoid}
   .record-context{font-size:10px;color:#41556b;margin:0 0 10px;overflow-wrap:anywhere}nav{display:flex;gap:12px;margin-bottom:22px}button{font:inherit;padding:9px 16px;border:1px solid #64748b;border-radius:5px;background:#fff;cursor:pointer}
   @media(max-width:600px){dl{grid-template-columns:1fr}}
   @media print{@page{size:A4 portrait;margin:12mm}body{font-size:10pt;max-width:none;margin:0;padding:0;color:#111}nav{display:none}.record-context{font-size:8pt;color:#333}dt{font-size:9pt;color:#333}h1{font-size:18pt}h2{break-after:avoid}article{border-color:#aaa}dl{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `;append(doc.head,style);
  const node=(tag:string,text?:string)=>{const el=doc.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
  const toolbar=node('nav');toolbar.setAttribute('aria-label','Report actions');
  const print=node('button','Print report');print.addEventListener('click',()=>popup.print());
  const close=node('button','Close report');close.addEventListener('click',()=>popup.close());append(toolbar,print,close);append(doc.body,toolbar);
  const main=node('main'),header=node('header');append(header,node('h1','Financial migration report'),node('p','iRatePilot PMS · USD · '+detail.status));
  const fields=(pairs:string[][])=>{const dl=node('dl');for(const [label,value] of pairs){const group=node('div');append(group,node('dt',label),node('dd',value||'—'));append(dl,group);}return dl;};
  const metadata=[['Tenant ID',detail.tenant],['Property ID',detail.property],['Batch ID',detail.batch],['Source batch',detail.sourceBatch],['Source PMS',detail.provider],['Cutover date',detail.cutover],['Status',detail.status],['Source file SHA256',detail.fingerprint]];
  append(header,fields(metadata));append(main,header,node('p','Original source amounts and saved accounting references. Matching existing balances does not create an additional balance. Amounts labelled USD cents are integer cents.'));
  const contextLabels=new Set(metadata.map(([label])=>label));
  function section(title:string,rows:string[][]){
   if(rows.length<2)return;
   const section=node('section');append(section,node('h2',title+' ('+(rows.length-1)+')'));
   rows.slice(1).forEach((row,index)=>{const record=node('article'),context=node('p','Property '+detail.property+' · Batch '+detail.batch);context.className='record-context';append(record,node('h3','Record '+(index+1)),context,fields(rows[0].flatMap((label,column)=>contextLabels.has(label)?[]:[[label,row[column]??'']])));append(section,record);});
   append(main,section);
  }
  section('Original source balances',[['Source item','Source reference','Category','Amount in USD cents','Reservation ID'],...detail.rows.map(row=>[row.source,row.reference,row.category,row.amount??'Invalid amount',row.reservation??'Unmatched'])]);
  section('Imported balances and posting references',financialMigrationDetailRows(detail));
  section('Invoice match correction history',financialMigrationCorrectionRows(detail));
  append(doc.body,main);
  if(download){
   toolbar.remove();
   const hint=node('p','Print this saved report using your browser Print command. This copy is a snapshot; reload the PMS report for current balances.');append(header,hint);
   const url=URL.createObjectURL(new Blob(['<!doctype html>\n'+doc.documentElement.outerHTML],{type:'text/html;charset=utf-8'}));
   const link=document.createElement('a');link.href=url;link.download='iratepilot-migration-'+detail.batch+'.html';
   document.body.appendChild(link);try{link.click()}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  }else popup.focus();
 }catch(error){popup.close();throw error;}
}



