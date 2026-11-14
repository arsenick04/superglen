import { districtAt, type Poi } from './CityData';

/**
 * A small name pill at the top of the screen: the district you walk into ("Pasar", with its colour dot), or a place you come
 * close to ("Rumah Glen", "Menara Jam"). A five-year-old reads the colour; the parent reads the name. DOM is only touched
 * when the shown name changes, never per frame.
 */
export class CityHud {
  private readonly el: HTMLDivElement;
  private readonly dot: HTMLSpanElement;
  private readonly label: HTMLSpanElement;
  private current = '';
  private timer = 0;
  private shown = false;
  private district = '';
  private poi = '';
  /** Number of names shown so far (tests). */
  changes = 0;

  constructor(
    ui: HTMLElement,
    private readonly pois: readonly Poi[],
  ) {
    this.el = document.createElement('div');
    this.el.className = 'city-toast';
    this.dot = document.createElement('span');
    this.dot.className = 'dot';
    this.label = document.createElement('span');
    this.el.append(this.dot, this.label);
    ui.appendChild(this.el);
  }

  /** Seconds a name shown with `show(.., true)` stays before district / place names may replace it. */
  private hold = 0;

  /** Show a name now. `sticky`: district and place names do not replace it while it is up (level start, the lab hook). */
  show(name: string, color: number, sticky = false): void {
    if (sticky) this.hold = 3;
    else if (this.hold > 0) return;
    if (name !== this.current) {
      this.current = name;
      this.label.textContent = name;
      this.dot.style.background = `#${color.toString(16).padStart(6, '0')}`;
      this.changes++;
    }
    this.timer = 3;
    if (!this.shown) {
      this.el.classList.add('show');
      this.shown = true;
    }
  }

  /** Take the current district / place as known without showing it (the level start shows the city name instead). */
  prime(x: number, z: number): void {
    this.district = districtAt(x, z).id;
    this.poi = '';
    for (const p of this.pois) if ((p.x - x) ** 2 + (p.z - z) ** 2 < p.radius * p.radius) {
      this.poi = p.name;
      break;
    }
  }

  get text(): string {
    return this.shown ? this.current : '';
  }

  update(dt: number, x: number, z: number): void {
    const d = districtAt(x, z);
    let poi = '';
    for (const p of this.pois) {
      const dx = p.x - x;
      const dz = p.z - z;
      if (dx * dx + dz * dz < p.radius * p.radius) {
        poi = p.name;
        break;
      }
    }
    if (poi !== this.poi) {
      this.poi = poi;
      if (poi) this.show(poi, d.color);
    }
    if (d.id !== this.district) {
      this.district = d.id;
      this.show(d.name, d.color);
    }
    if (this.hold > 0) this.hold -= dt;
    if (this.shown) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.el.classList.remove('show');
        this.shown = false;
      }
    }
  }

  dispose(): void {
    this.el.remove();
  }
}
