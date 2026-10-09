// Owner-run, read-only readiness report. Prints counts only, never rows or credentials.
import {readConfig,loadLocalEnvironment} from '../src/config.js';
import {googleStore} from '../src/google-store.js';
import {loadMouWorkspace} from '../src/mou-read.js';
try {
  const store=googleStore(readConfig(await loadLocalEnvironment()));
  await store.verifyResources();
  // Local owner CLI is not a web session or an automatic account grant.
  const model=await loadMouWorkspace(store,{status:'active',user:{role:'admin'}});
  const pendingAgencyCount=model.units.filter(unit=>unit.group==='UNKNOWN').length;
  console.log(JSON.stringify({connected:true,readOnly:true,units:model.units.length,categories:model.categories.length,items:model.items.length,pendingAgencyCount,agencyClassificationComplete:model.units.length>0&&pendingAgencyCount===0,periodSettingsComplete:model.settings.complete,needsReferenceImport:!model.units.length||!model.categories.length||!model.items.length,productionMigrationVerified:false},null,2));
} catch {console.error('MOU_READ_CHECK_FAILED: check private configuration, Google access and sheet schema; no credentials printed.');process.exitCode=1;}
