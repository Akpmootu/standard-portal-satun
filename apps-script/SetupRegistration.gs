// Paste into a separate SetupRegistration.gs file in the SAME Apps Script project.
// Run only from the editor with writes disabled. Creates empty tables, never users.
function setupRegistrationTables() {
  var properties=PropertiesService.getScriptProperties();
  writerAssert(properties.getProperty('MOU_WRITES_ENABLED')==='0','DISABLE_WRITES_FIRST');
  writerAssert(properties.getProperty('MOU_SHEET_ID')===WRITER_SHEET_ID,'WRONG_WRITER_TARGET');
  var lock=LockService.getScriptLock();writerAssert(lock.tryLock(5000),'WRITER_BUSY');
  try {
    writerAssert(properties.getProperty('MOU_WRITES_ENABLED')==='0','DISABLE_WRITES_FIRST');
    var meta=Sheets.Spreadsheets.get(WRITER_SHEET_ID,{fields:'sheets(properties(sheetId,title))'}),requests=[];
    ['reviewer_profiles','registration_requests'].forEach(function(name,index){
      var existing=meta.sheets.filter(s=>s.properties.title===name),headers=WRITER_SCHEMA[name].headers;
      writerAssert(existing.length<=1,'SCHEMA_MISMATCH');
      if(existing.length){
        var rows=Sheets.Spreadsheets.Values.get(WRITER_SHEET_ID,"'"+name+"'!A1:"+writerColumn(headers.length)+'1').values;
        writerAssert(rows&&JSON.stringify(rows[0])===JSON.stringify(headers),'SCHEMA_MISMATCH');return;
      }
      var id=1900090701+index;writerAssert(!meta.sheets.some(s=>s.properties.sheetId===id),'SETUP_ID_COLLISION');
      requests.push({addSheet:{properties:{sheetId:id,title:name,gridProperties:{rowCount:1001,columnCount:headers.length,frozenRowCount:1}}}});
      requests.push({updateCells:{range:{sheetId:id,startRowIndex:0,endRowIndex:1,startColumnIndex:0,endColumnIndex:headers.length},rows:[{values:headers.map(h=>({userEnteredValue:{stringValue:h}}))}],fields:'userEnteredValue'}});
      requests.push({repeatCell:{range:{sheetId:id,startRowIndex:0,endRowIndex:1},cell:{userEnteredFormat:{textFormat:{bold:true},backgroundColor:{red:0.85,green:0.94,blue:0.92}}},fields:'userEnteredFormat'}});
    });
    if(requests.length)Sheets.Spreadsheets.batchUpdate({requests:requests},WRITER_SHEET_ID);
    console.log('PASS: registration tables ready; no account or role granted; writes remain disabled.');
  } finally {lock.releaseLock();}
}
function checkRegistrationSetup(){
  writerAssert(PropertiesService.getScriptProperties().getProperty('MOU_WRITES_ENABLED')==='0','DISABLE_WRITES_FIRST');
  writerAssert(PropertiesService.getScriptProperties().getProperty('MOU_SHEET_ID')===WRITER_SHEET_ID,'WRONG_WRITER_TARGET');
  var snapshot=writerRead(WRITER_SHEET_ID);
  console.log('PASS: '+Object.keys(snapshot.tables).length+' tables readable. No writes performed.');
}
