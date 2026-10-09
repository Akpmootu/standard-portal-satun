import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {readConfig,loadLocalEnvironment} from '../src/config.js';
import {googleStore} from '../src/google-store.js';
import schema from '../src/schema.json' with {type:'json'};
try{
 const config=readConfig(await loadLocalEnvironment()),store=googleStore(config).forRequest(),tables={};
 for(const table of Object.keys(schema))tables[table]=await store.table(table);
 const body=JSON.stringify({format:'standard-portal-private-backup-v1',createdAt:new Date().toISOString(),sheetId:config.applicationSheetId,tables},null,2)+'\n';
 await mkdir('.migration',{recursive:true});const path=resolve('.migration','target-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');await writeFile(path,body,{flag:'wx',mode:0o600});
 console.log(JSON.stringify({path,sha256:createHash('sha256').update(body).digest('hex'),counts:Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,v.length])),writes:false}));
}catch{console.error('TARGET_SNAPSHOT_FAILED: credentials and records not printed');process.exitCode=1;}
