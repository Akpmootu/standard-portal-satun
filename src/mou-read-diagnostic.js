import {loadMouWorkspace} from './mou-read.js';
import {readOnlyPage} from './read-only-page.js';
import {PortalError} from './errors.js';

const SAFE_CODES=new Set(['GOOGLE_QUOTA_EXCEEDED','GOOGLE_CONNECTION_FAILED','STORAGE_NOT_CONFIGURED','MISSING_SHEET','SCHEMA_MISMATCH','TABLE_LIMIT_EXCEEDED','INVALID_RECORD_ID','IDENTIFIER_NOT_TEXT','INVALID_AGENCY_REFERENCE','INVALID_MOU_DATA','INVALID_MOU_SETTING','DUPLICATE_MOU_REFERENCE','ORPHAN_MOU_PROGRESS','DUPLICATE_MOU_PROGRESS','INVALID_MOU_STATUS','INVALID_REVIEW_STATUS','DIRECTORY_CHANGED_RETRY','AMBIGUOUS_HOSPITAL']);

// Owner-run diagnostic only: no web session, permission grant, write, or link fetch.
// Do not return upstream error objects/messages, row contents, or rendered HTML.
export async function diagnoseMouRead(store, now=new Date()) {
  const started=Date.now();
  try {
    store=store.forRequest?store.forRequest():store;
    const model=await loadMouWorkspace(store,{status:'active',user:{role:'admin'}},{hospitalId:'09625',year:'2569'},now);
    const html=readOnlyPage('mou',model);
    return {ok:true,readOnly:true,hospitalId:'09625',fiscalYear:2569,counts:model.counts,rendered:Boolean(html),elapsedMs:Date.now()-started};
  } catch(error) {
    return {ok:false,readOnly:true,code:error instanceof PortalError&&SAFE_CODES.has(error.code)?error.code:'MOU_READ_OR_RENDER_FAILED',elapsedMs:Date.now()-started};
  }
}
