import fs from 'node:fs/promises';
import path from 'node:path';
const base='http://127.0.0.1:3000';
const response=await fetch(base+'/api/state');if(!response.ok)throw new Error('Local application unavailable');
const before=await response.json();
if(before.importRulesVersion>=1){console.log('Rules already applied.');process.exit(0);}
const root=path.resolve('.data/backups');await fs.mkdir(root,{recursive:true});
const backup=path.join(root,`before-import-rules-${Date.now()}.json`);
await fs.writeFile(backup,JSON.stringify(before),{mode:0o600,flag:'wx'});
const result=await fetch(base+'/api/state',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({action:'apply_import_rules',version:before.version})});
const after=await result.json();if(!result.ok)throw new Error(after.error);
console.log(JSON.stringify({backup,version:after.version,historical:after.movements.filter(m=>m.historical).length,historicalPending:after.movements.filter(m=>m.historical&&m.status!=='accepted').length,newItemRows:after.movements.length-before.movements.length,historicalSheets:after.documents.flatMap(d=>d.historicalSheets||[]).length}));
