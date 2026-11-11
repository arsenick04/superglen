import * as THREE from 'three';
import { Quality } from './Quality';

/** Owns the WebGLRenderer and keeps it (and the camera aspect) in sync with the window size. */
export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera | null = null;
  private readonly onResize = (): void => this.resize();
  private readonly onOrientation = (): void => {
    // iOS reports the new size a little after orientationchange fires.
    this.resize();
    window.setTimeout(this.onResize, 250);
  };

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: Quality.antialias,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = Quality.shadows;
    this.renderer.shadowMap.type = Quality.shadowMapType;
    this.renderer.domElement.tabIndex = 0;
    container.appendChild(this.renderer.domElement);

    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onOrientation);
    this.resize();
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  /** The camera whose aspect ratio should follow the canvas size. */
  attachCamera(camera: THREE.PerspectiveCamera): void {
    this.camera = camera;
    this.resize();
  }

  resize(): void {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Quality.maxPixelRatio));
    this.renderer.setSize(w, h, false);
    if (this.camera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.render(scene, camera);
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onOrientation);
    this.renderer.dispose();
  }
}
