import * as THREE from './three.module.js';
import { normalizePilotName, pilotLabel } from './identity.js';
import { LIMP_ACCEL, LIMP_MAX_SPEED } from './flight.js';
const BULLET_SPEED=650,ROCKET_SPEED=460,PROJECTILE_MAX_TRAVEL=100000,ROCKET_BLAST_SCALE=2.6;
const launchVelocity=(direction,muzzleSpeed,shipVelocity=[0,0,0])=>direction.map((component,index)=>component*muzzleSpeed+(shipVelocity[index]||0));
const projectileExpired=distanceTravelled=>distanceTravelled>=PROJECTILE_MAX_TRAVEL;

const $=s=>document.querySelector(s), canvas=$('#game');
const ui={gate:$('#gate'),enter:$('#enterBtn'),pilotName:$('#pilotName'),selfName:$('#selfName'),killCount:$('#killCount'),killboardList:$('#killboardList'),nameEdit:$('#nameEdit'),namePanel:$('#namePanel'),nameEditInput:$('#nameEditInput'),nameSave:$('#nameSave'),nameCancel:$('#nameCancel'),joyZone:$('#joyZone'),joyBase:$('#joyBase'),joyKnob:$('#joyKnob'),tcFire:$('#tcFire'),tcSpecial:$('#tcSpecial'),tcBoost:$('#tcBoost'),speed:$('#speed'),thrust:$('#thrustBar'),health:$('#healthBar'),healthText:$('#healthText'),fuel:$('#fuelBar'),fuelText:$('#fuelText'),count:$('#playerCount'),net:$('#netState'),feed:$('#feed'),target:$('#targetName'),distance:$('#targetDistance'),targetEta:$('#targetEta'),targetFlavor:$('#targetFlavor'),targetDetail:$('#targetDetail'),hit:$('#hitmarker'),death:$('#death'),respawn:$('#respawnTime'),toast:$('#toast'),shipSwitch:$('#shipSwitch'),shipName:$('#shipName'),emergency:$('#emergency'),peerframes:$('#peerframes'),ammo:$('#ammoBar'),ammoText:$('#ammoText'),spec:$('#specBar'),specText:$('#specText'),shipStats:$('#shipStats'),ssName:$('#ssName'),ssWeapon:$('#ssWeapon'),ssSpeed:$('#ssSpeed'),ssAccel:$('#ssAccel'),ssRange:$('#ssRange'),chargeEta:$('#chargeEta'),deathCause:$('#deathCause'),resetLabel:$('#resetLabel'),helpCard:$('#helpCard'),helpBtn:$('#helpBtn')};
const scene=new THREE.Scene(); scene.background=new THREE.Color(0x010407); scene.fog=new THREE.FogExp2(0x010407,.00005);
const camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.1,40000);
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'}); renderer.setPixelRatio(Math.min(devicePixelRatio,1.75)); renderer.setSize(innerWidth,innerHeight); renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.35;
const clock=new THREE.Clock(), keys={}, peers=new Map(), bullets=[], debris=[], fx=[], planets=[], stations=[], crystals=[], projectiles=[], mines=[];
// Per-ship stats. speed=max u/s, accel=thrust, range=bullet life (s), special weapon + capacity.
const SHIP_STATS=[
  {name:'INTERCEPTOR',speed:135,accel:80,range:15,hull:100,special:'laser',specMax:20,weapon:'LASER LANCE'},
  {name:'GUNSHIP',speed:104,accel:64,range:13,hull:130,special:'rocket',specMax:6,weapon:'ROCKETS x6'},
  {name:'DART',speed:178,accel:108,range:20,hull:85,special:'laser',specMax:20,weapon:'LASER LANCE'},
  {name:'RAPTOR',speed:128,accel:86,range:15,hull:115,special:'mine',specMax:4,weapon:'PROX MINES x4'},
  {name:'PHANTOM',speed:210,accel:130,range:22,hull:55,special:'crystal',specMax:8,weapon:'CRYSTAL WAKE'}
];
const SHIP_NAMES=SHIP_STATS.map(s=>s.name);
const SR={speed:[104,210],accel:[64,130],range:[13,22]};
const statPct=(k,v)=>Math.round(((v-SR[k][0])/(SR[k][1]-SR[k][0]))*100);
let health=100,fuel=100,dead=false,lastShot=0,lastSpec=0,lastSync=0,locked=false,audioCtx,peerId='YOU',engineLevel=.06,invuln=0,shipVariant=Math.floor(Math.random()*5),emergency=false,ammo=120,maxAmmo=120,spec=0,specMax=0,maxHealth=100,kills=0;
let baseFov=72,camDist=20,ambientOn=false,ambientTimer=null,planetVoices=null,ambientDuck=null;
const vel=new THREE.Vector3(), desired=new THREE.Vector3(), proj=new THREE.Vector3();
const HOLE_ANGLE=0.15;
const touch={active:false,x:0,y:0,jx:0,jy:0,firing:false,boosting:false};
const peerFrameEls=new Map();
const peerArrowEls=new Map();
let entered=false,pilotName='';
try{pilotName=normalizePilotName(localStorage.getItem('voidLivePilotName')||'')}catch{}
ui.pilotName.value=pilotName;ui.selfName.textContent=pilotLabel(pilotName,peerId);

scene.add(new THREE.AmbientLight(0x284a55,1.2)); const sun=new THREE.DirectionalLight(0x9ffff0,3.2); sun.position.set(300,500,-200); scene.add(sun);
function stars(){const g=new THREE.BufferGeometry(),n=6500,a=new Float32Array(n*3),c=new Float32Array(n*3);for(let i=0;i<n;i++){const r=THREE.MathUtils.randFloat(500,24000),t=Math.random()*Math.PI*2,p=Math.acos(THREE.MathUtils.randFloatSpread(2));a[i*3]=r*Math.sin(p)*Math.cos(t);a[i*3+1]=r*Math.cos(p);a[i*3+2]=r*Math.sin(p)*Math.sin(t);const q=Math.random();c.set(q>.93?[.3,1,.85]:q>.82?[1,.65,.25]:[.38,.55,.62],i*3)}g.setAttribute('position',new THREE.BufferAttribute(a,3));g.setAttribute('color',new THREE.BufferAttribute(c,3));scene.add(new THREE.Points(g,new THREE.PointsMaterial({size:1.4,vertexColors:true,transparent:true,opacity:.8,sizeAttenuation:true})));}stars();

// Orbit: {cx,cz,radius,angle,speed,tilt} — planet rides a big circle on a tilted plane; ring drawn.
function addOrbitRing(o,color){const seg=128,pts=[];for(let i=0;i<=seg;i++){const a=i/seg*Math.PI*2;pts.push(new THREE.Vector3(Math.cos(a)*o.radius,0,Math.sin(a)*o.radius))}const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color,transparent:true,opacity:.16}));line.position.set(o.cx,o.cy,o.cz);line.rotation.x=o.tilt;line.rotation.z=o.tiltZ||0;scene.add(line);o.ringLine=line;}
function orbitPos(o){const x=Math.cos(o.angle)*o.radius,z=Math.sin(o.angle)*o.radius;const v=new THREE.Vector3(x,0,z);v.applyEuler(new THREE.Euler(o.tilt,0,o.tiltZ||0));v.x+=o.cx;v.y+=o.cy;v.z+=o.cz;return v}

// Visual/collision size multipliers for map bodies (1 = original). Applied at each
// body's radius so geometry, collisions, minimap and targeting all stay consistent.
const PLANET_SCALE=0.7, BH_SCALE=0.85;
function planet(pos,r,color,rings=false,orbit=null){r*=PLANET_SCALE;const root=new THREE.Group();root.position.copy(pos);const solid=new THREE.Mesh(new THREE.IcosahedronGeometry(r,4),new THREE.MeshStandardMaterial({color,roughness:.78,metalness:.12,transparent:true,opacity:.34}));const wire=new THREE.Mesh(new THREE.IcosahedronGeometry(r*1.005,3),new THREE.MeshBasicMaterial({color,wireframe:true,transparent:true,opacity:.2,blending:THREE.AdditiveBlending}));root.add(solid,wire);if(rings){const ring=new THREE.Mesh(new THREE.RingGeometry(r*1.45,r*2.15,96),new THREE.MeshBasicMaterial({color:0x49ffe1,side:THREE.DoubleSide,transparent:true,opacity:.16,wireframe:true}));ring.rotation.x=1.25;root.add(ring)}scene.add(root);if(orbit)addOrbitRing(orbit,color);const e={pos:pos.clone(),r,color,destructible:false,index:planets.length,root,orbit};planets.push(e);return root}
function destructiblePlanet(pos,r,color,rings=false,orbit=null,living=false,detail=3,coreGlow=true){
  r*=PLANET_SCALE;
  const root=new THREE.Group();root.position.copy(pos);
  const geo=new THREE.IcosahedronGeometry(r,detail);const posAttr=geo.getAttribute('position');const triCount=posAttr.count/3;
  const full=Float32Array.from(posAttr.array), live=posAttr.array, dirs=new Float32Array(triCount*3);
  for(let i=0;i<triCount;i++){let dx=(full[i*9]+full[i*9+3]+full[i*9+6])/3,dy=(full[i*9+1]+full[i*9+4]+full[i*9+7])/3,dz=(full[i*9+2]+full[i*9+5]+full[i*9+8])/3;const l=Math.hypot(dx,dy,dz)||1;dirs[i*3]=dx/l;dirs[i*3+1]=dy/l;dirs[i*3+2]=dz/l}
  const mat=new THREE.MeshStandardMaterial({color,roughness:.66,metalness:.2,transparent:true,opacity:.5,side:THREE.DoubleSide,flatShading:true});
  const shell=new THREE.Mesh(geo,mat);
  const wmat=new THREE.MeshBasicMaterial({color,wireframe:true,transparent:true,opacity:.3,blending:THREE.AdditiveBlending});
  const wire=new THREE.Mesh(geo,wmat);
  root.add(shell,wire);if(coreGlow)root.add(new THREE.Mesh(new THREE.IcosahedronGeometry(r*.3,1),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.55,blending:THREE.AdditiveBlending})));root.add(new THREE.PointLight(color,1.4,r*4));
  if(rings){const ring=new THREE.Mesh(new THREE.RingGeometry(r*1.45,r*2.15,96),new THREE.MeshBasicMaterial({color:0x49ffe1,side:THREE.DoubleSide,transparent:true,opacity:.16,wireframe:true}));ring.rotation.x=1.25;root.add(ring)}
  scene.add(root);if(orbit)addOrbitRing(orbit,color);const holes=[];
  const entry={pos:pos.clone(),r,color,destructible:true,index:planets.length,total:triCount,root,orbit,living,mat,wmat,hue:0,
    isSolidAt(d){for(const h of holes){if(d.x*h.x+d.y*h.y+d.z*h.z>h.c)return false}return true},
    aliveCount(){return (geo.drawRange.count||triCount*3)/3},
    addHole(dir,ang){const d=dir.clone().normalize();holes.push({x:d.x,y:d.y,z:d.z,c:Math.cos(ang),t:performance.now()});this.rebuild()},
    heal(){if(!living||!holes.length)return;const now=performance.now();if(now-holes[0].t>40000){holes.shift();this.rebuild()}},
    rebuild(){let w=0;for(let i=0;i<triCount;i++){const tx=dirs[i*3],ty=dirs[i*3+1],tz=dirs[i*3+2];let g=false;for(const h of holes){if(tx*h.x+ty*h.y+tz*h.z>h.c){g=true;break}}if(g)continue;const s=i*9,ds=w*9;for(let k=0;k<9;k++)live[ds+k]=full[s+k];w++}posAttr.needsUpdate=true;geo.setDrawRange(0,w*3)}};
  planets.push(entry);entry.rebuild();return root;
}
// Distinct planet looks: 'striped' latitude bands, 'blink' pulsing glow, 'sizzle' electric arcs.
function planetStyle(pl,style){pl.style=style;const root=pl.root,r=pl.r,col=pl.color;
  if(style==='striped'){const bandCol=new THREE.Color(col).offsetHSL(0,0,0.28).getHex();for(let i=-3;i<=3;i++){const lat=i/4*(Math.PI/2)*0.85,y=Math.sin(lat)*r,br=Math.cos(lat)*r*1.012;const band=new THREE.Mesh(new THREE.TorusGeometry(br,r*0.03,6,48),new THREE.MeshBasicMaterial({color:bandCol,transparent:true,opacity:.55}));band.rotation.x=Math.PI/2;band.position.y=y;root.add(band)}}
  else if(style==='blink'){const glow=new THREE.Mesh(new THREE.IcosahedronGeometry(r*1.16,2),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.22,blending:THREE.AdditiveBlending,depthWrite:false}));root.add(glow);pl.blinkGlow=glow}
  else if(style==='sizzle'){const N=22,geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(N*2*3),3));const seg=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:0x9ffcff,transparent:true,opacity:.7,blending:THREE.AdditiveBlending,depthWrite:false}));root.add(seg);pl.sizzle={geo,arr:geo.attributes.position.array,N,r}}}
destructiblePlanet(new THREE.Vector3(-300,-120,-350),95,0x2ec9b8,true);
destructiblePlanet(new THREE.Vector3(350,180,250),240,0xd66a34,false);
planet(new THREE.Vector3(150,-260,300),55,0x7a6bff,true);
// Coplanar concentric orbits — one shared ecliptic plane + big radial gaps, so planets never collide.
const ECL_TILT=0.35, ECL_TZ=0.1;
const orbA={cx:0,cy:0,cz:0,radius:5200,angle:0,speed:0.008,tilt:ECL_TILT,tiltZ:ECL_TZ};
destructiblePlanet(orbitPos(orbA),380,0x3a6bff,true,orbA);
// Orbit 12000 brings the giant visibly closer to the rest of the system (inner edge still clears COBALT THRONE's 5200 orbit by ~1400u) and the whole sphere now fits inside the 19000 flight boundary, so you can circle it. Slow orbital speed to match its bulk.
const orbB={cx:0,cy:0,cz:0,radius:12000,angle:2.1,speed:0.0008,tilt:ECL_TILT,tiltZ:ECL_TZ};
destructiblePlanet(orbitPos(orbB),7350,0xff7a3c,false,orbB,false,4,false); // THE COLOSSUS — destructible shell of 5120 triangles (detail 4), never heals (living=false), no core glow so the Heart stays visible. Shoot a hole, fly in through it.
// Small fractal trees growing on THE COLOSSUS. Every tree is UNIQUE: a per-tree seeded RNG picks
// its fork count (2-4), branching depth (3-5), branch angles, length ratio and twist, and heights
// are log-distributed across a 20x span — mighty giants tower over tiny shrubs. Planted along a
// golden-ratio spiral; children of the planet's root group so they ride its orbit and spin free.
function treeRand(seed){let s=seed>>>0;return()=>{s=(s+0x6D2B79F5)>>>0;let t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296}}
function fractalTreeGeo(h,seed){const rnd=treeRand(seed);const forks=2+Math.floor(rnd()*3),depthMax=3+Math.floor(rnd()*3),baseAng=0.25+rnd()*0.85,angJit=0.1+rnd()*0.35,ratio=0.55+rnd()*0.17,twist=rnd()*Math.PI*2;const pts=[];const grow=(p,dir,len,depth)=>{const tip=p.clone().addScaledVector(dir,len);pts.push(p.x,p.y,p.z,tip.x,tip.y,tip.z);if(depth<=0)return;for(let i=0;i<forks;i++){const ang=(i/forks)*Math.PI*2+depth*0.9+twist;const axis=new THREE.Vector3(Math.cos(ang),0,Math.sin(ang)).cross(dir);if(axis.lengthSq()<0.01)axis.set(1,0,0);axis.normalize();const nd=dir.clone().applyAxisAngle(axis,baseAng+rnd()*angJit).normalize();grow(tip,nd,len*(ratio+rnd()*0.06),depth-1)}};grow(new THREE.Vector3(0,0,0),new THREE.Vector3(0,1,0),h*0.38,depthMax);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(pts),3));return g}
{const colossus=planets[4],R=colossus.r,up=new THREE.Vector3(0,1,0),N_TREES=40,GOLD=Math.PI*(3-Math.sqrt(5)); // local golden angle: the shared GOLDEN const is declared further down and isn't usable yet here
  const treeMats=[new THREE.LineBasicMaterial({color:0x7dffb0,transparent:true,opacity:.7}),new THREE.LineBasicMaterial({color:0x41ffe0,transparent:true,opacity:.6}),new THREE.LineBasicMaterial({color:0xffd27a,transparent:true,opacity:.65})];
  colossus.trees=[];for(let i=0;i<N_TREES;i++){const y=1-2*(i+0.5)/N_TREES,rad=Math.sqrt(Math.max(0,1-y*y)),th=i*GOLD;const n=new THREE.Vector3(Math.cos(th)*rad,y,Math.sin(th)*rad);const seed=0x9E3779B9^Math.imul(i+1,0x85EBCA6B);const hh=40*Math.pow(20,(Math.imul(i+1,2654435761)>>>0)%1024/1024);const tree=new THREE.LineSegments(fractalTreeGeo(hh,seed),treeMats[i%3]);tree.position.copy(n).multiplyScalar(R);tree.quaternion.setFromUnitVectors(up,n);tree.rotateY(i*2.4);tree.scale.setScalar(0.45+(i%5)*0.05);tree.userData.hitR=hh*0.5;colossus.trees.push(tree);colossus.root.add(tree)}
  colossus.spinRate=0.004} // a body this massive turns ponderously — ~7x slower than the small planets' shared 0.03 rad/s
// The Heart of the Colossus: a triple-shelled jewel at the giant's core. The shell is destructible
// and never heals — blast a hole through the triangles, fly in through it, descend past the trees
// to the heart. Brushing it grants ETERNAL CHARGE: fuel, ammo and specials never run out again for
// the rest of this life and every life after (until page refresh).
let eternalCharge=false;
{const colossus=planets[4];const heart=new THREE.Group();heart.add(new THREE.Mesh(new THREE.OctahedronGeometry(120,0),new THREE.MeshBasicMaterial({color:0xbfeaff,transparent:true,opacity:.85})),new THREE.Mesh(new THREE.OctahedronGeometry(155,0),new THREE.MeshBasicMaterial({color:0x8a5cff,wireframe:true,transparent:true,opacity:.55})),new THREE.Mesh(new THREE.OctahedronGeometry(195,0),new THREE.MeshBasicMaterial({color:0xffffff,wireframe:true,transparent:true,opacity:.22,blending:THREE.AdditiveBlending})),new THREE.PointLight(0x9fd8ff,3,4000));colossus.root.add(heart);colossus.heart=heart}
// Shootable trees: ONE hit fells a tree in a burst of tumbling branch shards that fly far out into space.
const treeShards=[],_twp=new THREE.Vector3();
function hitColossusTree(p,pad){const c4=planets[4];if(!c4.trees||c4.gone)return false;for(const tr of c4.trees){if(tr.userData.dead)continue;tr.getWorldPosition(_twp);if(p.distanceTo(_twp)<tr.userData.hitR*tr.scale.x+(pad||10)){explodeTree(tr,_twp.clone());return true}}return false}
function explodeTree(tr,at){tr.userData.dead=true;tr.visible=false;if(tr.parent)tr.parent.remove(tr);const sc=tr.scale.x;for(let i=0;i<16;i++){const len=THREE.MathUtils.randFloat(14,90)*sc;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array([0,0,0,0,len,0]),3));const m=new THREE.LineSegments(g,tr.material.clone());m.position.copy(at);m.rotation.set(Math.random()*Math.PI,Math.random()*Math.PI,Math.random()*Math.PI);const dir=new THREE.Vector3(THREE.MathUtils.randFloatSpread(2),THREE.MathUtils.randFloatSpread(2),THREE.MathUtils.randFloatSpread(2)).normalize();m.userData={vel:dir.multiplyScalar(THREE.MathUtils.randFloat(250,900)),avx:THREE.MathUtils.randFloatSpread(6),avy:THREE.MathUtils.randFloatSpread(6),life:THREE.MathUtils.randFloat(4,7)};scene.add(m);treeShards.push(m)}boom(at.clone(),0x7dffb0,1.6);sound(160,.3,'triangle',.07);feed('\ud83c\udf32 a tree on <b>THE COLOSSUS</b> was blown to splinters')}
// Radius 1500 keeps the techno world's whole orbit well clear of the singularity (which sits ~2308u from origin) so it never wanders into the well by itself.
const orbC={cx:0,cy:0,cz:0,radius:1500,angle:4.0,speed:0.02,tilt:ECL_TILT,tiltZ:ECL_TZ};
destructiblePlanet(orbitPos(orbC),300,0x00ffa2,true,orbC,true); // living: colour-shift + self-heal
const orbD={cx:0,cy:0,cz:0,radius:900,angle:1.0,speed:0.028,tilt:ECL_TILT,tiltZ:ECL_TZ};
planet(orbitPos(orbD),70,0xffe45c,false,orbD); // tiny fast moon
// Assign a distinct look to each planet (index 5 = living green, its colour-shift is its own tell).
planetStyle(planets[0],'striped');planetStyle(planets[1],'sizzle');planetStyle(planets[2],'blink');planetStyle(planets[3],'striped');planetStyle(planets[6],'blink'); // index 4 (THE COLOSSUS) gets no style: its fractal trees + core crystal are the look, no electric arcs
const grid=new THREE.GridHelper(5000,70,0x123f3b,0x071715);grid.position.y=-750;scene.add(grid);

// ---- Energy-bubble charging station: pulsing shell + electric bolt + CHARGE label ----
const boltTex=(()=>{const c=document.createElement('canvas');c.width=64;c.height=64;const x=c.getContext('2d');x.clearRect(0,0,64,64);x.beginPath();x.moveTo(38,6);x.lineTo(20,36);x.lineTo(31,36);x.lineTo(26,58);x.lineTo(46,26);x.lineTo(34,26);x.closePath();x.shadowColor='#5cffd6';x.shadowBlur=12;x.fillStyle='#eafffb';x.fill();x.shadowBlur=0;x.lineWidth=1.5;x.strokeStyle='#5cffd6';x.stroke();return new THREE.CanvasTexture(c)})();
const chargeTex=(()=>{const c=document.createElement('canvas');c.width=128;c.height=64;const x=c.getContext('2d');x.fillStyle='rgba(4,16,20,0.0)';x.fillRect(0,0,128,64);x.strokeStyle='#5cffd6';x.lineWidth=2;x.strokeRect(6,18,116,28);x.fillStyle='#8dffe4';x.font='bold 20px monospace';x.textAlign='center';x.textBaseline='middle';x.fillText('CHARGE',64,33);return new THREE.CanvasTexture(c)})();
function station(pos,i){const g=new THREE.Group();g.position.copy(pos);const c=0x5cffd6;
  const bubble=new THREE.Mesh(new THREE.IcosahedronGeometry(30,3),new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.16,blending:THREE.AdditiveBlending,depthWrite:false}));
  const shell=new THREE.Mesh(new THREE.IcosahedronGeometry(30,2),new THREE.MeshBasicMaterial({color:c,wireframe:true,transparent:true,opacity:.5}));
  const core=new THREE.Sprite(new THREE.SpriteMaterial({map:boltTex,color:0xffffff,transparent:true,opacity:.95,blending:THREE.AdditiveBlending,depthWrite:false}));core.scale.set(25,25,1);
  const inner=new THREE.Mesh(new THREE.TorusGeometry(17,.8,6,32),new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.7}));inner.rotation.x=Math.PI/2;
  const label=new THREE.Sprite(new THREE.SpriteMaterial({map:chargeTex,transparent:true,depthWrite:false}));label.position.set(0,44,0);label.scale.set(46,23,1);
  g.add(bubble,shell,core,inner,label,new THREE.PointLight(c,2,420));scene.add(g);
  stations.push({pos:pos.clone(),r:52,mesh:g,bubble,shell,core,inner,label,name:'CHARGE-'+(i+1)});}
[[620,120,-260],[-1900,-620,1600],[3400,-380,-2600],[420,1500,900],[9000,1800,-8200],[-13500,-2200,11800],[900,1100,-2900],[-4300,-1500,3100],[2600,2200,-11500],[-9500,3100,-9200],[15800,-1600,3900]].forEach((p,i)=>station(new THREE.Vector3(p[0],p[1],p[2]),i)); // 7: singularity forward base · 8: COBALT THRONE approach · 9: on THE COLOSSUS's orbit lane · 10: far NW quadrant · 11: eastern rim

const GOLDEN=Math.PI*(3-Math.sqrt(5));
function petalGroup(size,color){const g=new THREE.Group();const stem=new THREE.Mesh(new THREE.ConeGeometry(size*0.26,size*1.7,5),new THREE.MeshBasicMaterial({color,wireframe:true,transparent:true,opacity:.92}));stem.rotation.x=Math.PI/2;stem.position.z=size*0.85;const bud=new THREE.Mesh(new THREE.OctahedronGeometry(size*0.42,0),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.4,blending:THREE.AdditiveBlending}));bud.position.z=size*1.7;g.add(stem,bud);return g}
// Flower / spiral fractal: petals placed by golden-angle phyllotaxis (bloom) or a 3D helix (spiral). Each petal is a Group so it can be shot off one at a time.
function buildFlower(petals,size,color,spiral){const grp=new THREE.Group();const core=new THREE.Mesh(new THREE.IcosahedronGeometry(size*0.55,1),new THREE.MeshBasicMaterial({color,wireframe:true,transparent:true,opacity:.9}));const glow=new THREE.Mesh(new THREE.IcosahedronGeometry(size*0.34,1),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.32,blending:THREE.AdditiveBlending}));grp.add(core,glow);const up=new THREE.Vector3(0,0,1);for(let i=0;i<petals;i++){let dir;if(spiral){const tt=petals>1?i/(petals-1):0,ang=tt*Math.PI*5,y=(tt-0.5)*1.9,rad=Math.sqrt(Math.max(0.03,1-y*y));dir=new THREE.Vector3(Math.cos(ang)*rad,y,Math.sin(ang)*rad)}else{const y=petals>1?1-(i/(petals-1))*2:0,rad=Math.sqrt(Math.max(0.03,1-y*y)),ang=i*GOLDEN;dir=new THREE.Vector3(Math.cos(ang)*rad,y,Math.sin(ang)*rad)}dir.normalize();const petal=petalGroup(size,color);petal.position.copy(dir.clone().multiplyScalar(size*0.55));petal.quaternion.setFromUnitVectors(up,dir);grp.add(petal)}return grp}
function crystal(pos,i,big){const col=[0x8a5cff,0x41ffe0,0xff6ac1,0x5cffa0][i%4];const size=big?11:6;const spiral=i%2===1;const petals=big?12:9;const g=buildFlower(petals,size,col,spiral);g.position.copy(pos);g.scale.setScalar(0.001);scene.add(g);const mode=i%3===0?'static':(i%3===1?'sprout':'grow');
  const branches=g.children.filter(ch=>ch.type==='Group');
  crystals.push({mesh:g,pos:pos.clone(),grow:0,full:1,mode,maxFull:mode==='grow'?(big?9:6):(mode==='sprout'?1.5:1),fullRate:big?0.05:0.035,radius0:big?52:26,radius:big?52:26,color:col,size,spiral,phase:i*1.7,name:(mode==='sprout'?'BRANCHER-':spiral?'SPIRAL-':'BLOOM-')+(i+1),alive:true,big,growRate:big?0.34:0.16,branches,branchHp:branches.map(()=>2),lastSprout:0,sproutCap:big?24:16});}
[[ -300,260,-500,0],[820,-140,220,1],[-1100,60,120,0],[260,-460,-1150,1],[500,300,-700,1],[-800,-300,-300,1]].forEach((p,i)=>crystal(new THREE.Vector3(p[0],p[1],p[2]),i,!!p[3]));
// ---- Black hole: shoot it across multiple ammo reloads to RESET the whole world ----
const bhFogTex=(()=>{const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');const gr=x.createRadialGradient(64,64,0,64,64,64);gr.addColorStop(0,'rgba(255,70,90,.5)');gr.addColorStop(.45,'rgba(150,20,40,.2)');gr.addColorStop(1,'rgba(60,4,16,0)');x.fillStyle=gr;x.fillRect(0,0,128,128);return new THREE.CanvasTexture(c)})();
// Diffuse dark-red mist instead of the old geometric wireframe shell: a soft sprite
// glow + a cloud of gradient puffs in a shell around the core ("veins" keeps its name
// so the existing rotation code keeps swirling the mist).
function makeBlackHole(pos){const g=new THREE.Group();g.position.copy(pos);const core=new THREE.Mesh(new THREE.SphereGeometry(60,40,28),new THREE.MeshBasicMaterial({color:0x000000}));const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:bhFogTex,color:0x991626,transparent:true,opacity:.4,blending:THREE.AdditiveBlending,depthWrite:false}));glow.scale.set(320,320,1);const N=240,fa=new Float32Array(N*3);for(let i=0;i<N;i++){const rr=THREE.MathUtils.randFloat(66,150),th=Math.random()*Math.PI*2,ph=Math.acos(THREE.MathUtils.randFloatSpread(2));fa[i*3]=rr*Math.sin(ph)*Math.cos(th);fa[i*3+1]=rr*Math.cos(ph);fa[i*3+2]=rr*Math.sin(ph)*Math.sin(th)}const fgeo=new THREE.BufferGeometry();fgeo.setAttribute('position',new THREE.BufferAttribute(fa,3));const fog=new THREE.Points(fgeo,new THREE.PointsMaterial({map:bhFogTex,color:0x8f1424,size:52,transparent:true,opacity:.2,blending:THREE.AdditiveBlending,depthWrite:false,sizeAttenuation:true}));g.add(core,glow,fog,new THREE.PointLight(0x8f1424,1.3,1500));g.scale.setScalar(BH_SCALE);scene.add(g);return{pos:pos.clone(),r:60*BH_SCALE,mesh:g,cover:glow,veins:fog,hits:0,max:333,name:'RESET SINGULARITY'}}
const blackhole=makeBlackHole(new THREE.Vector3(0,700,-2200));
let resetting=false;
// n = how many hits this impact counts for: blaster bolt 1, laser lance 3, rocket 5.
// The counter is SHARED and lives on the server. A local hit is applied optimistically for
// instant feedback, then reconciled with the authoritative total the server echoes back, so
// nobody runs their own private 333. The end of the world is the server's call, never ours.
function registerBHHit(at,n){n=Math.max(1,Math.round(n||1));blackhole.hits=Math.min(blackhole.max,blackhole.hits+n);sendBhhit?.({n});boom(at,0xff365c,.8);ui.hit.classList.add('on');setTimeout(()=>ui.hit.classList.remove('on'),90);bhMilestone(peerId)}
function bhIntegrity(){return Math.max(1,Math.ceil((1-blackhole.hits/blackhole.max)*100))}
// silent=true adopts the total without announcing it — used on welcome, so a late joiner
// inherits the sector's countdown instead of replaying every milestone it missed.
function applyBhTotal(total,silent){const t=Math.round(Number(total));if(!Number.isFinite(t))return false;blackhole.hits=Math.max(0,Math.min(blackhole.max,t));if(silent)bhIntShown=bhIntegrity();return true}
// ---- Doomsday alerts: everyone hears about it when somebody shoots the singularity ----
let bhWarnAt=0,bhIntShown=100;
const BH_TAUNTS=['<b>%N</b> is shooting the RESET SINGULARITY — somebody wants a fresh universe','<b>%N</b> keeps feeding the mouth at the end of everything','<b>%N</b> is poking the apocalypse. The apocalypse likes it.','<b>%N</b> has decided this world has had a good run'];
// WORLD INTEGRITY is announced on every whole-percent drop, naming whoever is currently
// pounding the singularity (the local player, or the peer whose hit came over the wire).
function bhMilestone(attackerId){const pct=blackhole.hits/blackhole.max,integ=Math.max(1,Math.ceil((1-pct)*100));if(integ<bhIntShown&&pct<1){bhIntShown=integ;const who=short(attackerId??peerId);toast('⚠ WORLD INTEGRITY '+integ+'% — '+who);feed('⚠ WORLD INTEGRITY <b>'+integ+'%</b> — <b>'+who+'</b> is wearing the world down');sound(90,.5,'sawtooth',.1)}}
function bhWarn(id){bhMilestone(id);const n=performance.now();if(n-bhWarnAt<3500)return;bhWarnAt=n;const rem=Math.max(0,blackhole.max-blackhole.hits);feed('⚠ '+BH_TAUNTS[(Math.random()*BH_TAUNTS.length)|0].replace('%N',short(id))+' — <b>'+rem+'</b> hits to oblivion');sound(140,.25,'triangle',.06)}
// ---- World end: the singularity swallows everything — world, ships, HUD — then stays alone on screen until the player refreshes ----
let worldEnding=false,endT0=0,endItems=null,endDom=null,endBS0=1;
const END_DUR=4000,endAxis=new THREE.Vector3(0,1,0);
function startWorldEnd(){if(worldEnding)return;worldEnding=true;resetting=true;endT0=performance.now();endBS0=blackhole.mesh.scale.x;
  try{document.exitPointerLock?.()}catch{}
  try{if(socket){socket.onclose=null;socket.close()}}catch{}
  sound(34,3.5,'sine',.3);sound(52,2.2,'sawtooth',.16);setTimeout(()=>sound(26,2.8,'sine',.34),1400);
  try{if(planetVoices&&audioCtx)for(const v of planetVoices)v.gain?.gain?.setTargetAtTime(0.0001,audioCtx.currentTime,0.7)}catch{}
  setTimeout(()=>{try{audioCtx?.suspend?.()}catch{}},END_DUR+800);
  const el=document.createElement('div');el.id='worldEnd';el.innerHTML='<h2>THE WORLD HAS ENDED</h2><p>everything belongs to the singularity now</p>';document.body.appendChild(el);
  endItems=[];for(const o of scene.children){if(o===blackhole.mesh)continue;endItems.push({o,p0:o.position.clone(),s0:o.scale.clone()})}
  // Only suck in what the player can actually SEE: panels hidden via opacity/visibility (help card, gate, toast)
  // must stay hidden instead of popping into view mid-collapse, and visible elements keep their own base opacity.
  endDom=[];document.querySelectorAll('body > *').forEach(n=>{if(n.id==='game'||n.tagName==='SCRIPT')return;const rc=n.getBoundingClientRect();if(!rc.width&&!rc.height)return;const cs=getComputedStyle(n);const op0=parseFloat(cs.opacity)||0;if(cs.visibility==='hidden'||cs.display==='none'||op0<0.05)return;endDom.push({n,cx:rc.left+rc.width/2,cy:rc.top+rc.height/2,tf0:cs.transform==='none'?'':cs.transform,op0});n.style.transition='none';n.style.pointerEvents='none'})}
function updateWorldEnd(dt){const t=performance.now(),k=Math.min(1,(t-endT0)/END_DUR),e=k*k;
  for(const it of endItems){const off=it.p0.clone().sub(blackhole.pos).applyAxisAngle(endAxis,e*3);it.o.position.copy(blackhole.pos).addScaledVector(off,1-e);it.o.scale.copy(it.s0).multiplyScalar(Math.max(.001,1-e))}
  const camT=blackhole.pos.clone().add(new THREE.Vector3(0,20,430));camera.position.lerp(camT,1-Math.pow(.03,dt));camera.up.set(0,1,0);camera.lookAt(blackhole.pos);camera.fov+=(baseFov-camera.fov)*Math.min(1,dt*2);camera.updateProjectionMatrix();
  // Once the collapse is complete the spin winds down over a few seconds to a slow, tired drift.
  const spinK=k<1?1:Math.max(0.03,Math.pow(0.35,(t-endT0-END_DUR)/1000));
  blackhole.veins.rotation.y+=dt*(0.25+e*2.6)*spinK;blackhole.veins.rotation.x+=dt*(0.12+e*1.2)*spinK;blackhole.mesh.scale.setScalar(endBS0*(1+0.35*e));
  if(endDom){proj.copy(blackhole.pos).project(camera);const sx=(proj.x*0.5+0.5)*innerWidth,sy=(-proj.y*0.5+0.5)*innerHeight,s=Math.max(.001,1-e);
    for(const d of endDom){d.n.style.transform=`translate(${(sx-d.cx)*e}px,${(sy-d.cy)*e}px) scale(${s}) ${d.tf0}`;d.n.style.opacity=String(Math.max(0,d.op0*(1-e*1.05)))}
    if(k>=1){for(const d of endDom)d.n.style.display='none';endDom=null}}
  updateFx(dt)}
function updateCrystals(t,dt){for(const c of crystals){const m=c.mesh;if(c.alive){if(c.grow<1)c.grow=Math.min(1,c.grow+dt*c.growRate);else if(c.full<c.maxFull)c.full=Math.min(c.maxFull,c.full+dt*c.fullRate)}if(c.alive&&c.mode==='sprout'&&c.grow>=1&&c.branches.length<c.sproutCap&&t-c.lastSprout>2400){c.lastSprout=t;const n=c.branches.length,y=1-(((n*13)%20)/10),rad=Math.sqrt(Math.max(0.05,1-y*y)),ang=n*GOLDEN,dir=new THREE.Vector3(Math.cos(ang)*rad,y,Math.sin(ang)*rad).normalize(),petal=petalGroup(c.size,c.color);petal.position.copy(dir.clone().multiplyScalar(c.size*0.55));petal.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),dir);c.mesh.add(petal);c.branches.push(petal);c.branchHp.push(2)}c.radius=c.radius0*c.full;const e=1-Math.pow(1-c.grow,3);const pulse=1+Math.sin(t*0.001+c.phase)*0.04;m.scale.setScalar(Math.max(0.001,e*c.full*pulse));m.visible=c.alive&&c.grow>0.02;m.rotation.y+=dt*0.12;m.rotation.x+=dt*0.05;}}
// Partial destruction: shoot ONE branch away; whole crystal only dies when all branches gone.
function hitCrystalBranch(c,at,bi,dmg){boom(at.clone(),c.color,.7);ui.hit.classList.add('on');setTimeout(()=>ui.hit.classList.remove('on'),90);
  if(bi>=0&&c.branchHp[bi]>0){c.branchHp[bi]-=(dmg||1);if(c.branchHp[bi]<=0){const b=c.branches[bi];if(b){b.visible=false;boom(c.pos.clone().add(b.position.clone().multiplyScalar(c.grow*c.full)),c.color,1.2)}}}
  if(c.branches.every((b,i)=>c.branchHp[i]<=0)){c.alive=false;boom(c.pos.clone(),c.color,2.6);feed(`<b>${c.name}</b> shattered`);if(c.phantom){setTimeout(()=>{const idx=crystals.indexOf(c);if(idx>=0){scene.remove(c.mesh);crystals.splice(idx,1)}},400);return}setTimeout(()=>{c.grow=0;c.full=1;c.alive=true;c.branchHp=c.branches.map(()=>2);c.branches.forEach(b=>b.visible=true)},9000)}}
function nearestBranch(c,pt){let bi=-1,bd=Infinity;for(let i=0;i<c.branches.length;i++){const b=c.branches[i];if(c.branchHp[i]<=0)continue;const wp=c.pos.clone().add(b.position.clone().multiplyScalar(c.grow*c.full));const d=wp.distanceTo(pt);if(d<bd){bd=d;bi=i}}return bi}

const flameTex=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');const gr=x.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.35,'rgba(150,235,255,.7)');gr.addColorStop(1,'rgba(40,120,255,0)');x.fillStyle=gr;x.fillRect(0,0,64,64);return new THREE.CanvasTexture(c)})();
function makeFlame(color,mount){const M=14,len=5.4;const geo=new THREE.BufferGeometry(),arr=new Float32Array(M*2*3),dirs=[];for(let i=0;i<M;i++)dirs.push([THREE.MathUtils.randFloatSpread(1),THREE.MathUtils.randFloatSpread(1)]);geo.setAttribute('position',new THREE.BufferAttribute(arr,3));const seg=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color,transparent:true,opacity:.6,blending:THREE.AdditiveBlending,depthWrite:false}));return{seg,geo,arr,dirs,mount,len,M};}
function updateFlame(f,level){const flick=.7+Math.random()*.5,L=f.len*(0.1+level*1.0)*flick;for(let i=0;i<f.M;i++){const o=i*6,dx=f.dirs[i][0],dy=f.dirs[i][1],jz=L*(0.5+Math.random()*0.7),sp=L*0.28;f.arr[o]=f.mount[0];f.arr[o+1]=f.mount[1];f.arr[o+2]=f.mount[2];f.arr[o+3]=f.mount[0]+dx*sp*Math.random();f.arr[o+4]=f.mount[1]+dy*sp*Math.random();f.arr[o+5]=f.mount[2]+jz;}f.geo.attributes.position.needsUpdate=true;f.seg.material.opacity=.18+level*.72;}

function ship(color=0x41ffe0,variant=0){
  const g=new THREE.Group();
  const wire=o=>new THREE.MeshBasicMaterial({color,wireframe:true,transparent:true,opacity:o});
  const line=new THREE.LineBasicMaterial({color,transparent:true,opacity:.9});
  const cockpit=()=>new THREE.Mesh(new THREE.SphereGeometry(1.15,10,8),new THREE.MeshBasicMaterial({color:0xffffff,wireframe:true,transparent:true,opacity:.45}));
  const loop=pts=>new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts.map(p=>new THREE.Vector3(p[0],p[1],p[2]))),line);
  let mounts=[],cannons=[],radius=7;
  if(variant===0){
    const nose=new THREE.Mesh(new THREE.ConeGeometry(1.7,7,6),wire(.92));nose.rotation.x=-Math.PI/2;nose.position.z=-5.5;g.add(nose);
    const body=new THREE.Mesh(new THREE.CylinderGeometry(1.7,2.3,7,6),wire(.85));body.rotation.x=Math.PI/2;body.position.z=.6;g.add(body);
    const tail=new THREE.Mesh(new THREE.ConeGeometry(2.3,3,6),wire(.7));tail.rotation.x=Math.PI/2;tail.position.z=5.6;g.add(tail);
    const cb=cockpit();cb.position.set(0,.9,-2);g.add(cb);
    for(const s of[1,-1]){g.add(loop([[.8*s,0,-1],[9*s,0,4],[9*s,0,6.6],[1.6*s,0,5.4]]));const pod=new THREE.Mesh(new THREE.OctahedronGeometry(.9,0),wire(.8));pod.position.set(8.6*s,0,5);g.add(pod);}
    g.add(loop([[0,0,3],[0,3.4,6.4],[0,0,6.8]]));mounts=[[-3.2,0,6],[0,0,6],[3.2,0,6]];cannons=[[0,0,-9]];radius=7;
  }else if(variant===1){
    const body=new THREE.Mesh(new THREE.BoxGeometry(4,2.4,11),wire(.85));g.add(body);
    const nose=new THREE.Mesh(new THREE.ConeGeometry(1.7,4,4),wire(.85));nose.rotation.x=-Math.PI/2;nose.rotation.z=Math.PI/4;nose.position.z=-6.5;g.add(nose);
    const cb=cockpit();cb.position.set(0,1.3,-1.5);g.add(cb);
    for(const s of[1,-1]){const pod=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.1,11,6),wire(.82));pod.rotation.x=Math.PI/2;pod.position.set(6*s,0,.4);g.add(pod);g.add(loop([[2*s,0,-2],[6*s,0,-2],[6*s,0,4],[2*s,0,3]]));const gun=new THREE.Mesh(new THREE.CylinderGeometry(.35,.35,7,6),wire(.9));gun.rotation.x=Math.PI/2;gun.position.set(6*s,0,-6);g.add(gun);}
    mounts=[[-6,0,5.7],[6,0,5.7]];cannons=[[-6,0,-8],[6,0,-8]];radius=9;
  }else if(variant===2){
    const body=new THREE.Mesh(new THREE.CylinderGeometry(1,1.4,15,5),wire(.85));body.rotation.x=Math.PI/2;g.add(body);
    const nose=new THREE.Mesh(new THREE.ConeGeometry(1,6,5),wire(.9));nose.rotation.x=-Math.PI/2;nose.position.z=-9;g.add(nose);
    const cb=cockpit();cb.scale.set(.8,.8,.8);cb.position.set(0,.7,-3);g.add(cb);
    for(const s of[1,-1])g.add(loop([[.6*s,0,2],[5.5*s,0,7],[.9*s,0,7.6]]));
    g.add(loop([[0,0,4],[0,4.2,8],[0,0,8]]));mounts=[[0,0,8]];cannons=[[0,0,-12]];radius=7;
  }else if(variant===3){
    const body=new THREE.Mesh(new THREE.CylinderGeometry(1.5,1.9,9,6),wire(.85));body.rotation.x=Math.PI/2;body.position.z=.5;g.add(body);
    const nose=new THREE.Mesh(new THREE.ConeGeometry(1.5,6,6),wire(.9));nose.rotation.x=-Math.PI/2;nose.position.z=-5.5;g.add(nose);
    const cb=cockpit();cb.position.set(0,.9,-1.5);g.add(cb);
    for(const s of[1,-1])for(const y of[1,-1]){g.add(loop([[1*s,.6*y,0],[8*s,3.4*y,4],[8*s,3.4*y,6],[1.5*s,.8*y,5]]));const tip=new THREE.Mesh(new THREE.CylinderGeometry(.3,.3,5,5),wire(.85));tip.rotation.x=Math.PI/2;tip.position.set(8*s,3.4*y,-1);g.add(tip);}
    mounts=[[-2.4,0,5.5],[2.4,0,5.5]];cannons=[[-8,3.4,-3],[8,-3.4,-3]];radius=8;
  }else{
    // PHANTOM — sleek sportscar: long teardrop hull, swept blade fins, single thruster
    const body=new THREE.Mesh(new THREE.CylinderGeometry(.7,1.5,13,12),wire(.92));body.rotation.x=Math.PI/2;body.position.z=1;g.add(body);
    const nose=new THREE.Mesh(new THREE.ConeGeometry(.7,7,12),wire(.96));nose.rotation.x=-Math.PI/2;nose.position.z=-8.6;g.add(nose);
    const tail=new THREE.Mesh(new THREE.ConeGeometry(1.5,3,12),wire(.7));tail.rotation.x=Math.PI/2;tail.position.z=8;g.add(tail);
    const cb=cockpit();cb.scale.set(.62,.5,1.5);cb.position.set(0,.55,-2.5);g.add(cb);
    for(const s of[1,-1])g.add(loop([[.5*s,0,3.5],[4.6*s,-.3,7.8],[.9*s,0,7.2]]));
    g.add(loop([[0,0,4],[0,2.2,7.6],[0,0,7.4]]));
    mounts=[[0,0,7.8]];cannons=[[0,0,-11.5]];radius=6;
  }
  g.flames=[];for(const m of mounts){const f=makeFlame(color,m);f.seg.userData.noBlink=true;g.add(f.seg);g.flames.push(f);}
  g.cannons=cannons.map(c=>new THREE.Vector3(c[0],c[1],c[2]));
  // Visible ordnance on the hull for special weapons
  g.ordnance=[];const st=SHIP_STATS[variant];
  if(st.special==='rocket'){for(const s of[1,-1])for(const rz of[-2.4,0,2.4]){const rk=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,3,6),new THREE.MeshBasicMaterial({color:0xff7a3c}));rk.rotation.x=-Math.PI/2;rk.position.set(5*s,-1.7,rz);const tip=new THREE.Mesh(new THREE.ConeGeometry(.42,1,6),new THREE.MeshBasicMaterial({color:0xffd0a0}));tip.rotation.x=-Math.PI/2;tip.position.z=-2;rk.add(tip);g.add(rk);g.ordnance.push(rk)}}
  else if(st.special==='mine'){const mn=new THREE.Mesh(new THREE.IcosahedronGeometry(2.2,0),new THREE.MeshBasicMaterial({color:0xff365c,wireframe:true}));mn.position.set(0,-2.2,2);g.add(mn);g.ordnance.push(mn);}
  g.userData.radius=radius;g.userData.variant=variant;return g;
}
let player=ship(0x41ffe0,shipVariant); player.position.set(0,0,120);scene.add(player);
function applyShipStats(v,refill){const st=SHIP_STATS[v];specMax=st.specMax;spec=refill?specMax:Math.min(spec,specMax);maxHealth=st.hull||100;health=Math.min(health,maxHealth);ui.shipName.textContent=st.name;showStatCard(v);updateOrdnance()}
function updateOrdnance(){const n=player.ordnance?player.ordnance.length:0;if(!n)return;const st=SHIP_STATS[shipVariant];if(st.special==='rocket'){const shown=Math.ceil(spec/st.specMax*n);player.ordnance.forEach((o,i)=>o.visible=i<shown)}else if(st.special==='mine'){player.ordnance.forEach(o=>o.visible=spec>0)}}
function showStatCard(v){const st=SHIP_STATS[v];ui.ssName.textContent=st.name;ui.ssWeapon.textContent=st.weapon;ui.ssSpeed.style.width=statPct('speed',st.speed)+'%';ui.ssAccel.style.width=statPct('accel',st.accel)+'%';ui.ssRange.style.width=statPct('range',st.range)+'%';ui.shipStats.classList.add('on');clearTimeout(showStatCard._t);showStatCard._t=setTimeout(()=>ui.shipStats.classList.remove('on'),2600)}
applyShipStats(shipVariant,true);
function drone(i){const g=new THREE.Group(),col=i%2?0xffb547:0xff365c;g.add(new THREE.Mesh(new THREE.OctahedronGeometry(6,1),new THREE.MeshBasicMaterial({color:col,wireframe:true})));const ring=new THREE.Mesh(new THREE.TorusGeometry(8,.25,5,24),new THREE.MeshBasicMaterial({color:col}));ring.rotation.x=Math.PI/2;g.add(ring);g.position.set(Math.sin(i*1.7)*600,Math.sin(i*.8)*260-80,Math.cos(i*1.7)*700);g.userData={base:g.position.clone(),phase:i*1.31,hp:3,radius:9,name:'DRONE-'+String(i+1).padStart(2,'0'),color:col};scene.add(g);debris.push(g)}for(let i=0;i<10;i++)drone(i);

let socket,sendState,sendShot,sendHit,sendDeath,sendPlanet,sendRocket,sendMine,sendLaser,sendPCrystal,sendBhhit,sendReset,sendName;
function connect(){const proto=location.protocol==='https:'?'wss:':'ws:';socket=new WebSocket(`${proto}//${location.host}/app/ws`);const send=(type,d)=>socket.readyState===1&&socket.send(JSON.stringify({type,d}));sendState=d=>send('state',d);sendShot=d=>send('shot',d);sendHit=d=>send('hit',d);sendDeath=d=>send('death',d);sendPlanet=d=>send('planet',d);sendRocket=d=>send('rocket',d);sendMine=d=>send('mine',d);sendLaser=d=>send('laser',d);sendPCrystal=d=>send('pcrystal',d);sendBhhit=d=>send('bhhit',d);sendReset=d=>send('reset',d);sendName=d=>send('name',d);socket.onopen=()=>{ui.net.textContent='LIVE';if(entered)send('hello',{name:pilotName})};socket.onmessage=e=>{const m=JSON.parse(e.data),d=m.d,id=m.id;if(m.type==='welcome'){peerId=m.id;ui.selfName.textContent=pilotLabel(pilotName,peerId);for(const [pid,st] of Object.entries(m.players||{})){if(pid!==peerId)updatePeer(st,pid)}(m.planets||[]).forEach(applyHole);if(m.bh){blackhole.max=Number(m.bh.max)||blackhole.max;applyBhTotal(m.bh.hits,true)}return}if(m.type==='join'){if(id!==peerId){addPeer(id,0,m.name);feed(`<b>${short(id,m.name)}</b> entered the sector`);toast('NEW PILOT ON RADAR');whoosh()}}else if(m.type==='name'&&id!==peerId){const p=peers.get(id);if(p)p.userData.name=m.name||'';feed(`<b>${pilotLabel(m.oldName,id)}</b> is now <b>${short(id,m.name)}</b>`)}else if(m.type==='leave'){feed(`<b>${short(id,m.name)}</b> left the sector`);removePeer(id)}else if(m.type==='state'&&id!==peerId)updatePeer(d,id);else if(m.type==='shot'&&id!==peerId)spawnBullet(d,id,false);else if(m.type==='rocket'&&id!==peerId)spawnRocket(d,id,false);else if(m.type==='mine'&&id!==peerId)spawnMine(d,id,false);else if(m.type==='laser'&&id!==peerId)spawnLaser(d,id,false);else if(m.type==='pcrystal'&&id!==peerId)spawnPhantomCrystal(new THREE.Vector3(d.p[0],d.p[1],d.p[2]),d.c,false);else if(m.type==='bhhit'){if(!applyBhTotal(d&&d.total))blackhole.hits=Math.min(blackhole.max,blackhole.hits+Math.max(1,Number(d&&d.n)||1));if(id===peerId)bhMilestone(peerId);else bhWarn(id)}else if(m.type==='reset')startWorldEnd();else if(m.type==='hit'&&d.target===peerId&&!dead){health=Math.max(0,health-d.damage);flashDamage();if(health<=0)die(id)}else if(m.type==='planet')applyHole(d);else if(m.type==='death'){const v=peers.get(d.victim);if(v&&!d.quiet)shipExplode(v.position.clone(),0xffb547);const kp=peers.get(d.killer);if(kp)kp.userData.kills=Number(d.killerKills)||0;if(d.killer===peerId){kills=Number(d.killerKills)||kills+1;ui.killCount.textContent=kills;toast('KILL #'+kills)}const streak=d.killer?' <span>[☠ '+(Number(d.killerKills)||0)+']</span>':'';feed(`<b>${d.killer?short(d.killer,d.killerName):'THE VOID'}</b>${streak} destroyed <b>${short(d.victim,d.victimName)}</b>`)}};socket.onclose=()=>{ui.net.textContent='RECONNECTING';setTimeout(connect,1500)};socket.onerror=()=>ui.net.textContent='ALERT'}connect();
function applyHole(h){const pl=planets[h.i];if(pl&&pl.destructible)pl.addHole(new THREE.Vector3(h.d[0],h.d[1],h.d[2]),HOLE_ANGLE)}
function short(id,name){if(id===peerId||id==='YOU')return pilotLabel(name??pilotName,id);const peer=peers.get(id);return pilotLabel(name??peer?.userData.name,id)}
function addPeer(id,v=0,name='',peerKills=0){if(peers.has(id)){const p=peers.get(id);if(name)p.userData.name=name;p.userData.kills=Number(peerKills)||p.userData.kills||0;return}const mesh=ship(0xffb547,v);mesh.userData={id,name:normalizePilotName(name),kills:Number(peerKills)||0,targetPos:new THREE.Vector3().copy(player.position),targetQuat:new THREE.Quaternion(),health:100,radius:mesh.userData.radius,variant:v,joined:performance.now(),engine:.06,targetEngine:.55};scene.add(mesh);peers.set(id,mesh);ui.count.textContent=peers.size+1}
function removePeer(id){const p=peers.get(id);if(p)scene.remove(p);peers.delete(id);const el=peerFrameEls.get(id);if(el){el.remove();peerFrameEls.delete(id)}const ar=peerArrowEls.get(id);if(ar){ar.remove();peerArrowEls.delete(id)}ui.count.textContent=peers.size+1}
function updatePeer(d,id){const v=d.v==null?0:d.v;let p=peers.get(id);if(!p){addPeer(id,v,d.name,d.kills);p=peers.get(id)}else if(p.userData.variant!==v){const tp=p.userData.targetPos,tq=p.userData.targetQuat,jn=p.userData.joined,nm=normalizePilotName(d.name??p.userData.name),pk=Number(d.kills)||p.userData.kills||0;scene.remove(p);const m=ship(0xffb547,v);m.userData={id,name:nm,kills:pk,targetPos:tp,targetQuat:tq,health:d.h,radius:m.userData.radius,variant:v,joined:jn,engine:p.userData.engine??.06,targetEngine:p.userData.targetEngine??.55};scene.add(m);peers.set(id,m);p=m}p.userData.name=normalizePilotName(d.name??p.userData.name);p.userData.kills=Number(d.kills)||0;p.userData.targetPos.set(d.p[0],d.p[1],d.p[2]);p.userData.targetQuat.set(d.q[0],d.q[1],d.q[2],d.q[3]);p.userData.health=d.h;p.userData.targetEngine=d.e==null?.55:Math.max(0,Math.min(1,Number(d.e)||0));p.visible=!d.dead}
function pack(){return{p:player.position.toArray().map(n=>Math.round(n*10)/10),q:player.quaternion.toArray().map(n=>Math.round(n*1000)/1000),h:health,dead,v:shipVariant,name:pilotName,e:Math.round(engineLevel*100)/100}}

function boom(pos,color,scale,ttl){ttl=ttl||0.85*scale;const n=Math.round(46*scale),geo=new THREE.BufferGeometry(),a=new Float32Array(n*3),vlist=[];for(let i=0;i<n;i++){vlist.push(new THREE.Vector3(THREE.MathUtils.randFloatSpread(2),THREE.MathUtils.randFloatSpread(2),THREE.MathUtils.randFloatSpread(2)).normalize().multiplyScalar(THREE.MathUtils.randFloat(30,120)*scale));a[i*3]=pos.x;a[i*3+1]=pos.y;a[i*3+2]=pos.z}geo.setAttribute('position',new THREE.BufferAttribute(a,3));const pts=new THREE.Points(geo,new THREE.PointsMaterial({color,size:2.4*scale,transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false}));const ring=new THREE.Mesh(new THREE.RingGeometry(1,2.2,40),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));ring.position.copy(pos);const flash=new THREE.Mesh(new THREE.SphereGeometry(3.5*scale,10,10),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));flash.position.copy(pos);scene.add(pts,ring,flash);fx.push({life:0,ttl,update:(k,dt)=>{for(let j=0;j<vlist.length;j++){a[j*3]+=vlist[j].x*dt;a[j*3+1]+=vlist[j].y*dt;a[j*3+2]+=vlist[j].z*dt}geo.attributes.position.needsUpdate=true;pts.material.opacity=1-k;const rs=1+k*22*scale;ring.scale.set(rs,rs,rs);ring.material.opacity=.9*(1-k);ring.quaternion.copy(camera.quaternion);const fs=Math.max(.01,1-k*3);flash.scale.set(fs,fs,fs);flash.material.opacity=.9*Math.max(0,1-k*2.5)},dispose:()=>{scene.remove(pts,ring,flash);geo.dispose()}});sound(38+18*Math.min(1,scale),Math.min(.9,.5*scale),'sine',Math.min(0.3,0.08*scale))}
function shipExplode(pos,color){boom(pos,0xffffff,3,.5);boom(pos,color,5.5,1.1);if(camera.position.distanceTo(pos)<220)document.body.animate([{filter:'brightness(2.6)'},{filter:'brightness(1)'}],{duration:300});sound(30,1.0,'sine',0.4);sound(48,.6,'sawtooth',0.26)}
function zap(center,color=0x5cffd6){const bolts=8,S=5,geo=new THREE.BufferGeometry(),arr=new Float32Array(bolts*(S-1)*2*3),dirs=[];for(let b=0;b<bolts;b++)dirs.push(new THREE.Vector3(THREE.MathUtils.randFloatSpread(2),THREE.MathUtils.randFloatSpread(2),THREE.MathUtils.randFloatSpread(2)).normalize());geo.setAttribute('position',new THREE.BufferAttribute(arr,3));const seg=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color,transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false}));scene.add(seg);const rebuild=()=>{let o=0;for(let b=0;b<bolts;b++){let px=center.x,py=center.y,pz=center.z;const step=26/(S-1);for(let s=1;s<S;s++){const nx=center.x+dirs[b].x*step*s+THREE.MathUtils.randFloatSpread(7),ny=center.y+dirs[b].y*step*s+THREE.MathUtils.randFloatSpread(7),nz=center.z+dirs[b].z*step*s+THREE.MathUtils.randFloatSpread(7);arr[o++]=px;arr[o++]=py;arr[o++]=pz;arr[o++]=nx;arr[o++]=ny;arr[o++]=nz;px=nx;py=ny;pz=nz}}geo.attributes.position.needsUpdate=true};rebuild();fx.push({life:0,ttl:.55,update:(k)=>{if(Math.random()<.7)rebuild();seg.material.opacity=Math.max(0,1-k)},dispose:()=>{scene.remove(seg);geo.dispose()}});sound(520,.28,'triangle')}
function laserStreak(from,dir){const len=90,geo=new THREE.BufferGeometry();const p=[];for(let i=0;i<6;i++){const off=new THREE.Vector3(THREE.MathUtils.randFloatSpread(3),THREE.MathUtils.randFloatSpread(3),THREE.MathUtils.randFloatSpread(3));const tilt=dir.clone().add(new THREE.Vector3(THREE.MathUtils.randFloatSpread(.45),THREE.MathUtils.randFloatSpread(.45),THREE.MathUtils.randFloatSpread(.45))).normalize();const l=len*THREE.MathUtils.randFloat(.6,1.25);p.push(from.x+off.x,from.y+off.y,from.z+off.z, from.x+off.x-tilt.x*l,from.y+off.y-tilt.y*l,from.z+off.z-tilt.z*l)}geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(p),3));const seg=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:0x9ffcff,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false}));const glow=new THREE.Mesh(new THREE.SphereGeometry(2.6,8,8),new THREE.MeshBasicMaterial({color:0xbdfcff,transparent:true,opacity:.7,blending:THREE.AdditiveBlending,depthWrite:false}));glow.position.copy(from).addScaledVector(dir,-6);scene.add(seg,glow);fx.push({life:0,ttl:.3,update:(k)=>{seg.material.opacity=.85*(1-k);const gs=1+k*7;glow.scale.setScalar(gs);glow.material.opacity=.7*(1-k)*(1-k)},dispose:()=>{scene.remove(seg,glow);geo.dispose()}})}
function updateFx(dt){for(let i=fx.length-1;i>=0;i--){const e=fx[i];e.life+=dt;const k=e.life/e.ttl;if(k>=1){e.dispose();fx.splice(i,1);continue}e.update(k,dt)}}
function animateEngines(dt){for(const f of player.flames)updateFlame(f,engineLevel);peers.forEach(p=>{if(p.flames){const u=p.userData,goal=p.visible?(u.targetEngine==null?.55:u.targetEngine):0;if(u.engine==null)u.engine=goal;u.engine+=(goal-u.engine)*Math.min(1,(dt||.016)*9);for(const f of p.flames)updateFlame(f,u.engine)}})}

function spawnBullet(d,owner,local){const m=new THREE.Mesh(new THREE.CylinderGeometry(.11,.11,5,5),new THREE.MeshBasicMaterial({color:local?0x41ffe0:0xffb547,transparent:true,opacity:.95,blending:THREE.AdditiveBlending}));m.rotation.x=Math.PI/2;m.position.fromArray(d.p);m.quaternion.fromArray(d.q);const dir=new THREE.Vector3(0,0,-1).applyQuaternion(m.quaternion),shotVel=new THREE.Vector3().fromArray(launchVelocity(dir.toArray(),BULLET_SPEED,d.s||[0,0,0]));m.userData={dir,shotVel,travel:0,owner,local};scene.add(m);bullets.push(m)}
function aimDir(muzzle){const camDir=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);const aim=camera.position.clone().addScaledVector(camDir,900);return aim.sub(muzzle).normalize()}
function segDist(a,b,p){const abx=b.x-a.x,aby=b.y-a.y,abz=b.z-a.z,l=abx*abx+aby*aby+abz*abz||1,t=Math.max(0,Math.min(1,((p.x-a.x)*abx+(p.y-a.y)*aby+(p.z-a.z)*abz)/l)),dx=a.x+abx*t-p.x,dy=a.y+aby*t-p.y,dz=a.z+abz*t-p.z;return Math.hypot(dx,dy,dz)}
function mechanicalShot(){sound(2350,.045,'square',.038);sound(760,.052,'sawtooth',.022);setTimeout(()=>sound(270,.026,'square',.016),16)}
function fire(){if(dead||worldEnding||performance.now()-lastShot<145)return;lastShot=performance.now();if(ammo<=0){sound(110,.05,'square');return}ammo--;if(ammo===0)toast('OUT OF AMMO — DOCK TO RELOAD');for(const off of player.cannons){const muzzle=player.position.clone().add(off.clone().applyQuaternion(player.quaternion));const dir=aimDir(muzzle.clone());const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,-1),dir);const d={p:muzzle.toArray(),q:q.toArray(),s:vel.toArray()};spawnBullet(d,peerId,true);if(sendShot)sendShot(d)}mechanicalShot();player.position.add(new THREE.Vector3(0,0,.35).applyQuaternion(player.quaternion))}
// ---- Special weapons: rockets + proximity mine ----
function spawnRocket(d,owner,local){const g=new THREE.Group();const body=new THREE.Mesh(new THREE.CylinderGeometry(.6,.6,4,7),new THREE.MeshBasicMaterial({color:0xff7a3c}));body.rotation.x=Math.PI/2;const tip=new THREE.Mesh(new THREE.ConeGeometry(.6,1.6,7),new THREE.MeshBasicMaterial({color:0xffe0b0}));tip.rotation.x=-Math.PI/2;tip.position.z=-2.6;const fl=new THREE.Sprite(new THREE.SpriteMaterial({map:flameTex,color:0xffb060,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));fl.position.z=3;fl.scale.set(5,5,5);g.add(body,tip,fl);g.position.fromArray(d.p);g.quaternion.fromArray(d.q);const dir=new THREE.Vector3(0,0,-1).applyQuaternion(g.quaternion),shotVel=new THREE.Vector3().fromArray(launchVelocity(dir.toArray(),ROCKET_SPEED,d.s||[0,0,0]));g.userData={dir,shotVel,travel:0,owner,local,fl,dmg:55};scene.add(g);projectiles.push(g)}
function spawnMine(d,owner,local){const g=new THREE.Group();const core=new THREE.Mesh(new THREE.IcosahedronGeometry(4,0),new THREE.MeshBasicMaterial({color:0xff365c,wireframe:true}));const glow=new THREE.Mesh(new THREE.SphereGeometry(2.4,8,8),new THREE.MeshBasicMaterial({color:0xff365c,transparent:true,opacity:.5,blending:THREE.AdditiveBlending}));g.add(core,glow);// sensor tendrils
  const sg=new THREE.BufferGeometry(),pts=[];for(let i=0;i<14;i++){const v=new THREE.Vector3(THREE.MathUtils.randFloatSpread(2),THREE.MathUtils.randFloatSpread(2),THREE.MathUtils.randFloatSpread(2)).normalize();pts.push(0,0,0,v.x*9,v.y*9,v.z*9)}sg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(pts),3));g.add(new THREE.LineSegments(sg,new THREE.LineBasicMaterial({color:0xff6a7c,transparent:true,opacity:.5})));
  g.position.fromArray(d.p);g.userData={owner,local,arm:performance.now()+900,sensor:60,core};scene.add(g);mines.push(g)}
function spawnLaser(d,owner,local){const len=190,m=new THREE.Mesh(new THREE.CylinderGeometry(1.6,1.6,len,12),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.98,blending:THREE.AdditiveBlending,depthWrite:false}));m.rotation.x=Math.PI/2;m.position.fromArray(d.p);m.quaternion.fromArray(d.q);const glow=new THREE.Mesh(new THREE.CylinderGeometry(4.6,4.6,len,12),new THREE.MeshBasicMaterial({color:0x9ffcff,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false}));glow.rotation.x=Math.PI/2;m.add(glow);const halo=new THREE.Mesh(new THREE.CylinderGeometry(9,9,len,12),new THREE.MeshBasicMaterial({color:0x6fd8ff,transparent:true,opacity:.16,blending:THREE.AdditiveBlending,depthWrite:false}));halo.rotation.x=Math.PI/2;m.add(halo);const dir=new THREE.Vector3(0,0,-1).applyQuaternion(m.quaternion);m.userData={dir,life:1.4,owner,local,laser:true,dmg:30,prev:new THREE.Vector3().fromArray(d.p)};scene.add(m);projectiles.push(m)}
function spawnPhantomCrystal(pos,col,local){col=col||0xb46bff;const g=buildFlower(8,6,col,true);g.position.copy(pos);g.scale.setScalar(0.001);scene.add(g);const branches=g.children.filter(ch=>ch.type==='Group');crystals.push({mesh:g,pos:pos.clone(),grow:0,full:1,maxFull:2.4,fullRate:0.25,radius0:16,radius:16,color:col,phase:Math.random()*6,name:'SHARD',alive:true,big:false,growRate:0.8,branches,branchHp:branches.map(()=>1),phantom:true});}
function fireSpecial(){if(dead||worldEnding)return;const st=SHIP_STATS[shipVariant];if(st.special==='none'){toast('NO SPECIAL WEAPON');return}if(performance.now()-lastSpec<420)return;if(spec<=0){toast('SPECIAL EMPTY — DOCK TO REARM');sound(110,.06,'square');return}lastSpec=performance.now();
  if(st.special==='rocket'){const rk=player.ordnance[spec-1];const muzzle=rk?rk.getWorldPosition(new THREE.Vector3()):player.position.clone().add(new THREE.Vector3(0,-1.7,-2).applyQuaternion(player.quaternion));const dir=aimDir(muzzle.clone());const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,-1),dir);const d={p:muzzle.toArray(),q:q.toArray(),s:vel.toArray()};spec--;updateOrdnance();spawnRocket(d,peerId,true);sendRocket?.(d);boom(muzzle.clone(),0xffb060,.5,.3);sound(150,.12,'sawtooth')}
  else if(st.special==='mine'){spec--;updateOrdnance();const p=player.position.clone().add(new THREE.Vector3(0,0,9).applyQuaternion(player.quaternion));const d={p:p.toArray()};spawnMine(d,peerId,true);sendMine?.(d);toast('MINE DEPLOYED');sound(90,.15,'square')}
  else if(st.special==='laser'){spec--;updateOrdnance();const muzzle=player.position.clone().add(new THREE.Vector3(0,0,-9).applyQuaternion(player.quaternion));const dir=aimDir(muzzle.clone());const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,-1),dir);const d={p:muzzle.toArray(),q:q.toArray()};spawnLaser(d,peerId,true);sendLaser?.(d);sound(1200,.14,'sawtooth',0.09)}
  else if(st.special==='crystal'){spec--;updateOrdnance();const p=player.position.clone().add(new THREE.Vector3(0,0,16).applyQuaternion(player.quaternion));spawnPhantomCrystal(p,0xb46bff,true);sendPCrystal?.({p:p.toArray(),c:0xb46bff});sound(520,.2,'triangle',0.06)}}
function detonateRocket(g,idx){shipExplode?boom(g.position.clone(),0xff7a3c,2.4):0;boom(g.position.clone(),0xff7a3c,2.4);scene.remove(g);projectiles.splice(idx,1)}
function hitPeer(target,id,dmg){dmg=dmg||25;sendHit?.({target:id,damage:dmg});target.userData.health-=dmg;ui.hit.classList.add('on');setTimeout(()=>ui.hit.classList.remove('on'),90);sound(680,.055,'sawtooth');boom(target.position.clone(),0xffb547,.5);if(target.userData.health<=0)feed(`<b>${short(peerId)}</b> critically hit <b>${short(id)}</b>`)}
function die(killer,cause,quiet){if(dead)return;dead=true;player.visible=false;if(!quiet)shipExplode(player.position.clone(),0x41ffe0);sendDeath?.({victim:peerId,killer,quiet:!!quiet});ui.death.classList.remove('hidden');ui.deathCause.textContent=cause||(killer?('DESTROYED BY '+short(killer)):'LOST IN THE VOID');let n=3;ui.respawn.textContent='RESPAWN '+n;const t=setInterval(()=>{n--;ui.respawn.textContent='RESPAWN '+n;if(n<=0){clearInterval(t);respawn()}},1000)}
function respawn(){health=maxHealth;fuel=100;ammo=maxAmmo;spec=specMax;updateOrdnance();dead=false;vel.set(0,0,0);player.position.set(THREE.MathUtils.randFloatSpread(2600),THREE.MathUtils.randFloatSpread(1400),THREE.MathUtils.randFloatSpread(2600));player.quaternion.identity();player.visible=true;invuln=2;ui.death.classList.add('hidden')}
function flashDamage(){document.body.animate([{filter:'none'},{filter:'sepia(1) saturate(6) hue-rotate(300deg)'},{filter:'none'}],{duration:260});sound(90,.18,'square')}
function sound(freq,dur,type,vol){if(!audioCtx)return;const v=vol||.035;const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.setValueAtTime(freq,audioCtx.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(30,freq*.35),audioCtx.currentTime+dur);g.gain.setValueAtTime(v,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+dur);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+dur)}
function whoosh(){if(!audioCtx)return;const now=audioCtx.currentTime,dur=1.15;const buf=audioCtx.createBuffer(1,Math.floor(audioCtx.sampleRate*dur),audioCtx.sampleRate);const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;const src=audioCtx.createBufferSource();src.buffer=buf;const bp=audioCtx.createBiquadFilter();bp.type='bandpass';bp.Q.value=9;bp.frequency.setValueAtTime(260,now);bp.frequency.exponentialRampToValueAtTime(4200,now+dur*0.55);bp.frequency.exponentialRampToValueAtTime(200,now+dur);const g=audioCtx.createGain();g.gain.setValueAtTime(0.0001,now);g.gain.exponentialRampToValueAtTime(0.13,now+dur*0.5);g.gain.exponentialRampToValueAtTime(0.0001,now+dur);src.connect(bp).connect(g).connect(audioCtx.destination);const o=audioCtx.createOscillator();o.type='sine';o.frequency.setValueAtTime(170,now);o.frequency.exponentialRampToValueAtTime(1500,now+dur*0.6);o.frequency.exponentialRampToValueAtTime(300,now+dur);const og=audioCtx.createGain();og.gain.setValueAtTime(0.0001,now);og.gain.exponentialRampToValueAtTime(0.05,now+dur*0.5);og.gain.exponentialRampToValueAtTime(0.0001,now+dur);o.connect(og).connect(audioCtx.destination);src.start(now);src.stop(now+dur);o.start(now);o.stop(now+dur)}
// -- RAVE WORLD --------------------------------------------------------------
// Planet index 5 (the living, colour-shifting green world) broadcasts a real
// techno track instead of a drone: 130 BPM, an 8-bar loop whose last bar drops
// the kick for a riser. Everything is scheduled with Web Audio lookahead so it
// never drifts, it fades in with proximity like the other planet voices, and it
// ducks the sector ambience so the two never fight over the same beat.
const TECHNO_PLANET=5;
let noiseBuf=null;
function noiseSrc(){if(!noiseBuf){noiseBuf=audioCtx.createBuffer(1,audioCtx.sampleRate,audioCtx.sampleRate);const d=noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1}const s=audioCtx.createBufferSource();s.buffer=noiseBuf;s.loop=true;return s}
function makeTechnoVoice(pl,bus){
  const BPM=130,S=60/BPM/4;                                   // S = one sixteenth
  const out=audioCtx.createGain();out.gain.value=0.0001;out.connect(bus);
  const mix=audioCtx.createGain();mix.gain.value=0.6;mix.connect(out);
  // 3/16 feedback delay, fed by the lead stabs only
  const dl=audioCtx.createDelay(1);dl.delayTime.value=S*3;const dlf=audioCtx.createBiquadFilter();dlf.type='lowpass';dlf.frequency.value=1300;const fb=audioCtx.createGain();fb.gain.value=0.3;dl.connect(dlf);dlf.connect(fb);fb.connect(dl);dl.connect(mix);
  const send=audioCtx.createGain();send.gain.value=0.2;send.connect(dl);
  // acid bass: one running saw through a resonant lowpass, re-enveloped per step
  const bf=audioCtx.createBiquadFilter();bf.type='lowpass';bf.Q.value=9;bf.frequency.value=220;const bg=audioCtx.createGain();bg.gain.value=0.0001;bf.connect(bg);bg.connect(mix);
  const bosc=audioCtx.createOscillator();bosc.type='sawtooth';bosc.frequency.value=55;bosc.connect(bf);bosc.start();
  // Sub: a clean sine an octave under the riff, bypassing the resonant filter so
  // the weight sits below the mix instead of adding brightness.
  const sub=audioCtx.createOscillator();sub.type='sine';sub.frequency.value=27.5;const subLP=audioCtx.createBiquadFilter();subLP.type='lowpass';subLP.frequency.value=120;const subg=audioCtx.createGain();subg.gain.value=0.0001;sub.connect(subLP);subLP.connect(subg);subg.connect(mix);sub.start();
  const A=55,C=65.41,D=73.42,E=82.41,G=98;                    // A minor, same key as the drones
  const BASS=[A,0,A,0,C,0,A,G,0,A,0,E,0,C,D,0];
  const ACC =[1,0,0,0,1,0,0,1,0,1,0,1,0,0,1,0];
  const LEAD=[[A*4,0,C*4,0,E*4,0,C*4,0,G*4,0,E*4,0,C*4,0,D*4,0],
              [E*4,0,0,C*4,0,A*4,0,0,G*4,0,C*4,0,E*4,0,D*4,0]];
  const kick=t=>{const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='sine';o.frequency.setValueAtTime(125,t);o.frequency.exponentialRampToValueAtTime(36,t+0.11);g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(0.85,t+0.005);g.gain.exponentialRampToValueAtTime(0.0001,t+0.38);o.connect(g).connect(mix);o.start(t);o.stop(t+0.4)};
  const hat=(t,open)=>{const s=noiseSrc(),f=audioCtx.createBiquadFilter(),g=audioCtx.createGain(),d=open?0.13:0.032;f.type='highpass';f.frequency.value=open?6000:7800;g.gain.setValueAtTime(open?0.036:0.024,t);g.gain.exponentialRampToValueAtTime(0.0001,t+d);s.connect(f).connect(g).connect(mix);s.start(t);s.stop(t+d+0.02)};
  const clap=t=>{for(let k=0;k<3;k++){const s=noiseSrc(),f=audioCtx.createBiquadFilter(),g=audioCtx.createGain(),st=t+k*0.012,d=k===2?0.15:0.03;f.type='bandpass';f.frequency.value=1100;f.Q.value=1.5;g.gain.setValueAtTime(0.1,st);g.gain.exponentialRampToValueAtTime(0.0001,st+d);s.connect(f).connect(g).connect(mix);s.start(st);s.stop(st+d+0.02)}};
  const stab=(t,f0)=>{const g=audioCtx.createGain(),f=audioCtx.createBiquadFilter();f.type='lowpass';f.Q.value=6;f.frequency.setValueAtTime(1800,t);f.frequency.exponentialRampToValueAtTime(400,t+0.24);g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(0.07,t+0.006);g.gain.exponentialRampToValueAtTime(0.0001,t+0.24);f.connect(g);g.connect(mix);g.connect(send);for(const m of[1,1.006,0.5]){const o=audioCtx.createOscillator();o.type=m===0.5?'square':'sawtooth';o.frequency.value=f0*m;o.connect(f);o.start(t);o.stop(t+0.26)}};
  const riser=(t,dur)=>{const s=noiseSrc(),f=audioCtx.createBiquadFilter(),g=audioCtx.createGain();f.type='bandpass';f.Q.value=5;f.frequency.setValueAtTime(500,t);f.frequency.exponentialRampToValueAtTime(4000,t+dur);g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(0.04,t+dur*0.95);g.gain.exponentialRampToValueAtTime(0.0001,t+dur+0.05);s.connect(f).connect(g).connect(mix);s.start(t);s.stop(t+dur+0.1)};
  const bass=(t,f0,accent,bar)=>{const sweep=380+1150*Math.sin((bar%8)/8*Math.PI);bosc.frequency.setTargetAtTime(f0,t,0.01);bf.frequency.setValueAtTime(150,t);bf.frequency.linearRampToValueAtTime(150+sweep*(accent?1:0.5),t+0.03);bf.frequency.exponentialRampToValueAtTime(160,t+S*3);bg.gain.setValueAtTime(0.0001,t);bg.gain.exponentialRampToValueAtTime(accent?0.24:0.15,t+0.01);bg.gain.exponentialRampToValueAtTime(0.0001,t+S*3.2);
    sub.frequency.setTargetAtTime(f0/2,t,0.008);subg.gain.setValueAtTime(0.0001,t);subg.gain.exponentialRampToValueAtTime(accent?0.5:0.36,t+0.02);subg.gain.exponentialRampToValueAtTime(0.0001,t+S*3.8)};
  let step=0,next=0;
  const voice={gain:out,pl,techno:true,level:0,beats:[],announced:false,stepCount:()=>step,
    // Driven from updatePlanetAudio every frame. Out of earshot the clock keeps
    // running but nothing is scheduled, so a distant rave costs nothing; after a
    // long stall (backgrounded tab) we resync to the next bar instead of dumping
    // every missed note into the graph at once.
    tick(now){
      if(!next)next=now+0.12;
      if(next<now-0.4){next=now+0.05;step=Math.ceil(step/16)*16}
      const audible=voice.level>0.012;
      while(next<now+(audible?0.25:0.1)){
        if(audible){
          const i=step%16,bar=(step/16)|0,build=(bar%8)===7;
          if(i%4===0&&(!build||i<8)){kick(next);voice.beats.push(next)}
          if(i%2===1)hat(next,false);
          if(i%4===2)hat(next,true);
          if(i===4||i===12)clap(next);
          const bn=BASS[i];if(bn)bass(next,bn,!!ACC[i],bar);
          const ln=LEAD[(bar>>1)%2][i];if(ln&&bar%4!==2)stab(next,ln);
          if(build&&i===0)riser(next,S*16);
        }
        next+=S;step++;
      }
      while(voice.beats.length&&voice.beats[0]<=now){voice.beats.shift();pl.beat=1}
      if(voice.beats.length>32)voice.beats.length=0;
    }};
  return voice;
}
// Quiet electro-techno ambient: detuned saw pad through a slow-swept lowpass + a steady sub-bass pulse.
function startAmbient(){if(ambientOn||!audioCtx)return;ambientOn=true;const master=audioCtx.createGain();master.gain.value=0.06;ambientDuck=audioCtx.createGain();ambientDuck.gain.value=1;ambientDuck.connect(audioCtx.destination);master.connect(ambientDuck);
  const padF=audioCtx.createBiquadFilter();padF.type='lowpass';padF.frequency.value=480;padF.Q.value=4;padF.connect(master);const padG=audioCtx.createGain();padG.gain.value=0.26;padG.connect(padF);for(const f of[55,55.4,82.4]){const o=audioCtx.createOscillator();o.type='sawtooth';o.frequency.value=f;o.connect(padG);o.start()}const lfo=audioCtx.createOscillator(),lfoG=audioCtx.createGain();lfo.type='sine';lfo.frequency.value=0.04;lfoG.gain.value=300;lfo.connect(lfoG);lfoG.connect(padF.frequency);lfo.start();
  const bassF=audioCtx.createBiquadFilter();bassF.type='lowpass';bassF.frequency.value=300;bassF.Q.value=14;const bassG=audioCtx.createGain();bassG.gain.value=0.0001;bassF.connect(bassG);bassG.connect(master);const bassOsc=audioCtx.createOscillator();bassOsc.type='sawtooth';bassOsc.frequency.value=41.2;bassOsc.connect(bassF);bassOsc.start();
  const seq=[41.2,0,41.2,55,0,36.7,0,41.2,49,0,41.2,0,55,0,36.7,0],acc=[1,0,0,1,0,0,0,1,0,0,1,0,1,0,0,0],step=0.19;let t=audioCtx.currentTime+0.2,i=0;
  ambientTimer=setInterval(()=>{const now=audioCtx.currentTime;while(t<now+1.0){const n=seq[i%16];if(n>0){bassOsc.frequency.setTargetAtTime(n,t,0.02);const a=acc[i%16]?1:0.55;bassF.frequency.setValueAtTime(180,t);bassF.frequency.linearRampToValueAtTime(180+1500*a,t+0.04);bassF.frequency.exponentialRampToValueAtTime(180,t+step*0.9);bassG.gain.setValueAtTime(0.0001,t);bassG.gain.exponentialRampToValueAtTime(0.22*a,t+0.012);bassG.gain.exponentialRampToValueAtTime(0.0001,t+step*0.95)}
    if(i%4===0){const k=audioCtx.createOscillator(),kg=audioCtx.createGain();k.type='sine';k.frequency.setValueAtTime(90,t);k.frequency.exponentialRampToValueAtTime(38,t+0.12);kg.gain.setValueAtTime(0.17,t);kg.gain.exponentialRampToValueAtTime(0.0001,t+0.16);k.connect(kg).connect(master);k.start(t);k.stop(t+0.18)}
    if(i%2===1){const h=audioCtx.createOscillator(),hg=audioCtx.createGain();h.type='square';h.frequency.value=6200;hg.gain.setValueAtTime(0.012,t);hg.gain.exponentialRampToValueAtTime(0.0001,t+0.03);h.connect(hg).connect(master);h.start(t);h.stop(t+0.04)}
    i++;t+=step}},500);
  const planetBus=audioCtx.createGain();planetBus.gain.value=0.6;planetBus.connect(audioCtx.destination);
  // A-phrygian, an octave below the old tuning: the flat second is what makes
  // the sector sound wrong on purpose.
  const SCALE=[55,58.27,65.41,73.42,82.41,87.31,98.0,110.0];
  // One planet (index 2 — 'THE WATCHER', lore says it pulses like a heartbeat) gets an ELECTRO voice:
  // resonant dual-saw + sub tuned to the SAME scale note as the other planets, tremolo-gated to the
  // bass sequence's tempo (step) and swept by a slow filter LFO. Same bus + same proximity gate as the
  // other planet drones, so it blends into the shared soundscape instead of standing apart.
  const ELECTRO_PLANET=2;
  planetVoices=planets.map((pl,i)=>{const g=audioCtx.createGain();g.gain.value=0.0001;g.connect(planetBus);const f=SCALE[i%SCALE.length];
    if(i===TECHNO_PLANET)return makeTechnoVoice(pl,planetBus);
    if(i===ELECTRO_PLANET){const vf=audioCtx.createBiquadFilter();vf.type='lowpass';vf.frequency.value=360;vf.Q.value=8;vf.connect(g);const trem=audioCtx.createGain();trem.gain.value=0.5;trem.connect(vf);const sa=audioCtx.createOscillator();sa.type='sawtooth';sa.frequency.value=f;const sb=audioCtx.createOscillator();sb.type='sawtooth';sb.frequency.value=f*1.005;const sub=audioCtx.createOscillator();sub.type='square';sub.frequency.value=f/2;const mix=audioCtx.createGain();mix.gain.value=0.3;sa.connect(mix);sb.connect(mix);const subg=audioCtx.createGain();subg.gain.value=0.2;sub.connect(subg);mix.connect(trem);subg.connect(trem);const tl=audioCtx.createOscillator(),tlg=audioCtx.createGain();tl.type='square';tl.frequency.value=1/(step*2);tlg.gain.value=0.42;tl.connect(tlg);tlg.connect(trem.gain);const cf=audioCtx.createOscillator(),cfg=audioCtx.createGain();cf.type='sine';cf.frequency.value=0.06;cfg.gain.value=240;cf.connect(cfg);cfg.connect(vf.frequency);sa.start();sb.start();sub.start();tl.start();cf.start();return{gain:g,pl}}
    // Dark drone: a low sine, a slowly beating triangle and a sub an octave
    // down, all behind a lowpass so nothing up top sparkles.
    const df=audioCtx.createBiquadFilter();df.type='lowpass';df.frequency.value=f*3.2;df.Q.value=1.1;df.connect(g);
    const o1=audioCtx.createOscillator();o1.type='sine';o1.frequency.value=f;const o2=audioCtx.createOscillator();o2.type='triangle';o2.frequency.value=f*1.008;const o3=audioCtx.createOscillator();o3.type='sine';o3.frequency.value=f/2;
    const vg=audioCtx.createGain();vg.gain.value=0.42;o1.connect(vg);o2.connect(vg);vg.connect(df);const sg=audioCtx.createGain();sg.gain.value=0.3;o3.connect(sg);sg.connect(df);
const lf=audioCtx.createOscillator(),lg=audioCtx.createGain();lf.type='sine';lf.frequency.value=0.05+i*0.013;lg.gain.value=f*0.004;lf.connect(lg);lg.connect(o1.frequency);
    // a very slow tremolo, so each world breathes instead of humming
    const br=audioCtx.createOscillator(),brg=audioCtx.createGain();br.type='sine';br.frequency.value=0.03+i*0.007;brg.gain.value=0.16;br.connect(brg);brg.connect(vg.gain);
    o1.start();o2.start();o3.start();lf.start();br.start();return{gain:g,pl}});
}
function updatePlanetAudio(){if(!planetVoices||!audioCtx)return;const now=audioCtx.currentTime;let tech=0;
  for(const v of planetVoices){const d=camera.position.distanceTo(v.pl.pos),r=v.pl.r;
    if(v.techno){// the rave world carries much further than a drone and rides its own curve
      const reach=r*9+3000,tt=Math.max(0,Math.min(1,1-(d-r)/reach));v.level=0.3*tt*tt;tech=Math.max(tech,tt);
      if(tt>0.55&&!v.announced){v.announced=true;toast('THE DOOR IS OPEN - BERGHAIN-6');feed('The dead plant is awake - <b>BERGHAIN-6</b> is running the night')}
      else if(tt<0.3&&v.announced)v.announced=false;
      v.tick(now);v.gain.gain.setTargetAtTime(v.level,now,0.35);continue}
    const range=r*5+1600;let t=Math.max(0,Math.min(1,1-(d-r)/range)),g=0.04*t*t;if(d<r+60){const inside=Math.max(0,Math.min(1,(r+60-d)/(r+60)));g+=0.16*inside}v.gain.gain.setTargetAtTime(Math.min(0.22,g),now,0.15)}
  if(ambientDuck)ambientDuck.gain.setTargetAtTime(1-0.6*tech,now,0.4)}
function feed(html){const d=document.createElement('div');d.innerHTML=html;ui.feed.prepend(d);while(ui.feed.children.length>5)ui.feed.lastChild.remove();setTimeout(()=>d.remove(),9000)}
function toast(s){ui.toast.textContent=s;ui.toast.classList.add('on');setTimeout(()=>ui.toast.classList.remove('on'),1700)}

function isTouch(){return matchMedia('(pointer:coarse)').matches}
function lock(){if(!dead&&!isTouch())canvas.requestPointerLock()}
function cycleShip(){if(worldEnding)return;shipVariant=(shipVariant+1)%5;const p=player.position.clone(),q=player.quaternion.clone(),vis=player.visible;scene.remove(player);player=ship(0x41ffe0,shipVariant);player.position.copy(p);player.quaternion.copy(q);player.visible=vis;scene.add(player);applyShipStats(shipVariant,false);toast('SHIP: '+SHIP_NAMES[shipVariant]);__V.player=player;if(locked)lock()}
function showHelp(auto){ui.helpCard.classList.add('on');clearTimeout(showHelp._t);if(auto)showHelp._t=setTimeout(()=>ui.helpCard.classList.remove('on'),7000)}
function hideHelp(){ui.helpCard.classList.remove('on')}
function toggleHelp(){ui.helpCard.classList.contains('on')?hideHelp():showHelp(false)}
function openNameEditor(){if(!entered||dead)return;ui.nameEditInput.value=pilotName;ui.namePanel.classList.remove('hidden');if(document.pointerLockElement)document.exitPointerLock();setTimeout(()=>{ui.nameEditInput.focus();ui.nameEditInput.select()},0)}
function closeNameEditor(resume=true){ui.namePanel.classList.add('hidden');ui.nameEditInput.blur();if(resume&&!dead&&!isTouch())setTimeout(lock,0)}
function savePilotName(){const oldName=pilotName,nextName=normalizePilotName(ui.nameEditInput.value);if(nextName!==oldName){pilotName=nextName;ui.pilotName.value=pilotName;ui.selfName.textContent=pilotLabel(pilotName,peerId);try{localStorage.setItem('voidLivePilotName',pilotName)}catch{}sendName?.({name:pilotName});feed(`<b>${pilotLabel(oldName,peerId)}</b> is now <b>${pilotLabel(pilotName,peerId)}</b>`);toast('CALLSIGN UPDATED')}closeNameEditor(true)}
ui.helpBtn.onclick=(e)=>{e.stopPropagation();toggleHelp()};
document.addEventListener('pointerdown',e=>{if(!ui.helpCard.classList.contains('on'))return;if(ui.helpCard.contains(e.target)||ui.helpBtn.contains(e.target))return;hideHelp()});
ui.helpCard.addEventListener('pointerdown',e=>{e.preventDefault();hideHelp();if(isTouch()){touch.active=false}});
ui.enter.onclick=()=>{pilotName=normalizePilotName(ui.pilotName.value);ui.pilotName.value=pilotName;try{localStorage.setItem('voidLivePilotName',pilotName)}catch{}ui.selfName.textContent=pilotLabel(pilotName,peerId);entered=true;if(socket?.readyState===1)socket.send(JSON.stringify({type:'hello',d:{name:pilotName}}));audioCtx=new(window.AudioContext||window.webkitAudioContext)();startAmbient();lock();ui.gate.classList.add('hidden');feed(`Pilot <b>${pilotLabel(pilotName,peerId)}</b> connected to sector`);showStatCard(shipVariant);showHelp(true)};
ui.pilotName.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter')ui.enter.click()});
ui.nameEdit.onclick=e=>{e.stopPropagation();openNameEditor()};
ui.nameSave.onclick=e=>{e.stopPropagation();savePilotName()};
ui.nameCancel.onclick=e=>{e.stopPropagation();closeNameEditor(true)};
ui.nameEditInput.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter')savePilotName();else if(e.key==='Escape')closeNameEditor(true)});
ui.shipSwitch.onclick=(e)=>{e.stopPropagation();cycleShip()};
canvas.addEventListener('click',()=>{if(ui.gate.classList.contains('hidden')&&!locked&&!dead&&!worldEnding&&!isTouch())lock()});
canvas.addEventListener('contextmenu',e=>{e.preventDefault();if(ui.gate.classList.contains('hidden')&&!dead)fireSpecial()});
document.addEventListener('pointerlockchange',()=>{locked=document.pointerLockElement===canvas;if(!locked&&ui.gate.classList.contains('hidden')&&!dead&&!worldEnding&&!isTouch())toast('CLICK TO RESUME')});
document.addEventListener('mousemove',e=>{if(!locked||dead)return;const yaw=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-e.movementX*.0017),pitch=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-e.movementY*.0015);player.quaternion.multiply(yaw).multiply(pitch).normalize()});
addEventListener('keydown',e=>{if(e.code==='Tab'){e.preventDefault();if(ui.gate.classList.contains('hidden'))cycleShip();return}if(e.code==='KeyH'){if(ui.gate.classList.contains('hidden'))toggleHelp();return}if(e.code==='KeyN'&&entered){e.preventDefault();openNameEditor();return}keys[e.code]=true});addEventListener('keyup',e=>keys[e.code]=false);
// Stuck-key guard: keyup never reaches the page for keys held while focus leaves (Ctrl+Tab, Alt+Tab, Cmd+click),
// leaving e.g. ControlLeft stuck "down" so the ship sinks on its own and a stuck Shift keeps the FOV boosted.
// Release everything whenever the window blurs, the tab hides, or pointer lock is lost.
function releaseKeys(){for(const k in keys)keys[k]=false}
addEventListener('blur',releaseKeys);document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseKeys()});document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas)releaseKeys()});
addEventListener('mousedown',e=>{if(!locked)return;if(ui.helpCard.classList.contains('on'))hideHelp();if(e.button===0)fire();else if(e.button===2)fireSpecial()});
// ---- Mobile controls: floating left thumb-stick (steer + thrust) + right-hand action buttons ----
const JOY_MAX=52,JOY_DEAD=0.12;let joyId=null,joyOX=0,joyOY=0;
function joyReset(){joyId=null;touch.jx=0;touch.jy=0;touch.active=false;ui.joyBase.classList.remove('on');ui.joyBase.style.left='';ui.joyBase.style.top='';ui.joyKnob.style.transform='translate(0,0)'}
function joyPlace(x,y){joyOX=x;joyOY=y;ui.joyBase.style.left=x+'px';ui.joyBase.style.top=y+'px';ui.joyKnob.style.transform='translate(0,0)';ui.joyBase.classList.add('on')}
function joyMove(x,y){let dx=x-joyOX,dy=y-joyOY;const d=Math.hypot(dx,dy);if(d>JOY_MAX){dx*=JOY_MAX/d;dy*=JOY_MAX/d}ui.joyKnob.style.transform=`translate(${dx}px,${dy}px)`;touch.jx=dx/JOY_MAX;touch.jy=dy/JOY_MAX;touch.active=Math.hypot(touch.jx,touch.jy)>JOY_DEAD}
// ALL mobile input runs through DOCUMENT-LEVEL listeners. The on-screen diagnostic
// proved touch events reach `document` on real phones even when element-bound handlers
// never fire (an overlay/canvas intercepts before the button/zone). We hit-test the
// coordinates ourselves to decide joystick vs. which action button. Touch Events are
// the primary driver (universally delivered on phones); Pointer Events are a fallback
// only when TouchEvent is unavailable, so a gesture is never processed twice.
const BTNS=()=>[[ui.tcFire,'fire'],[ui.tcSpecial,'spec'],[ui.tcBoost,'boost']];
function btnHit(x,y){for(const b of BTNS()){if(!b[0])continue;const r=b[0].getBoundingClientRect();if(r.width&&x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom)return b}return null}
const btnActive={};
let dbgHook=null,dbgErr=null;
const safeInput=fn=>{try{fn()}catch(err){dbgErr&&dbgErr(err)}};
function inputDown(id,x,y,e){const gated=!ui.gate.classList.contains('hidden');if(gated||dead||worldEnding){dbgHook&&dbgHook('down',x,y,gated?'GATE-UP':'dead');return}const hit=btnHit(x,y);if(hit){e&&e.preventDefault();btnActive[id]=hit;hit[0].classList.add('pressed');if(hit[1]==='fire'){touch.firing=true;fire()}else if(hit[1]==='spec')fireSpecial();else if(hit[1]==='boost')touch.boosting=true;dbgHook&&dbgHook('down',x,y,'BTN:'+hit[1]);return}if(joyId===null&&x<innerWidth*0.55){e&&e.preventDefault();joyId=id;joyPlace(x,y);joyMove(x,y);dbgHook&&dbgHook('down',x,y,'JOY-start');return}dbgHook&&dbgHook('down',x,y,'nohit')}
function inputMove(id,x,y,e){if(joyId===id){e&&e.preventDefault();joyMove(x,y);dbgHook&&dbgHook('move',x,y,'JOY jx='+touch.jx.toFixed(2))}}
function inputUp(id){const b=btnActive[id];if(b){b[0].classList.remove('pressed');if(b[1]==='fire')touch.firing=false;else if(b[1]==='boost')touch.boosting=false;delete btnActive[id]}if(joyId===id)joyReset();dbgHook&&dbgHook('up',0,0,'release')}
if('ontouchstart' in window||navigator.maxTouchPoints>0){
  document.addEventListener('touchstart',e=>safeInput(()=>{for(const t of e.changedTouches)inputDown(t.identifier,t.clientX,t.clientY,e)}),{passive:false});
  document.addEventListener('touchmove',e=>safeInput(()=>{for(const t of e.changedTouches)inputMove(t.identifier,t.clientX,t.clientY,e)}),{passive:false});
  const end=e=>safeInput(()=>{for(const t of e.changedTouches)inputUp(t.identifier)});
  document.addEventListener('touchend',end);document.addEventListener('touchcancel',end);
}else{
  document.addEventListener('pointerdown',e=>safeInput(()=>{if(e.pointerType!=='mouse')inputDown(e.pointerId,e.clientX,e.clientY,e)}),{passive:false});
  document.addEventListener('pointermove',e=>safeInput(()=>{if(e.pointerType!=='mouse')inputMove(e.pointerId,e.clientX,e.clientY,e)}),{passive:false});
  const pend=e=>safeInput(()=>{if(e.pointerType!=='mouse')inputUp(e.pointerId)});
  document.addEventListener('pointerup',pend);document.addEventListener('pointercancel',pend);
}
// TEMP on-screen touch diagnostic (only with ?debug=1). Shows every raw touch/pointer
// event and the element it lands on, so a real phone can report where input breaks.
if(new URLSearchParams(location.search).has('debug')){
  const dbg=document.createElement('div');dbg.style.cssText='position:fixed;left:50%;top:44px;transform:translateX(-50%);z-index:99;background:rgba(0,0,0,.85);color:#41ffe0;font:9px monospace;padding:4px 8px;border:1px solid #41ffe0;max-width:96vw;white-space:pre-wrap;pointer-events:none';document.body.appendChild(dbg);let n=0;let rawLine='RAW: (waiting)';let decLine='DEC: (waiting)';
  const render=()=>{dbg.textContent=rawLine+'\n'+decLine};render();
  // RAW: capture-phase, fires for EVERY touch/pointer before any handler logic.
  const raw=(type,e)=>{const t=e.changedTouches?e.changedTouches[0]:e;if(!t)return;const el=document.elementFromPoint(t.clientX,t.clientY);const id=el?(el.id||(typeof el.className==='string'?el.className:'')||el.tagName):'?';rawLine='RAW#'+(++n)+' '+type+' @'+Math.round(t.clientX)+','+Math.round(t.clientY)+' el='+String(id).slice(0,22)+' TA='+(el?getComputedStyle(el).touchAction:'?');render()};
  for(const ty of['touchstart','touchmove','pointerdown','pointermove'])document.addEventListener(ty,e=>raw(ty,e),{capture:true,passive:true});
  dbgHook=(phase,x,y,decision)=>{decLine='DEC '+phase+' → '+decision+' joy='+(touch.active?'ON':'off')+' fire='+(touch.firing?'ON':'off')+' entered='+entered;render()};
  dbgErr=(err)=>{decLine='ERR '+String(err&&err.message!==undefined?err.message:err)+' | '+String(err&&err.stack||'').slice(0,90);render()};
  addEventListener('error',ev=>{decLine='WINERR '+(ev.message||'(empty)')+' @'+String(ev.filename||'').split('/').pop()+':'+ev.lineno+':'+ev.colno;render()},true);
}
// Show touch controls on any touch-capable device — NOT gated on viewport width,
// because a phone held in landscape is often wider than 760px and would otherwise
// get the desktop layout with no on-screen controls at all.
if(matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0||'ontouchstart' in window)document.body.classList.add('touch-device');
function fitCamera(){camera.aspect=innerWidth/innerHeight;const portrait=camera.aspect<1;baseFov=portrait?96:72;camDist=portrait?40:20;camera.fov=baseFov;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)}
addEventListener('resize',fitCamera);fitCamera();

function updateFlight(dt){if(dead)return;
  const st=SHIP_STATS[shipVariant];
  const boost=((keys.ShiftLeft||keys.ShiftRight)||touch.boosting)&&fuel>0;
  desired.set((keys.KeyD?1:0)-(keys.KeyA?1:0),(keys.Space?1:0)-(keys.ControlLeft?1:0),(keys.KeyS?1:0)-(keys.KeyW?1:0));
  if(touch.active){const mag=Math.min(1,Math.hypot(touch.jx,touch.jy)),turn=Math.max(0,(mag-0.12)/0.88);const yaw=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-touch.jx*2.0*turn*dt),pitch=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-touch.jy*1.6*turn*dt);player.quaternion.multiply(yaw).multiply(pitch).normalize();if(mag>0.12)desired.z=-1;}
  const empty=fuel<=0; emergency=empty;
  const wantMove=desired.lengthSq()>0;
  engineLevel=empty?(wantMove?0.16:0.02):(wantMove?(boost?0.72:0.55):0.06);
  if(wantMove){desired.normalize();let acc,max;if(empty){acc=LIMP_ACCEL;max=LIMP_MAX_SPEED;}else if(boost){acc=st.accel*5;max=st.speed*4.8;}else{acc=st.accel;max=st.speed;}desired.applyQuaternion(player.quaternion).multiplyScalar(acc);vel.addScaledVector(desired,dt);if(!empty)fuel-=(boost?1.6:0.35)*dt;if(vel.length()>max)vel.setLength(max)}else{if(!empty)fuel-=0.025*dt}
  fuel=Math.max(0,fuel);
  // Eternal charge (Heart of the Colossus): once touched, fuel/ammo/specials never run out again.
  if(eternalCharge){fuel=100;emergency=false;if(ammo<maxAmmo||spec<specMax){ammo=maxAmmo;spec=specMax;updateOrdnance()}}
  else{const hc=planets[4];if(!hc.gone&&!dead&&player.position.distanceTo(hc.pos)<240){eternalCharge=true;fuel=100;ammo=maxAmmo;spec=specMax;updateOrdnance();zap(player.position.clone(),0x9fd8ff);toast('∞ THE HEART OF THE COLOSSUS — ETERNAL CHARGE');feed('∞ <b>'+short(peerId)+'</b> touched the Heart of the Colossus — charge is eternal now');sound(880,.6,'sine',.09)}}
  vel.multiplyScalar(Math.pow(empty?.97:.985,dt*60));
  // Singularity gravity well: inside ~5 radii the ship gets dragged toward the mouth (escapable at the rim, hopeless deep in).
  {const gd=blackhole.pos.clone().sub(player.position),gl=gd.length(),GR=blackhole.r*5;if(!dead&&gl<GR&&gl>1){const f=1-gl/GR;vel.addScaledVector(gd.multiplyScalar(1/gl),560*f*f*dt)}}
  player.position.addScaledVector(vel,dt);
  if(keys.KeyQ)player.rotateZ(1.45*dt);if(keys.KeyE)player.rotateZ(-1.45*dt);
  // Boost streaks spawn well BEHIND the hull and only on some frames, so the ship itself stays readable at full burn.
  if(boost&&vel.length()>200&&Math.random()<0.3){const back=new THREE.Vector3(0,0,1).applyQuaternion(player.quaternion);laserStreak(player.position.clone().addScaledVector(back,16),back)}
  if(player.position.length()>19000)player.position.setLength(19000);
  ui.speed.textContent=String(Math.round(vel.length())).padStart(3,'0');ui.thrust.style.width=Math.min(100,vel.length()/620*100)+'%';
  checkStations();if(invuln>0)invuln-=dt;else checkCollisions()}
function checkStations(){for(const st of stations){if((fuel<100||ammo<maxAmmo||spec<specMax)&&player.position.distanceTo(st.pos)<st.r){const wasEmpty=fuel<=0;fuel=100;ammo=maxAmmo;spec=specMax;updateOrdnance();emergency=false;zap(player.position.clone(),0x5cffd6);toast(wasEmpty?'CHARGED — FULL LOADOUT':'FUEL + AMMO + SPECIAL FULL');feed(`Charged at <b>${st.name}</b>`)}}}
function checkCollisions(){if(player.position.distanceTo(blackhole.pos)<blackhole.r+7)return die(null,'CONSUMED BY THE SINGULARITY',true);
  for(const pl of planets){if(pl.gone)continue;const lx=player.position.x-pl.pos.x,ly=player.position.y-pl.pos.y,lz=player.position.z-pl.pos.z,dist=Math.hypot(lx,ly,lz);if(pl.destructible){if(dist<pl.r+7&&dist>pl.r-14){const inv=1/(dist||1);if(pl.isSolidAt({x:lx*inv,y:ly*inv,z:lz*inv}))return die(null,'CRASHED INTO A PLANET')}}else if(dist<pl.r+7)return die(null,'CRASHED INTO A PLANET')}
  for(const d of debris){if(d.visible&&player.position.distanceTo(d.position)<d.userData.radius+7){d.visible=false;boom(d.position.clone(),d.userData.color,1.6);setTimeout(()=>{d.userData.hp=3;d.visible=true},8000);return die(null,'FLEW INTO A DRONE')}}
  for(const c of crystals){if(c.alive&&c.grow>0.5&&player.position.distanceTo(c.pos)<c.radius*c.grow){return die(null,'SHATTERED ON A CRYSTAL')}}
  for(const [id,p] of peers){if(p.visible&&player.position.distanceTo(p.position)<p.userData.radius+7)return die(null,'COLLIDED WITH '+short(id))}}
function updateCamera(dt){const boostFov=((keys.ShiftLeft||keys.ShiftRight)||touch.boosting)&&!dead?18:0;camera.fov+= (baseFov+boostFov-camera.fov)*Math.min(1,dt*6);camera.updateProjectionMatrix();const target=player.position.clone().add(new THREE.Vector3(0,camDist*.28,camDist).applyQuaternion(player.quaternion));camera.position.lerp(target,1-Math.pow(.001,dt));camera.up.set(0,1,0).applyQuaternion(player.quaternion);const look=player.position.clone().add(new THREE.Vector3(0,0,-45).applyQuaternion(player.quaternion));camera.lookAt(look)}
function updatePlanets(t,dt){for(const pl of planets){if(pl.gone)continue;
    // The well devours: once a planet's rim overlaps the singularity it is dragged in, crushed and gone for good.
    if(pl.swallow!==undefined||pl.pos.distanceTo(blackhole.pos)<blackhole.r+pl.r*0.6){
      if(pl.swallow===undefined){pl.swallow=1;pl.r0=pl.r;pl.orbit=null;const nm=(PLANET_LORE[pl.index]||{}).n||'A PLANET';toast('🕳 '+nm+' DEVOURED');feed('🕳 <b>'+nm+'</b> has been devoured by the singularity');sound(55,.7,'sawtooth',.09)}
      pl.swallow=Math.max(0,pl.swallow-dt*0.5);pl.pos.lerp(blackhole.pos,Math.min(1,dt*1.6));pl.root.position.copy(pl.pos);pl.root.scale.setScalar(Math.max(.001,pl.swallow));pl.r=pl.r0*pl.swallow;
      if(pl.swallow<=0.02){pl.gone=true;pl.r=0;scene.remove(pl.root);boom(blackhole.pos.clone(),0x8f1424,2.2)}
      continue}
    if(pl.orbit){pl.orbit.angle+=pl.orbit.speed*dt;const np=orbitPos(pl.orbit);pl.pos.copy(np);pl.root.position.copy(np);pl.root.rotation.y+=dt*(pl.spinRate??0.03)}if(pl.living){pl.hue=(pl.hue+dt*0.06*(1+2*(pl.beat||0)))%1;const col=new THREE.Color().setHSL(pl.hue,0.7,0.55);pl.mat.color.copy(col);pl.wmat.color.copy(col);pl.heal()}
    // Rave world: every kick of its techno broadcast thumps the whole globe.
    if(pl.beat!==undefined){pl.beat=Math.max(0,pl.beat-dt*3.4);const b=pl.beat*pl.beat;pl.root.scale.setScalar(1+0.045*b);if(pl.wmat)pl.wmat.opacity=0.3+0.5*b;if(pl.mat)pl.mat.opacity=0.5+0.32*b}
    if(pl.blinkGlow){pl.blinkGlow.material.opacity=0.12+0.34*(0.5+0.5*Math.sin(t*0.005+pl.index));const s=1+0.04*Math.sin(t*0.005+pl.index);pl.blinkGlow.scale.setScalar(s)}
    if(pl.sizzle){const sz=pl.sizzle,a=sz.arr;for(let i=0;i<sz.N;i++){const th=Math.random()*Math.PI*2,ph=Math.acos(THREE.MathUtils.randFloatSpread(2)),x=Math.sin(ph)*Math.cos(th),y=Math.cos(ph),z=Math.sin(ph)*Math.sin(th),r0=sz.r*1.02,r1=sz.r*(1.05+Math.random()*0.22);a[i*6]=x*r0;a[i*6+1]=y*r0;a[i*6+2]=z*r0;a[i*6+3]=x*r1;a[i*6+4]=y*r1;a[i*6+5]=z*r1}sz.geo.attributes.position.needsUpdate=true}}}
function updateProjectiles(dt){
  for(let i=projectiles.length-1;i>=0;i--){const g=projectiles[i],u=g.userData,pv=u.prev;if(pv)pv.copy(g.position);const step=u.laser?u.dir.clone().multiplyScalar(4200*dt):u.shotVel.clone().multiplyScalar(dt);g.position.add(step);if(u.laser)u.life-=dt;else u.travel+=step.length();let hit=false;const near=(pt,ex)=>u.laser&&pv?segDist(pv,g.position,pt)<ex:g.position.distanceTo(pt)<ex;if(u.fl){const fs=4+Math.random()*3;u.fl.scale.set(fs,fs,fs)}
    if(g.userData.local){for(const [id,p] of peers){if(p.visible&&near(p.position,p.userData.radius+(g.userData.laser?6:3))){hitPeer(p,id,g.userData.dmg||55);hit=true;break}}
      if(!hit)for(const d of debris){if(d.visible&&near(d.position,d.userData.radius+3)){d.visible=false;boom(d.position.clone(),d.userData.color,1.8);setTimeout(()=>{d.userData.hp=3;d.visible=true},8000);hit=true;break}}
      if(!hit)for(const c of crystals){if(c.alive&&c.grow>0.3&&near(c.pos,c.radius*c.grow)){hitCrystalBranch(c,g.position,nearestBranch(c,g.position),g.userData.dmg?Math.ceil(g.userData.dmg/12):2);hit=true;break}}
      if(!hit&&near(blackhole.pos,blackhole.r+24)){registerBHHit(g.position.clone(),g.userData.laser?3:5);hit=true}
      if(!hit&&hitColossusTree(g.position)){hit=true}
      if(!hit)for(const pl of planets){if(pl.gone)continue;const dist=g.position.distanceTo(pl.pos);if(pl.destructible){if(dist<pl.r+18&&dist>pl.r-18){const dir=g.position.clone().sub(pl.pos).normalize();if(pl.isSolidAt(dir)){pl.addHole(dir,HOLE_ANGLE*1.6);sendPlanet?.({i:pl.index,d:[dir.x,dir.y,dir.z]});hit=true;break}}}else if(dist<pl.r+3){hit=true;break}}
    }else{ if(!dead&&near(player.position,7)){health=Math.max(0,health-(g.userData.dmg||55));flashDamage();hit=true;if(health<=0)die(g.userData.owner)} }
    if(hit||(u.laser?u.life<=0:projectileExpired(u.travel))){if(u.laser)boom(g.position.clone(),0x9ffcff,1.2);else{boom(g.position.clone(),0xffffff,1.1,.35);boom(g.position.clone(),0xff7a3c,ROCKET_BLAST_SCALE,.7)}scene.remove(g);projectiles.splice(i,1)}
  }
  for(let i=mines.length-1;i>=0;i--){const g=mines[i];g.userData.core.rotation.y+=dt*1.5;g.userData.core.rotation.x+=dt;const armed=performance.now()>g.userData.arm;let blow=false;
    // Gravity: the singularity drags in stray mines and swallows them whole — no detonation, just gone.
    {const gd=blackhole.pos.clone().sub(g.position),gl=gd.length(),GR=blackhole.r*3;if(gl<GR){g.position.addScaledVector(gd.multiplyScalar(1/(gl||1)),(40+520*(1-gl/GR))*dt);if(gl<blackhole.r*0.9){zap(g.position.clone(),0xff365c);scene.remove(g);mines.splice(i,1);continue}}}
    if(!dead&&player.position.distanceTo(g.position)<g.userData.sensor&&(g.userData.owner!==peerId||armed)){
      if(player.position.distanceTo(g.position)<g.userData.sensor){ // proximity
        boom(g.position.clone(),0xff365c,3,1.0);
        if(player.position.distanceTo(g.position)<70){health=Math.max(0,health-80);flashDamage();if(health<=0)die(g.userData.owner)}
        blow=true;
      }
    }
    // local mines also catch peers passing by (visual only + owner scoring handled by owner client)
    if(!blow&&g.userData.local){for(const [id,p] of peers){if(p.visible&&p.position.distanceTo(g.position)<g.userData.sensor){hitPeer(p,id,80);boom(g.position.clone(),0xff365c,3,1.0);blow=true;break}}}
    if(blow){scene.remove(g);mines.splice(i,1)}
  }
}
function updateWorld(t,dt){
  debris.forEach(d=>{if(d.userData.eaten)return;
    // Drones caught in the well get dragged in (their bob anchor moves) and are devoured for good — no respawn.
    if(d.visible){const gd=blackhole.pos.clone().sub(d.position),gl=gd.length(),GR=blackhole.r*3;if(gl<GR){d.userData.base.addScaledVector(gd.multiplyScalar(1/(gl||1)),(30+420*(1-gl/GR))*dt);d.position.z=d.userData.base.z;if(gl<blackhole.r){d.userData.eaten=true;d.visible=false;zap(d.position.clone(),0xff365c);feed(`<b>${d.userData.name}</b> devoured by the singularity`);return}}}
    d.position.x=d.userData.base.x+Math.sin(t*.00015+d.userData.phase)*90;d.position.y=d.userData.base.y+Math.cos(t*.00022+d.userData.phase)*55;d.rotation.x+=dt*.18;d.rotation.y+=dt*.3});
  stations.forEach(st=>{st.shell.rotation.y+=dt*.3;st.inner.rotation.z+=dt*.8;const s=1+Math.sin(t*0.003)*0.09;st.bubble.scale.setScalar(s);st.core.scale.set(25*s,25*s,1);st.core.material.opacity=.72+.23*(.5+.5*Math.sin(t*.006))});
  peers.forEach(p=>{p.position.lerp(p.userData.targetPos,1-Math.pow(.0002,dt));p.quaternion.slerp(p.userData.targetQuat,1-Math.pow(.0002,dt))});
  blackhole.veins.rotation.y+=dt*0.25;blackhole.veins.rotation.x+=dt*0.12;{const c4=planets[4];if(!c4.gone){const h=c4.heart;if(h){h.rotation.y+=dt*0.5;h.rotation.x+=dt*0.23;h.scale.setScalar(1+0.06*Math.sin(t*0.002))}if(c4.trees)for(const tr of c4.trees){if(tr.userData.dead)continue;if(tr.scale.x<1.5)tr.scale.multiplyScalar(1+dt*0.006)}}for(let i=treeShards.length-1;i>=0;i--){const s=treeShards[i];s.userData.life-=dt;if(s.userData.life<=0){scene.remove(s);s.geometry.dispose();s.material.dispose();treeShards.splice(i,1);continue}s.position.addScaledVector(s.userData.vel,dt);s.rotation.x+=s.userData.avx*dt;s.rotation.y+=s.userData.avy*dt;s.material.opacity=Math.min(.8,s.userData.life*.3)}}updatePlanets(t,dt);updateCrystals(t,dt);updateProjectiles(dt);animateEngines(dt);
  for(let i=bullets.length-1;i>=0;i--){const b=bullets[i],step=b.userData.shotVel.clone().multiplyScalar(dt);b.position.add(step);b.userData.travel+=step.length();
    if(b.userData.local){
      for(const [id,p] of peers){if(p.visible&&b.position.distanceTo(p.position)<p.userData.radius){hitPeer(p,id);b.userData.travel=PROJECTILE_MAX_TRAVEL;break}}
      if(!projectileExpired(b.userData.travel)){for(const d of debris){if(d.visible&&b.position.distanceTo(d.position)<d.userData.radius){d.userData.hp--;ui.hit.classList.add('on');setTimeout(()=>ui.hit.classList.remove('on'),90);if(d.userData.hp<=0){d.visible=false;boom(d.position.clone(),d.userData.color,1.6);feed(`<b>${d.userData.name}</b> neutralized`);setTimeout(()=>{d.userData.hp=3;d.visible=true},8000)}b.userData.travel=PROJECTILE_MAX_TRAVEL;break}}}
      if(!projectileExpired(b.userData.travel)){for(const c of crystals){if(c.alive&&c.grow>0.3&&b.position.distanceTo(c.pos)<c.radius*c.grow){hitCrystalBranch(c,b.position,nearestBranch(c,b.position));b.userData.travel=PROJECTILE_MAX_TRAVEL;break}}}
      if(!projectileExpired(b.userData.travel)&&b.position.distanceTo(blackhole.pos)<blackhole.r+24){registerBHHit(b.position.clone());b.userData.travel=PROJECTILE_MAX_TRAVEL}
      if(!projectileExpired(b.userData.travel)&&hitColossusTree(b.position)){ui.hit.classList.add('on');setTimeout(()=>ui.hit.classList.remove('on'),90);b.userData.travel=PROJECTILE_MAX_TRAVEL}
      if(!projectileExpired(b.userData.travel)){for(const pl of planets){if(pl.gone||!pl.destructible)continue;const lx=b.position.x-pl.pos.x,ly=b.position.y-pl.pos.y,lz=b.position.z-pl.pos.z,dist=Math.hypot(lx,ly,lz);if(dist<pl.r+20&&dist>pl.r-20){const inv=1/(dist||1),dir=new THREE.Vector3(lx*inv,ly*inv,lz*inv);if(pl.isSolidAt(dir)){pl.addHole(dir,HOLE_ANGLE);sendPlanet?.({i:pl.index,d:[dir.x,dir.y,dir.z]});boom(b.position.clone(),pl.color,.7);ui.hit.classList.add('on');setTimeout(()=>ui.hit.classList.remove('on'),90);b.userData.travel=PROJECTILE_MAX_TRAVEL;break}}}}
    }
    if(projectileExpired(b.userData.travel)){scene.remove(b);bullets.splice(i,1)}
  }
}
const TGT_LORE={station:'The Aether Well. Drink deep, pilot — it asks only that you return.',blackhole:'The mouth at the end of everything. Feed it enough fire and the world begins anew.',drone:'A derelict sentinel, still dreaming of the fleet it lost.',peer:'Another soul adrift in the same dark — a friend, or the last face you will see.'};
const CRYSTAL_LORE=['A living lattice, unfolding along a spiral older than the first star.','It grows toward a light no instrument can name.','Bloom of the deep — patient, radiant, and quietly hungry.'];
const PLANET_LORE=[{n:'GLASSVEIL',f:'Struck, the frost-glass sings back. The song is a recording, and the voice in it is yours.'},{n:'EMBERWAKE',f:'Arc-storms crawl the crust like something searching. The old charts warn that it finds what it looks for.'},{n:'THE WATCHER',f:'A slow pulse, always the same interval. It is not a heartbeat. It is a count, and it is nearly finished.'},{n:'COBALT THRONE',f:'A crowned thing on a wide orbit. It grants passage to the ones it favours, and nobody has ever learned the rule.'},{n:'THE COLOSSUS',f:'So vast the horizon bends into a lie. Ships that circle it come back with one memory quietly replaced.'},{n:'BERGHAIN-6',f:'A dead power plant that never cooled. The door decides who is inside, the night runs from Saturday to Monday, and no camera has ever come back with a picture.'},{n:'MOTE',f:'A moon running from something. Whatever it is has never once fallen behind.'}];
function updateTargeting(){const clr=()=>{ui.target.textContent='—';ui.distance.textContent='SCANNING';ui.targetEta.textContent='';ui.targetFlavor.textContent='';ui.targetDetail.textContent=''};if(dead)return clr();const org=camera.position,dir=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);let best=null,bestScore=Infinity;const consider=(pos,radius,build)=>{const vx=pos.x-org.x,vy=pos.y-org.y,vz=pos.z-org.z,t=vx*dir.x+vy*dir.y+vz*dir.z;if(t<=0)return;const px=vx-dir.x*t,py=vy-dir.y*t,pz=vz-dir.z*t,perp=Math.hypot(px,py,pz),pad=radius+t*0.05;if(perp>pad)return;const score=perp/pad+t*0.00002;if(score<bestScore){bestScore=score;best={pos,build}}};for(const [id,p] of peers){if(p.visible)consider(p.position,p.userData.radius+3,()=>({name:short(id),flavor:TGT_LORE.peer,detail:SHIP_NAMES[p.userData.variant||0]+' · ☠ '+(p.userData.kills||0)+' · '+((performance.now()-(p.userData.joined||performance.now()))/1000).toFixed(0)+'s aloft · hull '+Math.round(p.userData.health)}))}for(const d of debris){if(d.visible)consider(d.position,d.userData.radius+2,()=>({name:d.userData.name,flavor:TGT_LORE.drone,detail:'sentinel · integrity '+d.userData.hp+'/3'}))}for(const c of crystals){if(c.alive&&c.grow>0.15)consider(c.pos,c.radius*c.grow+3,()=>({name:c.name,flavor:CRYSTAL_LORE[c.name.charCodeAt(0)%3],detail:'fractal · '+c.branchHp.filter(h=>h>0).length+' living branches'}))}for(const st of stations)consider(st.pos,st.r,()=>({name:st.name,flavor:TGT_LORE.station,detail:'recharge · fuel + ammo + special'}));for(const pl of planets)pl.gone||consider(pl.pos,pl.r,()=>{const L=PLANET_LORE[pl.index]||{n:'UNCHARTED',f:'No record survives of this place.'};let detail;if(pl.destructible){detail='shell '+Math.round(pl.aliveCount()/pl.total*100)+'% intact'+(pl.living?' · self-healing':'')}else{detail='solid body · Ø'+Math.round(pl.r*2)+'u'}if(pl.index===TECHNO_PLANET)detail+=' · no photographs';return{name:L.n,flavor:L.f,detail}});consider(blackhole.pos,blackhole.r,()=>({name:blackhole.name,flavor:TGT_LORE.blackhole,detail:'reset in '+Math.max(0,blackhole.max-blackhole.hits)+' hits'}));if(!best)return clr();const info=best.build(),dd=player.position.distanceTo(best.pos),sp=vel.length();ui.target.textContent=info.name;ui.distance.textContent=Math.round(dd)+' u';ui.targetEta.textContent=dd<80?'ARRIVED':(sp<3?'ETA —':'ETA ~'+(dd/sp<1?'<1':Math.round(dd/sp))+'s');ui.targetFlavor.textContent='“'+info.flavor+'”';ui.targetDetail.textContent=info.detail}
function updateHUD(){ui.health.style.width=health+'%';ui.healthText.textContent=health;ui.health.style.background=health<35?'var(--red)':'var(--cyan)';ui.fuel.style.width=fuel+'%';ui.fuelText.textContent=Math.round(fuel);ui.fuel.style.background=fuel<25?'var(--red)':'var(--amber)';ui.fuel.classList.toggle('emg',emergency);ui.emergency.classList.toggle('on',emergency&&!dead);ui.ammo.style.width=(ammo/maxAmmo*100)+'%';ui.ammoText.textContent=ammo;ui.ammo.style.background=ammo<=0?'var(--red)':(ammo<maxAmmo*.25?'var(--amber)':'#9fd8ff');const spm=specMax||1;ui.spec.style.width=(specMax?spec/spm*100:0)+'%';ui.specText.textContent=specMax?spec:'—';updateTargeting()}

// ---- persistent 2D corner-bracket frames around every peer on screen ----
function updatePeerFrames(){
  const seen=new Set();const W=innerWidth,H=innerHeight,cx=W/2,cy=H/2,m=56,maxX=cx-m,maxY=cy-m;
  for(const [id,p] of peers){
    let el=peerFrameEls.get(id),ar=peerArrowEls.get(id);
    if(!el){el=document.createElement('div');el.className='peer-frame';el.innerHTML='<i></i><i></i><i></i><i></i><b></b>';ui.peerframes.appendChild(el);peerFrameEls.set(id,el)}
    if(!ar){ar=document.createElement('div');ar.className='peer-arrow';ar.innerHTML='<i></i><b></b>';ui.peerframes.appendChild(ar);peerArrowEls.set(id,ar)}
    seen.add(id);
    if(!p.visible){el.style.display='none';ar.style.display='none';continue}
    proj.copy(p.position).project(camera);
    let nx=proj.x,ny=proj.y;const behind=proj.z>1;if(behind){nx=-nx;ny=-ny}
    const onScreen=!behind&&Math.abs(nx)<=1&&Math.abs(ny)<=1;
    const dist=player.position.distanceTo(p.position);
    if(onScreen){
      const x=(nx*0.5+0.5)*W,y=(-ny*0.5+0.5)*H;
      const size=Math.max(34,Math.min(150,4200/Math.max(30,dist)));
      el.style.display='block';el.style.left=x+'px';el.style.top=y+'px';el.style.width=size+'px';el.style.height=size+'px';
      const age=((performance.now()-(p.userData.joined||performance.now()))/1000).toFixed(1);el.querySelector('b').textContent='◈ '+short(id)+'  ☠ '+(p.userData.kills||0)+'  '+Math.round(dist)+'u  '+age+' s';
      ar.style.display='none';
    }else{
      el.style.display='none';
      let dx=nx,dy=-ny;if(Math.abs(dx)<1e-3&&Math.abs(dy)<1e-3)dy=-1;
      const t=Math.min(maxX/(Math.abs(dx)||1e-3),maxY/(Math.abs(dy)||1e-3));
      const ex=cx+dx*t,ey=cy+dy*t,ang=Math.atan2(dy,dx)*180/Math.PI+90;
      ar.style.display='block';ar.style.left=ex+'px';ar.style.top=ey+'px';ar.style.transform=`translate(-50%,-50%) rotate(${ang}deg)`;
      ar.querySelector('i').style.opacity=behind?'0.55':'1';
      const albl=ar.querySelector('b');albl.textContent=short(id);albl.style.transform=`rotate(${-ang}deg)`;
    }
  }
  for(const [id,el] of peerFrameEls){if(!seen.has(id)){el.remove();peerFrameEls.delete(id)}}
  for(const [id,ar] of peerArrowEls){if(!seen.has(id)){ar.remove();peerArrowEls.delete(id)}}
}

const mm=$('#minimap'),mmR=new THREE.WebGLRenderer({canvas:mm,antialias:true,alpha:true});mmR.setPixelRatio(Math.min(devicePixelRatio,2));mmR.setSize(mm.clientWidth||190,mm.clientHeight||190,false);
const mmScene=new THREE.Scene(),mmCam=new THREE.PerspectiveCamera(46,1,.1,100);mmCam.position.set(0,0,8.4);mmCam.lookAt(0,0,0);
const mmWorld=new THREE.Group();mmScene.add(mmWorld);
const HALF=3;
mmWorld.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(HALF*2,HALF*2,HALF*2)),new THREE.LineBasicMaterial({color:0x3fb9a8,transparent:true,opacity:.4})));
const MMAX=220;
function mkPts(size){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(MMAX*3),3));g.setAttribute('color',new THREE.BufferAttribute(new Float32Array(MMAX*3),3));const p=new THREE.Points(g,new THREE.PointsMaterial({size,vertexColors:true,transparent:true,opacity:.95,sizeAttenuation:true,depthWrite:false}));p.frustumCulled=false;mmWorld.add(p);return p}
const mmBig=mkPts(.62),mmSmall=mkPts(.34);
const mmPlanets=planets.map(pl=>{const rr=0.08+Math.min(0.62,pl.r/1050*0.6);const sph=new THREE.Mesh(new THREE.SphereGeometry(rr,12,10),new THREE.MeshBasicMaterial({color:pl.color,transparent:true,opacity:.92}));sph.add(new THREE.Mesh(new THREE.SphereGeometry(rr*1.04,8,6),new THREE.MeshBasicMaterial({color:pl.color,wireframe:true,transparent:true,opacity:.5})));mmWorld.add(sph);return{sph,pl}});
const mmBH=new THREE.Mesh(new THREE.SphereGeometry(.2,10,8),new THREE.MeshBasicMaterial({color:0x050505}));mmBH.add(new THREE.Mesh(new THREE.SphereGeometry(.3,10,8),new THREE.MeshBasicMaterial({color:0xff365c,wireframe:true,transparent:true,opacity:.8})));mmWorld.add(mmBH);
const mmShip=new THREE.Group();
const mmHull=new THREE.Mesh(new THREE.ConeGeometry(.2,.8,4),new THREE.MeshBasicMaterial({color:0x9ffcff}));mmHull.rotation.x=-Math.PI/2;mmShip.add(mmHull);
mmShip.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.55,0,.35),new THREE.Vector3(0,0,-.5),new THREE.Vector3(.55,0,.35),new THREE.Vector3(0,0,.12)]),new THREE.LineBasicMaterial({color:0x41ffe0})));
const mmShipHalo=new THREE.Mesh(new THREE.SphereGeometry(.7,10,10),new THREE.MeshBasicMaterial({color:0x41ffe0,transparent:true,opacity:.16,blending:THREE.AdditiveBlending}));mmShip.add(mmShipHalo);
mmShip.scale.setScalar(1.15);mmWorld.add(mmShip);
// peers rendered as small heading-correct 3D ships (amber), matching the player marker style
const mmPeers=[];
function mmPeerMarker(){const g=new THREE.Group();const hull=new THREE.Mesh(new THREE.ConeGeometry(.16,.66,4),new THREE.MeshBasicMaterial({color:0xffb547}));hull.rotation.x=-Math.PI/2;g.add(hull);g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.45,0,.3),new THREE.Vector3(0,0,-.42),new THREE.Vector3(.45,0,.3),new THREE.Vector3(0,0,.1)]),new THREE.LineBasicMaterial({color:0xffd28a})));g.visible=false;mmWorld.add(g);return{g}}
for(let i=0;i<12;i++)mmPeers.push(mmPeerMarker());
const MMR=6000;
// Soft clamp: things beyond range sit slightly OUTSIDE the cube (rotating with it) rather than hidden on its face.
function mmMap(px,pz,ox,oy,oz){let x=(ox-px)/MMR*HALF,y=(oy)/MMR*HALF,z=(oz-pz)/MMR*HALF;const cap=HALF*1.4,m=Math.max(Math.abs(x),Math.abs(y),Math.abs(z));if(m>cap){const s=cap/m;x*=s;y*=s;z*=s}return[x,y,z]}
function pushPt(pts,n,x,y,z,r,g,b){const pa=pts.geometry.attributes.position.array,ca=pts.geometry.attributes.color.array;pa[n*3]=x;pa[n*3+1]=y;pa[n*3+2]=z;ca[n*3]=r;ca[n*3+1]=g;ca[n*3+2]=b;}
function hexRGB(h){return[((h>>16)&255)/255,((h>>8)&255)/255,(h&255)/255]}
function updateMinimap(t,dt){
  mmWorld.rotation.y+=dt*0.32;mmWorld.rotation.x=0.42+Math.sin(t*0.0002)*0.12;
  const px=player.position.x,pyy=player.position.y,pz=player.position.z;
  for(const mp of mmPlanets){mp.sph.visible=!mp.pl.gone;if(mp.pl.gone)continue;const rel=mmMap(px,pz,mp.pl.pos.x,mp.pl.pos.y-pyy,mp.pl.pos.z);mp.sph.position.set(rel[0],rel[1],rel[2]);const c=(mp.pl.living&&mp.pl.mat)?mp.pl.mat.color:mp.pl.color;mp.sph.material.color.set(c);mp.sph.children[0].material.color.set(c)}
  mmBig.geometry.setDrawRange(0,0);{const bh=mmMap(px,pz,blackhole.pos.x,blackhole.pos.y-pyy,blackhole.pos.z);mmBH.position.set(bh[0],bh[1],bh[2])}
  let ns=0;
  for(const st of stations){if(ns>=MMAX)break;const rel=mmMap(px,pz,st.pos.x,st.pos.y-pyy,st.pos.z);pushPt(mmSmall,ns++,rel[0],rel[1],rel[2],.36,1,.84)}
  mmSmall.geometry.setDrawRange(0,ns);mmSmall.geometry.attributes.position.needsUpdate=true;mmSmall.geometry.attributes.color.needsUpdate=true;
  let pi=0;
  for(const [id,p] of peers){if(pi>=mmPeers.length)break;const mk=mmPeers[pi++];if(!p.visible){mk.g.visible=false;continue}const rel=mmMap(px,pz,p.position.x,p.position.y-pyy,p.position.z);mk.g.position.set(rel[0],rel[1],rel[2]);mk.g.quaternion.copy(p.quaternion);mk.g.visible=true}
  for(;pi<mmPeers.length;pi++){mmPeers[pi].g.visible=false}
  mmShip.quaternion.copy(player.quaternion);
  mmR.render(mmScene,mmCam);
}

function updateChargeEta(){let best=null,bd=Infinity;for(const st of stations){const d=player.position.distanceTo(st.pos);if(d<bd){bd=d;best=st}}if(!best||dead||(fuel>=100&&ammo>=maxAmmo&&spec>=specMax)){ui.chargeEta.style.display='none';return}const W=innerWidth,H=innerHeight,cx=W/2,cy=H/2;proj.copy(best.pos).project(camera);let x=proj.x,y=proj.y;if(proj.z>1){x=-x;y=-y}const sx=(x*0.5+0.5)*W,sy=(-y*0.5+0.5)*H;let mx=cx+(sx-cx)*0.5,my=cy+(sy-cy)*0.5;mx=Math.max(46,Math.min(W-46,mx));my=Math.max(80,Math.min(H-46,my));const sp=vel.length(),inRange=bd<best.r;const arrow=ui.chargeEta.firstElementChild,label=ui.chargeEta.lastElementChild;let txt;if(inRange)txt='\u26a1 IN RANGE';else if(sp<3)txt='\u26a1 '+Math.round(bd)+'u';else{const eta=bd/sp;txt='\u26a1 ~'+(eta<1?'<1':Math.round(eta))+'s'}label.textContent=txt;const ang=Math.atan2(sy-cy,sx-cx)*180/Math.PI+90;arrow.style.transform='rotate('+ang+'deg)';arrow.style.display=inRange?'none':'block';ui.chargeEta.style.display='flex';ui.chargeEta.style.left=mx+'px';ui.chargeEta.style.top=my+'px'}
function updateResetLabel(){const W=innerWidth,H=innerHeight,cx=W/2,cy=H/2;if(dead){ui.resetLabel.style.display='none';return}proj.copy(blackhole.pos).project(camera);let x=proj.x,y=proj.y;const behind=proj.z>1;if(behind){x=-x;y=-y}const sx=(x*0.5+0.5)*W,sy=(-y*0.5+0.5)*H;const onScreen=!behind&&Math.abs(x)<=1&&Math.abs(y)<=1;const rem=Math.max(0,blackhole.max-blackhole.hits);const arrow=ui.resetLabel.firstElementChild,label=ui.resetLabel.lastElementChild;label.textContent='\u2b24 '+rem;let mx,my;if(onScreen){mx=Math.max(40,Math.min(W-40,sx));my=Math.max(70,Math.min(H-30,sy));arrow.style.display='none'}else{mx=cx+(sx-cx)*0.5;my=cy+(sy-cy)*0.5;mx=Math.max(40,Math.min(W-40,mx));my=Math.max(70,Math.min(H-30,my));const ang=Math.atan2(sy-cy,sx-cx)*180/Math.PI+90;arrow.style.transform='rotate('+ang+'deg)';arrow.style.display='block'}ui.resetLabel.style.display='flex';ui.resetLabel.style.left=mx+'px';ui.resetLabel.style.top=my+'px'}
// Live kill leaderboard: self + every connected peer, ranked by kills, top 5, only shown once someone has a kill.
let kbLast=0;
function updateKillboard(t){if(t-kbLast<500)return;kbLast=t;const rows=[{id:peerId,name:pilotLabel(pilotName,peerId),kills:kills,self:true}];for(const [id,p] of peers)rows.push({id,name:short(id,p.userData.name),kills:p.userData.kills||0,self:false});rows.sort((a,b)=>b.kills-a.kills);const top=rows.slice(0,5);const show=top.some(r=>r.kills>0);ui.killboardList.parentElement.style.display=show?'block':'none';if(!show){ui.killboardList.innerHTML='';return}ui.killboardList.innerHTML=top.map(r=>`<li class="${r.self?'self':''}"><b>${r.name}</b><span>\u2620 ${r.kills}</span></li>`).join('')}
function animate(t){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.04);if(worldEnding){updateWorldEnd(dt);renderer.render(scene,camera);return}if(touch.firing&&!dead)fire();updateFlight(dt);updateCamera(dt);updateWorld(t,dt);updateFx(dt);updateHUD();updatePeerFrames();updateChargeEta();updateResetLabel();updateKillboard(t);updatePlanetAudio();updateMinimap(t,dt);if(t-lastSync>65){sendState?.(pack());lastSync=t}renderer.render(scene,camera)}animate(0);
const __V={scene,player,peers,bullets,fx,planets,stations,crystals,projectiles,mines,boom,zap,laserStreak,spawnLaser,spawnPhantomCrystal,THREE,SHIP_STATS,shipName:()=>SHIP_NAMES[shipVariant],shipVariant:()=>shipVariant,cycleShip,getFuel:()=>fuel,setFuel:v=>{fuel=v},getAmmo:()=>ammo,setAmmo:v=>{ammo=v},getSpec:()=>spec,setSpec:v=>{spec=v},specMax:()=>specMax,maxAmmo,fireSpecial,isEmergency:()=>emergency,startAmbient,whoosh,blackhole,triggerReset,startWorldEnd,isWorldEnding:()=>worldEnding,updateTargeting,showHelp,hideHelp,openNameEditor,getKills:()=>kills,updateKillboard,peerFrameEls,technoVoice:()=>planetVoices&&planetVoices.find(v=>v.techno),version:'2.41.0'};window.__VOID_LIVE__=__V;
