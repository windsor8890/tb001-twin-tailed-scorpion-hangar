import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import {
  createHangarDeckTextures,
  createContactShadowTexture,
  createArchitecturalRibTextures,
  createBrushedMetalTextures,
  createGpuStencilTexture,
  createBayStatusBoardTexture,
  createSoftGlowTexture,
} from '../textures/ProceduralTextures.js';
import { buildOrdnanceShowcaseRow, createOrdnanceMaterials } from './MunitionsSystem.js';

RectAreaLightUniformsLib.init();

/**
 * Soft Fresnel-attenuated volumetric light shaft ShaderMaterial (marked noAO).
 */
function createVolumetricShaftMaterial(colorHex, baseOpacity = 0.055) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(colorHex) },
      uOpacity: { value: baseOpacity },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewPos;
      void main() {
        vUv = uv;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mvPos.xyz;
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewPos;
      void main() {
        vec3 viewDir = normalize(vViewPos);
        float fresnel = pow(abs(dot(vNormalView, viewDir)), 1.9);
        float longFade = smoothstep(0.0, 0.28, vUv.y) * smoothstep(1.0, 0.15, 1.0 - vUv.y);
        float alpha = fresnel * longFade * uOpacity;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

/**
 * Generates crisp architectural bay signage textures ("10-1", "10-2", "10-3", "TENGDEN").
 */
function createBaySignageTexture(bayNumber, subLabel) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 384;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 512, 384);

  // Authentic Zhuhai Hangar Bay Typography ("10 - 2" in clean industrial cobalt-slate)
  ctx.fillStyle = 'rgba(28, 86, 158, 0.88)';
  ctx.font = '700 132px "Barlow Condensed", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(bayNumber, 256, 152);

  if (subLabel) {
    ctx.fillStyle = 'rgba(26, 92, 168, 0.90)';
    ctx.fillRect(166, 188, 180, 108);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 3;
    ctx.strokeRect(173, 195, 166, 94);

    ctx.fillStyle = '#f4f7fa';
    ctx.font = '500 18px "IBM Plex Mono", monospace';
    ctx.fillText('FLIGHT TEST BAY', 256, 222);
    ctx.font = '700 44px "Noto Sans SC", sans-serif';
    ctx.fillText(subLabel, 256, 272);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function createFasciaBannerTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 160;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1d4d8c';
  ctx.fillRect(0, 0, 1024, 160);

  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 8, 1008, 144);

  ctx.fillStyle = 'rgba(244, 247, 250, 0.95)';
  ctx.font = '700 58px "Noto Sans SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('腾  |  盾  |  科  |  创', 512, 86);

  ctx.fillStyle = 'rgba(208, 222, 238, 0.82)';
  ctx.font = '600 22px "Barlow Condensed", "IBM Plex Mono", sans-serif';
  ctx.fillText('TENGDEN TECHNOLOGY  ·  UNMANNED AVIATION FLIGHT TEST CENTER', 512, 128);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function createExteriorAirfieldTexture(mode = 'daylight') {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d');

  const sky = ctx.createLinearGradient(0, 0, 0, 350);
  if (mode === 'dusk') {
    sky.addColorStop(0.0, '#1a2738');
    sky.addColorStop(0.45, '#465d78');
    sky.addColorStop(0.78, '#d9884a');
    sky.addColorStop(1.0, '#f4c082');
  } else if (mode === 'inspection') {
    sky.addColorStop(0.0, '#18222e');
    sky.addColorStop(0.65, '#2b394a');
    sky.addColorStop(1.0, '#44566c');
  } else {
    // Natural bright overcast Zhuhai airfield sky
    sky.addColorStop(0.0, '#9eb0c2');
    sky.addColorStop(0.55, '#bcc8d4');
    sky.addColorStop(1.0, '#d8dfe6');
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1024, 350);

  // Distant coastal hills silhouette
  ctx.fillStyle = mode === 'dusk' ? '#252c36' : '#7b8794';
  ctx.beginPath();
  ctx.moveTo(0, 350);
  ctx.lineTo(0, 316);
  ctx.bezierCurveTo(220, 290, 410, 325, 640, 302);
  ctx.bezierCurveTo(810, 286, 940, 318, 1024, 308);
  ctx.lineTo(1024, 350);
  ctx.closePath();
  ctx.fill();

  // Distant hangar roofs
  ctx.fillStyle = mode === 'dusk' ? '#1c222b' : '#8e99a4';
  ctx.fillRect(120, 326, 210, 24);
  ctx.fillRect(680, 328, 240, 22);

  // Concrete airfield apron extending outside the open door
  const tarmac = ctx.createLinearGradient(0, 350, 0, 512);
  tarmac.addColorStop(0, mode === 'dusk' ? '#2c3036' : '#767c82');
  tarmac.addColorStop(1, mode === 'dusk' ? '#1a1d22' : '#4a5058');
  ctx.fillStyle = tarmac;
  ctx.fillRect(0, 350, 1024, 162);

  // Distant taxiway stripe
  ctx.strokeStyle = 'rgba(210, 168, 62, 0.65)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(460, 512);
  ctx.lineTo(508, 356);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildHangarScene() {
  const root = new THREE.Group();
  root.name = 'AerospaceTestHangar';

  const W = 38; // X: -19m .. +19m (calibrated to deck markings)
  const D = 38; // Z: -19m .. +19m
  const H = 12.4; // Eave clear height

  const deckTex = createHangarDeckTextures();
  const contactShadowTex = createContactShadowTexture();
  const ribTex = createArchitecturalRibTextures();
  const brushedTex = createBrushedMetalTextures();
  const softGlowTex = createSoftGlowTexture();

  const mats = {
    steelDark: new THREE.MeshStandardMaterial({
      color: 0x262b31,
      normalMap: brushedTex.normalMap,
      normalScale: new THREE.Vector2(0.28, 0.28),
      roughness: 0.54,
      metalness: 0.74,
    }),
    steelSlate: new THREE.MeshStandardMaterial({
      color: 0x3b434c,
      normalMap: brushedTex.normalMap,
      normalScale: new THREE.Vector2(0.24, 0.24),
      roughness: 0.48,
      metalness: 0.68,
    }),
    brushedAlum: new THREE.MeshStandardMaterial({
      color: 0xb8c0c8,
      normalMap: brushedTex.normalMap,
      normalScale: new THREE.Vector2(0.32, 0.32),
      roughnessMap: brushedTex.roughnessMap,
      roughness: 0.30,
      metalness: 0.88,
    }),
    galvanized: new THREE.MeshStandardMaterial({
      color: 0x8d959e,
      normalMap: brushedTex.normalMap,
      normalScale: new THREE.Vector2(0.22, 0.22),
      roughness: 0.36,
      metalness: 0.82,
    }),
    ribbedCladding: new THREE.MeshStandardMaterial({
      color: 0x313840,
      normalMap: ribTex.normalMap,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughness: 0.62,
      metalness: 0.36,
    }),
    translucentPolyPanel: new THREE.MeshStandardMaterial({
      color: 0xc8d1da,
      normalMap: ribTex.normalMap,
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughness: 0.44,
      metalness: 0.08,
      emissive: new THREE.Color(0x9fb2c6),
      emissiveIntensity: 0.34,
    }),
    clerestoryGlass: new THREE.MeshStandardMaterial({
      color: 0xd6e1ec,
      roughness: 0.28,
      metalness: 0.1,
      emissive: new THREE.Color(0xb8cde2),
      emissiveIntensity: 0.52,
    }),
    balustradeGlass: new THREE.MeshPhysicalMaterial({
      color: 0x9ab0c4,
      roughness: 0.12,
      metalness: 0.1,
      transmission: 0.55,
      transparent: true,
      opacity: 0.48,
    }),
    concreteDado: new THREE.MeshStandardMaterial({
      color: 0x353a40,
      roughness: 0.88,
      metalness: 0.04,
    }),
    fasciaWhite: new THREE.MeshStandardMaterial({
      color: 0xd8dde2,
      roughness: 0.58,
      metalness: 0.12,
    }),
    craneOchre: new THREE.MeshStandardMaterial({
      color: 0xba8628,
      roughness: 0.52,
      metalness: 0.38,
    }),
    flightCaseBlack: new THREE.MeshStandardMaterial({
      color: 0x171a1f,
      roughness: 0.72,
      metalness: 0.14,
    }),
    coverCobalt: new THREE.MeshStandardMaterial({
      color: 0x1e5094,
      roughness: 0.76,
      metalness: 0.05,
    }),
    gseSlateWhite: new THREE.MeshStandardMaterial({
      color: 0xcad1d8,
      normalMap: brushedTex.normalMap,
      normalScale: new THREE.Vector2(0.16, 0.16),
      roughness: 0.48,
      metalness: 0.22,
    }),
    gseAnthracite: new THREE.MeshStandardMaterial({
      color: 0x1e2329,
      roughness: 0.58,
      metalness: 0.48,
    }),
    tireRubber: new THREE.MeshStandardMaterial({
      color: 0x141619,
      roughness: 0.88,
      metalness: 0.04,
    }),
    safetyBumperAmber: new THREE.MeshStandardMaterial({
      color: 0xd4922a,
      roughness: 0.62,
      metalness: 0.12,
    }),
    softboxEmissive: new THREE.MeshBasicMaterial({
      color: 0xf2f6fa,
    }),
  };

  // ============================================================================
  // 1. BRUSHED CONCRETE & TROWELED EPOXY APRON + ATTENUATED PLANAR REFLECTION
  // ============================================================================
  const floorGeo = new THREE.PlaneGeometry(W, D);
  const reflectionRT = new THREE.WebGLRenderTarget(1024, 1024, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });

  const mirrorBaseMat = new THREE.ShaderMaterial({
    uniforms: {
      tReflection: { value: reflectionRT.texture },
      uDrawingBufferSize: { value: new THREE.Vector2(1600, 900) },
      uTint: { value: new THREE.Color(0x5b646e) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tReflection;
      uniform vec2 uDrawingBufferSize;
      uniform vec3 uTint;
      varying vec3 vWorldPos;
      void main() {
        vec2 uv = vec2(
          gl_FragCoord.x / uDrawingBufferSize.x,
          1.0 - gl_FragCoord.y / uDrawingBufferSize.y
        );
        // Physically based Schlick-Fresnel grazing-angle attenuation + 9-tap circular blur
        // Steep downward views see dry matte concrete; low grazing angles catch soft architectural sheen!
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float ndotv = clamp(viewDir.y, 0.0, 1.0);
        float fresnel = mix(0.06, 0.62, pow(1.0 - ndotv, 2.8));

        vec2 b = vec2(0.0046, 0.0056);
        vec3 c = texture2D(tReflection, uv).rgb * 0.24;
        c += texture2D(tReflection, uv + vec2(b.x, 0.0)).rgb * 0.11;
        c += texture2D(tReflection, uv - vec2(b.x, 0.0)).rgb * 0.11;
        c += texture2D(tReflection, uv + vec2(0.0, b.y)).rgb * 0.11;
        c += texture2D(tReflection, uv - vec2(0.0, b.y)).rgb * 0.11;
        c += texture2D(tReflection, uv + vec2(b.x, b.y) * 0.72).rgb * 0.08;
        c += texture2D(tReflection, uv + vec2(-b.x, b.y) * 0.72).rgb * 0.08;
        c += texture2D(tReflection, uv + vec2(b.x, -b.y) * 0.72).rgb * 0.08;
        c += texture2D(tReflection, uv + vec2(-b.x, -b.y) * 0.72).rgb * 0.08;

        vec3 baseConcrete = vec3(0.075, 0.082, 0.090);
        vec3 outCol = mix(baseConcrete, c * uTint, fresnel);
        gl_FragColor = vec4(outCol, 1.0);
      }
    `,
  });

  const mirrorBaseMesh = new THREE.Mesh(floorGeo, mirrorBaseMat);
  mirrorBaseMesh.rotation.x = -Math.PI / 2;
  mirrorBaseMesh.position.y = -0.004;
  mirrorBaseMesh.userData.noAO = true;
  root.add(mirrorBaseMesh);

  const epoxyFloorMat = new THREE.MeshStandardMaterial({
    map: deckTex.map,
    normalMap: deckTex.normalMap,
    normalScale: new THREE.Vector2(0.28, 0.28),
    roughnessMap: deckTex.roughnessMap,
    roughness: 0.88,
    metalness: 0.03,
    transparent: true,
    depthWrite: true,
  });
  const epoxyFloor = new THREE.Mesh(floorGeo, epoxyFloorMat);
  epoxyFloor.rotation.x = -Math.PI / 2;
  epoxyFloor.position.y = 0.0;
  epoxyFloor.receiveShadow = true;
  epoxyFloor.userData.keepAO = true; // Acts as exact y=0 receiver for real-time GTAO!
  root.add(epoxyFloor);

  // Helper to place grounded multi-stop contact shadow decals (zero floating tires/props!)
  const contactShadowGroup = new THREE.Group();
  root.add(contactShadowGroup);

  function addContactShadow(x, z, width, depth, opacity = 0.68, rotY = 0) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshBasicMaterial({
        map: contactShadowTex,
        transparent: true,
        opacity,
        depthWrite: false,
      })
    );
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = rotY;
    m.position.set(x, 0.0028, z);
    m.userData.noAO = true;
    contactShadowGroup.add(m);
  }

  // Aircraft Tire, Wheel-Chock & Broad Underbody Contact Shadows
  addContactShadow(0.0, 3.08, 0.78, 0.98, 0.82); // Nose tire & chocks
  addContactShadow(-2.38, -0.26, 0.96, 1.24, 0.84); // Starboard main tire & chocks
  addContactShadow(2.38, -0.26, 0.96, 1.24, 0.84); // Port main tire & chocks
  addContactShadow(-2.38, -0.64, 0.72, 0.72, 0.56); // Starboard hydraulic jack base
  addContactShadow(0.0, 1.05, 2.55, 7.2, 0.36); // Central fuselage belly soft occlusion
  addContactShadow(-2.38, 0.15, 3.6, 4.4, 0.24); // Starboard wing/nacelle soft occlusion
  addContactShadow(2.38, 0.15, 3.6, 4.4, 0.24); // Port wing/nacelle soft occlusion

  // Recessed Brass Ground Earthing Points & Tie-Down Rings in Concrete Apron
  const tieDownGeo = new THREE.RingGeometry(0.055, 0.085, 20);
  const tieDownMat = new THREE.MeshStandardMaterial({
    color: 0x8c7648,
    roughness: 0.46,
    metalness: 0.78,
  });
  for (const [tx, tz] of [
    [-1.4, 3.6],
    [1.4, 3.6],
    [-4.8, 0.8],
    [4.8, 0.8],
    [-3.6, -4.2],
    [3.6, -4.2],
  ]) {
    const ring = new THREE.Mesh(tieDownGeo, tieDownMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(tx, 0.002, tz);
    ring.userData.noAO = true;
    root.add(ring);
  }

  // ============================================================================
  // 2. MONUMENTAL PORT HANGAR BAY DOORS ("10-1 / 10-2 / 10-3") & MEZZANINE GALLERY
  //    Modeled directly after the background hangar architecture in ref_3.jpg!
  // ============================================================================
  const portWallX = W * 0.5; // x = +19.0m (directly in background of Hero 3/4 view!)
  const baySpecs = [
    { zCenter: -12.6, num: '10 - 1', sub: null },
    { zCenter: 0.0, num: '10 - 2', sub: '入 口' },
    { zCenter: 12.6, num: '10 - 3', sub: '出 口' },
  ];

  // Recessed Steel Floor Sliding Door Tracks along x = +18.75m
  const trackRail = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.014, D),
    mats.steelDark
  );
  trackRail.position.set(portWallX - 0.28, 0.007, 0);
  root.add(trackRail);

  for (const bay of baySpecs) {
    const bayW = 11.8;
    const doorH = 9.8;
    const bayGrp = new THREE.Group();
    bayGrp.position.set(portWallX - 0.12, 0, bay.zCenter);
    root.add(bayGrp);

    // Translucent milky-polycarbonate insulated multi-leaf hangar door panel
    const polyLeaf = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, doorH, bayW),
      mats.translucentPolyPanel
    );
    polyLeaf.position.y = doorH * 0.5;
    polyLeaf.receiveShadow = true;
    bayGrp.add(polyLeaf);

    // 6 Vertical Brushed-Aluminum Structural Mullions per Bay (exact ref_3.jpg look!)
    const leaves = 6;
    for (let i = 0; i <= leaves; i++) {
      const zLocal = -bayW * 0.5 + (i / leaves) * bayW;
      const mullion = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, doorH, 0.075),
        mats.brushedAlum
      );
      mullion.position.set(-0.02, doorH * 0.5, zLocal);
      mullion.castShadow = true;
      bayGrp.add(mullion);
    }

    // Horizontal Transom Bars at y = 3.2m, 6.5m, 9.7m
    for (const ty of [0.12, 3.25, 6.5, doorH - 0.08]) {
      const transom = new THREE.Mesh(
        new THREE.BoxGeometry(0.20, 0.085, bayW),
        mats.brushedAlum
      );
      transom.position.set(-0.02, ty, 0);
      bayGrp.add(transom);
    }

    // Pedestrian Pass-Door inset at bottom center of each Hangar Bay
    const passFrame = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 2.35, 1.35),
      mats.steelDark
    );
    passFrame.position.set(-0.04, 1.18, 0);
    bayGrp.add(passFrame);

    const passGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(1.08, 1.95),
      new THREE.MeshStandardMaterial({
        color: 0x10161e,
        roughness: 0.16,
        metalness: 0.85,
      })
    );
    passGlass.position.set(-0.165, 1.22, 0);
    passGlass.rotation.y = -Math.PI / 2;
    bayGrp.add(passGlass);

    // Authentic PBR-Lit Bay Number & Entry Stencil ("10-1", "10-2 入口", "10-3 出口")
    const signTex = createBaySignageTexture(bay.num, bay.sub);
    const signPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 1.95),
      new THREE.MeshStandardMaterial({
        map: signTex,
        roughness: 0.62,
        metalness: 0.05,
        transparent: true,
        depthWrite: false,
      })
    );
    signPlane.userData.noAO = true;
    signPlane.position.set(-0.18, 3.45, 0);
    signPlane.rotation.y = -Math.PI / 2;
    bayGrp.add(signPlane);
  }

  // Heavy Architectural Pier Pilasters between Bays (z = -18.8, -6.3, +6.3, +18.8)
  for (const zp of [-18.7, -6.3, 6.3, 18.7]) {
    const pier = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, H, 0.72),
      mats.fasciaWhite
    );
    pier.position.set(portWallX - 0.22, H * 0.5, zp);
    pier.castShadow = true;
    pier.receiveShadow = true;
    root.add(pier);
  }

  // Overhanging Upper Mezzanine Observation Gallery above Port Hangar Doors (exact ref_3.jpg top gallery!)
  const galleryDeck = new THREE.Mesh(
    new THREE.BoxGeometry(1.65, 0.36, D),
    mats.fasciaWhite
  );
  galleryDeck.position.set(portWallX - 0.82, 10.05, 0);
  galleryDeck.castShadow = true;
  root.add(galleryDeck);

  // Glass Balustrade + Brushed Aluminum Top Handrail along Mezzanine Gallery
  const glassRail = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, 1.05, D - 1.2),
    mats.balustradeGlass
  );
  glassRail.userData.noAO = true;
  glassRail.position.set(portWallX - 1.56, 10.75, 0);
  root.add(glassRail);

  const handrail = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.05, D - 1.0),
    mats.brushedAlum
  );
  handrail.position.set(portWallX - 1.56, 11.3, 0);
  root.add(handrail);

  for (let zr = -17.5; zr <= 17.5; zr += 2.5) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 1.1, 0.04),
      mats.brushedAlum
    );
    post.position.set(portWallX - 1.56, 10.75, zr);
    root.add(post);
  }

  // "腾 | 盾 | 科 | 创" Architectural Banner on Upper Gallery Wall
  const fasciaBanner = new THREE.Mesh(
    new THREE.PlaneGeometry(8.6, 1.35),
    new THREE.MeshBasicMaterial({ map: createFasciaBannerTexture() })
  );
  fasciaBanner.userData.noAO = true;
  fasciaBanner.position.set(portWallX - 0.25, 11.25, 0.0);
  fasciaBanner.rotation.y = -Math.PI / 2;
  root.add(fasciaBanner);

  // ============================================================================
  // 3. STARBOARD, REAR & PARTIALLY-OPEN FORWARD WALLS + WIDE-FLANGE H-COLUMNS
  // ============================================================================
  // Starboard Wall (x = -19m): Concrete Dado + Ribbed Acoustic Cladding + Clerestory Daylighting Band
  const stbdX = -W * 0.5;
  const stbdDado = new THREE.Mesh(new THREE.BoxGeometry(0.38, 1.65, D), mats.concreteDado);
  stbdDado.position.set(stbdX + 0.19, 0.825, 0);
  stbdDado.receiveShadow = true;
  root.add(stbdDado);

  const stbdMidWall = new THREE.Mesh(new THREE.PlaneGeometry(D, 6.75), mats.ribbedCladding);
  stbdMidWall.position.set(stbdX + 0.05, 1.65 + 3.375, 0);
  stbdMidWall.rotation.y = Math.PI / 2;
  stbdMidWall.receiveShadow = true;
  root.add(stbdMidWall);

  const stbdClerestory = new THREE.Mesh(new THREE.PlaneGeometry(D - 1.2, 3.2), mats.clerestoryGlass);
  stbdClerestory.position.set(stbdX + 0.08, 10.05, 0);
  stbdClerestory.rotation.y = Math.PI / 2;
  root.add(stbdClerestory);

  for (let zm = -17.0; zm <= 17.0; zm += 2.0) {
    const mul = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.3, 0.06), mats.steelDark);
    mul.position.set(stbdX + 0.12, 10.05, zm);
    root.add(mul);
  }

  // Rear Wall (z = -19m): Concrete Dado + Ribbed Acoustic Steel + Upper Clerestory Window Band + Steel Catwalk
  const rearZ = -D * 0.5;
  const rearDado = new THREE.Mesh(new THREE.BoxGeometry(W, 1.65, 0.38), mats.concreteDado);
  rearDado.position.set(0, 0.825, rearZ + 0.19);
  rearDado.receiveShadow = true;
  root.add(rearDado);

  const rearMidWall = new THREE.Mesh(new THREE.PlaneGeometry(W, 6.85), mats.ribbedCladding);
  rearMidWall.position.set(0, 1.65 + 3.425, rearZ + 0.06);
  rearMidWall.receiveShadow = true;
  root.add(rearMidWall);

  const rearClerestory = new THREE.Mesh(new THREE.PlaneGeometry(W - 1.6, 3.2), mats.clerestoryGlass);
  rearClerestory.position.set(0, 10.1, rearZ + 0.08);
  root.add(rearClerestory);

  for (let xm = -17.0; xm <= 17.0; xm += 2.0) {
    const mul = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.3, 0.12), mats.steelDark);
    mul.position.set(xm, 10.1, rearZ + 0.12);
    root.add(mul);
  }

  // Rear Structural Inspection Catwalk at y = 4.6m
  const rearCatwalk = new THREE.Mesh(new THREE.BoxGeometry(24.0, 0.14, 1.25), mats.steelSlate);
  rearCatwalk.position.set(-2.0, 4.6, rearZ + 0.82);
  rearCatwalk.castShadow = true;
  root.add(rearCatwalk);

  const rearCatwalkRail = new THREE.Mesh(new THREE.BoxGeometry(24.0, 0.045, 0.045), mats.brushedAlum);
  rearCatwalkRail.position.set(-2.0, 5.62, rearZ + 1.42);
  root.add(rearCatwalkRail);

  for (let xc = -13.5; xc <= 9.5; xc += 2.3) {
    const rPost = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.05, 0.04), mats.steelSlate);
    rPost.position.set(xc, 5.12, rearZ + 1.42);
    root.add(rPost);
  }

  // Structural Rear-Wall Steel Wind X-Bracing Rods & Galvanized Electrical Conduits
  for (const xb of [-12.0, -4.0, 4.0, 12.0]) {
    const rodLen = Math.hypot(6.6, 6.2);
    const rodAng = Math.atan2(6.6, 6.2);
    for (const sgn of [-1, 1]) {
      const rod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.022, rodLen, 8),
        mats.steelSlate
      );
      rod.position.set(xb, 5.05, rearZ + 0.16);
      rod.rotation.z = sgn * rodAng;
      root.add(rod);
    }
    const conduit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.032, 8.2, 10),
      mats.galvanized
    );
    conduit.position.set(xb + 3.4, 4.2, rearZ + 0.24);
    root.add(conduit);
  }

  // Restrained Architectural Hangar Bay Status LED Display beneath Rear Catwalk
  const boardFrame = new THREE.Mesh(
    new RoundedBoxGeometry(6.6, 1.08, 0.14, 2, 0.02),
    mats.steelDark
  );
  boardFrame.position.set(-2.2, 6.75, rearZ + 0.24);
  root.add(boardFrame);

  const boardFace = new THREE.Mesh(
    new THREE.PlaneGeometry(6.36, 0.96),
    new THREE.MeshBasicMaterial({ map: createBayStatusBoardTexture() })
  );
  boardFace.userData.noAO = true;
  boardFace.position.set(-2.2, 6.75, rearZ + 0.32);
  root.add(boardFace);

  // Recessed Muted-Crimson Aviation Fire Hose & Safety Cabinet on Rear Dado Wall
  const fireCabinetMat = new THREE.MeshStandardMaterial({
    color: 0x8a2224,
    roughness: 0.42,
    metalness: 0.32,
  });
  const fireCab = new THREE.Mesh(
    new RoundedBoxGeometry(0.92, 1.24, 0.24, 2, 0.015),
    fireCabinetMat
  );
  fireCab.position.set(-10.6, 1.32, rearZ + 0.34);
  fireCab.castShadow = true;
  root.add(fireCab);

  // Partially Open Monumental Forward Sliding Hangar Doors (z = +19m) + Exterior Airfield Backdrop
  const fwdZ = D * 0.5;
  const openGapHalf = 2.45; // 4.9m open airfield doorway!
  const doorLeafW = W * 0.5 - openGapHalf;

  for (const side of [-1, 1]) {
    const leafCenterX = side * (openGapHalf + doorLeafW * 0.5);
    const leafGrp = new THREE.Group();
    leafGrp.position.set(leafCenterX, 0, fwdZ - 0.22);
    root.add(leafGrp);

    const leafBody = new THREE.Mesh(
      new THREE.BoxGeometry(doorLeafW, 10.4, 0.44),
      mats.ribbedCladding
    );
    leafBody.position.y = 5.2;
    leafBody.castShadow = true;
    leafBody.receiveShadow = true;
    leafGrp.add(leafBody);

    // Upper translucent glazed vision band in sliding hangar door
    const visionBand = new THREE.Mesh(
      new THREE.BoxGeometry(doorLeafW - 0.8, 2.2, 0.48),
      mats.translucentPolyPanel
    );
    visionBand.position.y = 8.1;
    leafGrp.add(visionBand);

    // Heavy Structural Steel Door Edge Jamb & Horizontal Wind Girts
    const edgeJamb = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 10.4, 0.54),
      mats.steelDark
    );
    edgeJamb.position.set(-side * (doorLeafW * 0.5 - 0.14), 5.2, 0);
    leafGrp.add(edgeJamb);

    for (const gy of [2.4, 5.2, 9.8]) {
      const girt = new THREE.Mesh(
        new THREE.BoxGeometry(doorLeafW, 0.16, 0.52),
        mats.steelSlate
      );
      girt.position.y = gy;
      leafGrp.add(girt);
    }
  }

  // Continuous Header Box Truss above Forward Sliding Doors
  const fwdHeader = new THREE.Mesh(
    new THREE.BoxGeometry(W, 2.5, 0.65),
    mats.steelDark
  );
  fwdHeader.position.set(0, 11.45, fwdZ - 0.22);
  root.add(fwdHeader);

  // Exterior Airfield Tarmac & Sky Backdrop outside Open Doorway (z = +25.5m)
  const extTextures = {
    daylight: createExteriorAirfieldTexture('daylight'),
    dusk: createExteriorAirfieldTexture('dusk'),
    inspection: createExteriorAirfieldTexture('inspection'),
  };
  const exteriorBackdropMat = new THREE.MeshBasicMaterial({ map: extTextures.daylight });
  const exteriorBackdrop = new THREE.Mesh(new THREE.PlaneGeometry(24, 15), exteriorBackdropMat);
  exteriorBackdrop.position.set(0, 6.2, fwdZ + 6.5);
  exteriorBackdrop.rotation.y = Math.PI;
  exteriorBackdrop.userData.noAO = true;
  root.add(exteriorBackdrop);

  // Subtle Volumetric Daylight Shaft entering from Open Hangar Door
  const doorShaftMat = createVolumetricShaftMaterial(0xfff2de, 0.052);
  const doorShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 4.4, 18.0, 28, 1, true),
    doorShaftMat
  );
  doorShaft.position.set(0, 4.5, 10.2);
  doorShaft.rotation.x = -1.18;
  doorShaft.userData.noAO = true;
  root.add(doorShaft);

  // ============================================================================
  // 4. TRUE WIDE-FLANGE H-COLUMNS, WARREN SPACE-TRUSS ROOF & BRIDGE CRANE
  // ============================================================================
  const zBays = [-16.5, -11.0, -5.5, 0.0, 5.5, 11.0, 16.5];

  // Build True Wide-Flange H-Column Geometry Helper
  function addWideFlangeColumn(xPos, zPos) {
    const colGrp = new THREE.Group();
    colGrp.position.set(xPos, 0, zPos);

    // Chamfered concrete footing plinth + bolted steel baseplate
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(0.76, 0.52, 0.84),
      mats.concreteDado
    );
    plinth.position.y = 0.26;
    plinth.receiveShadow = true;
    colGrp.add(plinth);

    const basePlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.036, 0.70),
      mats.steelDark
    );
    basePlate.position.y = 0.538;
    colGrp.add(basePlate);

    const shaftH = H - 0.54;
    const shaftY = 0.54 + shaftH * 0.5;

    // Web + Inner/Outer Flanges (authentic H-section steel!)
    const web = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, shaftH, 0.032),
      mats.steelDark
    );
    web.position.y = shaftY;
    web.castShadow = true;
    colGrp.add(web);

    for (const fx of [-0.25, 0.25]) {
      const flange = new THREE.Mesh(
        new THREE.BoxGeometry(0.038, shaftH, 0.36),
        mats.steelSlate
      );
      flange.position.set(fx, shaftY, 0);
      flange.castShadow = true;
      flange.receiveShadow = true;
      colGrp.add(flange);
    }

    // Horizontal web stiffener plates every 2.4m
    for (const sy of [2.6, 5.0, 7.4, 9.8]) {
      const stiff = new THREE.Mesh(
        new THREE.BoxGeometry(0.48, 0.024, 0.32),
        mats.steelSlate
      );
      stiff.position.y = sy;
      colGrp.add(stiff);
    }

    root.add(colGrp);
    addContactShadow(xPos, zPos, 1.15, 1.2, 0.55);
  }

  // Roof Decking Overhead
  const roofCeiling = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({
      color: 0x1b2026,
      normalMap: ribTex.normalMap,
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughness: 0.72,
      metalness: 0.45,
    })
  );
  roofCeiling.position.set(0, H + 1.35, 0);
  roofCeiling.rotation.x = Math.PI / 2;
  root.add(roofCeiling);

  // 7 Span-Wide Triangulated Warren Roof Trusses
  const trussLowerY = H - 0.15;
  const trussUpperY = H + 1.05;
  const trussMidY = (trussLowerY + trussUpperY) * 0.5;
  const trussDepth = trussUpperY - trussLowerY;

  for (const zf of zBays) {
    addWideFlangeColumn(-W * 0.5 + 0.58, zf);

    // Lower & Upper Horizontal Steel Chords
    const lowerChord = new THREE.Mesh(
      new THREE.BoxGeometry(W - 0.8, 0.18, 0.18),
      mats.steelDark
    );
    lowerChord.position.set(0, trussLowerY, zf);
    root.add(lowerChord);

    const upperChord = new THREE.Mesh(
      new THREE.BoxGeometry(W - 0.8, 0.20, 0.20),
      mats.steelSlate
    );
    upperChord.position.set(0, trussUpperY, zf);
    root.add(upperChord);

    // 14 Triangulated Diagonal Web Struts + Vertical Nodes across the 38m Span!
    const panels = 14;
    const spanW = W - 1.6;
    const panelW = spanW / panels;
    const diagLen = Math.hypot(panelW, trussDepth);
    const diagAngle = Math.atan2(trussDepth, panelW);

    for (let p = 0; p < panels; p++) {
      const xStart = -spanW * 0.5 + p * panelW;
      const xMid = xStart + panelW * 0.5;
      const sign = p % 2 === 0 ? 1 : -1;

      const diag = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.045, diagLen, 8),
        mats.steelSlate
      );
      diag.position.set(xMid, trussMidY, zf);
      diag.rotation.z = sign * (Math.PI * 0.5 - diagAngle);
      root.add(diag);

      const vPost = new THREE.Mesh(
        new THREE.CylinderGeometry(0.038, 0.038, trussDepth, 8),
        mats.steelDark
      );
      vPost.position.set(xStart, trussMidY, zf);
      root.add(vPost);
    }
  }

  // Longitudinal Roof Purlins & Spiral Galvanized HVAC Ducts
  for (const xp of [-13.5, -6.8, 0.0, 6.8, 13.5]) {
    const purlin = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.14, D),
      mats.steelDark
    );
    purlin.position.set(xp, trussUpperY + 0.12, 0);
    root.add(purlin);
  }

  for (const xd of [-15.2, 14.8]) {
    const hvacDuct = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.38, D - 1.0, 20),
      mats.galvanized
    );
    hvacDuct.rotation.x = Math.PI / 2;
    hvacDuct.position.set(xd, H - 0.58, 0);
    root.add(hvacDuct);
  }

  // Overhead Dual-Girder Industrial Bridge Crane (y = 10.45m, z = -3.8m)
  const craneGroup = new THREE.Group();
  craneGroup.position.set(0, 10.45, -3.8);
  root.add(craneGroup);

  // Runway I-beams along Starboard & Port columns
  for (const rx of [-W * 0.5 + 1.05, W * 0.5 - 1.85]) {
    const runway = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.36, D - 1.2),
      mats.steelSlate
    );
    runway.position.set(rx, 10.12, 0);
    root.add(runway);
  }

  const craneSpan = W - 3.1;
  for (const zOff of [-0.58, 0.58]) {
    const boxGirder = new THREE.Mesh(
      new THREE.BoxGeometry(craneSpan, 0.52, 0.30),
      mats.craneOchre
    );
    boxGirder.position.set(-0.4, 0, zOff);
    boxGirder.castShadow = true;
    craneGroup.add(boxGirder);
  }

  // Trolley Carriage + Dual Hoist Drums + Wire Ropes + Hook Block
  const trolleyGroup = new THREE.Group();
  trolleyGroup.position.set(-4.6, 0.34, 0);
  craneGroup.add(trolleyGroup);

  const trolleyFrame = new THREE.Mesh(
    new THREE.BoxGeometry(1.85, 0.34, 1.48),
    mats.steelDark
  );
  trolleyGroup.add(trolleyFrame);

  const hoistDrum = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 0.96, 18),
    mats.steelSlate
  );
  hoistDrum.rotation.x = Math.PI / 2;
  hoistDrum.position.y = 0.22;
  trolleyGroup.add(hoistDrum);

  for (const cOff of [-0.16, 0.16]) {
    const wire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 2.35, 8),
      mats.galvanized
    );
    wire.position.set(cOff, -1.25, 0);
    trolleyGroup.add(wire);
  }

  const sheaveBlock = new THREE.Mesh(
    new RoundedBoxGeometry(0.46, 0.38, 0.24, 3, 0.03),
    mats.craneOchre
  );
  sheaveBlock.position.set(0, -2.48, 0);
  trolleyGroup.add(sheaveBlock);

  const forgedHook = new THREE.Mesh(
    new THREE.TorusGeometry(0.11, 0.028, 10, 20, Math.PI * 1.45),
    mats.steelDark
  );
  forgedHook.position.set(0, -2.76, 0);
  forgedHook.rotation.z = Math.PI * 0.85;
  trolleyGroup.add(forgedHook);

  // ============================================================================
  // 5. HIGH-DETAIL AEROSPACE GROUND SUPPORT EQUIPMENT (ZERO PRIMITIVE BOXES!)
  // ============================================================================

  // --- 5A. Zhuhai Multi-Tier Static Munitions Showcase Row + TENGDEN Plinth ---
  const showcaseRow = buildOrdnanceShowcaseRow(createOrdnanceMaterials());
  showcaseRow.position.set(-2.18, 0, 4.32);
  root.add(showcaseRow);

  // Ground contact shadows right beneath each showcase munition cradle (completely unobstructed!)
  for (const xOff of [0.0, -0.52, -1.06, -1.58, -2.06]) {
    addContactShadow(-2.18 + xOff, 4.32, 0.56, 1.35, 0.66);
  }

  // --- 5B. Aerospace Aluminum-Trimmed Avionics & Missile Flight Cases (ref_3.jpg background!) ---
  function buildFlightCase(len, wid, hgt, withBlueCover = false) {
    const fc = new THREE.Group();
    const wheelR = 0.055;
    const bodyY = wheelR * 2 + hgt * 0.5;

    const box = new THREE.Mesh(
      new RoundedBoxGeometry(wid, hgt, len, 3, 0.018),
      mats.flightCaseBlack
    );
    box.position.y = bodyY;
    box.castShadow = true;
    box.receiveShadow = true;
    fc.add(box);

    // Silver brushed-aluminum edge extrusions + lid split band
    const trimT = 0.022;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const longEdge = new THREE.Mesh(
          new THREE.BoxGeometry(trimT, trimT, len + 0.006),
          mats.brushedAlum
        );
        longEdge.position.set(sx * (wid * 0.5), bodyY + sy * (hgt * 0.5), 0);
        fc.add(longEdge);
      }
      const lidSplit = new THREE.Mesh(
        new THREE.BoxGeometry(0.008, 0.026, len + 0.008),
        mats.brushedAlum
      );
      lidSplit.position.set(sx * (wid * 0.5 + 0.002), bodyY + hgt * 0.22, 0);
      fc.add(lidSplit);

      // Recessed butterfly latches along side
      const latchCount = len > 2.0 ? 3 : 2;
      for (let li = 0; li < latchCount; li++) {
        const lz = -len * 0.32 + (li / Math.max(1, latchCount - 1)) * (len * 0.64);
        const latch = new THREE.Mesh(
          new THREE.BoxGeometry(0.012, 0.095, 0.085),
          mats.brushedAlum
        );
        latch.position.set(sx * (wid * 0.5 + 0.003), bodyY + hgt * 0.22, lz);
        fc.add(latch);
      }
    }

    for (const sz of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const crossEdge = new THREE.Mesh(
          new THREE.BoxGeometry(wid + 0.006, trimT, trimT),
          mats.brushedAlum
        );
        crossEdge.position.set(0, bodyY + sy * (hgt * 0.5), sz * (len * 0.5));
        fc.add(crossEdge);
      }
      for (const sx of [-1, 1]) {
        const vertEdge = new THREE.Mesh(
          new THREE.BoxGeometry(trimT, hgt + 0.006, trimT),
          mats.brushedAlum
        );
        vertEdge.position.set(sx * (wid * 0.5), bodyY, sz * (len * 0.5));
        fc.add(vertEdge);

        // Chrome ball corner guard
        const ball = new THREE.Mesh(
          new THREE.SphereGeometry(0.024, 10, 8),
          mats.brushedAlum
        );
        ball.position.set(sx * (wid * 0.5), bodyY + hgt * 0.5, sz * (len * 0.5));
        fc.add(ball);

        // Heavy swivel caster wheel
        const caster = new THREE.Mesh(
          new THREE.CylinderGeometry(wheelR, wheelR, 0.036, 14),
          mats.tireRubber
        );
        caster.rotation.z = Math.PI / 2;
        caster.position.set(sx * (wid * 0.5 - 0.08), wheelR, sz * (len * 0.5 - 0.12));
        fc.add(caster);
      }
    }

    if (withBlueCover) {
      const cap = new THREE.Mesh(
        new RoundedBoxGeometry(wid + 0.04, 0.14, len + 0.04, 3, 0.03),
        mats.coverCobalt
      );
      cap.position.y = bodyY + hgt * 0.5 + 0.04;
      cap.castShadow = true;
      fc.add(cap);
    }

    return fc;
  }

  // Place Flight Cases cleanly in background apron (echoing ref_3.jpg left-background!)
  const casePlacements = [
    { x: -7.4, z: -5.4, len: 2.85, wid: 0.72, hgt: 0.56, rotY: Math.PI / 2, blue: false },
    { x: -4.35, z: -5.4, len: 2.85, wid: 0.72, hgt: 0.56, rotY: Math.PI / 2, blue: false },
    { x: -9.65, z: -5.1, len: 1.18, wid: 0.92, hgt: 0.86, rotY: 0.08, blue: true },
    { x: 7.2, z: -5.6, len: 2.65, wid: 0.70, hgt: 0.58, rotY: Math.PI / 2 - 0.06, blue: false },
  ];
  for (const cp of casePlacements) {
    const fc = buildFlightCase(cp.len, cp.wid, cp.hgt, cp.blue);
    fc.position.set(cp.x, 0, cp.z);
    fc.rotation.y = cp.rotY;
    root.add(fc);
    addContactShadow(cp.x, cp.z, cp.len + 0.45, cp.wid + 0.45, 0.68, cp.rotY);
  }

  // --- 5C. Sculpted 28V Aerospace Ground Power Unit (GPU) & Coiled Umbilical Cable ---
  const gpuGroup = new THREE.Group();
  gpuGroup.position.set(3.95, 0, 4.65);
  gpuGroup.rotation.y = -0.54;
  root.add(gpuGroup);
  addContactShadow(3.95, 4.65, 1.65, 2.55, 0.76, -0.54);

  // Welded dark steel lower chassis frame + rubber bumpers
  const gpuChassis = new THREE.Mesh(
    new RoundedBoxGeometry(1.14, 0.16, 1.98, 3, 0.025),
    mats.gseAnthracite
  );
  gpuChassis.position.y = 0.28;
  gpuChassis.castShadow = true;
  gpuGroup.add(gpuChassis);

  // Sculpted satin slate-white acoustic generator canopy
  const gpuCanopy = new THREE.Mesh(
    new RoundedBoxGeometry(1.06, 0.76, 1.82, 4, 0.055),
    mats.gseSlateWhite
  );
  gpuCanopy.position.y = 0.72;
  gpuCanopy.castShadow = true;
  gpuCanopy.receiveShadow = true;
  gpuGroup.add(gpuCanopy);

  // Protective top rain hood with lift eye
  const gpuRoof = new THREE.Mesh(
    new RoundedBoxGeometry(1.12, 0.065, 1.88, 3, 0.02),
    mats.gseAnthracite
  );
  gpuRoof.position.y = 1.12;
  gpuGroup.add(gpuRoof);

  const liftEye = new THREE.Mesh(
    new THREE.TorusGeometry(0.055, 0.014, 10, 18),
    mats.steelSlate
  );
  liftEye.position.y = 1.18;
  gpuGroup.add(liftEye);

  // Recessed side acoustic cooling louver slats + service door latches
  for (const side of [-1, 1]) {
    const louverPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.018, 0.46, 0.74),
      mats.gseAnthracite
    );
    louverPlate.position.set(side * 0.528, 0.72, -0.36);
    gpuGroup.add(louverPlate);

    for (let li = 0; li < 7; li++) {
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(0.026, 0.018, 0.68),
        mats.steelSlate
      );
      slat.position.set(side * 0.535, 0.54 + li * 0.06, -0.36);
      slat.rotation.z = side * 0.25;
      gpuGroup.add(slat);
    }
  }

  // Recessed Diagnostic Instrument Panel (muted amber/warm-white OLED readout, zero neon cyan!)
  const panelRecess = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, 0.30, 0.44),
    mats.gseAnthracite
  );
  panelRecess.position.set(-0.525, 0.78, 0.44);
  gpuGroup.add(panelRecess);

  const oledReadout = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.14),
    new THREE.MeshBasicMaterial({ color: 0xd8b46a })
  );
  oledReadout.userData.noAO = true;
  oledReadout.position.set(-0.542, 0.82, 0.48);
  oledReadout.rotation.y = -Math.PI / 2;
  gpuGroup.add(oledReadout);

  // GPU Industrial Side Identification Plates, Brushed Grab Handles & Exhaust Stack Pipe
  const gpuStencilMat = new THREE.MeshStandardMaterial({
    map: createGpuStencilTexture(),
    roughness: 0.56,
    metalness: 0.12,
    transparent: true,
    depthWrite: false,
  });
  for (const side of [-1, 1]) {
    const stencil = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.38), gpuStencilMat);
    stencil.userData.noAO = true;
    stencil.position.set(side * 0.535, 0.72, 0.36);
    stencil.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    gpuGroup.add(stencil);

    const grab = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.42, 8),
      mats.brushedAlum
    );
    grab.position.set(side * 0.555, 0.80, 0.82);
    gpuGroup.add(grab);
  }

  const gpuExhaust = new THREE.Mesh(
    new THREE.CylinderGeometry(0.036, 0.040, 0.34, 14),
    mats.steelDark
  );
  gpuExhaust.position.set(0.28, 1.30, -0.56);
  gpuGroup.add(gpuExhaust);

  const exhaustCap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.046, 0.046, 0.016, 14),
    mats.brushedAlum
  );
  exhaustCap.position.set(0.28, 1.48, -0.56);
  exhaustCap.rotation.z = 0.25;
  gpuGroup.add(exhaustCap);

  // 4 Pneumatic Rubber GSE Tires + Brushed Aluminum 6-Lug Hubs
  for (const wx of [-0.54, 0.54]) {
    for (const wz of [-0.66, 0.66]) {
      const tire = new THREE.Mesh(
        new THREE.CylinderGeometry(0.20, 0.20, 0.13, 24),
        mats.tireRubber
      );
      tire.rotation.z = Math.PI / 2;
      tire.position.set(wx, 0.20, wz);
      tire.castShadow = true;
      gpuGroup.add(tire);

      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.105, 0.105, 0.138, 18),
        mats.brushedAlum
      );
      hub.rotation.z = Math.PI / 2;
      hub.position.set(wx, 0.20, wz);
      gpuGroup.add(hub);
    }
  }

  // A-Frame Tow Drawbar & Lunette Hitch Ring
  for (const tx of [-0.18, 0.18]) {
    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.88, 10),
      mats.gseAnthracite
    );
    bar.rotation.x = Math.PI / 2 - 0.18;
    bar.rotation.z = tx * 0.42;
    bar.position.set(tx * 0.55, 0.18, -1.32);
    gpuGroup.add(bar);
  }
  const towRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.065, 0.016, 10, 20),
    mats.safetyBumperAmber
  );
  towRing.rotation.x = Math.PI / 2;
  towRing.position.set(0, 0.10, -1.74);
  gpuGroup.add(towRing);

  // Heavy Umbilical 28VDC Power Cable + Low-Profile Rubber/Amber Floor Cable-Protector Ramp
  const powerCableCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(3.45, 0.42, 4.35),
    new THREE.Vector3(2.85, 0.026, 4.05),
    new THREE.Vector3(1.92, 0.026, 3.68),
    new THREE.Vector3(1.02, 0.026, 3.16),
    new THREE.Vector3(0.56, 0.45, 2.82),
    new THREE.Vector3(0.49, 1.24, 2.75),
  ]);
  const powerCableMesh = new THREE.Mesh(
    new THREE.TubeGeometry(powerCableCurve, 48, 0.024, 10, false),
    mats.tireRubber
  );
  powerCableMesh.castShadow = true;
  root.add(powerCableMesh);

  const cableRampGrp = new THREE.Group();
  cableRampGrp.position.set(2.15, 0, 3.76);
  cableRampGrp.rotation.y = 0.42;
  const rampBase = new THREE.Mesh(
    new RoundedBoxGeometry(0.92, 0.052, 0.34, 2, 0.012),
    mats.gseAnthracite
  );
  rampBase.position.y = 0.026;
  rampBase.receiveShadow = true;
  cableRampGrp.add(rampBase);

  const rampLid = new THREE.Mesh(
    new RoundedBoxGeometry(0.86, 0.016, 0.18, 2, 0.005),
    mats.safetyBumperAmber
  );
  rampLid.position.y = 0.056;
  cableRampGrp.add(rampLid);
  root.add(cableRampGrp);

  // --- 5E-0. Wheeled Aviation Flight-Line CO2 Fire Extinguisher Cart (beside ordnance cases) ---
  const extCart = new THREE.Group();
  extCart.position.set(-8.65, 0, -3.15);
  extCart.rotation.y = 0.55;
  root.add(extCart);
  addContactShadow(-8.65, -3.15, 0.85, 0.92, 0.62, 0.55);

  const extTank = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.155, 0.72, 10, 22),
    fireCabinetMat
  );
  extTank.position.set(0, 0.62, 0);
  extTank.rotation.x = -0.18;
  extTank.castShadow = true;
  extCart.add(extTank);

  const extValve = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.042, 0.14, 14),
    mats.brushedAlum
  );
  extValve.position.set(0, 1.14, -0.09);
  extCart.add(extValve);

  const extHorn = new THREE.Mesh(
    new THREE.ConeGeometry(0.068, 0.24, 16, 1, true),
    mats.gseAnthracite
  );
  extHorn.position.set(0.16, 0.84, 0.04);
  extHorn.rotation.z = -0.25;
  extCart.add(extHorn);

  for (const sx of [-0.22, 0.22]) {
    const extWheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19, 0.19, 0.05, 20),
      mats.tireRubber
    );
    extWheel.rotation.z = Math.PI / 2;
    extWheel.position.set(sx, 0.19, -0.10);
    extWheel.castShadow = true;
    extCart.add(extWheel);

    const extHub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.056, 14),
      mats.brushedAlum
    );
    extHub.rotation.z = Math.PI / 2;
    extHub.position.set(sx, 0.19, -0.10);
    extCart.add(extHub);

    const handleTube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.014, 1.18, 8),
      mats.steelDark
    );
    handleTube.position.set(sx * 0.78, 0.66, -0.18);
    handleTube.rotation.x = -0.18;
    extCart.add(handleTube);
  }
  const handleCross = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.014, 0.36, 8),
    mats.steelDark
  );
  handleCross.rotation.z = Math.PI / 2;
  handleCross.position.set(0, 1.24, -0.28);
  extCart.add(handleCross);

  // --- 5D. Tubular Aerospace Maintenance Workstand (机务登高维护梯) ---
  const standGrp = new THREE.Group();
  standGrp.position.set(5.45, 0, -2.15);
  standGrp.rotation.y = -Math.PI / 2 + 0.22;
  root.add(standGrp);
  addContactShadow(5.45, -2.15, 1.85, 2.45, 0.65, -Math.PI / 2 + 0.22);

  const deckH = 1.62;
  const platDeck = new THREE.Mesh(
    new RoundedBoxGeometry(1.18, 0.07, 1.28, 2, 0.015),
    mats.brushedAlum
  );
  platDeck.position.set(0, deckH, -0.42);
  platDeck.castShadow = true;
  standGrp.add(platDeck);

  // Protective padded amber bumper along aircraft-facing front edge
  const standBumper = new THREE.Mesh(
    new CylinderOrCapsuleBumper(1.22),
    mats.safetyBumperAmber
  );
  standBumper.position.set(0, deckH, -1.07);
  standGrp.add(standBumper);

  // Tubular aluminum support legs, diagonal K-braces & guardrails
  for (const lx of [-0.54, 0.54]) {
    for (const lz of [-0.98, 0.14]) {
      const vLeg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.026, 0.026, deckH, 10),
        mats.steelSlate
      );
      vLeg.position.set(lx, deckH * 0.5, lz);
      vLeg.castShadow = true;
      standGrp.add(vLeg);

      const sWheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.065, 0.04, 14),
        mats.tireRubber
      );
      sWheel.rotation.z = Math.PI / 2;
      sWheel.position.set(lx, 0.065, lz);
      standGrp.add(sWheel);
    }

    // Sloped stair stringer beams
    const stringer = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.09, 1.98),
      mats.steelSlate
    );
    stringer.position.set(lx, deckH * 0.5, 0.64);
    stringer.rotation.x = 0.72;
    standGrp.add(stringer);

    // Upper platform tubular safety handrails
    for (const ry of [deckH + 0.48, deckH + 0.96]) {
      const topRail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 1.24, 8),
        mats.safetyBumperAmber
      );
      topRail.rotation.x = Math.PI / 2;
      topRail.position.set(lx, ry, -0.42);
      standGrp.add(topRail);
    }

    for (const rz of [-1.02, 0.18]) {
      const rPost = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 0.98, 8),
        mats.safetyBumperAmber
      );
      rPost.position.set(lx, deckH + 0.49, rz);
      standGrp.add(rPost);
    }
  }

  for (let s = 0; s < 6; s++) {
    const tread = new THREE.Mesh(
      new THREE.BoxGeometry(1.04, 0.032, 0.24),
      mats.brushedAlum
    );
    tread.position.set(0, 0.24 + s * 0.24, 1.28 - s * 0.22);
    tread.castShadow = true;
    standGrp.add(tread);
  }

  // --- 5E. Tubular Apron Crowd/Safety Barriers along Background Perimeter (ref_3.jpg detail!) ---
  function addTubularBarrier(x, z, rotY, width = 2.2) {
    const bGrp = new THREE.Group();
    bGrp.position.set(x, 0, z);
    bGrp.rotation.y = rotY;

    const h = 0.96;
    const topBar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, width, 8),
      mats.fasciaWhite
    );
    topBar.rotation.z = Math.PI / 2;
    topBar.position.y = h;
    bGrp.add(topBar);

    const botBar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.016, width, 8),
      mats.fasciaWhite
    );
    botBar.rotation.z = Math.PI / 2;
    botBar.position.y = 0.22;
    bGrp.add(botBar);

    for (const sx of [-width * 0.5, width * 0.5]) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, h, 8),
        mats.fasciaWhite
      );
      leg.position.set(sx, h * 0.5, 0);
      bGrp.add(leg);

      const foot = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.025, 0.46),
        mats.steelDark
      );
      foot.position.set(sx, 0.012, 0);
      bGrp.add(foot);
    }

    for (let p = -4; p <= 4; p++) {
      const picket = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.008, h - 0.22, 6),
        mats.fasciaWhite
      );
      picket.position.set(p * (width / 10), 0.22 + (h - 0.22) * 0.5, 0);
      bGrp.add(picket);
    }

    root.add(bGrp);
  }

  for (const bz of [-8.8, -6.4, -4.0, -1.6, 0.8, 3.2]) {
    addTubularBarrier(14.2, bz, Math.PI / 2, 2.25);
  }

  // ============================================================================
  // 6. PHYSICAL RECT-AREA SOFTBOXES + 2K SHADOW KEY/RIM RIG
  // ============================================================================
  const overheadAreaLights = [];
  const softboxCoords = [
    [-4.6, 3.8],
    [4.6, 3.8],
    [-4.6, -3.8],
    [4.6, -3.8],
    [-11.2, 0.0],
    [11.2, 0.0],
  ];

  for (const [lx, lz] of softboxCoords) {
    // Suspended industrial high-bay luminaire housing
    const fixture = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 0.14, 0.92),
      mats.steelDark
    );
    fixture.position.set(lx, H - 0.42, lz);
    root.add(fixture);

    const diffuser = new THREE.Mesh(
      new THREE.PlaneGeometry(4.0, 0.78),
      mats.softboxEmissive
    );
    diffuser.rotation.x = Math.PI / 2;
    diffuser.position.set(lx, H - 0.495, lz);
    diffuser.userData.noAO = true;
    root.add(diffuser);

    // True physical Three.js RectAreaLight for authentic broad softbox speculars!
    const areaLight = new THREE.RectAreaLight(0xf4f8fc, 3.4, 4.0, 0.85);
    areaLight.position.set(lx, H - 0.52, lz);
    areaLight.lookAt(lx, 0, lz);
    root.add(areaLight);
    overheadAreaLights.push(areaLight);
  }

  // Balanced Hemisphere Sky/Concrete Bounce (kept moderate so GTAO & cast shadows retain crisp depth)
  const hemiLight = new THREE.HemisphereLight(0xdce6f2, 0x262a30, 0.62);
  root.add(hemiLight);

  // Primary Overhead-Starboard 2048x2048 Shadow Key Light
  const heroKeyLight = new THREE.SpotLight(0xf6f9fc, 108.0, 38.0, Math.PI * 0.44, 0.65, 1.18);
  heroKeyLight.position.set(-5.6, 11.4, 6.6);
  heroKeyLight.target.position.set(0.0, 1.15, 0.35);
  heroKeyLight.castShadow = true;
  heroKeyLight.shadow.mapSize.set(2048, 2048);
  heroKeyLight.shadow.camera.near = 2.5;
  heroKeyLight.shadow.camera.far = 28.0;
  heroKeyLight.shadow.bias = -0.00028;
  heroKeyLight.shadow.normalBias = 0.014;
  root.add(heroKeyLight);
  root.add(heroKeyLight.target);

  // Translucent Hangar Bay Skylight Wrap Fill from Port/Aft
  const baySkylightFill = new THREE.SpotLight(0xdce8f5, 76.0, 34.0, Math.PI * 0.46, 0.72, 1.25);
  baySkylightFill.position.set(8.5, 9.6, -5.8);
  baySkylightFill.target.position.set(-0.5, 1.6, -1.2);
  root.add(baySkylightFill);
  root.add(baySkylightFill.target);

  // Open Hangar Door Directional Daylight / Golden-Hour Rim Light (2048x2048 PCFSoft shadow)
  const doorRimLight = new THREE.DirectionalLight(0xfff2e0, 1.85);
  doorRimLight.position.set(1.2, 5.0, 21.0);
  doorRimLight.target.position.set(0, 1.3, -1.0);
  doorRimLight.castShadow = true;
  doorRimLight.shadow.mapSize.set(2048, 2048);
  doorRimLight.shadow.camera.left = -12.0;
  doorRimLight.shadow.camera.right = 12.0;
  doorRimLight.shadow.camera.top = 7.5;
  doorRimLight.shadow.camera.bottom = -2.0;
  doorRimLight.shadow.camera.near = 2.0;
  doorRimLight.shadow.camera.far = 36.0;
  doorRimLight.shadow.bias = -0.00035;
  doorRimLight.shadow.normalBias = 0.015;
  root.add(doorRimLight);
  root.add(doorRimLight.target);

  // Low-angle Underwing Ordnance Fill (reveals CNC dual-racks, sway braces & seeker domes cleanly)
  const underwingFill = new THREE.PointLight(0xd8e2ec, 4.8, 12.0, 1.45);
  underwingFill.position.set(-2.6, 0.62, 2.2);
  root.add(underwingFill);

  const underwingFillPort = new THREE.PointLight(0xd8e2ec, 4.2, 12.0, 1.45);
  underwingFillPort.position.set(2.6, 0.62, 2.2);
  root.add(underwingFillPort);

  // UAV Nose Strut Dual Taxi Headlight SpotLight projecting onto concrete apron
  const taxiFloorSpot = new THREE.SpotLight(0xf6faff, 16.0, 13.5, Math.PI * 0.20, 0.72, 1.4);
  taxiFloorSpot.position.set(0, 0.62, 3.16);
  taxiFloorSpot.target.position.set(0, 0.0, 9.8);
  root.add(taxiFloorSpot);
  root.add(taxiFloorSpot.target);

  // Subtle Floating Hangar Air Motes (very fine, non-distracting)
  const dustCount = 180;
  const dustPos = new Float32Array(dustCount * 3);
  const dustPhase = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 24;
    dustPos[i * 3 + 1] = 0.35 + Math.random() * 8.2;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 24;
    dustPhase[i] = Math.random() * Math.PI * 2;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({
    map: softGlowTex,
    color: 0xf4eee6,
    size: 0.055,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const dustPoints = new THREE.Points(dustGeo, dustMat);
  root.add(dustPoints);

  // ============================================================================
  // 7. LIGHTING ATMOSPHERE PRESETS ('daylight' | 'dusk' | 'inspection')
  // ============================================================================
  function setLightingAtmosphere(mode, scene) {
    if (mode === 'dusk') {
      scene.background.setHex(0x0b0f15);
      scene.fog.color.setHex(0x0e131b);
      scene.fog.density = 0.011;

      hemiLight.color.setHex(0x8fa8c8);
      hemiLight.groundColor.setHex(0x1b1f26);
      hemiLight.intensity = 0.46;

      heroKeyLight.color.setHex(0xdce8f8);
      heroKeyLight.intensity = 98.0;
      baySkylightFill.color.setHex(0x6e8cb0);
      baySkylightFill.intensity = 48.0;

      doorRimLight.color.setHex(0xffa44f);
      doorRimLight.intensity = 3.25;
      doorShaftMat.uniforms.uColor.value.setHex(0xffad58);
      doorShaftMat.uniforms.uOpacity.value = 0.095;

      for (const al of overheadAreaLights) {
        al.color.setHex(0xdde8f6);
        al.intensity = 2.2;
      }
      mats.softboxEmissive.color.setHex(0xdbe6f4);
      mats.translucentPolyPanel.emissive.setHex(0x526985);
      mats.translucentPolyPanel.emissiveIntensity = 0.22;
      mats.clerestoryGlass.emissive.setHex(0x6882a0);
      mats.clerestoryGlass.emissiveIntensity = 0.30;
      exteriorBackdropMat.map = extTextures.dusk;
      exteriorBackdropMat.needsUpdate = true;
      mirrorBaseMat.uniforms.uTint.value.setHex(0x58606b);
    } else if (mode === 'inspection') {
      scene.background.setHex(0x10151c);
      scene.fog.color.setHex(0x121820);
      scene.fog.density = 0.008;

      hemiLight.color.setHex(0xeaf2fa);
      hemiLight.groundColor.setHex(0x2d333b);
      hemiLight.intensity = 0.76;

      heroKeyLight.color.setHex(0xfafcff);
      heroKeyLight.intensity = 165.0;
      baySkylightFill.color.setHex(0xe8f1fa);
      baySkylightFill.intensity = 92.0;

      doorRimLight.color.setHex(0xd8e8f8);
      doorRimLight.intensity = 1.45;
      doorShaftMat.uniforms.uColor.value.setHex(0xd8ebff);
      doorShaftMat.uniforms.uOpacity.value = 0.038;

      for (const al of overheadAreaLights) {
        al.color.setHex(0xfafcff);
        al.intensity = 4.6;
      }
      mats.softboxEmissive.color.setHex(0xffffff);
      mats.translucentPolyPanel.emissive.setHex(0x8ea4bc);
      mats.translucentPolyPanel.emissiveIntensity = 0.26;
      mats.clerestoryGlass.emissive.setHex(0xa8bed6);
      mats.clerestoryGlass.emissiveIntensity = 0.38;
      exteriorBackdropMat.map = extTextures.inspection;
      exteriorBackdropMat.needsUpdate = true;
      mirrorBaseMat.uniforms.uTint.value.setHex(0x6c7682);
    } else {
      // 'daylight' — Default Natural Overcast Hangar Daylight (100% faithful to ref_3.jpg!)
      scene.background.setHex(0x141920);
      scene.fog.color.setHex(0x181e26);
      scene.fog.density = 0.0085;

      hemiLight.color.setHex(0xe2eaf2);
      hemiLight.groundColor.setHex(0x2c3036);
      hemiLight.intensity = 0.66;

      heroKeyLight.color.setHex(0xf7fafe);
      heroKeyLight.intensity = 108.0;
      baySkylightFill.color.setHex(0xdce8f4);
      baySkylightFill.intensity = 82.0;

      doorRimLight.color.setHex(0xfff1de);
      doorRimLight.intensity = 1.95;
      doorShaftMat.uniforms.uColor.value.setHex(0xfff2de);
      doorShaftMat.uniforms.uOpacity.value = 0.052;

      for (const al of overheadAreaLights) {
        al.color.setHex(0xf4f8fc);
        al.intensity = 3.4;
      }
      mats.softboxEmissive.color.setHex(0xf2f6fa);
      mats.translucentPolyPanel.emissive.setHex(0xa6b8ca);
      mats.translucentPolyPanel.emissiveIntensity = 0.36;
      mats.clerestoryGlass.emissive.setHex(0xc2d4e6);
      mats.clerestoryGlass.emissiveIntensity = 0.52;
      exteriorBackdropMat.map = extTextures.daylight;
      exteriorBackdropMat.needsUpdate = true;
      mirrorBaseMat.uniforms.uTint.value.setHex(0x646e78);
    }
  }

  // Explicit Pre-Pass Planar Reflection Renderer (zero nested MSAA FBO conflicts)
  const mirrorCamera = new THREE.PerspectiveCamera();
  mirrorCamera.matrixAutoUpdate = false;
  const mirrorScaleMat = new THREE.Matrix4().makeScale(1, -1, 1);
  const drawBufSize = new THREE.Vector2();

  function renderReflection(renderer, scene, camera) {
    renderer.getDrawingBufferSize(drawBufSize);
    mirrorBaseMat.uniforms.uDrawingBufferSize.value.copy(drawBufSize);

    camera.updateMatrixWorld();
    mirrorCamera.matrixWorld
      .copy(mirrorScaleMat)
      .multiply(camera.matrixWorld)
      .multiply(mirrorScaleMat);
    mirrorCamera.matrixWorldInverse.copy(mirrorCamera.matrixWorld).invert();
    mirrorCamera.projectionMatrix.copy(camera.projectionMatrix);
    mirrorCamera.projectionMatrixInverse.copy(camera.projectionMatrixInverse);

    mirrorBaseMesh.visible = false;
    epoxyFloor.visible = false;
    contactShadowGroup.visible = false;
    doorShaft.visible = false;
    dustPoints.visible = false;

    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(reflectionRT);
    renderer.clear();
    renderer.render(scene, mirrorCamera);
    renderer.setRenderTarget(prevTarget);

    mirrorBaseMesh.visible = true;
    epoxyFloor.visible = true;
    contactShadowGroup.visible = true;
    doorShaft.visible = true;
    dustPoints.visible = true;
  }

  function update(dt, elapsed, navLightsActive = true) {
    taxiFloorSpot.intensity = navLightsActive ? 16.0 : 0.0;

    const posAttr = dustGeo.attributes.position;
    for (let i = 0; i < dustCount; i++) {
      let y = posAttr.getY(i) + dt * 0.045;
      if (y > 8.5) y = 0.35;
      const x = posAttr.getX(i) + Math.sin(elapsed * 0.3 + dustPhase[i]) * dt * 0.025;
      posAttr.setXY(i, x, y);
    }
    posAttr.needsUpdate = true;
  }

  return {
    group: root,
    renderReflection,
    setLightingAtmosphere,
    update,
  };
}

function CylinderOrCapsuleBumper(length) {
  const geo = new THREE.CylinderGeometry(0.036, 0.036, length, 14);
  geo.rotateZ(Math.PI / 2);
  return geo;
}
