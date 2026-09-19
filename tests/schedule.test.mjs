import test from 'node:test';import assert from 'node:assert/strict';
import {shouldRunDaily,parisDay} from '../scripts/schedule.mjs';
test('a delayed afternoon runner still performs a missing daily collection',()=>{assert.equal(shouldRunDaily(new Date('2026-09-19T11:49:20Z'),'schedule','2026-09-18'),true);});
test('repeated scheduled runs do not repeat a completed Paris day',()=>{assert.equal(shouldRunDaily(new Date('2026-09-19T15:00:00Z'),'schedule','2026-09-19'),false);});
test('summer and winter both wait for 9am Paris',()=>{assert.equal(shouldRunDaily(new Date('2026-09-19T07:00:00Z'),'schedule',null),true);assert.equal(shouldRunDaily(new Date('2026-12-19T07:00:00Z'),'schedule',null),false);assert.equal(shouldRunDaily(new Date('2026-12-19T08:00:00Z'),'schedule',null),true);});
test('manual recovery remains possible and midnight uses Paris date',()=>{assert.equal(shouldRunDaily(new Date('2026-09-19T06:00:00Z'),'workflow_dispatch','2026-09-19'),true);assert.equal(parisDay('2026-09-19T22:30:00Z'),'2026-09-20');});
