/**
 * Tiny typed event emitter. `emit` allocates nothing (indexed loop over a plain array), so it is safe to call from
 * the fixed step. Payload objects are owned by the emitting system and REUSED: copy values, never keep the reference.
 *
 *   const off = emitter.on('laserHit', (e) => { ... });
 *   off();   // unsubscribe (levels: ctx.onDispose(off), or rely on SkillHub.clearListeners() at level unload)
 */
export class Emitter<M extends object> {
  private readonly lists: { [K in keyof M]?: ((payload: M[K]) => void)[] } = {};

  on<K extends keyof M>(name: K, fn: (payload: M[K]) => void): () => void {
    let list = this.lists[name];
    if (!list) {
      list = [];
      this.lists[name] = list;
    }
    list.push(fn);
    return () => this.off(name, fn);
  }

  off<K extends keyof M>(name: K, fn: (payload: M[K]) => void): void {
    const list = this.lists[name];
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  emit<K extends keyof M>(name: K, payload: M[K]): void {
    const list = this.lists[name];
    if (!list) return;
    for (let i = 0; i < list.length; i++) list[i](payload);
  }

  clear(): void {
    for (const k of Object.keys(this.lists) as (keyof M)[]) {
      const l = this.lists[k];
      if (l) l.length = 0;
    }
  }
}
