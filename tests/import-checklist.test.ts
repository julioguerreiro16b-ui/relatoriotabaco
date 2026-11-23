import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, MANUAL_SOURCES, SITE_SOURCES } from '../src/lib/model';
import { action } from '../src/server/actions';
import { completeness } from '../src/lib/domain';

test('manual documents can be processed without requiring file uploads for WooCommerce stores',()=>{
 const state=emptyState();
 for(const source of MANUAL_SOURCES.filter(s=>s.required))state.unavailable[source.key]=true;
 action(state,{action:'commit',confirmed:true});
 assert.equal(state.initialized,true);
 for(const source of SITE_SOURCES){
  assert.equal(state.unavailable[source],undefined);
  assert.ok(completeness(state).some(issue=>issue.includes(source)));
 }
});
test('manual checklist still requires acknowledgement of missing supporting documents',()=>{
 const state=emptyState();
 assert.throws(()=>action(state,{action:'commit',confirmed:true}),/Planilha histórica/);
 assert.equal(state.initialized,false);
});
