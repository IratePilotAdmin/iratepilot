'use client';
import {useState} from 'react';
import {PrivateGuideDownload} from '@/components/private-guide-download';
import {findManualArticles,manualNavigationCoverage,manualRevision,operatingManual,operatingManualText} from '@/lib/operating-manual';
export function OperatingManual({topicIds}:{topicIds?:readonly string[]}){
 const [query,setQuery]=useState(''),[showAll,setShowAll]=useState(!topicIds),[shortcut,setShortcut]=useState(''),[guideArea,setGuideArea]=useState('');
 const articles=findManualArticles(query).filter(article=>(!guideArea||manualNavigationCoverage[guideArea]?.includes(article.id))&&(!shortcut||article.title===shortcut)&&(showAll||query.trim()||topicIds?.includes(article.id)));
 const [downloadError,setDownloadError]=useState('');
 const shortcuts=['Daily front-desk checklist','Book a walk-in guest','Check in a reserved guest','Check out a guest','Hand over your shift'];
 function download(){
  setDownloadError('');
  let url:string|undefined;
  let link:HTMLAnchorElement|undefined;
  try{
   url=URL.createObjectURL(new Blob(['\ufeff'+operatingManualText()],{type:'text/plain;charset=utf-8'}));
   link=document.createElement('a');link.href=url;link.download='iRatePilot-operating-guide-'+manualRevision+'.txt';
   document.body.appendChild(link);link.click();
  }catch{setDownloadError('The guide could not be downloaded. You can still read the topics below.');}
  finally{link?.remove();if(url){const objectUrl=url;setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);}}
 }
 return <section className="operating-manual" aria-label="Operating manual"><p>Operating guide · Updated {manualRevision}. This guide covers documented workflows; it is not a launch certification. Articles marked Release preview describe changes that may not be enabled for your property.</p><label className="field">Find instructions by PMS screen<select value={guideArea} onChange={e=>{setGuideArea(e.target.value);setShortcut('');setShowAll(true)}}><option value="">All screens</option>{Object.keys(manualNavigationCoverage).map(view=><option key={view} value={view}>{view}</option>)}</select></label><label className="field">Search the operating manual<input type="search" value={query} onChange={e=>{setShortcut('');setQuery(e.target.value)}} placeholder="Try check-in, dirty room, refund or storage"/></label><output>{articles.length} topics found</output><p>The assistant above is read-only. Operating-instruction answers use this guide; current-property answers use only supported facts from your authorized workspace. It cannot change rooms, reservations, guest records or payments. Verify feature availability before acting.</p>
 <div><button className="secondary" onClick={download}>Download operating guide</button><p>Text file containing all guide topics, including those outside your search. No guest or property records are included.</p></div>
 <div><PrivateGuideDownload/><p>Current edition: {operatingManual.length} selected-workflow topics, with a clickable contents section. Includes room setup, Today front-desk shortcuts, reservations, housekeeping, finance, migration, guest arrival and recovery workflows. Unpublished features are marked Release preview; confirm availability before using them.</p></div>
 <nav aria-label="Common front-desk tasks"><h3>Start with your task</h3>{shortcuts.map(title=><button key={title} type="button" className="secondary" onClick={()=>{setGuideArea('');setShowAll(true);setShortcut(title);setQuery(title)}}>{title}</button>)}{(query||guideArea)&&<button type="button" className="secondary" onClick={()=>{setGuideArea('');setShortcut('');setQuery('');setShowAll(true)}}>Show all guide topics</button>}</nav>
 {downloadError&&<p role="alert">{downloadError}</p>}
 {!showAll&&<div><p>Suggested topics for this screen. Searching includes the entire guide.</p><button className="secondary" onClick={()=>setShowAll(true)}>Show all topics</button></div>}
 {articles.map(a=><details className="card" key={query+a.id} open={articles.length===1?true:undefined}><summary>{a.title} <small>· {a.area} · {a.availability}</small></summary><ol>{a.steps.map((step,i)=><li key={i}>{step}</li>)}</ol>{a.notes.map((note,i)=><p key={i}>{note}</p>)}</details>)}
 {!articles.length&&<p>No matching topic. Try fewer words or a task name. This guide does not yet cover every PMS operation.</p>}
 </section>;
}

