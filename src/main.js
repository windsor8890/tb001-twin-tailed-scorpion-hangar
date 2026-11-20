import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildHangarEnvironment } from './scene/EnvironmentProbe.js';
import { buildHangarScene } from './models/HangarScene.js';
import { buildTwinTailedScorpion } from './models/TwinTailedScorpion.js';
import { createPostProcessing } from './effects/PostProcessing.js';
import { createHangarAudio } from './audio/HangarAudio.js';
import { createHudController } from './ui/HudController.js';

// Calibrated 50mm-70mm Cinema Prime Camera Presets (reference 16:10 / 16:9 widescreen)
const CAMERA_PRESETS = {
  hero: {
    pos: new THREE.Vector3(-8.85, 2.08, 9.25),
    target: new THREE.Vector3(-0.35, 1.46, 0.65),
    fov: 37,
  },
  ordnance: {
    pos: new THREE.Vector3(-5.35, 1.24, 3.85),
    target: new THREE.Vector3(-2.85, 1.44, 0.12),
    fov: 34,
  },
  nose: {
    pos: new THREE.Vector3(-3.35, 1.36, 6.15),
    target: new THREE.Vector3(0.25, 1.36, 2.55),
    fov: 33,
  },
  tail: {
    pos: new THREE.Vector3(-5.65, 2.72, -7.85),
    target: new THREE.Vector3(0.0, 1.72, -1.75),
    fov: 38,
  },
  top: {
    pos: new THREE.Vector3(-4.2, 9.4, 8.6),
    target: new THREE.Vector3(0.0, 1.35, -0.35),
    fov: 40,
  },
};

/**
 * Preserves balanced horizontal cinema framing even on narrow split-screen viewports
 * without introducing wide-angle fisheye distortion.
 */
function adaptFramingForAspect(basePos, target, baseFov, aspect) {
  if (aspect >= 1.48) {
    return { pos: basePos.clone(), fov: baseFov };
  }
  const ratio = THREE.MathUtils.clamp(1.48 / Math.max(0.48, aspect), 1.0, 2.6);
  const distScale = Math.min(1.34, Math.pow(ratio, 0.34));
  const fovBoost = Math.min(11, (ratio - 1.0) * 6.8);
  const offset = basePos.clone().sub(target).multiplyScalar(distScale);
  const adaptedPos = target.clone().add(offset);
  adaptedPos.x = THREE.MathUtils.clamp(adaptedPos.x, -16.8, 16.8);
  adaptedPos.z = THREE.MathUtils.clamp(adaptedPos.z, -16.8, 16.8);
  return { pos: adaptedPos, fov: baseFov + fovBoost };
}

function setBootProgress(pct, statusText) {
  const fill = document.getElementById('boot-bar-fill');
  const status = document.getElementById('boot-status');
  if (fill) fill.style.width = `${pct}%`;
  if (status) status.textContent = statusText;
}

async function init() {
  const container = document.getElementById('canvas-container');

  setBootProgress(28, 'INITIALIZING ACES FILMIC & GTAO PIPELINE...');
  await new Promise((r) => requestAnimationFrame(r));

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x141920);
  scene.fog = new THREE.FogExp2(0x181e26, 0.0085);

  const initialAspect = window.innerWidth / Math.max(1, window.innerHeight);
  const initialHero = adaptFramingForAspect(
    CAMERA_PRESETS.hero.pos,
    CAMERA_PRESETS.hero.target,
    CAMERA_PRESETS.hero.fov,
    initialAspect
  );

  const camera = new THREE.PerspectiveCamera(initialHero.fov, initialAspect, 0.15, 95);
  camera.position.copy(initialHero.pos);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(CAMERA_PRESETS.hero.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.maxPolarAngle = Math.PI * 0.492;
  controls.minPolarAngle = 0.12;
  controls.minDistance = 2.0;
  controls.maxDistance = 21.5;
  controls.panSpeed = 0.65;

  setBootProgress(56, 'SYNTHESIZING 2K TANGENT NORMAL MAPS & HANGAR HDRI...');
  await new Promise((r) => requestAnimationFrame(r));

  let envRT = buildHangarEnvironment(renderer, 'daylight');
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.78;

  const hangar = buildHangarScene();
  scene.add(hangar.group);
  hangar.setLightingAtmosphere('daylight', scene);

  setBootProgress(84, 'MOUNTING TB-001A AIRFRAME & 12x LIVE MUNITIONS...');
  await new Promise((r) => requestAnimationFrame(r));

  const uav = buildTwinTailedScorpion();
  scene.add(uav.group);

  const post = createPostProcessing(renderer, scene, camera);
  const audio = createHangarAudio();

  const camAnim = {
    active: false,
    autoOrbit: false,
    targetPos: new THREE.Vector3(),
    targetLook: new THREE.Vector3(),
    targetFov: initialHero.fov,
  };

  function transitionCameraTo(basePos, lookAt, baseFov = 37) {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const framed = adaptFramingForAspect(basePos, lookAt, baseFov, aspect);
    camAnim.autoOrbit = false;
    camAnim.active = true;
    camAnim.targetPos.copy(framed.pos);
    camAnim.targetLook.copy(lookAt);
    camAnim.targetFov = framed.fov;
  }

  controls.addEventListener('start', () => {
    camAnim.active = false;
    if (camAnim.autoOrbit) {
      camAnim.autoOrbit = false;
      hud.setActiveCamButton(null);
    }
  });

  const hud = createHudController({
    camera,
    uav,
    hangar,
    scene,
    audio,
    onSelectCameraPreset: (presetKey) => {
      if (presetKey === 'orbit') {
        const aspect = window.innerWidth / Math.max(1, window.innerHeight);
        camAnim.active = false;
        camAnim.autoOrbit = true;
        camAnim.targetLook.set(0, 1.48, 0.25);
        camAnim.targetFov = aspect < 1.48 ? 44 : 37;
        return;
      }
      const p = CAMERA_PRESETS[presetKey];
      if (p) transitionCameraTo(p.pos, p.target, p.fov);
    },
    onFocusStationCamera: (stationMeta) => {
      const camX = stationMeta.x + Math.sign(stationMeta.x) * 0.62;
      transitionCameraTo(
        new THREE.Vector3(camX, 1.22, 3.05),
        new THREE.Vector3(stationMeta.x, 1.42, 0.08),
        33
      );
    },
    onResetEnvironmentLighting: (mode) => {
      const nextEnv = buildHangarEnvironment(renderer, mode);
      scene.environment = nextEnv.texture;
      scene.environmentIntensity =
        mode === 'dusk' ? 0.68 : mode === 'inspection' ? 0.88 : 0.78;
      envRT.dispose();
      envRT = nextEnv;
    },
    onCaptureSnapshot: () => {
      hangar.renderReflection(renderer, scene, camera);
      post.render(clock.elapsedTime);
      const dataUrl = renderer.domElement.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `TB-001A-Hangar-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    },
  });

  // Direct 3D Hover & Click Raycasting on Underwing Munitions
  const raycaster = new THREE.Raycaster();
  const pointerDownPos = new THREE.Vector2();
  const hoverNdc = new THREE.Vector2();
  let isPointerDragging = false;

  function pickStationAtClientPos(clientX, clientY) {
    hoverNdc.set(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(hoverNdc, camera);
    const hits = raycaster.intersectObjects(uav.munitions.group.children, true);
    if (hits.length > 0) {
      let obj = hits[0].object;
      while (obj && obj.parent !== uav.munitions.group) {
        obj = obj.parent;
      }
      if (obj && obj.name && obj.name.startsWith('STA-')) {
        return obj.name;
      }
    }
    return null;
  }

  renderer.domElement.addEventListener('pointerdown', (e) => {
    isPointerDragging = true;
    pointerDownPos.set(e.clientX, e.clientY);
  });

  renderer.domElement.addEventListener('pointermove', (e) => {
    if (isPointerDragging) return;
    const hitId = pickStationAtClientPos(e.clientX, e.clientY);
    renderer.domElement.style.cursor = hitId ? 'pointer' : 'grab';
    hud.setHoveredStation(hitId);
  });

  renderer.domElement.addEventListener('pointerleave', () => {
    isPointerDragging = false;
    hud.setHoveredStation(null);
  });

  renderer.domElement.addEventListener('pointerup', (e) => {
    isPointerDragging = false;
    if (Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y) > 5) {
      return;
    }
    const hitId = pickStationAtClientPos(e.clientX, e.clientY);
    if (hitId) {
      audio.playUiChirp('lock');
      hud.selectStation(hitId, true);
    }
  });

  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    post.resize(w, h);
  });

  setBootProgress(100, 'SYSTEMS READY // BAY 10-2');
  renderer.compile(scene, camera);
  hangar.renderReflection(renderer, scene, camera);
  post.render(0);

  setTimeout(() => {
    const bootEl = document.getElementById('boot-screen');
    if (bootEl) bootEl.classList.add('fade-out');
  }, 240);

  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.elapsedTime;

    if (camAnim.autoOrbit) {
      const aspect = window.innerWidth / Math.max(1, window.innerHeight);
      const baseR = aspect < 1.2 ? 13.6 : 11.8;
      const orbitAngle = -0.78 + elapsed * 0.14;
      const radius = baseR + Math.sin(elapsed * 0.28) * 1.1;
      const height = 2.25 + Math.sin(elapsed * 0.22) * 0.85;
      camera.position.x = Math.sin(orbitAngle) * radius;
      camera.position.z = Math.cos(orbitAngle) * radius;
      camera.position.y = height;
      controls.target.lerp(camAnim.targetLook, dt * 3.0);
      if (Math.abs(camera.fov - camAnim.targetFov) > 0.05) {
        camera.fov += (camAnim.targetFov - camera.fov) * dt * 3.5;
        camera.updateProjectionMatrix();
      }
    } else if (camAnim.active) {
      const lerpAmt = Math.min(1, dt * 4.2);
      camera.position.lerp(camAnim.targetPos, lerpAmt);
      controls.target.lerp(camAnim.targetLook, lerpAmt);
      if (Math.abs(camera.fov - camAnim.targetFov) > 0.05) {
        camera.fov += (camAnim.targetFov - camera.fov) * lerpAmt;
        camera.updateProjectionMatrix();
      }
      if (
        camera.position.distanceTo(camAnim.targetPos) < 0.03 &&
        controls.target.distanceTo(camAnim.targetLook) < 0.02
      ) {
        camAnim.active = false;
      }
    }

    if (camera.position.y < 0.42) camera.position.y = 0.42;

    controls.update();
    uav.update(dt, elapsed);
    hangar.update(dt, elapsed, uav.state.navLightsActive);
    audio.update(uav.state.propRpmFactor);
    hud.update(controls.target);

    hangar.renderReflection(renderer, scene, camera);
    post.render(elapsed);
  }

  animate();
}

init();
