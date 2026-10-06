import {renderToStaticMarkup} from 'react-dom/server';
import type {GuestDocumentModel} from '@/lib/guest-documents';

export const guestDocumentStyles=`
.guest-documents-panel .pilot-actions{flex-wrap:wrap}.guest-documents-panel .pilot-actions .primary{font-size:14px}
.gd-document{font-family:Arial,Helvetica,sans-serif;color:#172333;background:#fff;padding:30px;line-height:1.5;font-size:15px;overflow-wrap:anywhere}
.gd-document .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.gd-document header{border-bottom:2px solid #203e67;padding-bottom:18px;margin-bottom:22px}.gd-document .gd-property{font-size:15px;font-weight:700;color:#385272;margin:0 0 8px}.gd-document h1{font-size:26px;line-height:1.25;margin:0 0 10px;font-weight:700}.gd-document .gd-prepared{font-size:13px;margin:0;color:#526174}
.gd-document section{margin:24px 0}.gd-document h2{font-size:17px;font-weight:700;line-height:1.3;margin:0 0 12px}.gd-document p{margin:8px 0}.gd-document dl{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px 24px;margin:0}.gd-document dl>div{min-width:0}.gd-document dt{font-size:13px;color:#526174}.gd-document dd{font-size:15px;font-weight:600;margin:3px 0 0;white-space:pre-wrap}.gd-document .gd-warning{border:1px solid #a66816;padding:15px;background:#fff8e9}.gd-document .gd-warning h2{color:#68400a}
.gd-document table{width:100%;border-collapse:collapse;table-layout:auto;font-size:13px}.gd-document th,.gd-document td{padding:9px 6px;text-align:left;vertical-align:top;border-bottom:1px solid #d3dce6;white-space:normal}.gd-document th{font-weight:700;background:#f2f5f9}.gd-document td:nth-last-child(-n+2){font-variant-numeric:tabular-nums;text-align:right}.gd-document thead{display:table-header-group}.gd-document footer{border-top:1px solid #bbc8d8;margin-top:26px;padding-top:14px;font-size:13px;color:#445268}
@media(max-width:560px){.gd-document{padding:18px}.gd-document dl{grid-template-columns:1fr}.gd-document table{font-size:12px}.gd-document th,.gd-document td{padding:7px 4px}}
`;
const printStyles=guestDocumentStyles+`
@page{size:portrait;margin:15mm}html,body{margin:0;padding:0;background:white}body{color:black}.gd-document{padding:0;font-size:11pt;line-height:1.4}.gd-document h1{font-size:22pt}.gd-document h2{font-size:13pt;break-after:avoid}.gd-document dd{font-size:11pt}.gd-document dt,.gd-document table,.gd-document .gd-prepared,.gd-document footer{font-size:10pt}.gd-document section,.gd-document table{break-inside:auto}.gd-document tr,.gd-document dl>div,.gd-document .gd-warning{break-inside:avoid}.gd-document thead{display:table-header-group}.gd-document footer{break-inside:avoid}.gd-document th{background:white}.gd-document dl{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
`;
export function GuestDocumentView({model}:{model:GuestDocumentModel}){return <article className="gd-document" aria-label={model.title}><header><p className="gd-property">{model.property}</p><h1>{model.title}</h1><p className="gd-prepared">{model.prepared}</p></header>{model.sections.map((section,index)=><section className={section.warning?'gd-warning':undefined} key={index}><h2>{section.heading}</h2>{section.paragraphs?.map((p,i)=><p key={i}>{p}</p>)}{section.facts&&section.facts.length>0&&<dl>{section.facts.map(([label,value],i)=><div key={i}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}{section.headers&&<>{section.rows?.length?<table><caption className="sr-only">{section.heading}</caption><thead><tr>{section.headers.map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{section.rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table>:<p>No additional account entries recorded.</p>}</>}</section>)}<footer>{model.footer}</footer></article>}

// Only a privacy-filtered model reaches this isolated print document.
export function printGuestDocument(model:GuestDocumentModel):()=>void{
 const frame=document.createElement('iframe');frame.title='Guest document print preview';frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;frame.style.cssText='position:fixed;width:1px;height:1px;left:-10000px;top:0;border:0;';document.body.appendChild(frame);
 const doc=frame.contentDocument,printWindow=frame.contentWindow;if(!doc||!printWindow){frame.remove();throw Error('The browser could not prepare the printable document. Try again.')}
 doc.title=model.filename;const style=doc.createElement('style');style.textContent=printStyles;doc.head.appendChild(style);const host=doc.createElement('main');doc.body.appendChild(host);let active=true;
 const cleanup=()=>{if(!active)return;active=false;printWindow.removeEventListener('afterprint',cleanup);frame.remove()};printWindow.addEventListener('afterprint',cleanup,{once:true});
 // React escapes every text field; no source HTML or interpolated guest markup is accepted.
 try{host.innerHTML=renderToStaticMarkup(<GuestDocumentView model={model}/>);printWindow.focus();printWindow.print()}catch{cleanup();throw Error('The browser could not open printing. Refresh the preview and try again.')}
 return cleanup;
}

export function guestDocumentHtml(model:GuestDocumentModel):string{
 // The same privacy-filtered, React-escaped content as the visible preview.
 return '<!doctype html>'+renderToStaticMarkup(<html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>{model.title}</title><style>{guestDocumentStyles+'@media print{'+printStyles+'}'}</style></head><body><p>Saved snapshot. Use your browser’s Print command to print or save as PDF. Refresh the PMS preview for current records.</p><GuestDocumentView model={model}/></body></html>);
}
export function downloadGuestDocument(model:GuestDocumentModel):void{
 const url=URL.createObjectURL(new Blob([guestDocumentHtml(model)],{type:'text/html;charset=utf-8'}));
 const link=document.createElement('a');link.href=url;link.download=model.filename.replace(/[^a-z0-9._-]/gi,'-').slice(0,150)+'.html';
 document.body.appendChild(link);try{link.click()}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
}
