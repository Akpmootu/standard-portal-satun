import {OAuth2Client} from 'google-auth-library';
import {readFile,writeFile} from 'node:fs/promises';
import {readConfig,loadLocalEnvironment} from '../src/config.js';
const folder='.migration/complete-archive',id='1IKnC8r876AOPQEIT3BjD3jT7BvxrLU1PYkA_QJFlBn8';
const col=n=>{let s='';for(;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
try{
 const config=readConfig(await loadLocalEnvironment()),client=new OAuth2Client(config.storage.clientId,config.storage.clientSecret);client.setCredentials({refresh_token:config.storage.refreshToken});
 const get=async(path,params={})=>{const url=new URL(path);for(const [k,v] of Object.entries(params))for(const item of Array.isArray(v)?v:[v])url.searchParams.append(k,String(item));return (await client.request({url:url.href,method:'GET',timeout:45000,retry:false})).data;};
 const source=JSON.parse(await readFile(folder+'/source.json','utf8')),metadata=JSON.parse(await readFile(folder+'/native-metadata.json','utf8')),root='https://sheets.googleapis.com/v4/spreadsheets/'+id;
 const corrections=JSON.parse(await readFile(folder+'/native-cell-corrections.json','utf8'));
 if(process.argv[2]==='--prepare-corrections'){
  const ranges=corrections.map(c=>`'${c.sheet}'!${col(c.column+1)}${c.row+1}`);
  const current=await get(root,{ranges,includeGridData:true,fields:'sheets(properties(title,sheetId),data(startRow,startColumn,rowData(values(userEnteredValue,effectiveValue,dataValidation))))'});
  const requests=[];
  for(const c of corrections){const sheet=current.sheets.find(s=>s.properties.title===c.sheet),block=sheet?.data.find(d=>(d.startRow||0)===c.row&&(d.startColumn||0)===c.column),cell=block?.rowData?.[0]?.values?.[0];
   if(!cell||cell.dataValidation||!['',c.value,c.value.replace(/\r\n/g,'\n')].includes(cell.effectiveValue?.stringValue??''))throw Error('UNEXPECTED_CELL_BEFORE_REPAIR');
   requests.push({updateCells:{start:{sheetId:sheet.properties.sheetId,rowIndex:c.row,columnIndex:c.column},rows:[{values:[{userEnteredValue:{stringValue:c.value}}]}],fields:'userEnteredValue'}});
  }
  const overview=metadata.sheets.find(s=>s.properties.title==='รายการข้อมูล').properties.sheetId;
  requests.push({updateCells:{start:{sheetId:overview,rowIndex:1,columnIndex:1},rows:[{values:[{userEnteredValue:{stringValue:source.capturedAt},userEnteredFormat:{numberFormat:{type:'TEXT'}}}]}],fields:'userEnteredValue,userEnteredFormat.numberFormat'}});
  console.log(JSON.stringify(requests));
 }else{
  const specs=[];for(const [name,t] of Object.entries(source.tables))for(let offset=0;offset<t.rows.length+1;offset+=1000)specs.push({name,offset,end:Math.min(offset+1000,t.rows.length+1),columns:t.headers.length});
  let cells=0;const counts={};
  for(let offset=0;offset<specs.length;offset+=5){const chunk=specs.slice(offset,offset+5),ranges=chunk.map(s=>`'${s.name}'!A${s.offset+1}:${col(s.columns)}${s.end}`),result=await get(root+'/values:batchGet',{ranges,valueRenderOption:'UNFORMATTED_VALUE'});
   for(let j=0;j<chunk.length;j++){const s=chunk[j],actual=result.valueRanges[j].values||[],t=source.tables[s.name];if(actual.length!==s.end-s.offset)throw Error('NATIVE_ROW_COUNT_DIFFERENCE');
    for(let i=0;i<actual.length;i++){const index=s.offset+i,expected=index===0?t.headers:t.rows[index-1];for(let k=0;k<s.columns;k++){if(String(actual[i][k]??'')!==String(expected[k]??''))throw Error('NATIVE_CELL_DIFFERENCE '+s.name+' '+(index+1)+' '+(k+1));cells++;}if(index>0)counts[s.name]=(counts[s.name]||0)+1;}
   }
  }
  const lock=await get('https://www.googleapis.com/drive/v3/files/'+id,{fields:'id,modifiedTime,shared,trashed,permissions(role,emailAddress)'});
  if(lock.shared!==false||lock.trashed!==false||lock.permissions?.length!==1||lock.permissions[0].emailAddress!==config.ownerEmail)throw Error('ARCHIVE_NOT_PRIVATE');
  const record={spreadsheetId:id,capturedAt:source.capturedAt,modifiedTime:lock.modifiedTime,verified:true,cells,rows:Object.values(counts).reduce((a,b)=>a+b,0),tables:Object.fromEntries(Object.entries(source.tables).map(([n,t])=>[n,{rows:t.rows.length,headers:t.headers}]))};
  await writeFile(folder+'/native-verified.json',JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({ok:true,cells,rows:record.rows,tables:Object.keys(record.tables).length,private:true}));
 }
}catch(e){console.error('ARCHIVE_VERIFICATION_FAILED: '+(String(e.message).startsWith('NATIVE_')?e.message:'PRIVATE_DETAILS_HIDDEN'));process.exitCode=1;}
