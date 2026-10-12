import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {referenceSshArgs} from './reference-ssh-options.js';

try{
 const baseline=JSON.parse(await readFile('.migration/complete-archive/source.json','utf8'));
 const php=await readFile(new URL('./export-complete-archive.php',import.meta.url),'utf8');
 const r=spawnSync('C:/Windows/System32/OpenSSH/ssh.exe',referenceSshArgs(...process.argv.slice(2)),{input:php,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:96*1024*1024});
 if(r.status!==0)throw Error('EXPORT_FAILED');
 const fresh=JSON.parse(r.stdout);
 if(fresh.format!==baseline.format||fresh.readOnly!==true||Object.keys(fresh.tables).length!==20||JSON.stringify(Object.keys(fresh.tables).sort())!==JSON.stringify(Object.keys(baseline.tables).sort()))throw Error('ARCHIVE_INVENTORY_CHANGED');
 const sha=value=>createHash('sha256').update(value).digest('hex');
 // Compare all values, types, nulls and duplicate-row multiplicity. SQL tie ordering is immaterial.
 const digest=table=>sha(JSON.stringify({headers:table.headers,rows:table.rows.map(row=>JSON.stringify(row)).sort()}));
 const tables=Object.fromEntries(Object.entries(fresh.tables).map(([name,table])=>{
  const old=baseline.tables[name],before=digest(old),after=digest(table);
  return [name,{baselineRows:old.rows.length,currentRows:table.rows.length,columns:table.headers.length,headersEqual:JSON.stringify(old.headers)===JSON.stringify(table.headers),valuesEqual:before===after,baselineSha256:before,currentSha256:after}];
 }));
 const stamp=fresh.capturedAt.replace(/[:.]/g,'-'),folder='.migration/source-deltas/'+stamp;
 await mkdir(folder,{recursive:true});const body=JSON.stringify(fresh)+'\n';await writeFile(folder+'/source.json',body,{flag:'wx',mode:0o600});
 const report={readOnly:true,baselineCapturedAt:baseline.capturedAt,currentCapturedAt:fresh.capturedAt,tablesChecked:20,totalRows:Object.values(fresh.tables).reduce((n,t)=>n+t.rows.length,0),allBusinessValuesEqual:Object.values(tables).every(t=>t.valuesEqual),credentialExclusionsEqual:JSON.stringify(fresh.omittedCredentialColumns)===JSON.stringify(baseline.omittedCredentialColumns),tables,snapshotSha256:sha(body),note:'Comparison with verified archive snapshot only. Source remains writable; repeat after agreed write freeze. No destination writes.'};
 await writeFile(folder+'/report.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(report));
}catch{console.error('SOURCE_ARCHIVE_DELTA_FAILED: PRIVATE_DETAILS_HIDDEN');process.exitCode=1;}
