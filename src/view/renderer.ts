import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/** Final screen-space pass: chromatic aberration, vignette, scanlines, grain, flash and glitch. */
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uAberr: { value: 0 },
    uFlash: { value: new THREE.Vector4(1, 1, 1, 0) },
    uGlitch: { value: 0 },
    uVignette: { value: 1 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uAberr, uGlitch, uVignette;
    uniform vec4 uFlash;
    uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      if (uGlitch > 0.0) {
        float band = floor(uv.y * 24.0 + uTime * 40.0);
        float h = hash(vec2(band, floor(uTime * 30.0)));
        if (h < uGlitch * 0.6) uv.x += (h - 0.25) * 0.08 * uGlitch;
      }
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      float ab = (0.0015 + uAberr) * (0.4 + r2 * 2.5);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ab * 2.0).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ab * 2.0).b;
      // scanlines + grain, very subtle
      col *= 0.97 + 0.03 * sin(uv.y * uRes.y * 1.5);
      col += (hash(uv * uRes + uTime) - 0.5) * 0.025;
      col *= mix(1.0, smoothstep(0.85, 0.2, r2 * 1.6), 0.55 * uVignette);
      col = mix(col, uFlash.rgb, uFlash.a);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export interface Quality {
  pixelRatio: number;
  bloom: boolean;
  shadows: boolean;
  particles: number;
}

export const QUALITY: Record<'high' | 'medium' | 'low', Quality> = {
  high: { pixelRatio: 2, bloom: true, shadows: true, particles: 8000 },
  medium: { pixelRatio: 1.25, bloom: true, shadows: false, particles: 5000 },
  low: { pixelRatio: 1, bloom: false, shadows: false, particles: 2500 },
};

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(48, 1, 0.5, 200);
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  readonly final: ShaderPass;
  quality: Quality;

  constructor(root: HTMLElement, quality: Quality) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatio));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    root.appendChild(this.renderer.domElement);
    this.renderer.domElement.className = 'game-canvas';

    this.scene.background = new THREE.Color(0x020309);
    this.scene.fog = new THREE.FogExp2(0x020309, 0.012);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.75, 0.35, 0.9);
    this.bloom.enabled = quality.bloom;
    this.composer.addPass(this.bloom);
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.final);
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  setQuality(q: Quality): void {
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
    this.renderer.shadowMap.enabled = q.shadows;
    this.bloom.enabled = q.bloom;
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.final.uniforms.uRes.value.set(w, h);
  }

  render(time: number): void {
    this.final.uniforms.uTime.value = time;
    this.composer.render();
  }
}
