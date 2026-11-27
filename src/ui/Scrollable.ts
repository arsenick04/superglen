import './scroll.css';

const CHEV_DOWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9 L12 16 L19 9" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHEV_RIGHT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5 L16 12 L9 19" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHEV_LEFT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 L8 12 L15 19" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * Tap-safe button binding for controls inside scrollable menus:
 * - Mouse / pen / PadUi synthetic pointerdown fires immediately on pointerdown (no delay, preserves tests & gamepad).
 * - Touch fingers wait for pointerup within 12 px so dragging a finger across a button scrolls the menu cleanly.
 * - Enter / Space on keyboard triggers the same action.
 */
export function bindTap(el: HTMLElement, fn: () => void, isDisabled?: () => boolean): void {
  let sx = 0;
  let sy = 0;
  let pid = -1;
  let lastTap = 0;
  const blocked = (): boolean => (isDisabled ? isDisabled() : (el as HTMLButtonElement).disabled);
  el.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (e.pointerType === 'touch') {
      pid = e.pointerId;
      sx = e.clientX;
      sy = e.clientY;
      return;
    }
    e.preventDefault();
    if (!blocked()) fn();
  });
  el.addEventListener('pointerup', (e) => {
    if (e.pointerId !== pid) return;
    pid = -1;
    if (Math.hypot(e.clientX - sx, e.clientY - sy) < 12 && !blocked()) {
      lastTap = performance.now();
      fn();
    }
  });
  el.addEventListener(
    'touchend',
    (e) => {
      if (e.cancelable && performance.now() - lastTap < 60) e.preventDefault();
    },
    { passive: false },
  );
  el.addEventListener('pointercancel', () => {
    pid = -1;
  });
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    if (!blocked()) fn();
  });
}

export interface ScrollHandle {
  /** Re-measure overflow and update the subtle scroll-hint pill(s). */
  refresh(): void;
}

/**
 * Make `scroller` cleanly scrollable on touch, mouse wheel, gamepad and TV remote, and attach subtle edge arrows when more
 * content sits past the visible edge. Pass `host` (a non-scrolling wrapper with `position: relative`) so the indicator stays
 * pinned to the visible frame rather than scrolling away with the content.
 */
export function attachScroll(scroller: HTMLElement, axis: 'y' | 'x', host?: HTMLElement): ScrollHandle {
  scroller.dataset.scrollable = axis;
  const target = host ?? scroller;
  target.classList.add('sg-scroll-host');

  scroller.addEventListener(
    'wheel',
    (e) => {
      e.stopPropagation();
      if (axis === 'x' && scroller.scrollWidth > scroller.clientWidth + 2 && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        scroller.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    },
    { passive: axis !== 'x' },
  );

  let downEl: HTMLDivElement | null = null;
  let rightEl: HTMLDivElement | null = null;
  let leftEl: HTMLDivElement | null = null;

  const makeHint = (cls: string, svg: string): HTMLDivElement => {
    const d = document.createElement('div');
    d.className = `sg-scroll-hint ${cls}`;
    d.setAttribute('aria-hidden', 'true');
    d.innerHTML = svg;
    target.appendChild(d);
    return d;
  };

  if (axis === 'y') {
    downEl = makeHint('down', CHEV_DOWN);
  } else {
    rightEl = makeHint('right', CHEV_RIGHT);
    leftEl = makeHint('left', CHEV_LEFT);
  }

  const refresh = (): void => {
    if (downEl) {
      const more = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight > 6;
      downEl.classList.toggle('show', more);
    }
    if (rightEl && leftEl) {
      const moreR = scroller.scrollWidth - scroller.scrollLeft - scroller.clientWidth > 6;
      const moreL = scroller.scrollLeft > 6;
      rightEl.classList.toggle('show', moreR);
      leftEl.classList.toggle('show', moreL);
    }
  };

  scroller.addEventListener('scroll', refresh, { passive: true });
  window.addEventListener('resize', refresh, { passive: true });
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(refresh);
    ro.observe(scroller);
  }
  requestAnimationFrame(refresh);
  return { refresh };
}

/** Smoothly scroll the nearest scrollable ancestor so `el` is fully visible (used by gamepad / keyboard / TV remote focus). */
export function ensureInView(el: HTMLElement | null): void {
  if (!el) return;
  try {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  } catch {
    // older TV browsers
  }
}
