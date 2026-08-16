import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { LIMP_ACCEL, LIMP_MAX_SPEED } from '../client/flight.js';

assert.equal(LIMP_ACCEL,55,'limp acceleration is 2.5x the old value of 22');
assert.equal(LIMP_MAX_SPEED,85,'limp max speed is 2.5x the old value of 34');
assert.ok(statSync(new URL('../client/flight.js',import.meta.url)).mode&0o004,'flight.js must be public-web readable');

console.log('PASS limp mode is 2.5x faster');
