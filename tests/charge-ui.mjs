import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const game=readFileSync(new URL('../client/game.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../client/style.css',import.meta.url),'utf8');

assert.match(game,/function mechanicalShot\(\)/,'regular fire has a dedicated mechanical shot sound');
assert.match(game,/const core=new THREE\.Sprite\(new THREE\.SpriteMaterial\(\{map:boltTex/,'charge station uses the electric bolt sprite as its core');
assert.match(game,/st\.core\.scale\.set\(25\*s,25\*s,1\)/,'charge-station bolt keeps pulsing');
assert.match(css,/\.charge-eta \.charge-arrow\{[^}]*clip-path:polygon\(/,'desktop charge direction marker is an electric bolt');
assert.doesNotMatch(css,/\.charge-eta \.charge-arrow\{[^}]*border-left:/,'desktop charge marker no longer uses the old triangle');

console.log('PASS mechanical firing sound and charge bolt visuals');
