/* Runtime adapter. Build Writer.gs with scripts/build-mou-writer.js.
   All shared business rules are bundled from src; never edit generated code. */
function writerHex(bytes){return bytes.map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');}
function writerAssert(ok,code){if(!ok)throw new Error(code);}
function writerSame(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;var diff=0;for(var i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
function writerHash(s){return writerHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s,Utilities.Charset.UTF_8));}
function writerOutput(value){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
function doGet(){return writerOutput({ok:false,error:'POST_REQUIRED'});}
function writerColumn(n){var s='';for(;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
function writerRead(sheetId,module){
  var tableNames=WriterRules.WRITE_TABLES.concat(ManagementRules.MANAGEMENT_TABLES);
  if(module){var def=ModuleRules.MODULES[module];writerAssert(def,'UNKNOWN_MODULE');tableNames=tableNames.concat([def.catalog,def.progress,def.history]);}
  var meta=Sheets.Spreadsheets.get(sheetId,{fields:'spreadsheetId,sheets(properties(sheetId,title,gridProperties))'});
  var tabs={},ranges=[];
  tableNames.forEach(function(name){
    var props=meta.sheets.filter(s=>s.properties.title===name).map(s=>s.properties);
    writerAssert(props.length===1,'SCHEMA_MISMATCH');
    var contract=WRITER_SCHEMA[name],p=props[0];
    writerAssert(p.gridProperties.rowCount>=1&&p.gridProperties.rowCount<=contract.maxRows+1,'TABLE_LIMIT_EXCEEDED');
    tabs[name]=p;ranges.push("'"+name+"'!A1:"+writerColumn(contract.headers.length)+p.gridProperties.rowCount);
  });
  var result=Sheets.Spreadsheets.Values.batchGet(sheetId,{ranges:ranges,valueRenderOption:'UNFORMATTED_VALUE'});
  writerAssert(result.valueRanges&&result.valueRanges.length===ranges.length,'SCHEMA_MISMATCH');
  var tables={},rowIndices={},lastRows={};
  tableNames.forEach(function(name,index){
    var values=result.valueRanges[index].values||[],headers=WRITER_SCHEMA[name].headers,key=name==='write_requests'?'request_id':'id';
    writerAssert(JSON.stringify(values[0])===JSON.stringify(headers),'SCHEMA_MISMATCH');
    var seen=new Set();tables[name]=[];rowIndices[name]={};lastRows[name]=values.length;
    values.slice(1).forEach(function(row,i){
      if(!row.some(v=>v!==''&&v!=null))return;
      writerAssert(row.length<=headers.length,'SCHEMA_MISMATCH');
      var record={};headers.forEach((h,j)=>record[h]=row[j]==null?'':row[j]);
      writerAssert(typeof record[key]==='string'&&record[key]&&!seen.has(record[key]),'INVALID_RECORD_ID');seen.add(record[key]);
      headers.filter(h=>h==='id'||h.endsWith('_id')||h==='provider_subject').forEach(h=>writerAssert(typeof record[h]==='string','IDENTIFIER_NOT_TEXT'));
      tables[name].push(record);rowIndices[name][record[key]]=i+1;
    });
  });
  return {tables:tables,tabs:tabs,rowIndices:rowIndices,lastRows:lastRows};
}
function writerBatch(snapshot,plan){
  var requests=[];
  function rowWrite(name,record,existing){
    var p=snapshot.tabs[name],contract=WRITER_SCHEMA[name];
    var row=existing?snapshot.rowIndices[name][record.id]:snapshot.lastRows[name];
    writerAssert(Number.isInteger(row)&&row>=1&&row<=contract.maxRows,'TABLE_LIMIT_EXCEEDED');
    if(row>=p.gridProperties.rowCount)requests.push({appendDimension:{sheetId:p.sheetId,dimension:'ROWS',length:row-p.gridProperties.rowCount+1}});
    if(!existing)snapshot.lastRows[name]=row+1;
    p.gridProperties.rowCount=Math.max(p.gridProperties.rowCount,row+1);
    var values=contract.headers.map(function(h){var v=record[h];writerAssert(typeof v==='string'||typeof v==='number'&&Number.isFinite(v),'INVALID_WRITE_FIELD');return {userEnteredValue:typeof v==='number'?{numberValue:v}:{stringValue:v}};});
    requests.push({updateCells:{range:{sheetId:p.sheetId,startRowIndex:row,endRowIndex:row+1,startColumnIndex:0,endColumnIndex:values.length},rows:[{values:values}],fields:'userEnteredValue'}});
  }
  if(plan.changes){plan.changes.forEach(c=>rowWrite(c.table,c.record,c.existing));return {requests:requests};}
  rowWrite('mou_progress',plan.next,Boolean(plan.before));
  if(plan.history)rowWrite('mou_review_history',plan.history,false);
  rowWrite('audit_log',plan.audit,false);rowWrite('write_requests',plan.receipt,false);
  return {requests:requests};
}
function doPost(e){
  var lock=null,properties=PropertiesService.getScriptProperties();
  try{
    writerAssert(e&&e.postData&&typeof e.postData.contents==='string'&&e.postData.contents.length<=65536,'INVALID_ENVELOPE');
    var envelope=JSON.parse(e.postData.contents),key=properties.getProperty('MOU_WRITER_SECRET');
    writerAssert(typeof key==='string'&&/^[a-f0-9]{64}$/.test(key),'WRITER_NOT_CONFIGURED');
    writerAssert(envelope&&typeof envelope.payload==='string'&&envelope.payload.length<=50000&&typeof envelope.signature==='string'&&/^[a-f0-9]{64}$/.test(envelope.signature),'INVALID_ENVELOPE');
    var signature=writerHex(Utilities.computeHmacSha256Signature(envelope.payload,key,Utilities.Charset.UTF_8));
    writerAssert(writerSame(signature,envelope.signature),'INVALID_SIGNATURE');
    var payload=JSON.parse(envelope.payload),now=new Date();
    writerAssert(payload.v===2&&payload.audience==='standard-portal-mou-writer'&&Number.isSafeInteger(payload.timestamp)&&Math.abs(now.getTime()-payload.timestamp)<=120000,'REQUEST_EXPIRED');
    writerAssert(properties.getProperty('MOU_WRITES_ENABLED')==='1','WRITES_DISABLED');
    var sheetId=properties.getProperty('MOU_SHEET_ID');
    writerAssert(sheetId===WRITER_SHEET_ID,'WRONG_WRITER_TARGET');
    lock=LockService.getScriptLock();writerAssert(lock.tryLock(5000),'WRITER_BUSY');
    // Recheck after waiting: a previous unknown commit may have closed the gate.
    writerAssert(properties.getProperty('MOU_WRITES_ENABLED')==='1','WRITES_DISABLED');
    var account=payload.operation==='registration',assessment=payload.operation==='assessment',management=payload.operation==='management',migration=payload.operation==='migration';
    writerAssert(account||assessment||management||migration||!payload.operation,'INVALID_ENVELOPE');
    var command=account?RegistrationRules.normalizeRegistrationCommand(payload.command):assessment?ModuleRules.normalizeModuleCommand(payload.command):management?ManagementRules.normalizeManagementCommand(payload.command):migration?MigrationRules.normalizeMigrationCommand(payload.command):WriterRules.normalizeMouCommand(payload.command);
    var snapshot=writerRead(sheetId,assessment?command.module:null),hash=writerHash(JSON.stringify(command));
    var plan=account?RegistrationRules.planRegistration(snapshot.tables,payload.identity,command,hash,now):assessment?ModuleRules.planModuleWrite(snapshot.tables,payload.identity,command,hash,now):management?ManagementRules.planManagement(snapshot.tables,payload.identity,command,hash,now):migration?MigrationRules.planMigration(snapshot.tables,payload.identity,command,hash,now):WriterRules.planMouWrite(snapshot.tables,payload.identity,command,hash,now);
    if(plan.replayed)return writerOutput(plan.result);
    if(command.action==='review'||command.action==='response'){
      var targets=snapshot.tables.users.filter(u=>u.account_status==='active'&&u.role==='hospital'&&u.hospital_id===command.hospitalId&&snapshot.tables.identities.some(i=>i.legacy_user_id===u.id&&i.status==='active'));
      if(!plan.changes){plan.changes=[{table:'mou_progress',record:plan.next,existing:!!plan.before},{table:'mou_review_history',record:plan.history,existing:false},{table:'audit_log',record:plan.audit,existing:false},{table:'write_requests',record:plan.receipt,existing:false}];}
      targets.forEach(function(u,index){plan.changes.push({table:'notifications',existing:false,record:{id:'notification-'+command.requestId+'-'+index,user_id:u.id,hospital_id:command.hospitalId,type:'review',title:command.action==='response'?'ตอบข้อเสนอแนะ HAIT แล้ว':'มีผลตรวจประเมินใหม่',message:command.action==='response'?'ผู้ดูแลตอบคำขอความช่วยเหลือแล้ว':'กรุณาเปิดผลตรวจและข้อเสนอแนะในหน้าประเมิน',related_type:assessment?command.module:management?'hait-comment':'mou',related_item_id:command.itemId||command.chapterId,is_read:0,created_at:WriterRules.bangkokTimestamp(now),_version:1,_request_id:command.requestId}});});
    }
    var batch=writerBatch(snapshot,plan);
    try{Sheets.Spreadsheets.batchUpdate(batch,sheetId);}
    catch(error){
      // Do not release an uncertain write into a retry race. One atomic batch
      // includes its receipt; owner must reconcile it before reopening the gate.
      properties.setProperty('MOU_WRITES_ENABLED','0');
      properties.setProperty('MOU_UNCERTAIN_REQUEST_ID',command.requestId);
      return writerOutput({ok:false,error:'COMMIT_UNCERTAIN',requestId:command.requestId});
    }
    return writerOutput(plan.result);
  }catch(error){
    var safe=['INVALID_ENVELOPE','WRITER_NOT_CONFIGURED','INVALID_SIGNATURE','REQUEST_EXPIRED','WRITES_DISABLED','WRONG_WRITER_TARGET','WRITER_BUSY','SCHEMA_MISMATCH','TABLE_LIMIT_EXCEEDED','INVALID_RECORD_ID','IDENTIFIER_NOT_TEXT'];
    var code=error instanceof WriterErrors.PortalError?error.code:safe.includes(error.message)?error.message:'WRITER_FAILED';
    return writerOutput({ok:false,error:code});
  }finally{if(lock&&lock.hasLock())lock.releaseLock();}
}
