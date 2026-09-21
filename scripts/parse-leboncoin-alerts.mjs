// Read-only parser for Gmail MIME trees supplied by the authorized local connector.
// Output is limited to public listing facts. Never send raw input to the public repo.
import {readFile,writeFile} from 'node:fs/promises';
import {publicFact,mergeFacts} from './leboncoin.mjs';
export function parseAlerts(messages){const facts=[];
 const bodies=p=>[p?.body?.content||'',...(p?.parts||[]).flatMap(bodies)];
 for(const m of messages){
  const headers=m.payload?.headers||[],from=headers.find(h=>h.name.toLowerCase()==='from')?.value||'';
  if(!/^(?:leboncoin\s*<)?no\.reply@leboncoin\.fr>?$/i.test(from.trim()))continue;
  const timestamp=Number(m.internal_date);if(!Number.isFinite(timestamp)||timestamp<=0)continue;
  const observedAt=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(new Date(timestamp));
  for(const html of bodies(m.payload))for(const a of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)){
   const id=a[1].match(/^https:\/\/www\.leboncoin\.fr\/(?:vi\/(\d+)\.htm|ad\/ventes_immobilieres\/(\d+))(?:[#?]|$)/);if(!id)continue;
   const text=a[2].replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ').trim();
   const spec=text.match(/Appartement\s*·\s*(\d+)\s*pièces?\s*·\s*([\d,.]+)\s*m²/i),price=text.match(/^([\d\s]+)\s*€/);
   if(!spec||!price||!/\bGranville 50400\b/.test(text))continue;
   const fact=publicFact({id:id[1]||id[2],price:Number(price[1].replace(/\s/g,'')),area:Number(spec[2].replace(',','.')),rooms:Number(spec[1]),city:'Granville',postcode:'50400',type:'Appartement',center:/\bCentre\b/i.test(text),observedAt});if(fact)facts.push(fact);
  }
 }
 return mergeFacts([],facts);
}
if(process.argv[1]?.endsWith('/parse-leboncoin-alerts.mjs')){
 const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Provide private input and public-facts output paths.');
 const raw=JSON.parse(await readFile(input,'utf8'));const facts=parseAlerts(raw.responses||raw);
 await writeFile(output,JSON.stringify(facts,null,2)+'\n');console.log(JSON.stringify({facts:facts.length}));
}
