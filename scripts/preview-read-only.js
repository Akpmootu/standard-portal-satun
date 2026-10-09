// Isolated renderer QA. No credentials, login bypass on the application, Google calls or writes.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {loadMouWorkspace,currentFiscalYear} from '../src/mou-read.js';
import {readOnlyPage} from '../src/read-only-page.js';
import {loadMouHistory} from '../src/mou-history-read.js';
const port=Number(process.env.READ_PREVIEW_PORT||3002);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('INVALID_PORT');
const css=new Map(await Promise.all(['workspace.css','read-only.css','mou-history.css'].map(async name=>['/'+name,await readFile(new URL('../public/'+name,import.meta.url),'utf8')])));
const tables={
 mou_categories:[{id:'10',category_number:1,title:'บุคลากรสุขภาพดิจิทัล (fixture)',sort_order:1},{id:'20',category_number:2,title:'บริการดิจิทัล (fixture)',sort_order:2}],
 mou_items:[{id:'101',category_id:'10',item_number:'1.1',title:'จัดทำแผนพัฒนาบุคลากร — หัวข้อสำหรับทดสอบ',period:'6_months',target_group:'all',sort_order:1},{id:'102',category_id:'10',item_number:'1.2',title:'พัฒนาทักษะดิจิทัล — หัวข้อสำหรับทดสอบ',period:'all',target_group:'all',sort_order:2},{id:'201',category_id:'20',item_number:'2.1',title:'บริการดิจิทัล — หัวข้อสำหรับทดสอบ',period:'all',target_group:'all',sort_order:3}],
 mou_settings:[{id:'1',setting_key:'allow_6months_edit',setting_value:'0'},{id:'2',setting_key:'allow_9_12months_edit',setting_value:'1'}],
 mou_progress:[{id:'1',hospital_id:'09625',item_id:'101',fiscal_year:currentFiscalYear(),status:'completed',assessment_detail:'รายละเอียดสมมติเพื่อตรวจหน้าจอเท่านั้น',evidence_link:'https://example.org/evidence',admin_status:'rejected',admin_comment:'ข้อเสนอแนะสมมติ: กรุณาเพิ่มช่วงเวลาที่ดำเนินการ',updated_at:'2026-09-04T00:00:00Z'}],
};
tables.mou_review_history=Array.from({length:26},(_,i)=>({id:'fixture-history-'+i,progress_id:'1',admin_status:i%2?'approved':'rejected',admin_comment:i%2?'':'ข้อเสนอแนะสมมติสำหรับตรวจหน้าจอ: กรุณาเพิ่มช่วงเวลาดำเนินการและรายละเอียดประกอบ\nบรรทัดที่สองต้องอ่านได้ครบ ทั้งบนคอมพิวเตอร์และมือถือ',admin_reviewed_by:'legacy:ผู้ตรวจสมมติ',created_at:'2026-03-01 12:00:00'}));
const store={directory:async()=>[{id:'09625',name:'หน่วยบริการ fixture สำหรับตรวจ UI',type:'PCU'}],table:async name=>structuredClone(tables[name]||[])};
const access={status:'active',user:{role:'hospital',hospitalId:'09625',userGroup:'โรงพยาบาลส่งเสริมสุขภาพตำบล'}};
const server=createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");res.setHeader('Referrer-Policy','no-referrer');
 if(req.headers.host!==`127.0.0.1:${port}`||req.method!=='GET'){res.writeHead(400);return res.end('NOT_ALLOWED');}
 const url=new URL(req.url,`http://127.0.0.1:${port}`);
 if(css.has(url.pathname)){res.writeHead(200,{'Content-Type':'text/css; charset=utf-8'});return res.end(css.get(url.pathname));}
 if(!['/dashboard','/mou','/empty','/mou/history'].includes(url.pathname)){res.writeHead(404);return res.end('FIXTURE_PREVIEW_ONLY');}
 try{
  if(url.pathname==='/mou/history'){
   const model=await loadMouHistory(store,{status:'active',user:{role:'admin'}},{hospitalId:url.searchParams.get('hospital_id'),year:url.searchParams.get('year'),page:url.searchParams.get('page'),review:url.searchParams.get('review')});
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(readOnlyPage('mou/history',model,{testPreview:true}));
  }
  const fixture=url.pathname==='/empty'?{directory:async()=>[],table:async()=>[]}:store;
  const model=await loadMouWorkspace(fixture,access,{year:url.searchParams.get('year'),category:url.searchParams.get('category'),filter:url.searchParams.get('filter')});
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(readOnlyPage(url.pathname==='/mou'?'mou':'dashboard',model,{testPreview:true}));
 }catch{res.writeHead(400);res.end('INVALID_PREVIEW_REQUEST');}
});
server.on('error',()=>{console.error('READ_PREVIEW_START_FAILED');process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`Renderer fixture QA only: http://127.0.0.1:${port}/dashboard`));
