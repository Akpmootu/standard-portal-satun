import {readFile} from 'node:fs/promises';
import {openBackup} from '../src/backup.js';
import schema from '../src/schema.json' with {type:'json'};
// Emit bounded native cell data only; never emit keys or embedded file bytes.
const [path,name,startText='0',limitText='100']=process.argv.slice(2);
try {
 const key=JSON.parse(await readFile('.secrets/backup-key.json','utf8'));
 const snapshot=openBackup(JSON.parse(await readFile(path,'utf8')),Buffer.from(key.key,'hex'));
 if(!name) console.log(JSON.stringify({capturedAt:snapshot.capturedAt,tables:Object.entries(snapshot.tables).map(([name,t])=>({name,headers:t.headers,count:t.rows.length}))}));
 else {
  const start=Number(startText),limit=Number(limitText);
  if(!Object.hasOwn(schema,name)||!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('INVALID_RANGE');
  const t=snapshot.tables[name];console.log(JSON.stringify({name,start,headers:t.headers,rows:t.rows.slice(start,start+limit)}));
 }
}catch {console.error('RESTORE_PLAN_FAILED');process.exitCode=1;}
