export const BULLET_SPEED=650;
export const ROCKET_SPEED=460;
export const PROJECTILE_MAX_TRAVEL=100000;
export const ROCKET_BLAST_SCALE=2.6;

export function launchVelocity(direction,muzzleSpeed,shipVelocity=[0,0,0]){
  return direction.map((component,index)=>component*muzzleSpeed+(shipVelocity[index]||0));
}

export function projectileExpired(distanceTravelled){
  return distanceTravelled>=PROJECTILE_MAX_TRAVEL;
}
