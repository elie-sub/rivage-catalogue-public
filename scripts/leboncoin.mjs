import {auditDuplicates,sameProperty,earliest,urls} from './identity.mjs';

export const searchUrl='https://www.leboncoin.fr/cl/ventes_immobilieres/cp_granville_50400/real_estate_type%3A2';
// Strict allowlist: never publish a MIME message, recipient or tracking URL.
export function publicFact(raw){
 if(raw?.city!=='Granville'||raw.postcode!=='50400'||raw.type!=='Appartement'||!/^\d{6,12}$/.test(String(raw.id)))return null;
 if(![raw.price,raw.area,raw.rooms].every(n=>Number.isFinite(n)&&n>0)||!Number.isInteger(raw.rooms)||raw.price>1e7||raw.area>2000||raw.rooms>30)return null;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(raw.observedAt)||!Number.isFinite(Date.parse(raw.observedAt)))return null;
 return {id:String(raw.id),price:raw.price,area:raw.area,rooms:raw.rooms,city:'Granville',postcode:'50400',type:'Appartement',center:raw.center===true,observedAt:raw.observedAt};
}
export function mergeFacts(previous,incoming){
 const byId=new Map();
 for(const raw of [...previous,...incoming]){const p=publicFact(raw);if(!p)continue;const old=byId.get(p.id);if(!old||p.observedAt>=old.observedAt)byId.set(p.id,p);}
 return [...byId.values()].sort((a,b)=>b.observedAt.localeCompare(a.observedAt)||a.id.localeCompare(b.id));
}
export function toProperty(p,importedAt){
 return {id:'leboncoin-'+p.id,title:`Appartement ${p.rooms} pièce${p.rooms>1?'s':''} · ${p.area} m²`,price:p.price,area:p.area,rooms:p.rooms,
 source:`https://www.leboncoin.fr/ad/ventes_immobilieres/${p.id}`,agency:'Leboncoin',ref:p.id,
 center:p.center,zone:p.center?'Centre de Granville · annoncé':'Granville · secteur à confirmer',floor:null,bedrooms:null,condition:'unknown',dpe:'?',charges:null,tax:null,
 works:Math.round(p.area*1100),rent:Math.min(950,Math.round(p.area*(p.area<35?17:p.area<55?15:13))),ownerCharges:350,
 description:'Appartement repéré dans une alerte Leboncoin. Prix, surface et pièces issus de l’alerte ; disponibilité, étage, état et diagnostics à confirmer. Loyer et travaux sont des hypothèses modifiables.',
 assets:['Annonce Leboncoin'],risks:['Disponibilité actuelle non vérifiée : consulter l’annonce.','Étage, état, DPE, copropriété et occupation à confirmer.','Travaux provisionnés à 1 100 €/m², sans devis ni état constaté.'],
 checked:p.observedAt,sourceObservedAt:p.observedAt,firstSeenAt:importedAt,publishedAt:null,publicationEvidence:null,
 sourceKind:'leboncoin_alert',availabilityVerified:false,automated:true,archived:false,occupied:false,priority:20};
}
export function attachLeboncoin(catalog,snapshot,now=catalog.updatedAt){
 const facts=mergeFacts([],snapshot.facts||[]),all=structuredClone(catalog.properties);
 for(const fact of facts){
  const raw=toProperty(fact,snapshot.importedAt);const old=all.find(p=>sameProperty(p,raw));
  if(!old){all.push(raw);continue;}
  // Sparse email observations must never overwrite an agency's richer/live facts.
  old.aliases=[...new Set([...urls(old),raw.source])];
  const entry={url:raw.source,agency:'Leboncoin',ref:raw.ref,price:raw.price,checked:raw.checked,sourceKind:'leboncoin_alert',publishedAt:null};
  old.listingSources=[...(old.listingSources||[]).filter(s=>s.url!==raw.source),entry];
  if(old.sourceKind==='leboncoin_alert'&&raw.sourceObservedAt>=(old.sourceObservedAt||'')){
   const first=old.firstSeenAt;Object.assign(old,{price:raw.price,sourceObservedAt:raw.sourceObservedAt,checked:raw.checked,firstSeenAt:earliest(first,snapshot.importedAt)});
  }
 }
 const audit=auditDuplicates(all);
 const source={id:'leboncoin',name:'Leboncoin',url:searchUrl,status:'email_import',mode:'email',checked:0,imported:facts.length,lastImportedAt:snapshot.importedAt,lastObservedAt:facts[0]?.observedAt||null,discovered:facts.length,errors:0,message:'Alertes reçues importées ; collecte directe indisponible. Import assisté, hors collecte cloud quotidienne.'};
 return {...catalog,updatedAt:now,sources:[...catalog.sources.filter(s=>s.id!=='leboncoin'),source],properties:audit.properties,deduplication:{checkedAt:now,confirmedMerged:audit.confirmedMerged,hiddenCandidates:audit.hiddenCandidates}};
}
