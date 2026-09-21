import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {shouldRunDaily,parisDay} from './schedule.mjs';
import {reconcile} from './reconcile.mjs';
import {attachLeboncoin} from './leboncoin.mjs';
const catalog=JSON.parse(await readFile('data/catalog.json','utf8'));
const lastCollectedAt=catalog.lastCollectedAt||catalog.updatedAt;
const lastCompletedDay=lastCollectedAt?parisDay(lastCollectedAt):null;
if(!shouldRunDaily(new Date(),process.env.GITHUB_EVENT_NAME,lastCompletedDay)){console.log('Daily collection already completed, or before 09:00 Paris.');process.exit(0);}
const result=spawnSync('python3',['scripts/collect.py'],{encoding:'utf8',timeout:900000,maxBuffer:12e6});
if(result.status!==0)throw Error('Collecte indisponible, catalogue conservé.');
const ids=catalog.properties.map(p=>p.id),state={seenIds:ids,baselineIds:ids,alertedIds:[],pendingAlerts:[]};
const next=reconcile(catalog,state,JSON.parse(result.stdout));
try{next.catalog=attachLeboncoin(next.catalog,JSON.parse(await readFile('data/leboncoin.json','utf8')));}catch(e){if(e.code!=='ENOENT')throw e;}
await writeFile('data/catalog.json',JSON.stringify(next.catalog,null,2)+'\n');
console.log(JSON.stringify({updatedAt:next.catalog.updatedAt,count:next.catalog.properties.length,sources:next.catalog.sources}));
if(!next.successful)process.exitCode=2;
