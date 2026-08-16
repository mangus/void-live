export function normalizePilotName(value){
  return Array.from(String(value??'').replace(/[^\p{L}\p{N} _-]/gu,'').replace(/\s+/g,' ').trim()).slice(0,20).join('');
}

export function pilotLabel(name,id){
  const clean=normalizePilotName(name);
  if(clean)return clean;
  if(id==='YOU')return 'YOU';
  return String(id??'PILOT').slice(0,5).toUpperCase();
}
