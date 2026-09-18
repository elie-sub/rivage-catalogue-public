import {defaults,calculate} from './model.mjs';
export const normalized=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const family=p=>/pozzo/i.test(p.agency)?'pozzo':/century/i.test(p.agency)?'century':/iad/i.test(p.agency)?'iad':/folliot/i.test(p.agency)?'folliot':normalized(p.agency);
const urls=p=>[p.source,p.photoSource,...(p.aliases||[])].filter(Boolean).map(x=>x.replace(/\/$/,''));
export function sameProperty(a,b){
 if(urls(a).some(x=>urls(b).includes(x)))return true;
 if(family(a)===family(b)&&normalized(a.ref)===normalized(b.ref)&&normalized(a.ref).length>2)return true;
 // Similar dimensions/prices are only a possible duplicate, never a proven identity.
 return false;
}
export function possibleDuplicate(a,b){return a.id!==b.id&&Math.abs(a.area-b.area)<.6&&a.rooms===b.rooms&&Math.abs(a.price-b.price)/Math.max(a.price,b.price)<.035;}
export function valid(p){return p&&typeof p.id==='string'&&typeof p.title==='string'&&p.price>0&&p.area>0&&p.rooms>0&&Number.isFinite(p.price)&&Number.isFinite(p.area)&&/^https:\/\//.test(p.source)&&Array.isArray(p.risks)&&Array.isArray(p.assets)&&Number.isFinite(calculate(defaults(p)).netYield);}
export function qualifies(p){return !p.archived&&!p.occupied&&!p.possibleDuplicate&&p.center===true&&Number.isInteger(p.floor)&&p.floor>0&&p.condition==='renovate'&&calculate(defaults(p)).netYield>=3;}
export function reconcile(catalog,state,incoming,now=new Date().toISOString()){
 const all=structuredClone(catalog.properties),seen=new Set(state.seenIds),changed=[],added=[];
 for(const raw of incoming.properties){
  if(!valid(raw))continue;
  const index=all.findIndex(p=>sameProperty(p,raw));
  if(index>=0){
   const old=all[index];const next={...raw,id:old.id,aliases:[...new Set([...urls(old),...urls(raw)])]};
   // Keep manually researched hypotheses and details when the automated source does not establish them.
   if(!old.automated){next.automated=false;for(const k of ['title','description','assets','risks','works','rent','ownerCharges','priority'])next[k]=old[k];if(old.center)next.center=old.center;}
   for(const k of ['floor','tax','charges','bedrooms'])if(next[k]==null)next[k]=old[k]??null;
   if(next.dpe==='?')next.dpe=old.dpe;
   next.firstSeenAt=old.firstSeenAt||old.checked;
   if(old.price!==next.price)changed.push({id:old.id,oldPrice:old.price,newPrice:next.price});
   all[index]=next;
  }else{raw.firstSeenAt=now;all.push(raw);added.push(raw.id);}
 }
 for(const p of all){
  if(p.automated&&!state.baselineIds.includes(p.id)){
   p.possibleDuplicate=all.some(other=>possibleDuplicate(p,other));
   if(p.possibleDuplicate&&!p.risks.includes('Doublon possible avec une autre annonce : identité du bien à vérifier.'))p.risks.push('Doublon possible avec une autre annonce : identité du bien à vérifier.');
  }
  seen.add(p.id);
 }
 const excluded=new Set([...(state.baselineIds||[]),...(state.alertedIds||[])]);
 const eligible=all.filter(p=>!excluded.has(p.id)&&qualifies(p));
 const pending=new Set([...(state.pendingAlerts||[]),...eligible.map(p=>p.id)]);
 const updated={...state,seenIds:[...seen],pendingAlerts:[...pending],lastAttemptAt:now};
 const successful=incoming.sources.some(s=>s.checked>0);
 if(successful)updated.lastCompletedDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(new Date(now));
 const output={schema:1,updatedAt:successful?now:catalog.updatedAt,lastAttemptAt:now,sources:incoming.sources,properties:all};
 return {catalog:output,state:updated,added,changed,successful};
}
