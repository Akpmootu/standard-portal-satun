import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseMouRead} from '../src/mou-read-diagnostic.js';
import {PortalError} from '../src/errors.js';

test('MOU diagnostic exposes allowlisted code but never upstream errors or credentials',async()=>{
  for(const [error,expected] of [[new PortalError('GOOGLE_QUOTA_EXCEEDED'),'GOOGLE_QUOTA_EXCEEDED'],[new Error('PRIVATE_CANARY_TOKEN'),'MOU_READ_OR_RENDER_FAILED'],[new PortalError('PRIVATE_CANARY_TOKEN'),'MOU_READ_OR_RENDER_FAILED']]) {
    const fail=async()=>{throw error;};
    const result=await diagnoseMouRead({directory:fail,table:fail});
    assert.equal(result.ok,false);assert.equal(result.code,expected);
    assert.ok(!JSON.stringify(result).includes('PRIVATE_CANARY'));
    assert.equal(result.readOnly,true);
  }
});
