import type { LevelContext } from '../../world/Level';

/** What the skill props (practice targets, fly rings, ball thrower) need from the level context. Pass `ctx`. */
export type PropEnv = Pick<LevelContext, 'root' | 'player' | 'targets' | 'projectiles' | 'fx'>;
