import type { Player } from '../player/Player';
import type { Sfx } from './Sfx';

/**
 * Connect the player's events to the procedural effects. These subscribers live for the whole session: the skill hub's
 * `onAlways` survives level unloads and the rhythm emitter is never cleared. Returns the unsubscribe functions.
 * Everything else (coins, rings' extra sounds, UI, quiz, transform) is called directly where it happens.
 */
export function wireSfx(sfx: Sfx, player: Player): (() => void)[] {
  const sk = player.skills;
  const ev = player.events;
  return [
    sk.onAlways('laserFire', () => sfx.laserFire()),
    sk.onAlways('laserHit', () => sfx.laserHit()),
    sk.onAlways('laserMiss', () => sfx.laserMiss()),
    sk.onAlways('targetFlip', () => sfx.targetFlip()),
    sk.onAlways('flightStart', () => sfx.jetStart(true)),
    sk.onAlways('flightStop', () => sfx.jetStop()),
    sk.onAlways('shieldUp', () => sfx.shieldUp()),
    sk.onAlways('shieldDown', () => sfx.shieldDown()),
    sk.onAlways('shieldBlock', () => sfx.shieldBlock()),
    sk.onAlways('ballHit', () => sfx.ballHit()),
    sk.onAlways('ringPass', () => sfx.ringPass()),
    ev.on('jump', (e) => (e.air ? sfx.doubleJump() : sfx.jump(e.superglen))),
    ev.on('land', (e) => sfx.land(e.impact)),
    ev.on('wallKick', () => sfx.wallKick()),
    ev.on('mantle', () => sfx.mantle()),
  ];
}
