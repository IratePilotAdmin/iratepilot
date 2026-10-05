export function selectRoomIds(current:string[], anchor:string|null, id:string, visible:string[], range:boolean, toggle:boolean){
 if(range&&anchor&&visible.includes(anchor)&&visible.includes(id)){
  const a=visible.indexOf(anchor),b=visible.indexOf(id);
  return [...new Set([...current,...visible.slice(Math.min(a,b),Math.max(a,b)+1)])];
 }
 return toggle?(current.includes(id)?current.filter(x=>x!==id):[...current,id]):[id];
}
