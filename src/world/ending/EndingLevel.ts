import * as THREE from 'three';
import { Ending } from '../../config/ending';
import { startGate } from '../../core/StartGate';
import type { Level, LevelContext } from '../Level';
import { flow, travel } from '../progress';
import { runCredits } from '../../ui/CreditsRoll';

/**
 * The ending: the sky cinematic (`cin_ending.mp4`, skipped without errors while the file is missing), its last frame held with the
 * credit roll on top, then Superglen returns to the Lab training room. The level itself is only an empty sky behind the overlay.
 * Marks the story as complete ('ending' in the save) when the roll is over. Debug: `?ending=1`.
 */
export class EndingLevel implements Level {
  readonly id = 'ending';
  readonly spawn = { x: 0, y: 0, z: 0, yaw: Math.PI };

  build(ctx: LevelContext): void {
    const real = !flow.sandbox;
    if (real) ctx.save.setWhere('ending');
    ctx.scene.background = new THREE.Color(0x8cc4f0);
    ctx.root.add(new THREE.HemisphereLight(0xffffff, 0xcfe6ff, 1.6));
    ctx.physics.addFixedCuboid({ x: 20, y: 0.5, z: 20 }, { x: 0, y: -0.5, z: 0 });
    ctx.game.setTransformAllowed(false);
    ctx.audio.preload(Ending.lines.map((l) => l.id));
    ctx.game.preloadCinematic('ending');
    ctx.audio.music.setScene(null); // the credit roll starts its own music (scene 'kredit')
    ctx.seq.run(async () => {
      await ctx.seq.waitUntil(() => startGate.started);
      ctx.game.debugInfo.ending = 'playing';
      await ctx.game.playCinematic('ending', { hold: (stage) => runCredits(stage, ctx.audio) });
      ctx.game.debugInfo.ending = 'done';
      if (real) {
        ctx.save.markChapterDone('ending');
        ctx.save.setInterlude('');
        ctx.save.setWhere('training-room');
      }
      await travel(ctx.game, 'training-room', 'trainingFromEnding');
    });
  }

  update(): void {}
  dispose(): void {}
}
