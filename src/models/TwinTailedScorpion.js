import * as THREE from 'three';
import {
  createFuselageLiveryTextures,
  createAirframePanelTextures,
  createAircraftMarkingsTexture,
  createBrushedMetalTextures,
  createRbfRibbonTexture,
  createSoftGlowTexture,
} from '../textures/ProceduralTextures.js';
import { buildMunitionsSystem, createOrdnanceMaterials } from './MunitionsSystem.js';

/**
 * Smooth Catmull-Rom longitudinal station upsampler for Class-A aerospace lofting
 * (completely eliminates polygonal banding along the curved Beluga SATCOM forehead & cowlings).
 */
function resampleStationsSmooth(stations, samplesPerSpan = 4) {
  if (stations.length < 3) return stations;
  const out = [];
  const catmull = (p0, p1, p2, p3, t) => {
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      0.5 *
      (2 * p1 +
        (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
    );
  };

  const n = stations.length;
  for (let i = 0; i < n - 1; i++) {
    const s0 = stations[Math.max(0, i - 1)];
    const s1 = stations[i];
    const s2 = stations[i + 1];
    const s3 = stations[Math.min(n - 1, i + 2)];
    const steps = i === n - 2 ? samplesPerSpan : samplesPerSpan;
    for (let k = 0; k < steps; k++) {
      const t = k / samplesPerSpan;
      const yTop = catmull(s0.yTop, s1.yTop, s2.yTop, s3.yTop, t);
      const yBot = catmull(s0.yBot, s1.yBot, s2.yBot, s3.yBot, t);
      const yc0 = s0.yChine !== undefined ? s0.yChine : (s0.yTop + s0.yBot) * 0.5;
      const yc1 = s1.yChine !== undefined ? s1.yChine : (s1.yTop + s1.yBot) * 0.5;
      const yc2 = s2.yChine !== undefined ? s2.yChine : (s2.yTop + s2.yBot) * 0.5;
      const yc3 = s3.yChine !== undefined ? s3.yChine : (s3.yTop + s3.yBot) * 0.5;
      const yChine = THREE.MathUtils.clamp(
        catmull(yc0, yc1, yc2, yc3, t),
        yBot + 0.004,
        yTop - 0.004
      );
      out.push({
        z: THREE.MathUtils.lerp(s1.z, s2.z, t),
        yTop,
        yBot,
        yChine,
        rx: Math.max(0.012, catmull(s0.rx, s1.rx, s2.rx, s3.rx, t)),
        expTop: THREE.MathUtils.lerp(s1.expTop ?? 0.92, s2.expTop ?? 0.92, t),
        expBot: THREE.MathUtils.lerp(s1.expBot ?? 0.78, s2.expBot ?? 0.78, t),
        chineSharpness: Math.max(
          0,
          THREE.MathUtils.lerp(s1.chineSharpness ?? 0, s2.chineSharpness ?? 0, t)
        ),
      });
    }
  }
  out.push(stations[n - 1]);
  return out;
}

/**
 * Builds a smooth aerodynamic teardrop canoe geometry for underwing flap-hinge fairings
 * (eliminating flat open cone bases visible during close-up pylon inspection).
 */
function buildTeardropFairingGeometry(length = 0.52, maxR = 0.036) {
  const pts = [];
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0 = rounded forward nose (+Z), 1 = tapered rear point (-Z)
    const r =
      t < 0.25
        ? maxR * Math.sin((t / 0.25) * Math.PI * 0.5)
        : maxR * Math.pow(1 - (t - 0.25) / 0.75, 1.25);
    pts.push(new THREE.Vector2(Math.max(0.001, r), (0.35 - t) * length));
  }
  const geo = new THREE.LatheGeometry(pts, 18);
  geo.rotateX(Math.PI / 2);
  return geo;
}

/**
 * Lofted Multi-Station Body Builder with explicit Lateral Chine Height (yChine)
 * so the upper dorsal SATCOM dome and flat-bottomed lower canoe hull match
 * real Tengden TB-001 cross-sections without oval sausage distortion.
 */
function buildChinedLoftedGeometry(stations, radialSegs = 64, uScale = 1, vScale = 1) {
  const smoothStations = resampleStationsSmooth(stations, 4);
  const ringCount = smoothStations.length;
  const cols = radialSegs + 1;
  const positions = new Float32Array(ringCount * cols * 3);
  const uvs = new Float32Array(ringCount * cols * 2);
  const indices = [];

  const zMax = smoothStations[0].z;
  const zMin = smoothStations[ringCount - 1].z;
  const zSpan = Math.max(0.001, zMax - zMin);

  for (let i = 0; i < ringCount; i++) {
    const st = smoothStations[i];
    const yChine = st.yChine !== undefined ? st.yChine : (st.yTop + st.yBot) * 0.5;
    const ryTop = Math.max(0.001, st.yTop - yChine);
    const ryBot = Math.max(0.001, yChine - st.yBot);
    const expTop = st.expTop || 0.92;
    const expBot = st.expBot || 0.78; // Flatter lower canoe hull
    const vCoord = ((zMax - st.z) / zSpan) * vScale;

    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const theta = u * Math.PI * 2; // 0 = dorsal (+Y), PI/2 = port (+X), PI = ventral (-Y), 3PI/2 = stbd (-X)
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);

      const isUpper = cosT >= 0;
      const exp = isUpper ? expTop : expBot;
      const shapedSin = Math.sign(sinT) * Math.pow(Math.abs(sinT), exp);
      const shapedCos = Math.sign(cosT) * Math.pow(Math.abs(cosT), exp);

      // Optional crisp chine pinch near horizontal midline (|cosT| ~ 0) on nose stations
      const chineBoost = st.chineSharpness
        ? 1.0 + st.chineSharpness * Math.pow(1.0 - Math.abs(cosT), 3.0)
        : 1.0;

      const x = shapedSin * st.rx * chineBoost;
      const y = yChine + (isUpper ? shapedCos * ryTop : shapedCos * ryBot);

      const idx = i * cols + j;
      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = st.z;

      uvs[idx * 2] = u * uScale;
      uvs[idx * 2 + 1] = vCoord;
    }
  }

  for (let i = 0; i < ringCount - 1; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * cols + j;
      const b = (i + 1) * cols + j;
      const c = (i + 1) * cols + (j + 1);
      const d = i * cols + (j + 1);
      // Outward-pointing right-handed winding (+Y on dorsal spine, +X on port, -X on starboard, -Y on belly)
      indices.push(a, d, b);
      indices.push(b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function sampleLaminarAirfoil(s, camber = 0.034, thickness = 0.14) {
  const yt =
    5 *
    thickness *
    (0.2969 * Math.sqrt(Math.max(0, s)) -
      0.126 * s -
      0.3516 * s * s +
      0.2843 * s * s * s -
      0.1015 * s * s * s * s);
  const p = 0.4;
  const yc =
    s < p
      ? (camber / (p * p)) * (2 * p * s - s * s)
      : (camber / ((1 - p) * (1 - p))) * (1 - 2 * p + 2 * p * s - s * s);
  return { yc, yt };
}

function buildLoftedWingGeometry(stations, profileSegs = 40, uSpanScale = 2.6) {
  const ptsPerRing = profileSegs * 2 + 1;
  const ringCount = stations.length;
  const positions = new Float32Array(ringCount * ptsPerRing * 3);
  const uvs = new Float32Array(ringCount * ptsPerRing * 2);
  const indices = [];

  const xStart = stations[0].x;
  const xEnd = stations[ringCount - 1].x;
  const xSpan = Math.max(0.001, Math.abs(xEnd - xStart));

  for (let i = 0; i < ringCount; i++) {
    const st = stations[i];
    const uCoord = (Math.abs(st.x - xStart) / xSpan) * uSpanScale;

    for (let j = 0; j < ptsPerRing; j++) {
      const frac = j / (ptsPerRing - 1); // 0..0.5 = Upper surface, 0.5..1.0 = Lower surface
      const isUpper = frac <= 0.5;
      const raw = isUpper ? (0.5 - frac) * 2 : (frac - 0.5) * 2;
      const s = 0.5 * (1 - Math.cos(raw * Math.PI));

      const { yc, yt } = sampleLaminarAirfoil(s, st.camber ?? 0.034, st.thicknessRatio ?? 0.14);
      const localY = (isUpper ? yc + yt : yc - yt) * st.chord;
      const localZ = st.zLE - s * st.chord;

      const zPivot = st.zLE - 0.25 * st.chord;
      const dz = localZ - zPivot;
      const tw = st.twist || 0;
      const rotY = localY * Math.cos(tw) + dz * Math.sin(tw);
      const rotZ = zPivot - localY * Math.sin(tw) + dz * Math.cos(tw);

      const idx = i * ptsPerRing + j;
      positions[idx * 3] = st.x;
      positions[idx * 3 + 1] = st.y + rotY;
      positions[idx * 3 + 2] = rotZ;

      uvs[idx * 2] = uCoord;
      uvs[idx * 2 + 1] = frac; // 0..0.5 upper, 0.5..1.0 lower -> enables counter-shaded wing paint!
    }
  }

  const positiveDir = xEnd >= xStart;
  for (let i = 0; i < ringCount - 1; i++) {
    for (let j = 0; j < ptsPerRing - 1; j++) {
      const a = i * ptsPerRing + j;
      const b = (i + 1) * ptsPerRing + j;
      const c = (i + 1) * ptsPerRing + (j + 1);
      const d = i * ptsPerRing + (j + 1);
      if (positiveDir) {
        indices.push(a, d, b);
        indices.push(b, d, c);
      } else {
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Counter-shaded Two-Tone Wing Albedo Texture (Upper Gull-Slate / Lower Dark Slate, ref_3.jpg!).
 */
function createCounterShadedWingAlbedo(scheme = 'airshow') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');

  // Canvas flipY=true: v in [0..0.5] (upper wing) maps to bottom half (y=256..512);
  // v in [0.5..1.0] (lower wing) maps to top half (y=0..256)!
  ctx.fillStyle = scheme === 'airshow' ? '#424a52' : '#4a535c'; // Lower wing dark tactical slate
  ctx.fillRect(0, 0, 512, 256);

  ctx.fillStyle = scheme === 'airshow' ? '#969fa8' : '#58626c'; // Upper wing cool gull-slate
  ctx.fillRect(0, 256, 512, 256);

  // Soft leading-edge wrap transition at y = 256
  const grad = ctx.createLinearGradient(0, 244, 0, 268);
  grad.addColorStop(0, scheme === 'airshow' ? '#424a52' : '#4a535c');
  grad.addColorStop(1, scheme === 'airshow' ? '#969fa8' : '#58626c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 244, 512, 24);

  // Subtle rib lines
  ctx.strokeStyle = 'rgba(20,24,28,0.20)';
  ctx.lineWidth = 1.2;
  for (let x = 64; x < 512; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Builds a high-detail aircraft wheel with sidewall bulge, grooved tread, multi-bolt rim & disc brake.
 */
function buildAircraftWheel(radius, width, mats) {
  const grp = new THREE.Group();
  const hw = width * 0.5;
  const rimR = radius * 0.52;

  const pts = [
    new THREE.Vector2(rimR, -hw * 0.78),
    new THREE.Vector2(radius * 0.82, -hw),
    new THREE.Vector2(radius * 0.96, -hw * 0.86),
    new THREE.Vector2(radius, -hw * 0.50),
    new THREE.Vector2(radius, hw * 0.50),
    new THREE.Vector2(radius * 0.96, hw * 0.86),
    new THREE.Vector2(radius * 0.82, hw),
    new THREE.Vector2(rimR, hw * 0.78),
  ];
  const tireGeo = new THREE.LatheGeometry(pts, 40);
  tireGeo.rotateZ(Math.PI / 2);
  const tire = new THREE.Mesh(tireGeo, mats.tireRubber);
  tire.castShadow = true;
  tire.receiveShadow = true;
  grp.add(tire);

  for (const xOff of [-hw * 0.26, 0, hw * 0.26]) {
    const groove = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.996, 0.0038, 8, 40),
      mats.cavityBlack
    );
    groove.rotation.y = Math.PI / 2;
    groove.position.x = xOff;
    grp.add(groove);
  }

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(rimR * 1.02, rimR * 1.02, width * 0.78, 28),
    mats.gearEnamelWhite
  );
  hub.rotation.z = Math.PI / 2;
  grp.add(hub);

  for (const side of [-1, 1]) {
    const hubCap = new THREE.Mesh(
      new THREE.CylinderGeometry(rimR * 0.44, rimR * 0.54, 0.026, 20),
      mats.cncDark
    );
    hubCap.rotation.z = Math.PI / 2;
    hubCap.position.x = side * (width * 0.40);
    grp.add(hubCap);

    for (let b = 0; b < 8; b++) {
      const ang = (b / 8) * Math.PI * 2;
      const bolt = new THREE.Mesh(
        new THREE.CylinderGeometry(0.007, 0.007, 0.016, 8),
        mats.brushedSilver
      );
      bolt.rotation.z = Math.PI / 2;
      bolt.position.set(
        side * (width * 0.39),
        Math.cos(ang) * rimR * 0.74,
        Math.sin(ang) * rimR * 0.74
      );
      grp.add(bolt);
    }
  }

  return grp;
}

/**
 * Builds the Polished Natural-Aluminum Spinner + 3-Blade Light-Silver Scimitar Propeller
 * seen directly on ref_3.jpg!
 */
function buildScimitarPropeller(bladeRadius, isPusher, mats) {
  const grp = new THREE.Group();

  const spinnerLen = 0.40;
  const sPts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const r = Math.pow(Math.sin((1 - t) * Math.PI * 0.5), 0.76) * 0.165;
    sPts.push(new THREE.Vector2(Math.max(0.002, r), t * spinnerLen));
  }
  const sGeo = new THREE.LatheGeometry(sPts, 32);
  sGeo.rotateX(isPusher ? -Math.PI / 2 : Math.PI / 2);
  const spinner = new THREE.Mesh(sGeo, mats.brushedSilver);
  spinner.castShadow = true;
  grp.add(spinner);

  // Dark CNC bulkhead seam ring behind spinner
  const backRing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.166, 0.166, 0.022, 32),
    mats.cncDark
  );
  backRing.rotation.x = Math.PI / 2;
  backRing.position.z = isPusher ? -0.01 : 0.01;
  grp.add(backRing);

  for (let i = 0; i < 3; i++) {
    const holder = new THREE.Group();
    holder.rotation.z = (i * Math.PI * 2) / 3;
    holder.position.z = isPusher ? -0.095 : 0.095;

    const cuff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.036, 0.14, 14),
      mats.cncDark
    );
    cuff.position.y = 0.14;
    holder.add(cuff);

    const bLen = bladeRadius - 0.15;
    const bShape = new THREE.Shape();
    bShape.moveTo(-0.034, 0);
    bShape.bezierCurveTo(-0.072, bLen * 0.28, -0.058, bLen * 0.72, -0.016, bLen);
    bShape.lineTo(0.018, bLen);
    bShape.bezierCurveTo(0.056, bLen * 0.68, 0.052, bLen * 0.28, 0.036, 0);
    bShape.closePath();

    const bGeo = new THREE.ExtrudeGeometry(bShape, {
      depth: 0.010,
      bevelEnabled: true,
      bevelThickness: 0.004,
      bevelSize: 0.004,
      bevelSegments: 2,
    });
    bGeo.translate(0, 0, -0.005);
    const blade = new THREE.Mesh(bGeo, mats.propSilverComposite);
    blade.position.y = 0.15;
    blade.rotation.y = isPusher ? -0.36 : 0.36;
    blade.castShadow = true;
    holder.add(blade);

    // Metallic nickel leading-edge erosion guard strip
    const guard = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, bLen * 0.82, 0.013),
      mats.brushedSilver
    );
    guard.position.set(-0.036, 0.15 + bLen * 0.44, 0);
    guard.rotation.y = isPusher ? -0.36 : 0.36;
    holder.add(guard);

    grp.add(holder);
  }

  // Realistic 3-blade streaked radial rotor motion-blur disc
  const blurC = document.createElement('canvas');
  blurC.width = 512;
  blurC.height = 512;
  const ctx = blurC.getContext('2d');
  ctx.translate(256, 256);
  const g = ctx.createRadialGradient(0, 0, 38, 0, 0, 248);
  g.addColorStop(0, 'rgba(185,195,205,0)');
  g.addColorStop(0.25, 'rgba(195,205,214,0.16)');
  g.addColorStop(0.84, 'rgba(180,192,202,0.12)');
  g.addColorStop(0.95, 'rgba(218,224,230,0.20)');
  g.addColorStop(1, 'rgba(185,195,205,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 248, 0, Math.PI * 2);
  ctx.fill();

  for (let b = 0; b < 3; b++) {
    const baseA = (b * Math.PI * 2) / 3;
    for (let s = 0; s < 12; s++) {
      const a0 = baseA + s * 0.055;
      const alpha = (1 - s / 12) * 0.14;
      ctx.fillStyle = `rgba(215, 224, 232, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 244, a0, a0 + 0.07);
      ctx.closePath();
      ctx.fill();
    }
  }

  const blurMat = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(blurC),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const blurDisc = new THREE.Mesh(new THREE.CircleGeometry(bladeRadius, 40), blurMat);
  blurDisc.userData.noAO = true;
  blurDisc.position.z = isPusher ? -0.095 : 0.095;
  grp.add(blurDisc);

  return { group: grp, blurMat };
}

/**
 * Builds the 100% photo-accurate Tengden TB-001A ("双尾蝎A" / TW328-A) UAV.
 */
export function buildTwinTailedScorpion() {
  const uavRoot = new THREE.Group();
  uavRoot.name = 'TB001A_TwinTailedScorpion';

  const fuselageAirshowTex = createFuselageLiveryTextures('airshow');
  const fuselageTacticalTex = createFuselageLiveryTextures('tactical');
  const darkAirframeTex = createAirframePanelTextures('#434b53', 2, 2);
  const gullCapTex = createAirframePanelTextures('#aeb6be', 1, 1);
  const brushed = createBrushedMetalTextures();
  const softGlowTex = createSoftGlowTexture();

  const wingAirshowAlbedo = createCounterShadedWingAlbedo('airshow');
  const wingTacticalAlbedo = createCounterShadedWingAlbedo('tactical');

  const mats = {
    // Matte polyurethane fuselage coating (ZERO plastic clearcoat!)
    fuselageSkin: new THREE.MeshStandardMaterial({
      map: fuselageAirshowTex.map,
      normalMap: fuselageAirshowTex.normalMap,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughnessMap: fuselageAirshowTex.roughnessMap,
      roughness: 0.72,
      metalness: 0.05,
    }),
    wingSkin: new THREE.MeshStandardMaterial({
      map: wingAirshowAlbedo,
      normalMap: darkAirframeTex.normalMap,
      normalScale: new THREE.Vector2(0.42, 0.42),
      roughnessMap: darkAirframeTex.roughnessMap,
      roughness: 0.70,
      metalness: 0.06,
    }),
    boomDarkSlate: new THREE.MeshStandardMaterial({
      map: darkAirframeTex.map,
      normalMap: darkAirframeTex.normalMap,
      normalScale: new THREE.Vector2(0.50, 0.50),
      roughnessMap: darkAirframeTex.roughnessMap,
      roughness: 0.68,
      metalness: 0.08,
    }),
    dielectricGullGray: new THREE.MeshStandardMaterial({
      map: gullCapTex.map,
      normalMap: gullCapTex.normalMap,
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughness: 0.72,
      metalness: 0.04,
    }),
    eoirBallGull: new THREE.MeshStandardMaterial({
      color: 0xc0c7ce, // Exact light gull-gray spherical EO/IR housing from ref_3.jpg!
      normalMap: gullCapTex.normalMap,
      normalScale: new THREE.Vector2(0.22, 0.22),
      roughness: 0.60,
      metalness: 0.10,
    }),
    brushedSilver: new THREE.MeshStandardMaterial({
      color: 0xdce2e8,
      normalMap: brushed.normalMap,
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughnessMap: brushed.roughnessMap,
      roughness: 0.24,
      metalness: 0.90,
    }),
    propSilverComposite: new THREE.MeshStandardMaterial({
      color: 0xc2cad2, // Sleek silver-gray composite blades from ref_3.jpg!
      roughness: 0.38,
      metalness: 0.32,
    }),
    chromeMirror: new THREE.MeshStandardMaterial({
      color: 0xf2f6fa,
      roughness: 0.05,
      metalness: 0.98,
    }),
    gearEnamelWhite: new THREE.MeshStandardMaterial({
      color: 0xe4e9ee, // Gloss aerospace white landing gear struts from ref_3.jpg!
      roughness: 0.28,
      metalness: 0.18,
    }),
    cncDark: new THREE.MeshStandardMaterial({
      color: 0x22272d,
      normalMap: brushed.normalMap,
      roughness: 0.36,
      metalness: 0.80,
    }),
    inconelExhaust: new THREE.MeshStandardMaterial({
      color: 0x5c4c42,
      roughness: 0.28,
      metalness: 0.90,
    }),
    gearBayPrimer: new THREE.MeshStandardMaterial({
      color: 0x262c32,
      roughness: 0.68,
      metalness: 0.25,
    }),
    tireRubber: new THREE.MeshStandardMaterial({
      color: 0x191c1f,
      roughness: 0.86,
      metalness: 0.04,
    }),
    chockRubberBlack: new THREE.MeshStandardMaterial({
      color: 0x15181b, // Black molded wheel chocks from ref_3.jpg!
      roughness: 0.82,
      metalness: 0.08,
    }),
    towJackRed: new THREE.MeshStandardMaterial({
      color: 0xb82424, // Red hydraulic ground-handling wheel jack frame from ref_3.jpg!
      roughness: 0.38,
      metalness: 0.45,
    }),
    cavityBlack: new THREE.MeshBasicMaterial({ color: 0x06080a }),
    opticalGermanium: new THREE.MeshPhysicalMaterial({
      color: 0x1e1610,
      roughness: 0.04,
      metalness: 0.32,
      ior: 1.85,
      reflectivity: 1.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
    }),
    opticalSapphire: new THREE.MeshPhysicalMaterial({
      color: 0x0e1a28,
      roughness: 0.03,
      metalness: 0.22,
      ior: 1.77,
      reflectivity: 1.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
    }),
    brassRing: new THREE.MeshStandardMaterial({
      color: 0xb68d4c,
      roughness: 0.24,
      metalness: 0.90,
    }),
    rbfRibbon: new THREE.MeshStandardMaterial({
      map: createRbfRibbonTexture(),
      roughness: 0.78,
      side: THREE.DoubleSide,
    }),
  };

  // ============================================================================
  // 1. CHINED CENTRAL FUSELAGE POD (Exact ref_3.jpg Beluga SATCOM Dome + Canoe Hull)
  // ============================================================================
  const fuselageStations = [
    { z: 4.56, yTop: 1.35, yBot: 1.32, yChine: 1.335, rx: 0.025, chineSharpness: 0.14 },
    { z: 4.48, yTop: 1.43, yBot: 1.26, yChine: 1.325, rx: 0.13, chineSharpness: 0.16 },
    { z: 4.30, yTop: 1.58, yBot: 1.19, yChine: 1.315, rx: 0.27, chineSharpness: 0.16 },
    { z: 4.02, yTop: 1.77, yBot: 1.13, yChine: 1.31, rx: 0.40, chineSharpness: 0.14 },
    { z: 3.65, yTop: 1.96, yBot: 1.10, yChine: 1.32, rx: 0.50, chineSharpness: 0.11 },
    { z: 3.20, yTop: 2.09, yBot: 1.09, yChine: 1.33, rx: 0.56, chineSharpness: 0.08 }, // Peak SATCOM forehead
    { z: 2.70, yTop: 2.12, yBot: 1.09, yChine: 1.35, rx: 0.58, chineSharpness: 0.05 },
    { z: 2.15, yTop: 2.07, yBot: 1.09, yChine: 1.37, rx: 0.57, chineSharpness: 0.03 },
    { z: 1.55, yTop: 1.98, yBot: 1.10, yChine: 1.40, rx: 0.54, chineSharpness: 0.0 }, // Sleek neck taper ahead of wing!
    { z: 0.95, yTop: 1.94, yBot: 1.12, yChine: 1.43, rx: 0.53, chineSharpness: 0.0 },
    { z: 0.35, yTop: 1.93, yBot: 1.14, yChine: 1.45, rx: 0.53, chineSharpness: 0.0 }, // High-wing center saddle
    { z: -0.30, yTop: 1.91, yBot: 1.19, yChine: 1.48, rx: 0.50, chineSharpness: 0.0 },
    { z: -0.90, yTop: 1.85, yBot: 1.29, yChine: 1.53, rx: 0.43, chineSharpness: 0.0 },
    { z: -1.42, yTop: 1.79, yBot: 1.40, yChine: 1.57, rx: 0.33, chineSharpness: 0.0 },
    { z: -1.78, yTop: 1.73, yBot: 1.49, yChine: 1.60, rx: 0.23, chineSharpness: 0.0 },
    { z: -1.96, yTop: 1.69, yBot: 1.53, yChine: 1.61, rx: 0.166, chineSharpness: 0.0 },
  ];

  const fuselageGeo = buildChinedLoftedGeometry(fuselageStations, 64, 1.0, 1.0);
  const fuselageMesh = new THREE.Mesh(fuselageGeo, mats.fuselageSkin);
  fuselageMesh.castShadow = true;
  fuselageMesh.receiveShadow = true;
  uavRoot.add(fuselageMesh);

  // Nose Tip Air-Data Pitot Probe (seen clearly in ref_2.jpg!)
  const nosePitotCollar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.020, 0.12, 12),
    mats.cncDark
  );
  nosePitotCollar.rotation.x = Math.PI / 2;
  nosePitotCollar.position.set(0, 1.335, 4.60);
  uavRoot.add(nosePitotCollar);

  const nosePitotTube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0045, 0.009, 0.44, 10),
    mats.brushedSilver
  );
  nosePitotTube.rotation.x = Math.PI / 2;
  nosePitotTube.position.set(0, 1.335, 4.84);
  uavRoot.add(nosePitotTube);

  // Exact cross-section evaluator so contoured side decals hug the fuselage skin at +3.5mm
  function evalFuselageHalfWidth(zQuery, yQuery) {
    let idx = 0;
    while (idx < fuselageStations.length - 2 && fuselageStations[idx + 1].z > zQuery) {
      idx++;
    }
    const s0 = fuselageStations[idx];
    const s1 = fuselageStations[idx + 1];
    const t = THREE.MathUtils.clamp((s0.z - zQuery) / Math.max(0.0001, s0.z - s1.z), 0, 1);
    const yTop = THREE.MathUtils.lerp(s0.yTop, s1.yTop, t);
    const yBot = THREE.MathUtils.lerp(s0.yBot, s1.yBot, t);
    const yChine = THREE.MathUtils.lerp(s0.yChine, s1.yChine, t);
    const rx = THREE.MathUtils.lerp(s0.rx, s1.rx, t);
    const sharp = THREE.MathUtils.lerp(s0.chineSharpness || 0, s1.chineSharpness || 0, t);

    const isUpper = yQuery >= yChine;
    const exp = isUpper ? 0.92 : 0.78;
    const ry = isUpper ? Math.max(0.01, yTop - yChine) : Math.max(0.01, yChine - yBot);
    const shapedCos = THREE.MathUtils.clamp(Math.abs(yQuery - yChine) / ry, 0, 0.98);
    const cosT = Math.pow(shapedCos, 1 / exp);
    const sinT = Math.sqrt(Math.max(0.01, 1 - cosT * cosT));
    const shapedSin = Math.pow(sinT, exp);
    const chineBoost = 1.0 + sharp * Math.pow(1.0 - cosT, 3.0);
    return shapedSin * rx * chineBoost;
  }

  // Contoured PBR-Lit Side Branding Decals: Exact "TENGDEN / 腾 | 盾 | 科 | 创" from ref_3.jpg!
  const tengdenBrandMat = new THREE.MeshStandardMaterial({
    map: createAircraftMarkingsTexture('tengden_brand'),
    roughness: 0.68,
    metalness: 0.05,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    side: THREE.DoubleSide,
  });
  const tengdenDecals = [];
  for (const side of [-1, 1]) {
    const segZ = 22;
    const segY = 8;
    const dGeo = new THREE.PlaneGeometry(1.16, 0.27, segZ, segY);
    const pos = dGeo.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const lx = pos.getX(k);
      const ly = pos.getY(k);
      const worldZ = 2.66 + (side < 0 ? lx : -lx);
      const worldY = 1.32 + ly;
      const hullX = evalFuselageHalfWidth(worldZ, worldY);
      pos.setXYZ(k, side * (hullX + 0.004), worldY, worldZ);
    }
    dGeo.computeVertexNormals();
    const decalMesh = new THREE.Mesh(dGeo, tengdenBrandMat);
    decalMesh.userData.noAO = true;
    uavRoot.add(decalMesh);
    tengdenDecals.push(decalMesh);
  }

  // Aerospace Air-Data Suite: Twin Cheek AOA Vanes, Dorsal GPS/Beidou Pucks & Ventral UHF Blade
  for (const side of [-1, 1]) {
    const aoaBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.018, 0.014, 12),
      mats.brushedSilver
    );
    aoaBase.rotation.z = Math.PI / 2;
    const aoaX = evalFuselageHalfWidth(3.52, 1.33);
    aoaBase.position.set(side * (aoaX + 0.003), 1.33, 3.52);
    uavRoot.add(aoaBase);

    const aoaVane = new THREE.Mesh(
      new THREE.BoxGeometry(0.048, 0.010, 0.036),
      mats.brushedSilver
    );
    aoaVane.position.set(side * (aoaX + 0.028), 1.33, 3.51);
    uavRoot.add(aoaVane);
  }

  for (const zg of [2.42, 1.48]) {
    const gpsPuck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.062, 0.072, 0.018, 20),
      mats.gearEnamelWhite
    );
    gpsPuck.position.set(0, zg > 2.0 ? 2.11 : 1.98, zg);
    uavRoot.add(gpsPuck);
  }

  const dorsalBlade = new THREE.Mesh(
    new THREE.BoxGeometry(0.012, 0.22, 0.15),
    mats.dielectricGullGray
  );
  dorsalBlade.position.set(0, 1.98, -0.45);
  dorsalBlade.rotation.x = -0.28;
  uavRoot.add(dorsalBlade);

  const ventralUhfBlade = new THREE.Mesh(
    new THREE.BoxGeometry(0.010, 0.18, 0.13),
    mats.boomDarkSlate
  );
  ventralUhfBlade.position.set(0, 1.03, 0.62);
  ventralUhfBlade.rotation.x = 0.28;
  uavRoot.add(ventralUhfBlade);

  // ============================================================================
  // 2. VENTRAL NOSE LANDING GEAR (z = +3.08m) & EO/IR-380 GIMBAL BALL (z = +1.82m)
  //    100% Verified against Zhuhai Airshow photo ref_3.jpg!
  // ============================================================================
  const rbfStreamers = [];

  // --- 2A. Nose Landing Gear (z = +3.08m, forward under TENGDEN logo!) ---
  const noseGearGroup = new THREE.Group();
  noseGearGroup.position.set(0, 0, 3.08);
  uavRoot.add(noseGearGroup);

  const noseWheelR = 0.21;

  // Recessed Dark Wheel-Well Cavity Framing & Inner Bulkhead directly under fuselage belly!
  const noseWellRim = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.06, 0.68),
    mats.cavityBlack
  );
  noseWellRim.position.set(0, 1.10, -0.04);
  noseGearGroup.add(noseWellRim);

  const noseWellTrim = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.014, 0.72),
    mats.gearBayPrimer
  );
  noseWellTrim.position.set(0, 1.09, -0.04);
  noseGearGroup.add(noseWellTrim);

  // Nose Steering Actuator Collar & Flexible Hydraulic Hose
  const steerCollar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.056, 0.056, 0.085, 18),
    mats.cncDark
  );
  steerCollar.position.set(0, 0.94, 0);
  noseGearGroup.add(steerCollar);

  const noseHoseCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.045, 1.05, -0.08),
    new THREE.Vector3(0.058, 0.82, -0.04),
    new THREE.Vector3(0.046, 0.56, -0.02),
    new THREE.Vector3(0.032, 0.38, -0.01),
  ]);
  noseGearGroup.add(
    new THREE.Mesh(new THREE.TubeGeometry(noseHoseCurve, 14, 0.006, 6, false), mats.tireRubber)
  );

  // Starboard Sleek Rectangular Open Nose Gear Door (proportioned cleanly to ref_3.jpg)
  const stbdNoseDoor = new THREE.Mesh(
    new THREE.BoxGeometry(0.014, 0.16, 0.64),
    mats.boomDarkSlate
  );
  stbdNoseDoor.position.set(-0.165, 1.03, -0.04);
  stbdNoseDoor.rotation.z = -0.08;
  stbdNoseDoor.castShadow = true;
  noseGearGroup.add(stbdNoseDoor);

  // Internal structural stiffener ribs on nose door
  for (const rz of [-0.22, 0, 0.22]) {
    const rib = new THREE.Mesh(
      new THREE.BoxGeometry(0.009, 0.13, 0.020),
      mats.gearEnamelWhite
    );
    rib.position.set(-0.154, 1.03, rz - 0.04);
    noseGearGroup.add(rib);
  }

  // Gloss Aerospace-White Shock Strut + Mirror Chrome Oleo + Scissor Links
  const noseUpperStrut = new THREE.Mesh(
    new THREE.CylinderGeometry(0.042, 0.038, 0.68, 20),
    mats.gearEnamelWhite
  );
  noseUpperStrut.position.set(0, 0.84, 0);
  noseUpperStrut.castShadow = true;
  noseGearGroup.add(noseUpperStrut);

  const noseOleo = new THREE.Mesh(
    new THREE.CylinderGeometry(0.027, 0.027, 0.28, 18),
    mats.chromeMirror
  );
  noseOleo.position.set(0, 0.40, 0);
  noseGearGroup.add(noseOleo);

  const noseDrag = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.54, 12),
    mats.gearEnamelWhite
  );
  noseDrag.position.set(0, 0.90, -0.20);
  noseDrag.rotation.x = 0.68;
  noseGearGroup.add(noseDrag);

  for (const cfg of [
    { y: 0.50, rot: -0.58 },
    { y: 0.39, rot: 0.58 },
  ]) {
    const link = new THREE.Mesh(
      new THREE.BoxGeometry(0.026, 0.13, 0.016),
      mats.gearEnamelWhite
    );
    link.position.set(0, cfg.y, -0.05);
    link.rotation.x = cfg.rot;
    noseGearGroup.add(link);
  }

  // Dual Nose Taxi Headlights
  for (const sgn of [-1, 1]) {
    const housing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.030, 0.025, 0.044, 16),
      mats.cncDark
    );
    housing.rotation.x = Math.PI / 2;
    housing.position.set(sgn * 0.058, 0.62, 0.042);
    noseGearGroup.add(housing);

    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(0.026, 16),
      new THREE.MeshBasicMaterial({ color: 0xf4f8fc })
    );
    lens.userData.noAO = true;
    lens.position.set(sgn * 0.058, 0.62, 0.065);
    noseGearGroup.add(lens);
  }

  // Cast White Nose Fork + Grooved Nose Tire + Molded Black Wheel Chocks
  const forkTop = new THREE.Mesh(
    new THREE.BoxGeometry(0.20, 0.034, 0.058),
    mats.gearEnamelWhite
  );
  forkTop.position.set(0, 0.36, 0);
  noseGearGroup.add(forkTop);

  for (const sgn of [-1, 1]) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.025, 0.18, 0.046),
      mats.gearEnamelWhite
    );
    leg.position.set(sgn * 0.088, 0.28, 0);
    noseGearGroup.add(leg);
  }

  const noseWheel = buildAircraftWheel(noseWheelR, 0.125, mats);
  noseWheel.position.set(0, noseWheelR, 0);
  noseGearGroup.add(noseWheel);

  for (const zc of [0.22, -0.22]) {
    const chock = new THREE.Mesh(
      new THREE.CylinderGeometry(0.042, 0.042, 0.22, 3),
      mats.chockRubberBlack
    );
    chock.rotation.z = Math.PI / 2;
    chock.position.set(0, 0.026, zc);
    chock.castShadow = true;
    noseGearGroup.add(chock);
  }

  // --- 2B. EO/IR-380 Stabilized Gimbal Turret (z = +1.82m, Gull-Gray Housing + Recessed CNC Optics!) ---
  const eoirMount = new THREE.Group();
  eoirMount.position.set(0, 1.11, 1.82);
  uavRoot.add(eoirMount);

  const eoirCollar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.20, 0.175, 0.065, 32),
    mats.eoirBallGull
  );
  eoirCollar.position.y = -0.02;
  eoirMount.add(eoirCollar);

  const eoirAzimuth = new THREE.Group();
  eoirAzimuth.position.y = -0.05;
  eoirMount.add(eoirAzimuth);

  for (const side of [-1, 1]) {
    const yokeArm = new THREE.Mesh(
      new THREE.BoxGeometry(0.042, 0.21, 0.13),
      mats.eoirBallGull
    );
    yokeArm.position.set(side * 0.19, -0.095, 0);
    yokeArm.castShadow = true;
    eoirAzimuth.add(yokeArm);
  }

  const eoirBallGroup = new THREE.Group();
  eoirBallGroup.position.y = -0.145;
  eoirAzimuth.add(eoirBallGroup);

  const ballShell = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 36, 28),
    mats.eoirBallGull
  );
  ballShell.castShadow = true;
  ballShell.receiveShadow = true;
  eoirBallGroup.add(ballShell);

  // Deeply recessed matte-black CNC optical faceplate (exact look of ref_3.jpg EO/IR pod!)
  const opticHousing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.128, 0.138, 0.055, 32),
    mats.cncDark
  );
  opticHousing.rotation.x = Math.PI / 2;
  opticHousing.position.z = 0.155;
  eoirBallGroup.add(opticHousing);

  // Multi-element Physical Optical Objectives inside recessed barrels (NO flat colored stickers!)
  const apertures = [
    { x: -0.042, y: 0.022, r: 0.048, mat: mats.opticalGermanium, ringMat: mats.brassRing },
    { x: 0.050, y: 0.032, r: 0.034, mat: mats.opticalSapphire, ringMat: mats.brushedSilver },
    { x: 0.044, y: -0.042, r: 0.026, mat: mats.opticalSapphire, ringMat: mats.brassRing },
    { x: -0.038, y: -0.048, r: 0.018, mat: mats.opticalGermanium, ringMat: mats.brushedSilver },
  ];

  for (const ap of apertures) {
    const barrelRing = new THREE.Mesh(
      new THREE.TorusGeometry(ap.r, 0.0045, 8, 24),
      ap.ringMat
    );
    barrelRing.position.set(ap.x, ap.y, 0.184);
    eoirBallGroup.add(barrelRing);

    const curvedObjective = new THREE.Mesh(
      new THREE.SphereGeometry(ap.r * 0.96, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.36),
      ap.mat
    );
    curvedObjective.rotation.x = Math.PI / 2;
    curvedObjective.position.set(ap.x, ap.y, 0.174);
    eoirBallGroup.add(curvedObjective);
  }

  // Dynamically Terminated 1064nm Tactical Laser Designator Beam + Floor Target Impact Reticle
  // Unit-length cylinder along +Z scaled dynamically to exact floor ray-intersection distance!
  const laserBeamGeo = new THREE.CylinderGeometry(0.0035, 0.014, 1.0, 12, 1, true);
  laserBeamGeo.translate(0, 0.5, 0);
  laserBeamGeo.rotateX(Math.PI / 2);
  const laserBeamMat = new THREE.MeshBasicMaterial({
    color: 0x3ce896,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const laserBeamMesh = new THREE.Mesh(laserBeamGeo, laserBeamMat);
  laserBeamMesh.userData.noAO = true;
  laserBeamMesh.position.set(0.044, -0.042, 0.19);
  eoirBallGroup.add(laserBeamMesh);

  const laserFloorSpotMat = new THREE.MeshBasicMaterial({
    map: softGlowTex,
    color: 0x4cffaa,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const laserFloorSpot = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.38), laserFloorSpotMat);
  laserFloorSpot.rotation.x = -Math.PI / 2;
  laserFloorSpot.position.set(0, 0.006, 5.5);
  laserFloorSpot.userData.noAO = true;
  uavRoot.add(laserFloorSpot);

  // ============================================================================
  // 3. 20m STRAIGHT-TAPERED HIGH-ASPECT-RATIO LAMINAR WING (NO Airline Winglets!)
  // ============================================================================
  const fcsSurfaces = {
    flaps: [],
    ailerons: [],
    rudders: [],
    elevator: null,
  };
  const strobeLights = [];

  for (const side of [-1, 1]) {
    // Authentic TB-001 20m wingspan straight-tapered laminar wing (ref_2.jpg & ref_3.jpg!)
    const wingStations = [
      { x: 0, y: 1.90, zLE: 0.72, chord: 1.38, thicknessRatio: 0.145, twist: 0 },
      { x: side * 0.62, y: 1.90, zLE: 0.72, chord: 1.38, thicknessRatio: 0.145, twist: 0 },
      { x: side * 2.38, y: 1.902, zLE: 0.71, chord: 1.35, thicknessRatio: 0.142, twist: 0 },
      { x: side * 4.80, y: 1.952, zLE: 0.63, chord: 1.16, thicknessRatio: 0.134, twist: -0.012 },
      { x: side * 7.60, y: 2.010, zLE: 0.51, chord: 0.90, thicknessRatio: 0.125, twist: -0.022 },
      { x: side * 9.88, y: 2.058, zLE: 0.39, chord: 0.64, thicknessRatio: 0.115, twist: -0.030 },
      // Sheared aerodynamic Hoerner wingtip cap (no passenger jet winglet!)
      { x: side * 10.02, y: 2.072, zLE: 0.31, chord: 0.42, thicknessRatio: 0.065, twist: -0.030 },
    ];
    const wingGeo = buildLoftedWingGeometry(wingStations, 42, 3.4);
    const wingMesh = new THREE.Mesh(wingGeo, mats.wingSkin);
    wingMesh.castShadow = true;
    wingMesh.receiveShadow = true;
    uavRoot.add(wingMesh);

    // Wingtip Recessed Navigation LED (Port +X Red, Starboard -X Green)
    const navColor = side > 0 ? 0xd92638 : 0x18c964;
    const navBulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 12, 10),
      new THREE.MeshBasicMaterial({ color: navColor })
    );
    navBulb.userData.noAO = true;
    navBulb.position.set(side * 10.01, 2.07, 0.24);
    uavRoot.add(navBulb);

    const navGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: softGlowTex,
        color: navColor,
        transparent: true,
        opacity: 0.48,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    navGlow.scale.set(0.32, 0.32, 1);
    navGlow.position.copy(navBulb.position);
    uavRoot.add(navGlow);

    // Articulated Inner/Mid Flaps & Outer Ailerons
    const innerFlapPiv = new THREE.Group();
    innerFlapPiv.position.set(side * 1.44, 1.885, -0.45);
    const innerFlap = new THREE.Mesh(
      new THREE.BoxGeometry(1.26, 0.032, 0.23),
      mats.boomDarkSlate
    );
    innerFlap.position.z = -0.115;
    innerFlap.castShadow = true;
    innerFlapPiv.add(innerFlap);
    uavRoot.add(innerFlapPiv);
    fcsSurfaces.flaps.push(innerFlapPiv);

    const midFlapPiv = new THREE.Group();
    midFlapPiv.position.set(side * 4.35, 1.938, -0.35);
    midFlapPiv.rotation.z = side * 0.021;
    const midFlap = new THREE.Mesh(
      new THREE.BoxGeometry(3.05, 0.028, 0.21),
      mats.boomDarkSlate
    );
    midFlap.position.z = -0.105;
    midFlap.castShadow = true;
    midFlapPiv.add(midFlap);
    uavRoot.add(midFlapPiv);
    fcsSurfaces.flaps.push(midFlapPiv);

    const ailPiv = new THREE.Group();
    ailPiv.position.set(side * 7.85, 2.012, -0.22);
    ailPiv.rotation.z = side * 0.021;
    const aileron = new THREE.Mesh(
      new THREE.BoxGeometry(3.35, 0.022, 0.16),
      mats.boomDarkSlate
    );
    aileron.position.z = -0.08;
    aileron.castShadow = true;
    ailPiv.add(aileron);
    uavRoot.add(ailPiv);
    fcsSurfaces.ailerons.push({ pivot: ailPiv, side });

    // Sculpted Streamlined Teardrop Underwing Flap-Hinge Fairings (rounded nose + tapered canoe!)
    const fairingGeo = buildTeardropFairingGeometry(0.52, 0.036);
    for (const fx of [1.10, 3.08, 5.18, 7.15]) {
      const fy = 1.845 + Math.max(0, fx - 2.38) * 0.021;
      const fairing = new THREE.Mesh(fairingGeo, mats.boomDarkSlate);
      fairing.scale.set(0.74, 0.92, 1.0);
      fairing.position.set(side * fx, fy, -0.44);
      fairing.castShadow = true;
      fairing.receiveShadow = true;
      uavRoot.add(fairing);
    }

    // Wing Leading-Edge Pitot Tube
    const wingPitot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.011, 0.42, 10),
      mats.brushedSilver
    );
    wingPitot.rotation.x = Math.PI / 2;
    wingPitot.position.set(side * 3.05, 1.915, 0.86);
    uavRoot.add(wingPitot);
  }

  // ============================================================================
  // 4. SCULPTED SHARK-NOSE NACELLES, CHEEK BLISTERS, 5 LOUVERS & TWIN BOOMS (ref_3.jpg!)
  // ============================================================================
  const propellers = [];
  const tailSerialMat = new THREE.MeshStandardMaterial({
    map: createAircraftMarkingsTexture('tail_serial'),
    roughness: 0.72,
    metalness: 0.05,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });

  for (const side of [-1, 1]) {
    const boomX = side * 2.38;
    const boomGroup = new THREE.Group();
    boomGroup.position.x = boomX;
    uavRoot.add(boomGroup);

    // Sculpted Nacelle hanging cleanly BENEATH the high wing, tapering & sweeping up aft!
    const boomStations = [
      { z: 2.28, yTop: 1.83, yBot: 1.50, yChine: 1.665, rx: 0.166, expTop: 1.0, expBot: 1.0 },
      { z: 2.08, yTop: 1.88, yBot: 1.38, yChine: 1.65, rx: 0.255, expTop: 0.92, expBot: 0.86 },
      { z: 1.65, yTop: 1.91, yBot: 1.34, yChine: 1.64, rx: 0.295, expTop: 0.88, expBot: 0.84 },
      { z: 1.05, yTop: 1.91, yBot: 1.36, yChine: 1.64, rx: 0.285, expTop: 0.88, expBot: 0.85 },
      { z: 0.40, yTop: 1.90, yBot: 1.40, yChine: 1.65, rx: 0.265, expTop: 0.90, expBot: 0.88 },
      { z: -0.35, yTop: 1.88, yBot: 1.43, yChine: 1.66, rx: 0.245, expTop: 0.92, expBot: 0.90 }, // Main gear bay
      { z: -1.35, yTop: 1.86, yBot: 1.50, yChine: 1.68, rx: 0.205, expTop: 0.95, expBot: 0.95 },
      { z: -2.75, yTop: 1.88, yBot: 1.60, yChine: 1.74, rx: 0.165, expTop: 0.98, expBot: 0.98 }, // Upward sweep!
      { z: -4.15, yTop: 1.91, yBot: 1.69, yChine: 1.80, rx: 0.135, expTop: 1.0, expBot: 1.0 },
      { z: -5.25, yTop: 1.93, yBot: 1.75, yChine: 1.84, rx: 0.115, expTop: 1.0, expBot: 1.0 },
      { z: -5.52, yTop: 1.89, yBot: 1.80, yChine: 1.845, rx: 0.052, expTop: 1.0, expBot: 1.0 },
    ];
    const boomGeo = buildChinedLoftedGeometry(boomStations, 44, 1.5, 3.2);
    const boomMesh = new THREE.Mesh(boomGeo, mats.boomDarkSlate);
    boomMesh.castShadow = true;
    boomMesh.receiveShadow = true;
    boomGroup.add(boomMesh);

    // Sculpted Oval Chin Air Intake Lip directly below Spinner (NO ugly rectangular box! Exact ref_3.jpg!)
    const intakeLip = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.088, 0.36, 10, 20),
      mats.boomDarkSlate
    );
    intakeLip.rotation.x = Math.PI / 2;
    intakeLip.scale.set(1.25, 0.72, 1.0);
    intakeLip.position.set(0, 1.44, 1.96);
    intakeLip.castShadow = true;
    boomGroup.add(intakeLip);

    const intakeMouth = new THREE.Mesh(
      new THREE.CircleGeometry(0.072, 18),
      mats.cavityBlack
    );
    intakeMouth.scale.set(1.28, 0.68, 1.0);
    intakeMouth.position.set(0, 1.44, 2.225);
    boomGroup.add(intakeMouth);

    // Streamlined Teardrop Cheek Fairing Blisters on Cowling Flanks (exact ref_3.jpg signature detail!)
    for (const cSide of [-1, 1]) {
      const blister = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 24, 18),
        mats.boomDarkSlate
      );
      blister.scale.set(0.55, 0.68, 2.85);
      blister.position.set(cSide * 0.255, 1.62, 1.62);
      blister.castShadow = true;
      boomGroup.add(blister);

      // 5 Vertical Recessed Cooling Louver Gills right behind Cheek Blister (exact ref_3.jpg!)
      for (let gIdx = 0; gIdx < 5; gIdx++) {
        const gill = new THREE.Mesh(
          new THREE.BoxGeometry(0.012, 0.115, 0.018),
          mats.cavityBlack
        );
        gill.position.set(cSide * 0.285, 1.61, 1.24 - gIdx * 0.042);
        boomGroup.add(gill);
      }

      // Recessed Inconel Exhaust Stubs
      for (const zEx of [1.46, 1.35]) {
        const ex = new THREE.Mesh(
          new THREE.CylinderGeometry(0.022, 0.025, 0.12, 14),
          mats.inconelExhaust
        );
        ex.position.set(cSide * 0.24, 1.44, zEx);
        ex.rotation.z = cSide * 0.65;
        ex.rotation.x = -0.45;
        boomGroup.add(ex);
      }
    }

    // Forward Tractor 3-Blade Silver Scimitar Propeller (z = +2.28m)
    const tractor = buildScimitarPropeller(0.86, false, mats);
    tractor.group.position.set(0, 1.665, 2.28);
    tractor.group.rotation.z = side > 0 ? 0.35 : 1.15;
    boomGroup.add(tractor.group);
    propellers.push({ ...tractor, dir: side > 0 ? 1 : -1, isRearPusher: false });

    // --- Main Landing Gear under Boom (x = ±2.38m, z = -0.26m, exact ref_3.jpg!) ---
    const mainGear = new THREE.Group();
    mainGear.position.set(0, 0, -0.26);
    boomGroup.add(mainGear);

    const mainWheelR = 0.30;

    // Small sculpted dark-slate clamshell bay doors under nacelle
    for (const dSide of [-1, 1]) {
      const door = new THREE.Mesh(
        new THREE.BoxGeometry(0.016, 0.30, 0.78),
        mats.boomDarkSlate
      );
      door.position.set(dSide * 0.195, 1.32, -0.06);
      door.rotation.z = dSide * 0.16;
      door.castShadow = true;
      mainGear.add(door);
    }

    // Gloss White Heavy Shock Strut + Chrome Oleo + Angled White Retraction Brace (exact ref_3.jpg!)
    const mStrut = new THREE.Mesh(
      new THREE.CylinderGeometry(0.052, 0.046, 0.82, 20),
      mats.gearEnamelWhite
    );
    mStrut.position.set(-side * 0.045, 1.04, 0);
    mStrut.castShadow = true;
    mainGear.add(mStrut);

    const mOleo = new THREE.Mesh(
      new THREE.CylinderGeometry(0.034, 0.034, 0.38, 18),
      mats.chromeMirror
    );
    mOleo.position.set(-side * 0.045, 0.50, 0);
    mainGear.add(mOleo);

    const mDrag = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.72, 14),
      mats.gearEnamelWhite
    );
    mDrag.position.set(-side * 0.045, 1.08, -0.25);
    mDrag.rotation.x = 0.65;
    mainGear.add(mDrag);

    for (const cfg of [
      { y: 0.64, rot: 0.56 },
      { y: 0.49, rot: -0.56 },
    ]) {
      const sc = new THREE.Mesh(
        new THREE.BoxGeometry(0.032, 0.17, 0.020),
        mats.gearEnamelWhite
      );
      sc.position.set(-side * 0.045, cfg.y, 0.065);
      sc.rotation.x = cfg.rot;
      mainGear.add(sc);
    }

    const axle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.034, 0.034, 0.20, 16),
      mats.cncDark
    );
    axle.rotation.z = Math.PI / 2;
    axle.position.set(side * 0.02, mainWheelR, 0);
    mainGear.add(axle);

    const mainWheel = buildAircraftWheel(mainWheelR, 0.19, mats);
    mainWheel.position.set(side * 0.055, mainWheelR, 0);
    mainGear.add(mainWheel);

    // Molded Black Rubber Wheel Chocks + Red Hydraulic Tow/Jack Stand (seen in ref_3.jpg!)
    for (const zc of [0.32, -0.32]) {
      const chock = new THREE.Mesh(
        new THREE.CylinderGeometry(0.050, 0.050, 0.26, 3),
        mats.chockRubberBlack
      );
      chock.rotation.z = Math.PI / 2;
      chock.position.set(side * 0.055, 0.032, zc);
      chock.castShadow = true;
      mainGear.add(chock);
    }

    // Recessed Main Wheel-Well Cavity + Hydraulic Brake Hose & Caliper
    const mainWell = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.06, 0.78),
      mats.cavityBlack
    );
    mainWell.position.set(0, 1.43, -0.05);
    mainGear.add(mainWell);

    const brakeCaliper = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.11, 0.085),
      mats.cncDark
    );
    brakeCaliper.position.set(-side * 0.04, mainWheelR + 0.03, -0.08);
    mainGear.add(brakeCaliper);

    const mainHoseCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-side * 0.02, 1.38, -0.08),
      new THREE.Vector3(-side * 0.08, 0.96, -0.07),
      new THREE.Vector3(-side * 0.07, 0.56, -0.07),
      new THREE.Vector3(-side * 0.04, mainWheelR + 0.05, -0.08),
    ]);
    mainGear.add(
      new THREE.Mesh(new THREE.TubeGeometry(mainHoseCurve, 14, 0.0065, 6, false), mats.tireRubber)
    );

    // Authentic Red Tubular Steel Tripod Hydraulic Wheel-Jack Stand beside starboard main wheel (exact ref_3.jpg!)
    if (side < 0) {
      const jackFrame = new THREE.Group();
      jackFrame.position.set(0.22, 0, -0.22);

      // 3 angled red tubular tripod legs + horizontal base tie triangle + swivel pads
      const legR = 0.22;
      const topY = 0.34;
      const footPts = [];
      for (let i = 0; i < 3; i++) {
        const ang = (i * Math.PI * 2) / 3 + 0.35;
        const fx = Math.cos(ang) * legR;
        const fz = Math.sin(ang) * legR;
        footPts.push(new THREE.Vector3(fx, 0.045, fz));

        const footPad = new THREE.Mesh(
          new THREE.CylinderGeometry(0.026, 0.030, 0.022, 12),
          mats.cncDark
        );
        footPad.position.set(fx, 0.011, fz);
        jackFrame.add(footPad);

        const legVec = new THREE.Vector3(-fx * 0.72, topY - 0.02, -fz * 0.72);
        const legTube = new THREE.Mesh(
          new THREE.CylinderGeometry(0.011, 0.011, legVec.length(), 10),
          mats.towJackRed
        );
        legTube.position.set(fx + legVec.x * 0.5, 0.02 + legVec.y * 0.5, fz + legVec.z * 0.5);
        legTube.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          legVec.clone().normalize()
        );
        legTube.castShadow = true;
        jackFrame.add(legTube);
      }

      for (let i = 0; i < 3; i++) {
        const pA = footPts[i];
        const pB = footPts[(i + 1) % 3];
        const diff = pB.clone().sub(pA);
        const tie = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0085, 0.0085, diff.length(), 8),
          mats.towJackRed
        );
        tie.position.copy(pA).addScaledVector(diff, 0.5);
        tie.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), diff.clone().normalize());
        jackFrame.add(tie);
      }

      // Central hydraulic jack barrel, chrome ram piston, saddle & pump handle
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.032, 0.036, 0.32, 16),
        mats.towJackRed
      );
      barrel.position.y = 0.20;
      barrel.castShadow = true;
      jackFrame.add(barrel);

      const ram = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 0.14, 14),
        mats.chromeMirror
      );
      ram.position.y = 0.40;
      jackFrame.add(ram);

      const saddle = new THREE.Mesh(
        new THREE.BoxGeometry(0.068, 0.022, 0.055),
        mats.cncDark
      );
      saddle.position.y = 0.47;
      jackFrame.add(saddle);

      const pumpHandle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.007, 0.007, 0.34, 8),
        mats.brushedSilver
      );
      pumpHandle.position.set(0.11, 0.25, 0.06);
      pumpHandle.rotation.z = -0.62;
      jackFrame.add(pumpHandle);

      mainGear.add(jackFrame);
    }
  }

  // TB-001A 3rd Central Rear Pusher Engine + 3-Blade Scimitar Pusher Propeller (z = -1.96m)
  const rearEngineGroup = new THREE.Group();
  rearEngineGroup.position.set(0, 1.61, -1.96);
  uavRoot.add(rearEngineGroup);

  for (const sgn of [-1, 1]) {
    const scoop = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.042, 0.34, 8, 12),
      mats.boomDarkSlate
    );
    scoop.rotation.x = Math.PI / 2;
    scoop.position.set(sgn * 0.28, 0.03, 0.45);
    rearEngineGroup.add(scoop);

    const ex = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.025, 0.15, 12),
      mats.inconelExhaust
    );
    ex.position.set(sgn * 0.22, -0.09, 0.22);
    ex.rotation.z = sgn * 0.65;
    ex.rotation.x = 0.42;
    rearEngineGroup.add(ex);
  }

  const pusherProp = buildScimitarPropeller(0.82, true, mats);
  pusherProp.group.rotation.z = 0.72;
  rearEngineGroup.add(pusherProp.group);
  propellers.push({ ...pusherProp, dir: 1, isRearPusher: true });

  // ============================================================================
  // 5. UPRIGHT TWIN VERTICAL TAILS + DIELECTRIC CAPS + VENTRAL FINS (腹鳍) + HIGH H-TAIL
  //    100% Verified against ref_3.jpg & ref_2.jpg!
  // ============================================================================
  for (const side of [-1, 1]) {
    const finX = side * 2.38;

    // Upper Vertical Stabilizer Main Body (Dark Tactical Slate, height 1.24m)
    const finShape = new THREE.Shape();
    finShape.moveTo(0, 0);
    finShape.lineTo(0.34, 1.24);
    finShape.lineTo(0.94, 1.24);
    finShape.lineTo(0.88, 0);
    finShape.closePath();

    const finGeo = new THREE.ExtrudeGeometry(finShape, {
      depth: 0.064,
      bevelEnabled: true,
      bevelThickness: 0.018,
      bevelSize: 0.014,
      bevelSegments: 3,
    });
    finGeo.translate(0, 0, -0.032);
    finGeo.rotateY(Math.PI / 2);

    const finMesh = new THREE.Mesh(finGeo, mats.boomDarkSlate);
    finMesh.position.set(finX, 1.85, -4.46);
    finMesh.castShadow = true;
    finMesh.receiveShadow = true;
    uavRoot.add(finMesh);

    // Light Gull-Gray Dielectric Top Fin Cap (top 18cm, clearly visible in ref_2.jpg!)
    const capShape = new THREE.Shape();
    capShape.moveTo(0.34, 1.24);
    capShape.lineTo(0.39, 1.42);
    capShape.lineTo(0.96, 1.42);
    capShape.lineTo(0.94, 1.24);
    capShape.closePath();

    const capGeo = new THREE.ExtrudeGeometry(capShape, {
      depth: 0.062,
      bevelEnabled: true,
      bevelThickness: 0.016,
      bevelSize: 0.012,
      bevelSegments: 2,
    });
    capGeo.translate(0, 0, -0.031);
    capGeo.rotateY(Math.PI / 2);
    const capMesh = new THREE.Mesh(capGeo, mats.dielectricGullGray);
    capMesh.position.set(finX, 1.85, -4.46);
    capMesh.castShadow = true;
    uavRoot.add(capMesh);

    // Lower Swept Ventral Fin (腹鳍) below each Tail Boom (prominent in ref_3.jpg & ref_2.jpg!)
    const vFinShape = new THREE.Shape();
    vFinShape.moveTo(0.05, 0.04);
    vFinShape.lineTo(0.32, -0.36);
    vFinShape.lineTo(0.86, -0.34);
    vFinShape.lineTo(0.88, 0.04);
    vFinShape.closePath();

    const vFinGeo = new THREE.ExtrudeGeometry(vFinShape, {
      depth: 0.048,
      bevelEnabled: true,
      bevelThickness: 0.012,
      bevelSize: 0.010,
      bevelSegments: 2,
    });
    vFinGeo.translate(0, 0, -0.024);
    vFinGeo.rotateY(Math.PI / 2);
    const vFinMesh = new THREE.Mesh(vFinGeo, mats.boomDarkSlate);
    vFinMesh.position.set(finX, 1.77, -4.50);
    vFinMesh.castShadow = true;
    uavRoot.add(vFinMesh);

    // Outer Vertical Fin Serial & Scorpion Crest ("JD-1052", offset cleanly outside beveled fin surface)
    const tailDecal = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.17), tailSerialMat);
    tailDecal.userData.noAO = true;
    tailDecal.position.set(finX + side * 0.054, 2.38, -4.92);
    tailDecal.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    uavRoot.add(tailDecal);

    // Articulated Rudder
    const rudPiv = new THREE.Group();
    rudPiv.position.set(finX, 2.52, -5.28);
    const rudder = new THREE.Mesh(
      new THREE.BoxGeometry(0.042, 1.28, 0.22),
      mats.boomDarkSlate
    );
    rudder.position.z = -0.11;
    rudder.castShadow = true;
    rudPiv.add(rudder);
    uavRoot.add(rudPiv);
    fcsSurfaces.rudders.push(rudPiv);

    // Anti-Collision Strobe Beacon on Fin Tip
    const bMat = new THREE.MeshBasicMaterial({ color: 0xd92030 });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.024, 12, 10), bMat);
    beacon.userData.noAO = true;
    beacon.position.set(finX, 3.29, -5.12);
    uavRoot.add(beacon);

    const bGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: softGlowTex,
        color: 0xff2638,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    bGlow.scale.set(0.42, 0.42, 1);
    bGlow.position.copy(beacon.position);
    uavRoot.add(bGlow);
    strobeLights.push({ mat: bMat, sprite: bGlow, phase: side > 0 ? 0 : 0.16 });
  }

  // High-Mounted Horizontal Stabilizer spanning cleanly across Vertical Fin Tips (y = 3.26m)
  const hTailStations = [
    { x: -2.43, y: 3.26, zLE: -4.84, chord: 0.64, thicknessRatio: 0.115, camber: 0.01 },
    { x: 0.0, y: 3.26, zLE: -4.84, chord: 0.64, thicknessRatio: 0.115, camber: 0.01 },
    { x: 2.43, y: 3.26, zLE: -4.84, chord: 0.64, thicknessRatio: 0.115, camber: 0.01 },
  ];
  const hTailMesh = new THREE.Mesh(
    buildLoftedWingGeometry(hTailStations, 30, 1.8),
    mats.wingSkin
  );
  hTailMesh.castShadow = true;
  hTailMesh.receiveShadow = true;
  uavRoot.add(hTailMesh);

  const elevPiv = new THREE.Group();
  elevPiv.position.set(0, 3.26, -5.34);
  const elev = new THREE.Mesh(
    new THREE.BoxGeometry(4.72, 0.028, 0.18),
    mats.boomDarkSlate
  );
  elev.position.z = -0.09;
  elev.castShadow = true;
  elevPiv.add(elev);
  uavRoot.add(elevPiv);
  fcsSurfaces.elevator = elevPiv;

  // ============================================================================
  // 6. INTEGRATED 6-PYLON / 12-MISSILE MUNITIONS SYSTEM
  // ============================================================================
  const munitions = buildMunitionsSystem(createOrdnanceMaterials());
  uavRoot.add(munitions.group);

  // ============================================================================
  // 7. STATE, LIVERY SWITCHING & REAL-TIME KINEMATICS
  // ============================================================================
  const state = {
    engineRunning: false,
    propRpmFactor: 0,
    eoirScanning: true,
    laserDesignatorActive: false,
    fcsBitActive: false,
    navLightsActive: true,
    triEngineVariant: true,
    liveryScheme: 'airshow', // 'airshow' (ref_3.jpg Zhuhai 3-tone) | 'tactical' (PLA JD-1052 low-vis)
  };

  const calloutAnchors = [
    {
      id: 'satcom',
      code: '01',
      title: 'KA/KU 卫通天线整流舱',
      sub: 'SATCOM BEYOND-LOS DATALINK',
      localPos: new THREE.Vector3(0, 2.09, 3.05),
      camPreset: 'nose',
    },
    {
      id: 'eoir',
      code: '02',
      title: 'EO/IR-380 多光谱光电吊舱',
      sub: 'MWIR / HDTV / LASER DESIGNATOR',
      localPos: new THREE.Vector3(0, 0.84, 1.96),
      camPreset: 'nose',
    },
    {
      id: 'propulsion',
      code: '03',
      title: '双前拉+尾推三发涡轮增压动力',
      sub: '3× TURBOCHARGED PISTON PROPULSION',
      localPos: new THREE.Vector3(-2.38, 1.85, 1.95),
      camPreset: 'tail',
    },
    {
      id: 'ordnance',
      code: '04',
      title: '6挂点双联复合挂架 · 12枚实弹',
      sub: 'AR-4 / FT-9 / CM-502KG MIXED LOAD',
      localPos: new THREE.Vector3(-3.48, 1.36, 0.35),
      camPreset: 'ordnance',
    },
    {
      id: 'empennage',
      code: '05',
      title: '双尾撑直立垂尾+腹鳍+高平尾',
      sub: 'TWIN-BOOM H-TAIL & VENTRAL FINS',
      localPos: new THREE.Vector3(-2.38, 3.15, -4.95),
      camPreset: 'tail',
    },
  ];

  function setLiveryScheme(scheme) {
    state.liveryScheme = scheme;
    const isAirshow = scheme === 'airshow';
    const fTex = isAirshow ? fuselageAirshowTex : fuselageTacticalTex;
    mats.fuselageSkin.map = fTex.map;
    mats.fuselageSkin.normalMap = fTex.normalMap;
    mats.fuselageSkin.roughnessMap = fTex.roughnessMap;
    mats.fuselageSkin.needsUpdate = true;

    mats.wingSkin.map = isAirshow ? wingAirshowAlbedo : wingTacticalAlbedo;
    mats.wingSkin.needsUpdate = true;

    for (const d of tengdenDecals) {
      d.visible = isAirshow;
    }
    munitions.setLiveryScheme(scheme);
  }

  function setVariant(isTriEngine) {
    state.triEngineVariant = isTriEngine;
    rearEngineGroup.visible = isTriEngine;
    munitions.setLoadoutMode(isTriEngine ? 'beast12' : 'recon8');
  }

  function update(dt, elapsed) {
    const targetRpm = state.engineRunning ? 1.0 : 0.0;
    state.propRpmFactor += (targetRpm - state.propRpmFactor) * Math.min(1, dt * 1.8);

    if (state.propRpmFactor > 0.002) {
      const spin = state.propRpmFactor * 36.0;
      for (const p of propellers) {
        if (p.isRearPusher && !state.triEngineVariant) continue;
        p.group.rotation.z += spin * dt * p.dir;
        p.blurMat.opacity = Math.max(0, (state.propRpmFactor - 0.35) * 0.78);
      }
      uavRoot.position.y = Math.sin(elapsed * 46) * 0.0012 * state.propRpmFactor;
    } else {
      uavRoot.position.y = 0;
      for (const p of propellers) p.blurMat.opacity = 0;
    }

    if (state.eoirScanning || state.laserDesignatorActive) {
      const yawT = state.laserDesignatorActive
        ? Math.sin(elapsed * 0.4) * 0.22
        : Math.sin(elapsed * 0.5) * 0.46;
      const pitchT = state.laserDesignatorActive ? 0.12 : 0.06 + Math.sin(elapsed * 0.7) * 0.08;
      eoirAzimuth.rotation.y += (yawT - eoirAzimuth.rotation.y) * dt * 2.8;
      eoirBallGroup.rotation.x += (pitchT - eoirBallGroup.rotation.x) * dt * 2.8;
    }

    const laserTarget = state.laserDesignatorActive ? 0.24 : 0.0;
    laserBeamMat.opacity += (laserTarget - laserBeamMat.opacity) * Math.min(1, dt * 8);

    // Dynamically compute exact laser beam ray-floor intersection at y = 0 so it never pierces tarmac!
    if (laserBeamMat.opacity > 0.004) {
      eoirBallGroup.updateWorldMatrix(true, false);
      const originW = new THREE.Vector3(0.044, -0.042, 0.19).applyMatrix4(
        eoirBallGroup.matrixWorld
      );
      const forwardW = new THREE.Vector3(0, 0, 1)
        .transformDirection(eoirBallGroup.matrixWorld)
        .normalize();
      let rayDist = 14.0;
      if (forwardW.y < -0.015) {
        rayDist = THREE.MathUtils.clamp(-originW.y / forwardW.y, 0.5, 18.0);
        const hitW = originW.clone().addScaledVector(forwardW, rayDist);
        laserFloorSpot.position.set(hitW.x, 0.006, hitW.z);
        const pulse = 0.85 + 0.15 * Math.sin(elapsed * 22);
        laserFloorSpot.scale.setScalar(pulse);
        laserFloorSpotMat.opacity = laserBeamMat.opacity * 2.8;
      } else {
        laserFloorSpotMat.opacity = 0;
      }
      laserBeamMesh.scale.set(1, 1, rayDist);
    } else {
      laserFloorSpotMat.opacity = 0;
    }

    if (state.fcsBitActive) {
      const flapAng = (Math.sin(elapsed * 1.5) * 0.5 + 0.5) * 0.38;
      for (const f of fcsSurfaces.flaps) f.rotation.x = flapAng;
      const ailAng = Math.sin(elapsed * 2.2) * 0.28;
      for (const a of fcsSurfaces.ailerons) a.pivot.rotation.x = ailAng * a.side;
      const rudAng = Math.sin(elapsed * 1.8) * 0.30;
      for (const r of fcsSurfaces.rudders) r.rotation.y = rudAng;
      if (fcsSurfaces.elevator) fcsSurfaces.elevator.rotation.x = Math.cos(elapsed * 2.0) * 0.24;
    } else {
      for (const f of fcsSurfaces.flaps) f.rotation.x *= 0.92;
      for (const a of fcsSurfaces.ailerons) a.pivot.rotation.x *= 0.92;
      for (const r of fcsSurfaces.rudders) r.rotation.y *= 0.92;
      if (fcsSurfaces.elevator) fcsSurfaces.elevator.rotation.x *= 0.92;
    }

    for (const st of strobeLights) {
      if (!state.navLightsActive) {
        st.sprite.material.opacity = 0;
        st.mat.color.setHex(0x280608);
        continue;
      }
      const cyc = (elapsed * 0.82 + st.phase) % 1.0;
      const flash = (cyc > 0 && cyc < 0.055) || (cyc > 0.12 && cyc < 0.165) ? 1.0 : 0.10;
      st.sprite.material.opacity = flash * 0.82;
      st.mat.color.setRGB(0.22 + flash * 0.78, 0.04, 0.06);
    }

    munitions.update(elapsed);
  }

  return {
    group: uavRoot,
    munitions,
    state,
    calloutAnchors,
    setLiveryScheme,
    setVariant,
    update,
  };
}
