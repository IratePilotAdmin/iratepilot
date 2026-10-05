'use client';

/** Only used when a deferred module fails to import, before its workflow mounts. */
export function SectionLoadError(){
 return <section className="card" role="alert">
  <h2>This section could not load</h2>
  <p>Check your connection, then reload the PMS to try again. You can still use the other sections.</p>
  <button className="primary" onClick={()=>window.location.reload()}>Reload PMS</button>
 </section>;
}
