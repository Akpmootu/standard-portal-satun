import test from 'node:test';
import assert from 'node:assert/strict';
import {portalNavigation,portalShell} from '../src/portal-layout.js';
import {page} from '../src/page.js';

test('shared navigation respects reviewer scope and retains MOU unit/year context',()=>{
 const html=portalNavigation({role:'reviewer',path:'/mou/history',hospitalId:'09611',year:2569});
 assert.ok(!html.includes('href="/ctam"'));assert.ok(!html.includes('href="/hait"'));assert.ok(!html.includes('/admin/users'));
 assert.match(html,/href="\/mou\?hospital_id=09611&amp;year=2569"/);
 assert.match(html,/href="\/mou\/history\?hospital_id=09611&amp;year=2569" aria-current="page"/);
 assert.ok(html.includes('/mou/reviews?year=2569'));assert.ok(!html.includes('/assistant'));
 const hospital=portalNavigation({role:'hospital'});assert.ok(!hospital.includes('/mou/reviews'));assert.ok(!hospital.includes('/admin/'));
 assert.ok(portalNavigation({role:'admin'}).includes('/admin/registrations'));
});
test('shared frame provides a keyboard skip link, native mobile disclosure and escapes account names',()=>{
 const html=portalShell('<script>title</script>','<p>Content</p>',{role:'admin',path:'/resources'});
 assert.ok(html.includes('href="#main"'));assert.ok(html.includes('<details class="portal-mobile-menu">'));
 assert.ok(html.includes('id="main"'));assert.ok(!html.includes('<script>title</script>'));
 assert.match(html,/href="\/resources" aria-current="page"/);
 const home=page({identity:{name:'<img src=x>',email:'test@example.org'},access:{status:'active',user:{role:'reviewer'}},csrf:'test'});
 assert.ok(!home.includes('<img src=x>'));assert.ok(home.includes('&lt;img src=x&gt;'));assert.ok(!home.includes('href="/ctam"'));assert.ok(home.includes('/auth/logout'));
});
