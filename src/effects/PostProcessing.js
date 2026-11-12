import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

const CinematicLensShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.16 },
    uChromatic: { value: 0.00045 },
    uGrain: { value: 0.010 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uChromatic;
    uniform float uGrain;
    varying vec2 vUv;

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec2 centered = vUv - 0.5;
      float distSq = dot(centered, centered);

      vec2 offset = centered * distSq * uChromatic * 4.0;
      float r = texture2D(tDiffuse, vUv + offset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - offset).b;
      vec3 col = vec3(r, g, b);

      // Subtle filmic toe contrast to eliminate milky mid-blacks
      col = mix(col, smoothstep(0.0, 1.0, col), 0.08);

      float vig = 1.0 - distSq * (uVignette * 2.1);
      col *= clamp(vig, 0.62, 1.0);

      float n = hash12(vUv * vec2(1440.0, 900.0) + fract(uTime * 11.3)) - 0.5;
      col += n * uGrain;

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};

export function createPostProcessing(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const pixelRatio = renderer.getPixelRatio();
  const effW = Math.max(1, Math.floor(size.x * pixelRatio));
  const effH = Math.max(1, Math.floor(size.y * pixelRatio));

  // Non-MSAA HalfFloat target guarantees 100% WebGL2 compatibility alongside planar reflection
  const renderTarget = new THREE.WebGLRenderTarget(effW, effH, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });

  const composer = new EffectComposer(renderer, renderTarget);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(size.x, size.y);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // Ground-Truth Ambient Occlusion (GTAO) for realistic pylon, cowling & tire contact depth!
  const gtaoPass = new GTAOPass(scene, camera, effW, effH);
  gtaoPass.output = GTAOPass.OUTPUT.Default;
  gtaoPass.blendIntensity = 0.86;
  gtaoPass.updateGtaoMaterial({
    radius: 0.44,
    distanceExponent: 1.45,
    thickness: 0.95,
    scale: 1.0,
    samples: 16,
    distanceFallOff: 1.0,
    screenSpaceRadius: false,
  });
  gtaoPass.updatePdMaterial({
    lumaPhi: 10.0,
    depthPhi: 2.0,
    normalPhi: 3.0,
    radius: 4.0,
    radiusExponent: 1.0,
    rings: 2.0,
    samples: 16,
  });

  // Hide decals, sprites, transparent glass/cones & 0-alpha discs during GTAO G-buffer pass
  gtaoPass.overrideVisibility = function () {
    const cache = this._visibilityCache;
    this.scene.traverse((object) => {
      cache.set(object, object.visible);
      if (!object.visible) return;
      if (object.isPoints || object.isLine || object.isSprite || object.userData.noAO) {
        object.visible = false;
        return;
      }
      const mat = object.material;
      if (mat && !object.userData.keepAO) {
        if (Array.isArray(mat)) {
          if (mat.some((m) => m && m.transparent)) object.visible = false;
        } else if (mat.transparent) {
          object.visible = false;
        }
      }
    });
  };
  composer.addPass(gtaoPass);

  // Restrained HDR Bloom: only luminaires, taxi lamps & sky aperture bloom softly
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    0.18,
    0.45,
    0.96
  );
  composer.addPass(bloomPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  const fxaaPass = new ShaderPass(FXAAShader);
  fxaaPass.material.uniforms['resolution'].value.set(1 / effW, 1 / effH);
  composer.addPass(fxaaPass);

  const lensPass = new ShaderPass(CinematicLensShader);
  composer.addPass(lensPass);

  function resize(w, h) {
    const pr = renderer.getPixelRatio();
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    bloomPass.resolution.set(w, h);
    fxaaPass.material.uniforms['resolution'].value.set(
      1 / Math.max(1, w * pr),
      1 / Math.max(1, h * pr)
    );
  }

  function render(elapsed) {
    lensPass.uniforms.uTime.value = elapsed;
    composer.render();
  }

  return {
    composer,
    gtaoPass,
    bloomPass,
    lensPass,
    resize,
    render,
  };
}
