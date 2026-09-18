import {defaults,calculate} from './model.mjs';
import {normalized,urls,sameProperty,possibleDuplicate,auditDuplicates,earliest} from './identity.mjs';
export {sameProperty,possibleDuplicate} from './identity.mjs';
export function valid(p){return p&&typeof p.id==='string'&&typeof p.title==='string'&&p.price>0&&p.area>0&&p.rooms>0&&Number.isFinite(p.price)&&Number.isFinite(p.area)&&/^https:\/\//.test(p.source)&&Array.isArray(p.risks)&&Array.isArray(p.assets)&&Number.isFinite(calculate(defaults(p)).netYield);}
export function qualifies(p){return !p.archived&&!p.occupied&&!p.possibleDuplicate&&p.center===true&&Number.isInteger(p.floor)&&p.floor>0&&p.condition==='renovate'&&calculate(defaults(p)).netYield>=3;}
export function reconcile(catalog,state,incoming,now=new Date().toISOString()){
 let all=structuredClone(catalog.properties);const seen=new Set(state.seenIds),changed=[],added=[];
 for(const raw of incoming.properties){
  if(!valid(raw))continue;
  const index=all.findIndex(p=>sameProperty(p,raw));
  if(index>=0){
   const old=all[index];const next={...raw,id:old.id,aliases:[...new Set([...urls(old),...urls(raw)])]};
   // Keep manually researched hypotheses and details when the automated source does not establish them.
   if(!old.automated){next.automated=false;for(const k of ['title','description','assets','risks','works','rent','ownerCharges','priority'])next[k]=old[k];if(old.center)next.center=old.center;}
   for(const k of ['floor','tax','charges','bedrooms'])if(next[k]==null)next[k]=old[k]??null;
   if(next.dpe==='?')next.dpe=old.dpe;
   next.firstSeenAt=earliest(old.firstSeenAt,old.checked,raw.firstSeenAt)||now;
   next.publishedAt=earliest(old.publishedAt,raw.publishedAt);next.publicationEvidence=(next.publishedAt===old.publishedAt?old:raw).publicationEvidence||null;
   next.mergedIds=[...new Set([...(old.mergedIds||[]),...(raw.mergedIds||[])])];next.listingSources=[...(old.listingSources||[]),...(raw.listingSources||[])];
   if(old.price!==next.price)changed.push({id:old.id,oldPrice:old.price,newPrice:next.price});
   all[index]=next;
  }else{raw.firstSeenAt=raw.firstSeenAt||now;all.push(raw);added.push(raw.id);}
 }
 const audit=auditDuplicates(all);all=audit.properties;
 for(const p of all)seen.add(p.id);
 const excluded=new Set([...(state.baselineIds||[]),...(state.alertedIds||[])]);
 const eligible=all.filter(p=>![p.id,...(p.mergedIds||[])].some(id=>excluded.has(id))&&qualifies(p));
 const pending=new Set([...(state.pendingAlerts||[]),...eligible.map(p=>p.id)]);
 const updated={...state,seenIds:[...seen],pendingAlerts:[...pending],lastAttemptAt:now};
 const successful=incoming.sources.some(s=>s.checked>0);
 if(successful)updated.lastCompletedDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(new Date(now));
 const output={schema:1,updatedAt:successful?now:catalog.updatedAt,lastAttemptAt:now,sources:incoming.sources,properties:all,deduplication:{checkedAt:now,confirmedMerged:audit.confirmedMerged,hiddenCandidates:audit.hiddenCandidates}};
 return {catalog:output,state:updated,added,changed,successful};
}
