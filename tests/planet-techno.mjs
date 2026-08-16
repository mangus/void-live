import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const game=readFileSync(new URL('../client/game.js',import.meta.url),'utf8');

assert.match(game,/const TECHNO_PLANET=5;/,'one planet is designated as the techno broadcaster');
assert.match(game,/if\(i===TECHNO_PLANET\)return makeTechnoVoice\(pl,planetBus\)/,'that planet gets the track instead of a drone, on the shared planet bus');
assert.match(game,/ambientDuck\.gain\.setTargetAtTime\(1-0\.6\*tech,now,0\.4\)/,'the sector ambience ducks out as the track fades in');
assert.match(game,/sub\.frequency\.setTargetAtTime\(f0\/2/,'the riff is doubled an octave down by a dedicated sub');
assert.match(game,/if\(pl\.beat!==undefined\)/,'the planet itself pulses on every kick');

// --- behavioural: drive the REAL scheduler with a stub AudioContext --------
const src=game.slice(game.indexOf('let noiseBuf=null;'),game.indexOf('// Quiet electro-techno ambient'));
const started=[];
let clock=0;
const param=v=>({value:v||0,setValueAtTime(x){this.value=x},linearRampToValueAtTime(x){this.value=x},exponentialRampToValueAtTime(x){this.value=x},setTargetAtTime(x){this.value=x}});
const node=kind=>({kind,type:'',buffer:null,loop:false,gain:param(1),frequency:param(0),Q:param(1),delayTime:param(0),
  connect(n){return n},disconnect(){},stop(){},
  start(t){started.push({kind,type:this.type,freq:this.frequency.value,t:t===undefined?clock:t})}});
const audioCtx={sampleRate:48000,get currentTime(){return clock},destination:node('dest'),
  createGain:()=>node('gain'),createOscillator:()=>node('osc'),createBiquadFilter:()=>node('filter'),
  createDelay:()=>node('delay'),createBufferSource:()=>node('src'),
  createBuffer:(ch,len)=>({getChannelData:()=>new Float32Array(len)})};
const makeTechnoVoice=eval(src+'\n;makeTechnoVoice');

const pl={r:210};
const voice=makeTechnoVoice(pl,node('bus'));
const idle=started.length;   // the always-on bass + sub oscillators
const run=(seconds,level)=>{voice.level=level;for(let i=0;i<seconds*60;i++){clock+=1/60;voice.tick(clock)}};

// Out of earshot the clock keeps running but the graph stays empty.
run(4,0);
assert.equal(started.length,idle,'a distant, silent rave schedules nothing beyond its always-on oscillators');

// In range: four-on-the-floor at 130 BPM, on the grid.
started.length=0;
run(8,0.4);
const kicks=started.filter(e=>e.kind==='osc'&&e.type==='sine').map(e=>e.t);
assert.ok(kicks.length>=14,`expected a steady kick, got ${kicks.length} in 8s`);
const beat=60/130;
for(let i=1;i<kicks.length;i++){const gap=kicks[i]-kicks[i-1];
  const onGrid=[1,2,3].some(n=>Math.abs(gap-beat*n)<1e-6);
  assert.ok(onGrid,`kick ${i} landed off the grid (gap ${gap.toFixed(4)}s)`)}
assert.ok(started.some(e=>e.kind==='src'),'hats and claps are firing');
assert.ok(started.some(e=>e.kind==='osc'&&e.type==='sawtooth'),'the acid lead stabs are playing');
assert.equal(pl.beat,1,'a kick that has actually sounded pulses the planet');

// A backgrounded tab must not dump every missed bar into the graph at once.
started.length=0;
clock+=30;voice.tick(clock);
assert.ok(started.length<40,`resync scheduled ${started.length} nodes - it should skip the missed bars`);

// Lore: the club planet, and every neighbour still carrying its own line.
const lore=eval(game.slice(game.indexOf('const PLANET_LORE=')+'const PLANET_LORE='.length,game.indexOf('function updateTargeting')).trim().replace(/;$/,''));
assert.equal(lore.length,7,'every planet still has a lore entry');
assert.ok(lore.every(l=>l.n&&l.f&&l.f.length>30),'every entry has a name and a real flavour line');
assert.match(lore[5].n,/BERGHAIN/,'planet 5 is the club');
const scale=eval(game.slice(game.indexOf('const SCALE=[')+'const SCALE='.length,game.indexOf(';',game.indexOf('const SCALE=['))));
assert.ok(Math.max(...scale)<=110,'the planet drones sit in the low, dark register');

console.log('PASS rave world plays a 130 BPM techno track, gated by proximity and safe to leave running');
