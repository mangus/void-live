import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes } from 'node:crypto';

// Bind the sanctioned agent-app port. nginx proxies agent<ID>.mintbot.ai/app/*
// here unchanged, so every route is mounted under /app/.
const PORT=8700, HOST='127.0.0.1', ROOT='/opt/void-live/client', PREFIX='/app';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.wasm':'application/wasm'};
const server=http.createServer(async(req,res)=>{try{let pathname=new URL(req.url,'http://localhost').pathname;if(pathname===PREFIX)pathname='/';else if(pathname.startsWith(PREFIX+'/'))pathname=pathname.slice(PREFIX.length);if(pathname==='/ws')return;let file=normalize(join(ROOT,pathname));if(!file.startsWith(ROOT))throw new Error('forbidden');if((await stat(file)).isDirectory())file=join(file,'index.html');const body=await readFile(file);res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream','cache-control':extname(file)==='.html'?'no-cache':'public, max-age=3600','x-content-type-options':'nosniff'});res.end(body)}catch{res.writeHead(404);res.end('Not found')}});
const wss=new WebSocketServer({server,path:PREFIX+'/ws'}), players=new Map(), planetHoles=[];
const broadcast=(msg,except)=>{const data=JSON.stringify(msg);for(const client of wss.clients)if(client!==except&&client.readyState===WebSocket.OPEN)client.send(data)};
const broadcastAll=msg=>broadcast(msg,null);
// The RESET SINGULARITY is ONE shared world object, so the server owns its hit counter.
// Clients never keep their own tally: every hit is echoed back as an authoritative total
// (to the shooter too), late joiners get the current total in their welcome, and the world
// ends exactly once — when the server's counter fills, not when some browser thinks it did.
const BH_MAX=333; let bhHits=0;
const resetWorld=()=>{planetHoles.length=0;bhHits=0;broadcastAll({type:'reset'})};
const cleanName=value=>Array.from(String(value??'').replace(/[^\p{L}\p{N} _-]/gu,'').replace(/\s+/g,' ').trim()).slice(0,20).join('');
const namedState=(ws,state)=>({...state,name:ws.name||'',kills:ws.kills||0});
wss.on('connection',ws=>{
  const id=randomBytes(3).toString('hex').toUpperCase();ws.id=id;ws.name='';ws.kills=0;ws.joined=false;ws.isAlive=true;
  ws.on('pong',()=>ws.isAlive=true);
  ws.send(JSON.stringify({type:'welcome',id,players:Object.fromEntries(players),planets:planetHoles,bh:{hits:bhHits,max:BH_MAX}}));
  ws.on('message',raw=>{if(raw.length>4096)return;try{
    const m=JSON.parse(raw),d=m.d&&typeof m.d==='object'?m.d:{};
    if(m.type==='hello'){
      ws.name=cleanName(d.name);if(!ws.joined){ws.joined=true;broadcast({type:'join',id,name:ws.name},ws)}
    }else if(m.type==='name'){
      const oldName=ws.name;ws.name=cleanName(d.name);if(ws.joined&&oldName!==ws.name)broadcast({type:'name',id,name:ws.name,oldName},ws)
      const current=players.get(id);if(current)players.set(id,namedState(ws,current));
    }else if(m.type==='state'){
      if(!ws.joined){ws.joined=true;broadcast({type:'join',id,name:ws.name},ws)}
      const state=namedState(ws,d);players.set(id,state);broadcast({type:'state',id,d:state},ws)
    }else if(m.type==='planet'){if(planetHoles.length<800)planetHoles.push(d);broadcast({type:'planet',id,d},ws)
    }else if(m.type==='bhhit'){
      // Authoritative tally: clamp the claimed weapon weight, then echo the running total to
      // EVERYONE (the shooter included) so no browser can drift onto its own private countdown.
      const n=Math.max(1,Math.min(20,Math.round(Number(d.n)||1)));bhHits=Math.min(BH_MAX,bhHits+n);
      broadcastAll({type:'bhhit',id,d:{n,total:bhHits,max:BH_MAX}});
      if(bhHits>=BH_MAX)resetWorld()
    }else if(m.type==='reset'){resetWorld()
    }else if(m.type==='death'){
      const victim=d.victim,killer=d.killer;const victimState=players.get(victim),killerState=players.get(killer),killerWs=[...wss.clients].find(c=>c.id===killer);
      if(killerWs&&killer!==victim){killerWs.kills++;const current=players.get(killer);if(current)players.set(killer,namedState(killerWs,current))}
      broadcast({type:'death',id,d:{...d,victimName:victimState?.name||'',killerName:killerState?.name||'',killerKills:killerWs?.kills||killerState?.kills||0}},ws)
    }else if(['shot','hit','rocket','mine','laser','pcrystal'].includes(m.type))broadcast({type:m.type,id,d},ws)
  }catch{}});
  ws.on('close',()=>{players.delete(id);if(ws.joined)broadcast({type:'leave',id,name:ws.name})});
});
setInterval(()=>{for(const ws of wss.clients){if(!ws.isAlive){ws.terminate();continue}ws.isAlive=false;ws.ping()}},20000);
server.listen(PORT,HOST,()=>console.log(`VOID//LIVE listening on http://${HOST}:${PORT} (mounted at ${PREFIX}/)`));
