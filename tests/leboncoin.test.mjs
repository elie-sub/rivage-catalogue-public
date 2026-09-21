import test from 'node:test';
import assert from 'node:assert/strict';
import {publicFact,mergeFacts,toProperty,attachLeboncoin} from '../scripts/leboncoin.mjs';
import {sameProperty} from '../scripts/identity.mjs';
import {parseAlerts} from '../scripts/parse-leboncoin-alerts.mjs';
const fact={id:'3265557563',price:128000,area:31,rooms:2,city:'Granville',postcode:'50400',type:'Appartement',center:false,observedAt:'2026-09-08'};
const snapshot={importedAt:'2026-09-19T15:00:00Z',facts:[fact]};
const catalog={schema:1,updatedAt:snapshot.importedAt,sources:[],properties:[]};
test('allowlist excludes private email metadata and non-Granville apartments',()=>{
 assert.deepEqual(publicFact({...fact,email:'private@example.test',messageId:'secret',source:'https://tracking.example/token',html:'private'}),fact);
 for(const change of [{city:'Donville-les-Bains'},{postcode:'50350'},{type:'Maison'},{price:NaN},{rooms:1.5},{id:'../private'}])assert.equal(publicFact({...fact,...change}),null);
});
test('email receipt does not become publication or a live verification',()=>{
 const p=toProperty(fact,snapshot.importedAt);assert.equal(p.publishedAt,null);assert.equal(p.floor,null);assert.equal(p.condition,'unknown');assert.equal(p.firstSeenAt,snapshot.importedAt);assert.equal(p.availabilityVerified,false);
});
test('imports are idempotent and older alerts cannot revert newer prices',()=>{
 assert.equal(mergeFacts([fact],[{...fact,price:120000,observedAt:'2026-08-01'}])[0].price,128000);
 const first=attachLeboncoin(catalog,snapshot),second=attachLeboncoin(first,snapshot);
 assert.equal(second.properties.length,1);assert.equal(second.properties[0].firstSeenAt,snapshot.importedAt);
 assert.equal(second.sources[0].checked,0);assert.equal(second.sources[0].lastImportedAt,snapshot.importedAt);
});
test('an alert only enriches aliases on an already verified agency listing',()=>{
 const p={...toProperty(fact,snapshot.importedAt),id:'agency-123',agency:'Pozzo',sourceKind:'agency',source:'https://example.test/listing',aliases:['https://www.leboncoin.fr/vi/3265557563.htm'],price:130000,floor:2,condition:'renovate',checked:'2026-09-19'};
 const result=attachLeboncoin({...catalog,properties:[p]},snapshot);
 assert.equal(result.properties.length,1);assert.equal(result.properties[0].price,130000);assert.equal(result.properties[0].floor,2);assert.equal(result.properties[0].checked,'2026-09-19');assert.equal(result.properties[0].listingSources[0].agency,'Leboncoin');
});
test('similar dimensions remain uncertain and are hidden as possible duplicates',()=>{
 const p={...toProperty({...fact,id:'3265557000'},snapshot.importedAt),id:'agency-other',agency:'Other'};
 const result=attachLeboncoin({...catalog,properties:[p]},snapshot);
 assert.equal(result.properties.length,2);assert.equal(result.deduplication.hiddenCandidates,1);assert.ok(result.properties.every(p=>p.possibleDuplicate));
});
test('legacy and current Leboncoin links refer to the same listing',()=>{
 assert.ok(sameProperty({id:'a',source:'https://www.leboncoin.fr/vi/3265557563.htm#tracking=private'},{id:'b',source:'https://www.leboncoin.fr/ad/ventes_immobilieres/3265557563?utm_source=mail'}));
});
test('MIME parser reads only official Granville apartment cards and strips tracking',()=>{
 const card=(city,type='Appartement')=>`<a href="https://www.leboncoin.fr/vi/3265557563.htm#private-tracking"><b>128 000 €</b> ${type} · 2 pièces · 31 m² ${city} Voir l’annonce</a>`;
 const message={internal_date:String(Date.parse('2026-09-08T06:05:00Z')),payload:{headers:[{name:'From',value:'leboncoin <no.reply@leboncoin.fr>'}],body:{content:card('Granville 50400')+card('Donville-les-Bains 50350')+card('Granville 50400','Maison')}}};
 assert.deepEqual(parseAlerts([message,message]),[fact]);
 assert.deepEqual(parseAlerts([{...message,payload:{...message.payload,headers:[{name:'From',value:'fake@example.test'}]}}]),[]);
});
test('an email import does not change the agency collection timestamp',()=>{
 const result=attachLeboncoin({...catalog,updatedAt:'2026-09-18T10:00:00Z'},snapshot,snapshot.importedAt);
 assert.equal(result.updatedAt,snapshot.importedAt);assert.equal(result.lastCollectedAt,'2026-09-18T10:00:00Z');
});
