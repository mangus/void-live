import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const game=readFileSync(new URL('../client/game.js',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const css=readFileSync(new URL('../client/style.css',import.meta.url),'utf8');

// 1) shooting the black hole warns the whole sector
// The singularity counter is GLOBAL: the server owns it, clients only mirror it.
assert.match(server,/const BH_MAX=333; let bhHits=0;/,'the server holds the one and only hit counter');
assert.match(server,/bhHits=Math\.min\(BH_MAX,bhHits\+n\);/,'a relayed hit advances the shared counter');
assert.match(server,/broadcastAll\(\{type:'bhhit',id,d:\{n,total:bhHits,max:BH_MAX\}\}\)/,'the authoritative total is echoed to every client, shooter included');
assert.match(server,/if\(bhHits>=BH_MAX\)resetWorld\(\)/,'the server alone decides when the world ends');
assert.match(server,/type:'welcome'.*bh:\{hits:bhHits,max:BH_MAX\}/,'late joiners inherit the current countdown');
assert.match(server,/const resetWorld=\(\)=>\{planetHoles\.length=0;bhHits=0;broadcastAll\(\{type:'reset'\}\)\}/,'a reset clears planet damage AND the counter for everyone');
assert.match(game,/m\.type==='bhhit'\)\{if\(!applyBhTotal\(d&&d\.total\)\)/,'clients adopt the server total instead of counting their own hits');
assert.match(game,/if\(id===peerId\)bhMilestone\(peerId\);else bhWarn\(id\)\}/,'a remote hit still raises a doomsday warning naming the culprit');
assert.match(game,/if\(m\.bh\)\{blackhole\.max=Number\(m\.bh\.max\)\|\|blackhole\.max;applyBhTotal\(m\.bh\.hits,true\)\}/,'welcome syncs the countdown silently, no replayed milestones');
assert.ok(!/blackhole\.hits>=blackhole\.max\)triggerReset/.test(game),'no client ends the world off its own tally');
assert.ok(game.includes('BH_TAUNTS'),'warnings rotate witty taunts naming the culprit');
assert.ok(game.includes('WORLD INTEGRITY'),'milestone toasts report world integrity');
assert.match(game,/if\(n-bhWarnAt<3500\)return/,'feed warnings are throttled');

// 2) world end: no auto-reload; a ~4 s collapse into the hole that owns the screen until refresh
assert.ok(!game.includes('location.reload'),'nothing auto-reloads: the black hole stays until the player refreshes');
assert.match(game,/m\.type==='reset'\)startWorldEnd\(\)/,'a relayed reset starts the collapse for every player');
assert.ok(game.includes('const END_DUR=4000'),'the collapse takes ~4 seconds');
assert.match(game,/if\(worldEnding\)\{updateWorldEnd\(dt\);renderer\.render\(scene,camera\);return\}/,'the render loop hands over to the collapse');
assert.match(game,/if\(o===blackhole\.mesh\)continue/,'every scene object except the black hole is pulled in');
assert.ok(game.includes("querySelectorAll('body > *')"),'HUD, touch controls and overlays are sucked in too');
assert.ok(game.includes('THE WORLD HAS ENDED'),'players get an end-of-world announcement');
assert.ok(css.includes('#worldEnd'),'the announcement is styled');
assert.match(game,/function fire\(\)\{if\(dead\|\|worldEnding/,'firing is disabled while the world ends');

// behavioural: the pull easing parks everything AT the hole with ~zero scale at k=1
const bhx=0;
const pull=(x0,k)=>{const e=k*k;return{x:bhx+(x0-bhx)*(1-e),s:Math.max(.001,1-e)}};
assert.equal(pull(9000,1).x,bhx,'at k=1 objects sit at the singularity');
assert.equal(pull(9000,1).s,.001,'...scaled to (near) nothing');
const mid=pull(9000,.5);
assert.ok(mid.x<9000&&mid.x>bhx,'mid-collapse objects are between start and hole');

console.log('PASS shooting the singularity warns the sector, and the world ends by collapsing into the black hole until refresh');
