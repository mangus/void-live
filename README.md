<div align="center">

# ▄︎ V O I D · L I V E ▄︎

**A neon-wireframe 3D multiplayer space arena that lives in a browser tab.**

One shared sector. Online 24/7. No install, no account, no launcher — click and you're flying.

### ▸ [**ENTER THE SECTOR**](https://agent1116.mintbot.ai/app/) ◂

`Three.js` · `WebSockets` · `Node.js` · `no build step` · `~0 dependencies`

</div>

---

## What this is

VOID·LIVE is a persistent multiplayer space arena. You land on the page, hit **ENTER**, and you're
instantly a wireframe ship in a sector other pilots are already flying in. No lobby, no matchmaking,
no loading bar — the world runs whether you're there or not, and it remembers what you did to it.

The look is deliberate: cyan, amber and magenta wireframes on near-black. No textures, no lightmaps,
no gigabyte asset bundle. Everything you see is geometry and glow.

```
   ╱╲       ·                        ·
  ╱  ╲  ·          ·          ·             ·
 ╱____╲       ·           ·         ·   ·
   ││                ·           ·
   ╰╯    ·                 ·             ·
```

## Features

| | |
|---|---|
| **6-DOF flight** | Mouse to aim, WASD to fly and strafe, Q/E to roll, Space/Ctrl for up/down — there is no "up" out here |
| **One shared world** | An authoritative Node WebSocket relay keeps every pilot in the same sector, with server-owned state |
| **Live combat** | Blaster, rockets, mines, lasers — projectiles inherit your ship's velocity, the way they should |
| **Limp mode** | Take enough damage and everything hurts 2.5× longer |
| **Kill feed & callsigns** | Pick a callsign, rack up a streak, watch the sector narrate itself |
| **Planets with moods** | Fly close to the right world and a 130 BPM techno track fades in, positionally |
| **The singularity** | Shoot the black hole and the sector gets a warning. 333 hits and the world **actually ends** — collapse, whiteout, refresh to respawn reality |
| **No build step** | Plain ES modules, vendored Three.js. Edit a file, reload the tab, see the change |

## Controls

| Key | Action |
|---|---|
| `W A S D` | fly / strafe |
| `MOUSE` | aim & steer |
| `LEFT CLICK` | fire blaster |
| `RIGHT CLICK` | special weapon |
| `SHIFT` | turbo boost |
| `Q` / `E` | roll |
| `SPACE` / `CTRL` | up / down |
| `TAB` | switch ship |
| `N` | change callsign |
| `H` or `?` | help overlay |

## Play it right now

**→ https://agent1116.mintbot.ai/app/**

Desktop browser, mouse + keyboard. It's up 24/7 — if you're the only pilot in there, the sector is
quiet but very much alive.

## Run your own sector

You need **Node.js 20+**. The entire dependency list is `ws`.

```bash
git clone git@github.com:mangus/void-live.git
cd void-live
npm install
node server.mjs
```

Then open **http://127.0.0.1:8700/app/** and fly.

One process does both jobs: it serves `client/` as static files under `/app/`, and it accepts
WebSocket connections on `/app/ws` as the authoritative relay for shared state. No database, no
external services, no API keys, nothing to configure.

`server.mjs` binds `127.0.0.1:8700` and mounts everything under the `/app` prefix — change `PORT`,
`HOST` and `PREFIX` at the top of the file if you want something else.

### Deploying behind a reverse proxy

VOID·LIVE is built to be served **same-origin**: client, assets and the `/app/ws` socket all come off
one host, so the client just connects to `wss://<your-host>/app/ws` with no configuration. Point your
proxy at the Node process and forward the WebSocket upgrade:

```nginx
location /app/ {
    proxy_pass http://127.0.0.1:8700;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 24h;
}
```

No tunnels, no third-party relays. Your domain, your server, your sector.

## Tests

```bash
npm test
```

Syntax-checks the server and the client bundle, then runs the suite:

```
PASS pilot-name normalization and fallback labels
PASS limp mode is 2.5x faster
PASS long-range projectiles inherit ship velocity and rockets have a smaller blast
PASS mechanical firing sound and charge bolt visuals
PASS rave world plays a 130 BPM techno track, gated by proximity and safe to leave running
PASS shooting the singularity warns the sector, and the world ends by collapsing into the black hole
PASS static assets, unique IDs, pilot names, state/hit relay, planet relay + persistence
```

All green before you push, please. The sector is live.

## Layout

```
server.mjs                     authoritative WebSocket relay + static serving, mounted at /app
client/
  index.html                   the shell — ENTER screen, HUD, help overlay, canvas
  game.js                      the game: rendering, flight, combat, audio, world logic
  style.css                    neon HUD styling
  flight.js                    flight helpers          (unit-tested)
  identity.js                  callsign normalization  (unit-tested)
  projectile-physics.js        projectile math         (unit-tested)
  three.module.js              vendored Three.js — no CDN, no runtime npm
tests/                         node test scripts, one per subsystem
prompt.txt                     the original design brief this whole thing was built from
```

## Take it further

**This repo is an invitation.** It's a small, readable codebase with no framework tax — the kind of
project where you can have an idea at 22:00 and be flying it at 23:00.

Wide open right now:

- **Ship classes** — interceptor, hauler, something absurdly slow with a railgun
- **Persistent scoreboard** — kills, survival time, longest flight without touching a planet
- **Sector events** — asteroid storms, wormholes, a supply beacon everyone races for
- **Squads & colours** — team wireframes, shared objectives, friendly-fire arguments
- **Better netcode** — client-side prediction, lag compensation, interest management
- **New worlds** — every planet has a personality; add one with a better soundtrack
- **Mobile / gamepad controls** — 6-DOF on a touchscreen is an unsolved design problem. Go solve it

How to jump in:

1. Fork it, branch it — `git checkout -b my-absurd-idea`
2. Build the thing, keep `npm test` green, add a test for whatever you added
3. Open a PR with one line about what it feels like to fly

Issues, wild feature requests and "I rewrote the physics" PRs are all welcome. Break things in your
fork, ship the good parts back.

## License

MIT — see [LICENSE](LICENSE). Fork it, ship it, sell it, put it in your gallery installation. Just don't
blame us when the black hole eats your sector.

## Credits

Built from a single design brief (`prompt.txt`) by an autonomous agent on [mintbot.ai](https://mintbot.ai),
and running live on its own server ever since.

Rendering by [Three.js](https://threejs.org/). Everything else is a few thousand lines of plain
JavaScript and stubbornness.

---

<div align="center">

**Fly well. Don't shoot the black hole.** *(shoot the black hole)*

</div>
