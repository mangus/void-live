import assert from 'node:assert/strict';
import WebSocket from 'ws';

const HTTP='http://127.0.0.1:8700/app';
const WS='ws://127.0.0.1:8700/app/ws';

const staticBodies=new Map();
for(const path of ['/', '/style.css', '/game.js', '/identity.js', '/flight.js', '/projectile-physics.js', '/three.module.js']){
  const response=await fetch(HTTP+path);
  assert.equal(response.status,200,`${path} must return 200`);
  const body=await response.text();
  staticBodies.set(path,body);
  assert.ok(body.length>20,`${path} must not be empty`);
}
assert.match(staticBodies.get('/'),/id="nameEdit"/,'HUD exposes an in-game callsign editor');
assert.match(staticBodies.get('/'),/id="killCount"/,'HUD exposes the local kill counter');
assert.match(staticBodies.get('/'),/id="joyBase"/,'HUD exposes the mobile joystick');
assert.match(staticBodies.get('/'),/id="tcFire"/,'HUD exposes the mobile fire button');
assert.match(staticBodies.get('/game.js'),/joyMove/,'game wires up the floating joystick');
assert.match(staticBodies.get('/game.js'),/send\('name'/,'in-game editor sends live name changes');

function client(){
  const ws=new WebSocket(WS),queue=[],waiters=[];
  ws.on('message',raw=>{
    const message=JSON.parse(raw);
    const index=waiters.findIndex(w=>w.type===message.type&&w.predicate(message));
    if(index<0)queue.push(message);
    else{const waiter=waiters.splice(index,1)[0];clearTimeout(waiter.timer);waiter.resolve(message)}
  });
  const wait=(type,predicate=()=>true)=>new Promise((resolve,reject)=>{
    const index=queue.findIndex(message=>message.type===type&&predicate(message));
    if(index>=0)return resolve(queue.splice(index,1)[0]);
    const waiter={type,predicate,resolve};
    waiter.timer=setTimeout(()=>reject(new Error(`timeout waiting for ${type}`)),3000);
    waiters.push(waiter);
  });
  return {ws,wait};
}

const a=client(),b=client();
try{
  const [welcomeA,welcomeB]=await Promise.all([a.wait('welcome'),b.wait('welcome')]);
  assert.notEqual(welcomeA.id,welcomeB.id,'clients need unique IDs');
  assert.ok(Array.isArray(welcomeA.planets),'welcome carries a planets array');

  const namedJoinReceived=b.wait('join',m=>m.id===welcomeA.id);
  a.ws.send(JSON.stringify({type:'hello',d:{name:'Nova'}}));
  const namedJoin=await namedJoinReceived;
  assert.equal(namedJoin.id,welcomeA.id);
  assert.equal(namedJoin.name,'Nova','join announces the chosen pilot name');

  const stateReceived=b.wait('state',m=>m.id===welcomeA.id);
  a.ws.send(JSON.stringify({type:'state',d:{p:[12,3,-8],q:[0,0,0,1],h:100,dead:false,v:0,kills:999}}));
  const state=await stateReceived;
  assert.equal(state.id,welcomeA.id);
  assert.deepEqual(state.d.p,[12,3,-8]);
  assert.equal(state.d.name,'Nova','server adds the authoritative pilot name to state');
  assert.equal(state.d.kills,0,'clients cannot forge their kill counter');

  const renamedOnB=b.wait('name',m=>m.id===welcomeA.id);
  a.ws.send(JSON.stringify({type:'name',d:{name:'Nova Prime'}}));
  const renamed=await renamedOnB;
  assert.equal(renamed.oldName,'Nova');
  assert.equal(renamed.name,'Nova Prime','name changes broadcast to other pilots');

  const bNamedOnA=a.wait('join',m=>m.id===welcomeB.id);
  b.ws.send(JSON.stringify({type:'hello',d:{name:'Vega'}}));
  await bNamedOnA;
  const bStateOnA=a.wait('state',m=>m.id===welcomeB.id);
  b.ws.send(JSON.stringify({type:'state',d:{p:[0,0,0],q:[0,0,0,1],h:100,dead:false,v:1}}));
  await bStateOnA;

  const deathReceived=b.wait('death',m=>m.id===welcomeA.id);
  a.ws.send(JSON.stringify({type:'death',d:{victim:welcomeA.id,killer:welcomeB.id}}));
  const death=await deathReceived;
  assert.equal(death.d.victimName,'Nova Prime','kill event carries the latest victim name');
  assert.equal(death.d.killerName,'Vega','kill event carries the killer name');
  assert.equal(death.d.killerKills,1,'a player kill increments the killer counter');

  const killerStateOnA=a.wait('state',m=>m.id===welcomeB.id);
  b.ws.send(JSON.stringify({type:'state',d:{p:[0,0,0],q:[0,0,0,1],h:100,dead:false,v:1,kills:777}}));
  const killerState=await killerStateOnA;
  assert.equal(killerState.d.kills,1,'authoritative kills are included in player state');

  const hitReceived=b.wait('hit',m=>m.id===welcomeA.id);
  a.ws.send(JSON.stringify({type:'hit',d:{target:welcomeB.id,damage:25}}));
  const hit=await hitReceived;
  assert.equal(hit.d.target,welcomeB.id);
  assert.equal(hit.d.damage,25);

  // Planet damage relays live AND persists into a late joiner's welcome.
  const planetReceived=b.wait('planet',m=>m.id===welcomeA.id);
  a.ws.send(JSON.stringify({type:'planet',d:{i:0,d:[1,0,0]}}));
  const planet=await planetReceived;
  assert.equal(planet.d.i,0);
  assert.deepEqual(planet.d.d,[1,0,0]);

  // The RESET SINGULARITY has ONE shared hit counter: the server owns it and echoes the
  // authoritative running total back to every client, the shooter included.
  const bhOnA=a.wait('bhhit'),bhOnB=b.wait('bhhit');
  a.ws.send(JSON.stringify({type:'bhhit',d:{n:3}}));
  const [bhA,bhB]=await Promise.all([bhOnA,bhOnB]);
  assert.equal(bhA.id,welcomeA.id,'the hit is attributed to the shooter');
  assert.equal(bhA.d.n,3,'the weapon hit weight is relayed');
  assert.equal(bhB.d.total,bhA.d.total,'both pilots see the same countdown');
  const bhTotal=bhA.d.total;

  const bh2OnA=a.wait('bhhit'),bh2OnB=b.wait('bhhit');
  b.ws.send(JSON.stringify({type:'bhhit',d:{n:999}}));
  const [bh2A,bh2B]=await Promise.all([bh2OnA,bh2OnB]);
  assert.equal(bh2A.d.n,20,'an absurd hit weight is clamped server-side');
  assert.equal(bh2A.d.total,bhTotal+20,'hits accumulate on the one shared counter');
  assert.equal(bh2B.d.total,bh2A.d.total,'the shooter gets the same total as everyone else');

  const c=client();
  try{
    const welcomeC=await c.wait('welcome');
    assert.ok(welcomeC.planets.some(h=>h.i===0&&h.d[0]===1),'late joiner receives existing planet damage');
    assert.equal(welcomeC.players[welcomeA.id].name,'Nova Prime','late joiner receives the latest pilot name');
    assert.equal(welcomeC.players[welcomeB.id].kills,1,'late joiner receives player kill counters');
    assert.equal(welcomeC.bh.total??welcomeC.bh.hits,bh2A.d.total,'late joiner inherits the sector countdown instead of a fresh one');
    assert.equal(welcomeC.bh.max,333,'the reset threshold comes from the server');
  }finally{c.ws.close()}

  console.log('PASS static assets, unique IDs, pilot names, state/hit relay, planet relay + persistence');
}finally{
  a.ws.close(); b.ws.close();
}
