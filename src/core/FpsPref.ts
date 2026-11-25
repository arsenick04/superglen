/** "Tampilkan FPS" (the small FPS + quality letter pill). Saved on this device; default on for now. */
const KEY = 'superglen.showfps.v1';
let on = true;
try {
  on = window.localStorage.getItem(KEY) !== '0';
} catch {
  // ignore
}
const listeners: ((v: boolean) => void)[] = [];

export const fpsPref = {
  get on(): boolean {
    return on;
  },
  set(v: boolean): void {
    on = v;
    try {
      window.localStorage.setItem(KEY, v ? '1' : '0');
    } catch {
      // ignore
    }
    for (const l of listeners) l(v);
  },
  onChange(cb: (v: boolean) => void): void {
    listeners.push(cb);
    cb(on);
  },
};
