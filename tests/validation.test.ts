import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { emptyState, type DocumentInfo, type Movement } from '../src/lib/model';
import { fresh } from '../src/lib/parsers';
import { validateAll } from '../src/lib/validation';
import { runValidation } from '../src/server/validation';

const bytes=Buffer.from('Documento fictício');
const doc:DocumentInfo={id:'document-1',name:'teste.csv',source:'outgoing',hash:createHash('sha256').update(bytes).digest('hex'),size:bytes.length,mime:'text/csv',importedAt:'2026-10-06T10:00:00Z',sheets:[],batch:'test'};
const move=(p:Partial<Movement>={})=>fresh(doc,{category:'DRY_SNUFF',date:'2026-01-10',invoice:'A',recipient:'Cliente',customer:'Cliente',state:'CA',kg:2,status:'accepted',...p});

test('full validation is non-mutating, includes all years and both products, and preserves onboarding',()=>{
  const s=emptyState();s.documents=[doc];s.movements=[move(),move({invoice:'B',date:'2025-03-02',category:'MAPACHO',kg:null,status:'staged',issues:['PDF: conferir o documento']})];
  const before=structuredClone(s);const report=validateAll(s,'run','2026-10-06T12:00:00Z');
  assert.deepEqual(s,before);assert.equal(report.movements,2);assert.equal(report.checks.length,8);
  assert.equal(report.checks.find(c=>c.key==='inventory')?.checked,48);
  assert.ok(report.findings.some(f=>f.message.includes('checklist')));
  assert.ok(report.findings.some(f=>f.message.startsWith('PDF')));
  assert.ok(report.findings.some(f=>f.message.includes('Peso não identificado')));
});
test('full validation detects accepted duplicates but respects explicit distinct and ignored decisions',()=>{
  const s=emptyState();s.documents=[doc];const a=move(),b=move({kg:3,kind:'SITE_SALE',site:'Sacred'}),ignored=move({status:'ignored'});s.movements=[a,b,ignored];
  const first=validateAll(s,'run','now');assert.equal(first.findings.filter(f=>f.check==='duplicates').length,1);assert.equal(first.skipped,1);
  b.distinctFrom=[a.id];assert.equal(validateAll(s,'run','now').findings.filter(f=>f.check==='duplicates').length,0);
});
test('full validation covers stock, Florida, document pairs and historical divergences together',()=>{
  const s=emptyState();s.initialized=true;s.documents=[doc];s.movements=[move({kind:'OPENING_STOCK',date:'2026-01-01',kg:1,invoice:'',origins:[]}),move({state:'FL',kg:5}),move({kind:'ENTRY',invoice:'E',kg:1})];
  s.references=[{id:'ref',documentId:doc.id,sheet:'Resumo Mensal',row:3,category:'DRY_SNUFF',month:'2026-01',metric:'closing',kg:20,originalLb:null}];
  const report=validateAll(s,'run','now');for(const key of ['inventory','florida','entries','history'])assert.ok(report.findings.some(f=>f.check===key),key);
  assert.ok(report.findings.some(f=>f.message.includes('estoque final negativo')));
});
test('server validation checks original bytes, reports unreadable documents and persists only report and audit',async()=>{
  const s=emptyState();s.documents=[doc,{...doc,id:'document-2',name:'ausente.pdf',hash:'other'},{...doc,id:'document-3',name:'alterado.pdf',hash:'wrong'}];s.movements=[move()];
  const before=structuredClone(s.movements);await runValidation(s,async id=>{if(id==='document-2')throw new Error('private server detail');return bytes;});
  assert.deepEqual(s.movements,before);assert.equal(s.initialized,false);assert.equal(s.lastValidation?.version,1);assert.equal(s.audit.length,1);
  assert.ok(s.lastValidation?.findings.some(f=>f.documentId==='document-2'&&f.message.includes('não foi possível ler')));
  assert.ok(s.lastValidation?.findings.some(f=>f.documentId==='document-3'&&f.message.includes('assinatura')));
  assert.ok(!JSON.stringify(s.lastValidation).includes('private server detail'));
});
