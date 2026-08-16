import assert from 'node:assert/strict';
import {
  BULLET_SPEED,
  ROCKET_SPEED,
  PROJECTILE_MAX_TRAVEL,
  ROCKET_BLAST_SCALE,
  launchVelocity,
  projectileExpired
} from '../client/projectile-physics.js';

assert.equal(BULLET_SPEED,650,'bullets retain their base muzzle speed');
assert.equal(ROCKET_SPEED,460,'rockets retain their base motor speed');
assert.ok(PROJECTILE_MAX_TRAVEL>=100000,'bullets and rockets travel effectively forever across the playable sector');
assert.deepEqual(
  launchVelocity([0,0,-1],BULLET_SPEED,[0,0,-500]),
  [0,0,-1150],
  'a fast ship adds its velocity to the fired bullet'
);
assert.deepEqual(
  launchVelocity([0,0,-1],ROCKET_SPEED,[120,0,-300]),
  [120,0,-760],
  'rockets also inherit the firing ship velocity'
);
assert.equal(projectileExpired(PROJECTILE_MAX_TRAVEL-1),false,'projectile remains alive through the whole sector');
assert.equal(projectileExpired(PROJECTILE_MAX_TRAVEL),true,'projectile is eventually culled far outside useful space');
assert.ok(ROCKET_BLAST_SCALE<=2.8,'rocket blast is smaller than the previous 4.4 scale');

console.log('PASS long-range projectiles inherit ship velocity and rockets have a smaller blast');
