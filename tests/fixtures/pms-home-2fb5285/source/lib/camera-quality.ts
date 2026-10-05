// Lightweight capture gating, not identity/document authentication.
export function cameraQuality(pixels:Uint8ClampedArray,width:number,height:number,previous?:Uint8Array){
 const gray=new Uint8Array(width*height);let sum=0,white=0,motion=0,signedMotion=0,sharpness=0,edges=0;
 for(let i=0;i<gray.length;i++){
  const j=i*4;gray[i]=Math.round((pixels[j]*.299+pixels[j+1]*.587+pixels[j+2]*.114));sum+=gray[i];if(gray[i]>248)white++;
  if(previous?.length===gray.length){const delta=gray[i]-previous[i];motion+=Math.abs(delta);signedMotion+=delta}
 }
 for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){const i=y*width+x;const lap=4*gray[i]-gray[i-1]-gray[i+1]-gray[i-width]-gray[i+width];sharpness+=lap*lap;if(Math.abs(gray[i]-gray[i-1])>35)edges++}
 const count=gray.length,light=sum/count,detail=sharpness/count,edgeRatio=edges/count;
 // Webcams often change exposure while focusing. Ignore uniform whole-frame
 // brightness drift, but keep local pixel changes as evidence of document motion.
 const localMotion=previous?.length===count?Math.max(0,motion/count-Math.abs(signedMotion/count)):Infinity;
 const moving=localMotion>12;
 const reason=light<45?'Add more light.':light>245||white/count>.75?'Tilt the document to reduce glare.':detail<130||edgeRatio<.025?'Move the document closer and let the camera focus.':moving?'Hold the document steady.':'';
 // A soft preview at 320px must not prevent reading the full-resolution frame.
 // Keep only blank/dark/overexposed/moving frames from the fallback attempt.
 const canAttempt=light>=45&&light<=245&&white/count<=.75&&detail>8&&!moving;
 return {gray,usable:!reason,canAttempt,reason};
}
