export const normalized=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
export const family=p=>/pozzo/i.test(p.agency)?'pozzo':/century/i.test(p.agency)?'century':/iad/i.test(p.agency)?'iad':/folliot/i.test(p.agency)?'folliot':normalized(p.agency);
export function canonicalUrl(value){try{const u=new URL(value);u.hash='';u.hostname=u.hostname.replace(/^www\./,'');for(const k of [...u.searchParams.keys()])if(/^(utm_|fbclid$|gclid$)/i.test(k))u.searchParams.delete(k);u.searchParams.sort();return u.origin+u.pathname.replace(/\/$/,'')+u.search;}catch{return '';}}
export const urls=p=>[p.source,p.photoSource,...(p.aliases||[]),...(p.listingSources||[]).map(s=>s.url)].filter(Boolean).map(canonicalUrl).filter(Boolean);
const refs=p=>[{agency:p.agency,ref:p.ref},...(p.listingSources||[])].filter(s=>s.ref&&/^\d{3,}$|^[a-zA-Z]*\d{3,}[a-zA-Z]*$/.test(String(s.ref)));
const sameRef=(a,b)=>refs(a).some(x=>refs(b).some(y=>family(x)===family(y)&&normalized(x.ref)===normalized(y.ref)));
const compatible=(a,b)=>a.rooms===b.rooms&&Math.abs(a.area-b.area)<=Math.max(.6,Math.min(a.area,b.area)*.01)&&!(Number.isInteger(a.floor)&&Number.isInteger(b.floor)&&a.floor!==b.floor)&&!(a.bedrooms&&b.bedrooms&&Number(a.bedrooms)!==Number(b.bedrooms));
function photoKey(p){const s=String(p.photo||'');const uuid=s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);return uuid?uuid[0].toLowerCase():s&&!/logo|placeholder|default|agency/i.test(s)?canonicalUrl(s):'';}
export function sameProperty(a,b){
 if(a.id===b.id||(a.mergedIds||[]).includes(b.id)||(b.mergedIds||[]).includes(a.id))return true;
 if(urls(a).some(u=>urls(b).includes(u))||sameRef(a,b))return true;
 const image=photoKey(a);return !!image&&image===photoKey(b)&&compatible(a,b)&&Math.abs(a.price-b.price)/Math.max(a.price,b.price)<.06;
}
export function possibleDuplicate(a,b){return a.id!==b.id&&compatible(a,b)&&Math.abs(a.price-b.price)/Math.max(a.price,b.price)<.035;}
export function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)&&Number.isFinite(Date.parse(value))?value:null;}
export function earliest(...dates){return dates.flat().map(validDate).filter(Boolean).sort((a,b)=>Date.parse(a)-Date.parse(b))[0]||null;}
const sourceRecord=p=>({url:p.source,agency:p.agency,ref:p.ref,price:p.price,checked:p.checked,publishedAt:p.publishedAt||null});
function merge(a,b){
 const preferred=!a.automated?a:!b.automated?b:a;
 const result={...preferred,id:a.id,mergedIds:[...new Set([...(a.mergedIds||[]),b.id,...(b.mergedIds||[])])].filter(id=>id!==a.id),aliases:[...new Set([...urls(a),...urls(b)])]};
 const sources=[sourceRecord(a),...(a.listingSources||[]),sourceRecord(b),...(b.listingSources||[])];
 result.listingSources=[...new Map(sources.filter(s=>s.url).map(s=>[canonicalUrl(s.url),s])).values()];
 for(const field of ['floor','tax','charges','bedrooms','photo'])if(result[field]==null)result[field]=a[field]??b[field]??null;
 result.firstSeenAt=earliest(a.firstSeenAt,a.checked,b.firstSeenAt,b.checked);
 result.publishedAt=earliest(a.publishedAt,b.publishedAt);
 result.publicationEvidence=(result.publishedAt===a.publishedAt?a:b).publicationEvidence||null;
 result.identityStatus='confirmed';return result;
}
export function auditDuplicates(input){
 const groups=[];
 for(const original of input){let p=structuredClone(original);p.firstSeenAt=p.firstSeenAt||p.checked||null;
  const indexes=groups.map((g,i)=>sameProperty(g,p)?i:-1).filter(i=>i>=0);
  if(!indexes.length){groups.push(p);continue;}
  const first=indexes.shift();groups[first]=merge(groups[first],p);
  for(const i of indexes.reverse()){groups[first]=merge(groups[first],groups[i]);groups.splice(i,1);}
 }
 for(const p of groups){p.possibleDuplicate=false;p.possibleDuplicateIds=[];delete p.duplicateCandidateOf;}
 const representatives=[];
 for(const p of groups){
  const others=groups.filter(other=>possibleDuplicate(p,other));p.possibleDuplicate=others.length>0;p.possibleDuplicateIds=others.map(x=>x.id);
  const representative=representatives.find(other=>possibleDuplicate(p,other));
  if(representative)p.duplicateCandidateOf=representative.id;else representatives.push(p);
 }
 return {properties:groups,confirmedMerged:input.length-groups.length,hiddenCandidates:groups.filter(p=>p.duplicateCandidateOf).length};
}
export function compareDate(a,b,field,direction=-1){const aa=validDate(a[field]),bb=validDate(b[field]);if(!aa&&!bb)return a.id.localeCompare(b.id);if(!aa)return 1;if(!bb)return -1;return direction*(Date.parse(aa)-Date.parse(bb))||a.id.localeCompare(b.id);}
