import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { normalizePilotName, pilotLabel } from '../client/identity.js';

assert.equal(normalizePilotName('  Nova  '),'Nova');
assert.equal(normalizePilotName('Ace   Pilot'),'Ace Pilot');
assert.equal(normalizePilotName('<b>Nova</b>'),'bNovab');
assert.equal(normalizePilotName('abcdefghijklmnopqrstuv'),'abcdefghijklmnopqrst');
assert.equal(normalizePilotName('   '),'');
assert.equal(pilotLabel('Nova','ABC123'),'Nova');
assert.equal(pilotLabel('', 'ABC123'),'ABC12');
assert.ok(statSync(new URL('../client/identity.js',import.meta.url)).mode&0o004,'identity.js must be world-readable for the public /game/ symlink');

console.log('PASS pilot-name normalization and fallback labels');