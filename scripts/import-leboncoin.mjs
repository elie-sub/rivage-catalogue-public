import {readFile,writeFile} from 'node:fs/promises';
import {mergeFacts,attachLeboncoin} from './leboncoin.mjs';
const input=process.argv[2];if(!input)throw Error('Provide a private JSON file containing public listing facts only.');
const incoming=JSON.parse(await readFile(input,'utf8'));
if(!Array.isArray(incoming))throw Error('Expected an array of public facts.');
let previous={facts:[]};try{previous=JSON.parse(await readFile('data/leboncoin.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const now=new Date().toISOString(),facts=mergeFacts(previous.facts,incoming);
if(!facts.length)throw Error('No valid Granville apartment facts.');
const snapshot={schema:1,importedAt:now,facts};
const catalog=JSON.parse(await readFile('data/catalog.json','utf8'));
const next=attachLeboncoin(catalog,snapshot,now);
await writeFile('data/leboncoin.json',JSON.stringify(snapshot,null,2)+'\n');
await writeFile('data/catalog.json',JSON.stringify(next,null,2)+'\n');
console.log(JSON.stringify({imported:facts.length,added:next.properties.length-catalog.properties.length,hiddenCandidates:next.deduplication.hiddenCandidates}));
