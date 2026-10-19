import {MOU_HOSPITAL_IDS} from './mou-reference.js';
import {fail} from './errors.js';
const clean=v=>typeof v==='string'?v.normalize('NFKC').trim().replace(/\s+/g,' '):'';
export function registrationUnits(rows,units){
 const allowed=new Set(MOU_HOSPITAL_IDS),seen=new Set();
 for(const unit of units){fail(allowed.has(unit.id)&&!seen.has(unit.id)&&typeof unit.name==='string'&&unit.name.trim(),'INVALID_REGISTRATION_DIRECTORY');seen.add(unit.id);}
 const names=new Map();for(const u of units){const n=clean(u.name);names.set(n,names.has(n)?null:u.id);}
 const people=new Map(units.map(u=>[u.id,new Set()]));
 for(const row of rows){const org=clean(row.organization),code=/^([0-9]{5})(?:\s*[·|–-].*)?$/.exec(org)?.[1];
  // Old free-text rows are matched only by an exact unit name or an assigned unit.
  // Never infer a facility from a person's name or email.
  const id=code&&people.has(code)?code:names.get(org)||(people.has(row.hospital_id)?row.hospital_id:null);if(!id)continue;
  const key=row.provider&&row.provider_subject?row.provider+':'+row.provider_subject:row.email?'email:'+clean(row.email).toLowerCase():'row:'+row.id;
  people.get(id).add(key);
 }
 return units.map(u=>({id:u.id,name:u.name,registrations:people.get(u.id).size}));
}
export function registrationUnitLabel(value,units){const unit=units.find(u=>u.id===value);return unit?unit.id+' · '+unit.name:value;}
