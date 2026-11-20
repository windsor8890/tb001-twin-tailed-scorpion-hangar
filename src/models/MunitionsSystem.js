import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  createAirframePanelTextures,
  createBrushedMetalTextures,
  createAircraftMarkingsTexture,
  createOrdnancePlaqueTexture,
  createRbfRibbonTexture,
} from '../textures/ProceduralTextures.js';

export const WEAPON_STATIONS_META = [
  {
    id: 'STA-01',
    code: 'STBD · OUT',
    side: '右外翼',
    x: -4.55,
    wingY: 1.946,
    weaponType: 'CM-502KG',
    count: 2,
    name: 'CM-502KG / AR-2 轻型多用途空地导弹',
    enName: 'CM-502KG LIGHT TACTICAL AGM',
    massKg: '2 × 25 KG',
    rangeKm: '25.0 KM',
    guidance: '电视/非制冷红外成像 + 双向数据链',
    warhead: '串联破甲/多用途杀爆战斗部',
  },
  {
    id: 'STA-02',
    code: 'STBD · MID',
    side: '右中翼',
    x: -3.48,
    wingY: 1.924,
    weaponType: 'FT-9',
    count: 2,
    name: 'FT-9 飞腾精确制导炸弹',
    enName: 'FT-9 PRECISION GUIDED MUNITION',
    massKg: '2 × 50 KG',
    rangeKm: '32.0 KM',
    guidance: '北斗三号/INS + 末段半主动激光复合',
    warhead: '高爆侵彻杀伤战斗部',
  },
  {
    id: 'STA-03',
    code: 'STBD · IN',
    side: '右内翼',
    x: -1.44,
    wingY: 1.902,
    weaponType: 'AR-4',
    count: 2,
    name: 'AR-4 重型多模防区外空地导弹',
    enName: 'AR-4 HEAVY TRI-MODE STRIKE AGM',
    massKg: '2 × 80 KG',
    rangeKm: '20.0 – 40.0 KM',
    guidance: '毫米波 / 红外成像 / 激光三模复合导引',
    warhead: '重型聚能破甲/攻坚侵彻战斗部',
  },
  {
    id: 'STA-04',
    code: 'PORT · IN',
    side: '左内翼',
    x: 1.44,
    wingY: 1.902,
    weaponType: 'AR-4',
    count: 2,
    name: 'AR-4 重型多模防区外空地导弹',
    enName: 'AR-4 HEAVY TRI-MODE STRIKE AGM',
    massKg: '2 × 80 KG',
    rangeKm: '20.0 – 40.0 KM',
    guidance: '毫米波 / 红外成像 / 激光三模复合导引',
    warhead: '重型聚能破甲/攻坚侵彻战斗部',
  },
  {
    id: 'STA-05',
    code: 'PORT · MID',
    side: '左中翼',
    x: 3.48,
    wingY: 1.924,
    weaponType: 'FT-9',
    count: 2,
    name: 'FT-9 飞腾精确制导炸弹',
    enName: 'FT-9 PRECISION GUIDED MUNITION',
    massKg: '2 × 50 KG',
    rangeKm: '32.0 KM',
    guidance: '北斗三号/INS + 末段半主动激光复合',
    warhead: '高爆侵彻杀伤战斗部',
  },
  {
    id: 'STA-06',
    code: 'PORT · OUT',
    side: '左外翼',
    x: 4.55,
    wingY: 1.946,
    weaponType: 'CM-502KG',
    count: 2,
    name: 'CM-502KG / AR-2 轻型多用途空地导弹',
    enName: 'CM-502KG LIGHT TACTICAL AGM',
    massKg: '2 × 25 KG',
    rangeKm: '25.0 KM',
    guidance: '电视/非制冷红外成像 + 双向数据链',
    warhead: '串联破甲/多用途杀爆战斗部',
  },
];

function createWeaponStencilTexture(mainCode, subCode) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 512, 128);

  ctx.fillStyle = 'rgba(242, 245, 248, 0.90)';
  ctx.font = '700 38px "Barlow Condensed", sans-serif';
  ctx.fillText(mainCode, 28, 62);

  ctx.fillStyle = 'rgba(205, 212, 220, 0.65)';
  ctx.font = '500 16px "IBM Plex Mono", monospace';
  ctx.fillText(subCode, 30, 92);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function createOrdnanceMaterials() {
  const darkPylonTex = createAirframePanelTextures('#424a52', 1, 1);
  const brushed = createBrushedMetalTextures();

  return {
    pylonSlate: new THREE.MeshStandardMaterial({
      map: darkPylonTex.map,
      normalMap: darkPylonTex.normalMap,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughnessMap: darkPylonTex.roughnessMap,
      roughness: 0.68,
      metalness: 0.14,
    }),
    cncAnodizedDark: new THREE.MeshStandardMaterial({
      color: 0x2b3138,
      normalMap: brushed.normalMap,
      normalScale: new THREE.Vector2(0.25, 0.25),
      roughness: 0.36,
      metalness: 0.78,
    }),
    cncSilver: new THREE.MeshStandardMaterial({
      color: 0xd0d7de,
      normalMap: brushed.normalMap,
      roughnessMap: brushed.roughnessMap,
      roughness: 0.24,
      metalness: 0.92,
    }),
    cableRubber: new THREE.MeshStandardMaterial({
      color: 0x181b1f,
      roughness: 0.78,
      metalness: 0.08,
    }),
    cm502Charcoal: new THREE.MeshStandardMaterial({
      color: 0x22262b, // Exact matte charcoal-black from ref_3.jpg CM-502
      roughness: 0.60,
      metalness: 0.18,
    }),
    ar4Gunmetal: new THREE.MeshStandardMaterial({
      color: 0x31373d,
      roughness: 0.56,
      metalness: 0.24,
    }),
    ft9Terracotta: new THREE.MeshStandardMaterial({
      color: 0x8f2926, // Exact brick-terracotta oxide FT-9 airshow casing from ref_3.jpg!
      roughness: 0.58,
      metalness: 0.12,
    }),
    ft9TacticalSlate: new THREE.MeshStandardMaterial({
      color: 0x4b535b,
      roughness: 0.62,
      metalness: 0.18,
    }),
    ft7OliveGray: new THREE.MeshStandardMaterial({
      color: 0x8e9389, // Exact pale olive-gray glide bomb from ref_3.jpg!
      roughness: 0.58,
      metalness: 0.12,
    }),
    ar2WhiteTest: new THREE.MeshStandardMaterial({
      color: 0xe6eaee, // Exact matte white light test missile from ref_3.jpg!
      roughness: 0.52,
      metalness: 0.08,
    }),
    seekerNoseBlack: new THREE.MeshStandardMaterial({
      color: 0x171a1e,
      roughness: 0.42,
      metalness: 0.35,
    }),
    orangeBand: new THREE.MeshStandardMaterial({
      color: 0xd9531e, // Exact burnt orange-vermilion missile band from ref_3.jpg!
      roughness: 0.48,
      metalness: 0.10,
    }),
    yellowBand: new THREE.MeshStandardMaterial({
      color: 0xc99326,
      roughness: 0.50,
      metalness: 0.12,
    }),
    // Realistic deeply-coated dark germanium/sapphire seeker optics (NO neon glow!)
    germaniumDome: new THREE.MeshPhysicalMaterial({
      color: 0x261a10,
      roughness: 0.05,
      metalness: 0.35,
      ior: 1.85,
      reflectivity: 1.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
    }),
    sapphireSeekerGlass: new THREE.MeshPhysicalMaterial({
      color: 0x101c26,
      roughness: 0.04,
      metalness: 0.25,
      ior: 1.76,
      reflectivity: 1.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
    }),
    brassInternal: new THREE.MeshStandardMaterial({
      color: 0xb88c46,
      roughness: 0.24,
      metalness: 0.90,
    }),
    exhaustInconel: new THREE.MeshStandardMaterial({
      color: 0x4c453f,
      roughness: 0.32,
      metalness: 0.88,
    }),
    stencilCM502: new THREE.MeshStandardMaterial({
      map: createWeaponStencilTexture('CM-502', 'S/N 02-194 // LIVE'),
      roughness: 0.65,
      metalness: 0.08,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
    stencilFT9: new THREE.MeshStandardMaterial({
      map: createWeaponStencilTexture('FT-9', '50KG BDS/SAL PGM'),
      roughness: 0.65,
      metalness: 0.08,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
    stencilAR4: new THREE.MeshStandardMaterial({
      map: createWeaponStencilTexture('AR-4', '80KG TRI-MODE AGM'),
      roughness: 0.65,
      metalness: 0.08,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
    stencilTengdenPod: new THREE.MeshStandardMaterial({
      map: createAircraftMarkingsTexture('tengden_pod'),
      roughness: 0.65,
      metalness: 0.08,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
    rbfRibbon: new THREE.MeshStandardMaterial({
      map: createRbfRibbonTexture(),
      roughness: 0.78,
      metalness: 0.02,
      side: THREE.DoubleSide,
    }),
    cradleBlue: new THREE.MeshStandardMaterial({
      color: 0x28568a, // Authentic Zhuhai ordnance cradle blue-slate
      roughness: 0.46,
      metalness: 0.35,
    }),
  };
}

function buildClippedFin(rootChord, tipChord, span, thickness, sweep, material) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(sweep, span);
  shape.lineTo(sweep + tipChord, span);
  shape.lineTo(rootChord, 0);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: thickness * 0.35,
    bevelSize: 0.002,
    bevelSegments: 1,
  });
  geo.translate(0, 0, -thickness / 2);
  geo.rotateY(Math.PI / 2);
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * Builds a single museum-grade munition with recessed multi-part optical seeker & machined hardware.
 */
export function buildMunitionMesh(type, mats, scheme = 'airshow') {
  const g = new THREE.Group();

  if (type === 'CM-502KG') {
    // Exact ref_3.jpg outer-pylon missile: matte charcoal body, twin burnt-orange bands, CM-502 stencil
    const r = 0.064;
    const len = 1.18;
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, len, 28),
      mats.cm502Charcoal
    );
    body.rotation.x = Math.PI / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    // Tapered machined seeker bezel + internal brass gimbal ring + dark coated optical dome
    const bezel = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.82, r, 0.08, 28),
      mats.cncAnodizedDark
    );
    bezel.rotation.x = Math.PI / 2;
    bezel.position.z = len / 2 + 0.04;
    g.add(bezel);

    const innerRing = new THREE.Mesh(
      new THREE.TorusGeometry(r * 0.52, 0.006, 8, 20),
      mats.brassInternal
    );
    innerRing.position.z = len / 2 + 0.075;
    g.add(innerRing);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.80, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.52),
      mats.sapphireSeekerGlass
    );
    dome.rotation.x = Math.PI / 2;
    dome.position.z = len / 2 + 0.068;
    g.add(dome);

    // Twin burnt-orange bands exactly as seen on CM-502 in ref_3.jpg!
    for (const zb of [0.34, 0.14]) {
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(r + 0.0012, r + 0.0012, 0.036, 28),
        mats.orangeBand
      );
      band.rotation.x = Math.PI / 2;
      band.position.z = zb;
      g.add(band);
    }

    for (const dir of [-1, 1]) {
      const dec = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.09), mats.stencilCM502);
      dec.userData.noAO = true;
      dec.position.set(dir * (r + 0.002), 0.005, -0.05);
      dec.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      g.add(dec);
    }

    for (let i = 0; i < 4; i++) {
      const piv = new THREE.Group();
      piv.rotation.z = Math.PI / 4 + (i * Math.PI) / 2;
      const midFin = buildClippedFin(0.22, 0.09, 0.095, 0.0045, 0.08, mats.cncAnodizedDark);
      midFin.position.set(0, r - 0.003, 0.10);
      piv.add(midFin);

      const aftFin = buildClippedFin(0.14, 0.07, 0.088, 0.004, 0.05, mats.cncAnodizedDark);
      aftFin.position.set(0, r - 0.003, -len / 2 + 0.16);
      piv.add(aftFin);
      g.add(piv);
    }

    const nozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.92, r * 0.68, 0.065, 22),
      mats.exhaustInconel
    );
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.z = -len / 2 - 0.032;
    g.add(nozzle);
  } else if (type === 'FT-9') {
    // Exact ref_3.jpg FT-9 Precision Guided Bomb: terracotta-red body (or tactical slate), matte black seeker nose, FT-9 stencil!
    const r = 0.074;
    const len = 1.14;
    const bodyMat = scheme === 'airshow' ? mats.ft9Terracotta : mats.ft9TacticalSlate;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 28), bodyMat);
    body.rotation.x = Math.PI / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    // Matte black conical-ogive guidance unit (exact match to FT-9 in ref_3.jpg!)
    const nosePts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const rad = Math.pow(1 - t, 0.68) * r;
      nosePts.push(new THREE.Vector2(Math.max(0.022, rad), t * 0.28));
    }
    const noseGeo = new THREE.LatheGeometry(nosePts, 28);
    noseGeo.rotateX(Math.PI / 2);
    const noseMesh = new THREE.Mesh(noseGeo, mats.seekerNoseBlack);
    noseMesh.position.z = len / 2;
    noseMesh.castShadow = true;
    g.add(noseMesh);

    const seekerLens = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
      mats.germaniumDome
    );
    seekerLens.rotation.x = Math.PI / 2;
    seekerLens.position.z = len / 2 + 0.275;
    g.add(seekerLens);

    // Machined silver lug band
    const lugRing = new THREE.Mesh(
      new THREE.CylinderGeometry(r + 0.0025, r + 0.0025, 0.028, 28),
      mats.cncSilver
    );
    lugRing.rotation.x = Math.PI / 2;
    lugRing.position.z = 0.08;
    g.add(lugRing);

    for (const dir of [-1, 1]) {
      const dec = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.105), mats.stencilFT9);
      dec.userData.noAO = true;
      dec.position.set(dir * (r + 0.002), 0.006, -0.14);
      dec.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      g.add(dec);
    }

    // Tail strakes & cruciform guidance fins (45° X-config)
    const tailCone = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r * 0.64, 0.22, 24),
      bodyMat
    );
    tailCone.rotation.x = Math.PI / 2;
    tailCone.position.z = -len / 2 - 0.11;
    g.add(tailCone);

    for (let i = 0; i < 4; i++) {
      const piv = new THREE.Group();
      piv.rotation.z = Math.PI / 4 + (i * Math.PI) / 2;
      const fin = buildClippedFin(0.36, 0.18, 0.115, 0.005, 0.09, bodyMat);
      fin.position.set(0, r * 0.85, -len / 2 + 0.18);
      piv.add(fin);
      g.add(piv);
    }
  } else if (type === 'AR-4') {
    // Heavy 80kg Multi-Mode AGM on inboard dual racks
    const r = 0.088;
    const len = 1.44;
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, len, 32),
      mats.ar4Gunmetal
    );
    body.rotation.x = Math.PI / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.84, r, 0.09, 32),
      mats.cncAnodizedDark
    );
    collar.rotation.x = Math.PI / 2;
    collar.position.z = len / 2 + 0.045;
    g.add(collar);

    const innerAperture = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.028, 0.03, 20),
      mats.brassInternal
    );
    innerAperture.rotation.x = Math.PI / 2;
    innerAperture.position.z = len / 2 + 0.082;
    g.add(innerAperture);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.83, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.52),
      mats.germaniumDome
    );
    dome.rotation.x = Math.PI / 2;
    dome.position.z = len / 2 + 0.076;
    g.add(dome);

    for (const zb of [0.42, 0.33]) {
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(r + 0.0014, r + 0.0014, 0.032, 32),
        mats.orangeBand
      );
      band.rotation.x = Math.PI / 2;
      band.position.z = zb;
      g.add(band);
    }

    for (const zr of [0.16, -0.18]) {
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(r + 0.003, r + 0.003, 0.022, 32),
        mats.cncSilver
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.z = zr;
      g.add(ring);
    }

    for (const dir of [-1, 1]) {
      const dec = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.12), mats.stencilAR4);
      dec.userData.noAO = true;
      dec.position.set(dir * (r + 0.0025), 0.006, -0.02);
      dec.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      g.add(dec);
    }

    for (let i = 0; i < 4; i++) {
      const piv = new THREE.Group();
      piv.rotation.z = Math.PI / 4 + (i * Math.PI) / 2;
      const wing = buildClippedFin(0.32, 0.11, 0.155, 0.006, 0.15, mats.cncAnodizedDark);
      wing.position.set(0, r - 0.004, 0.12);
      piv.add(wing);

      const tail = buildClippedFin(0.16, 0.085, 0.128, 0.005, 0.055, mats.cncAnodizedDark);
      tail.position.set(0, r - 0.004, -len / 2 + 0.18);
      piv.add(tail);
      g.add(piv);
    }

    const tailCone = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r * 0.66, 0.10, 24),
      mats.exhaustInconel
    );
    tailCone.rotation.x = Math.PI / 2;
    tailCone.position.z = -len / 2 - 0.05;
    g.add(tailCone);
  } else if (type === 'FT-7-GLIDE') {
    // Pale olive-gray planar-wing glide bomb from ref_3.jpg foreground!
    const r = 0.072;
    const len = 1.28;
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, len, 24),
      mats.ft7OliveGray
    );
    body.rotation.x = Math.PI / 2;
    body.castShadow = true;
    g.add(body);

    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(r, 0.28, 24),
      mats.ft7OliveGray
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.z = len / 2 + 0.14;
    g.add(nose);

    const wingPack = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.032, 0.82),
      mats.cncAnodizedDark
    );
    wingPack.position.set(0, r + 0.016, 0.05);
    g.add(wingPack);

    for (let i = 0; i < 4; i++) {
      const piv = new THREE.Group();
      piv.rotation.z = Math.PI / 4 + (i * Math.PI) / 2;
      const fin = buildClippedFin(0.24, 0.14, 0.11, 0.005, 0.06, mats.ft7OliveGray);
      fin.position.set(0, r * 0.85, -len / 2 + 0.22);
      piv.add(fin);
      g.add(piv);
    }
  } else if (type === 'TENGDEN-POD') {
    // Matte-charcoal heavy standoff cruise pod/dispensers with "TENGDEN 腾盾科创" from ref_3.jpg!
    const r = 0.125;
    const len = 1.72;
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, len, 32),
      mats.cm502Charcoal
    );
    body.rotation.x = Math.PI / 2;
    body.castShadow = true;
    g.add(body);

    const noseCap = new THREE.Mesh(
      new THREE.SphereGeometry(r, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.5),
      mats.cm502Charcoal
    );
    noseCap.rotation.x = Math.PI / 2;
    noseCap.position.z = len / 2;
    g.add(noseCap);

    const tailCone = new THREE.Mesh(
      new THREE.CylinderGeometry(r, 0.045, 0.34, 24),
      mats.cm502Charcoal
    );
    tailCone.rotation.x = Math.PI / 2;
    tailCone.position.z = -len / 2 - 0.17;
    g.add(tailCone);

    for (const dir of [-1, 1]) {
      const dec = new THREE.Mesh(
        new THREE.PlaneGeometry(0.72, 0.18),
        mats.stencilTengdenPod
      );
      dec.userData.noAO = true;
      dec.position.set(dir * (r + 0.002), 0.02, 0.18);
      dec.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      g.add(dec);
    }

    for (let i = 0; i < 4; i++) {
      const piv = new THREE.Group();
      piv.rotation.z = (i * Math.PI) / 2;
      const fin = buildClippedFin(0.24, 0.14, 0.14, 0.006, 0.06, mats.cm502Charcoal);
      fin.position.set(0, r * 0.65, -len / 2 - 0.02);
      piv.add(fin);
      g.add(piv);
    }
  } else if (type === 'AR-2-WHITE') {
    // White exhibition precision light missile from ref_3.jpg foreground!
    const r = 0.048;
    const len = 0.96;
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, len, 22),
      mats.ar2WhiteTest
    );
    body.rotation.x = Math.PI / 2;
    body.castShadow = true;
    g.add(body);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(r, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
      mats.sapphireSeekerGlass
    );
    dome.rotation.x = Math.PI / 2;
    dome.position.z = len / 2;
    g.add(dome);

    for (let i = 0; i < 4; i++) {
      const piv = new THREE.Group();
      piv.rotation.z = (i * Math.PI) / 2;
      const fin = buildClippedFin(0.26, 0.12, 0.095, 0.004, 0.08, mats.ar2WhiteTest);
      fin.position.set(0, r * 0.85, -0.08);
      piv.add(fin);
      g.add(piv);
    }
  }

  return g;
}

/**
 * Builds the 6 Underwing Pylons + Stepped Dual Composite Ejector Racks + 12 Live Munitions.
 */
export function buildMunitionsSystem(mats = createOrdnanceMaterials()) {
  const root = new THREE.Group();
  root.name = 'MunitionsSystem';

  const stations = new Map();
  const rbfStreamers = [];
  const ft9BodyMeshes = [];

  for (const meta of WEAPON_STATIONS_META) {
    const stGroup = new THREE.Group();
    stGroup.name = meta.id;
    const attachY = meta.wingY - 0.052;
    stGroup.position.set(meta.x, attachY, 0.06);

    const isHeavy = meta.weaponType === 'AR-4';
    const pylonH = isHeavy ? 0.25 : 0.22;
    const pylonLen = isHeavy ? 1.02 : 0.88;

    // 1. Sculpted Stepped Wing Pylon (modeled directly on ref_3.jpg underwing pylon!)
    const pylonShape = new THREE.Shape();
    pylonShape.moveTo(-pylonLen * 0.46, 0);
    pylonShape.lineTo(pylonLen * 0.54, 0);
    pylonShape.lineTo(pylonLen * 0.40, -pylonH);
    pylonShape.lineTo(-pylonLen * 0.40, -pylonH);
    pylonShape.closePath();

    const pylonGeo = new THREE.ExtrudeGeometry(pylonShape, {
      depth: 0.068,
      bevelEnabled: true,
      bevelThickness: 0.009,
      bevelSize: 0.007,
      bevelSegments: 2,
    });
    pylonGeo.translate(0, 0, -0.034);
    pylonGeo.rotateY(Math.PI / 2);
    const pylonMesh = new THREE.Mesh(pylonGeo, mats.pylonSlate);
    pylonMesh.position.y = 0.038;
    pylonMesh.castShadow = true;
    pylonMesh.receiveShadow = true;
    stGroup.add(pylonMesh);

    // Wing-to-Pylon Aerodynamic Root Fairing Collar
    const rootCollar = new THREE.Mesh(
      new RoundedBoxGeometry(0.11, 0.028, pylonLen * 1.04, 2, 0.008),
      mats.pylonSlate
    );
    rootCollar.position.set(0, 0.032, 0.02);
    stGroup.add(rootCollar);

    // 2. Beveled CNC Y-Spreader Dual Composite Ejector Rack (Hero Close-Up Geometry!)
    const rackSpread = isHeavy ? 0.195 : meta.weaponType === 'FT-9' ? 0.172 : 0.152;
    const rackY = -pylonH + 0.03;

    const adapterBeam = new THREE.Mesh(
      new RoundedBoxGeometry(0.115, 0.056, pylonLen * 0.78, 3, 0.009),
      mats.cncAnodizedDark
    );
    adapterBeam.position.set(0, rackY, 0.02);
    adapterBeam.castShadow = true;
    adapterBeam.receiveShadow = true;
    stGroup.add(adapterBeam);

    // CNC hex mounting bolt heads along pylon flank
    for (const sDir of [-1, 1]) {
      for (const zb of [-0.26, 0.02, 0.28]) {
        const bolt = new THREE.Mesh(
          new THREE.CylinderGeometry(0.006, 0.006, 0.012, 6),
          mats.cncSilver
        );
        bolt.rotation.z = Math.PI / 2;
        bolt.position.set(sDir * 0.044, -pylonH * 0.45, zb);
        stGroup.add(bolt);
      }
    }

    for (const side of [-1, 1]) {
      // Chamfered CNC spreader arm
      const arm = new THREE.Mesh(
        new RoundedBoxGeometry(rackSpread + 0.035, 0.036, 0.36, 2, 0.007),
        mats.pylonSlate
      );
      arm.position.set(side * (rackSpread * 0.5), rackY - 0.012, 0.02);
      arm.rotation.z = side * -0.16;
      arm.castShadow = true;
      stGroup.add(arm);

      // Machined Ejector Launch Rail
      const rail = new THREE.Mesh(
        new RoundedBoxGeometry(0.048, 0.046, isHeavy ? 0.96 : 0.82, 2, 0.007),
        mats.cncAnodizedDark
      );
      rail.position.set(side * rackSpread, rackY - 0.044, 0.03);
      rail.castShadow = true;
      rail.receiveShadow = true;
      stGroup.add(rail);

      // Threaded CNC silver sway-brace pads + central suspension lug shackles
      for (const zb of [-0.17, 0.19]) {
        const lugPin = new THREE.Mesh(
          new THREE.BoxGeometry(0.018, 0.036, 0.038),
          mats.cncSilver
        );
        lugPin.position.set(side * rackSpread, rackY - 0.068, zb);
        stGroup.add(lugPin);

        for (const sDir of [-1, 1]) {
          const brace = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0055, 0.0055, 0.052, 8),
            mats.cncSilver
          );
          brace.position.set(side * rackSpread + sDir * 0.024, rackY - 0.072, zb);
          brace.rotation.z = sDir * 0.36;
          stGroup.add(brace);
        }
      }

      // Umbilical data cable
      const cCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.035, rackY, 0.14),
        new THREE.Vector3(side * (rackSpread * 0.65), rackY - 0.025, 0.18),
        new THREE.Vector3(side * rackSpread, rackY - 0.07, 0.12),
      ]);
      stGroup.add(
        new THREE.Mesh(new THREE.TubeGeometry(cCurve, 8, 0.0055, 6, false), mats.cableRubber)
      );
    }

    // Subtle Remove-Before-Flight cloth safety streamer on inboard & mid racks
    if (meta.id !== 'STA-01' && meta.id !== 'STA-06') {
      const rbfPiv = new THREE.Group();
      rbfPiv.position.set(Math.sign(meta.x) * (rackSpread + 0.028), rackY - 0.04, 0.25);
      const rbfGeo = new THREE.PlaneGeometry(0.044, 0.28);
      rbfGeo.translate(0, -0.14, 0);
      const rbfMesh = new THREE.Mesh(rbfGeo, mats.rbfRibbon);
      rbfMesh.userData.noAO = true;
      rbfMesh.rotation.y = Math.PI / 5;
      rbfPiv.add(rbfMesh);
      stGroup.add(rbfPiv);
      rbfStreamers.push({ pivot: rbfPiv, phase: Math.abs(meta.x) * 1.4 });
    }

    // 3. Mount Twin Precision Munitions
    const mRadius =
      meta.weaponType === 'AR-4' ? 0.088 : meta.weaponType === 'FT-9' ? 0.074 : 0.064;
    const mCenterY = rackY - 0.068 - mRadius;

    const missileMeshes = [];
    for (const side of [-1, 1]) {
      const m = buildMunitionMesh(meta.weaponType, mats, 'airshow');
      m.position.set(side * rackSpread, mCenterY, 0.05);
      stGroup.add(m);
      missileMeshes.push(m);
      if (meta.weaponType === 'FT-9') {
        m.traverse((child) => {
          if (child.isMesh && child.material === mats.ft9Terracotta) {
            ft9BodyMeshes.push(child);
          }
        });
      }
    }

    // 4. Restrained Architectural Selection Wireframe Box (Muted Champagne Gold #C8A464)
    const edges = new THREE.EdgesGeometry(
      new THREE.BoxGeometry(rackSpread * 2 + 0.28, 0.34, isHeavy ? 1.76 : 1.48)
    );
    const selBox = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({
        color: 0xc8a464,
        transparent: true,
        opacity: 0.0,
      })
    );
    selBox.position.set(0, mCenterY + 0.03, 0.05);
    stGroup.add(selBox);

    root.add(stGroup);
    stations.set(meta.id, {
      meta,
      group: stGroup,
      missileMeshes,
      selLineMat: selBox.material,
    });
  }

  function setHighlightedStation(stationId) {
    for (const [id, st] of stations.entries()) {
      st.selLineMat.opacity = id === stationId ? 0.72 : 0.0;
    }
  }

  function setLiveryScheme(scheme) {
    const targetMat = scheme === 'airshow' ? mats.ft9Terracotta : mats.ft9TacticalSlate;
    for (const m of ft9BodyMeshes) {
      m.material = targetMat;
    }
  }

  function setLoadoutMode(mode) {
    for (const [, st] of stations.entries()) {
      const singleOuter =
        mode === 'recon8' &&
        (st.meta.id === 'STA-01' ||
          st.meta.id === 'STA-02' ||
          st.meta.id === 'STA-05' ||
          st.meta.id === 'STA-06');
      st.missileMeshes[0].visible = true;
      st.missileMeshes[1].visible = !singleOuter;
    }
  }

  function update(elapsed) {
    for (const s of rbfStreamers) {
      s.pivot.rotation.z = Math.sin(elapsed * 1.7 + s.phase) * 0.045;
    }
  }

  return {
    group: root,
    stations,
    materials: mats,
    setHighlightedStation,
    setLiveryScheme,
    setLoadoutMode,
    update,
  };
}

/**
 * Builds the authentic Zhuhai Airshow Multi-Tier Static Munitions Showcase
 * seen in the starboard-front foreground of ref_3.jpg (all munitions pointing +Z
 * parallel to the UAV nose, stepped outboard along -X on blue-slate steel cradles).
 */
export function buildOrdnanceShowcaseRow(mats = createOrdnanceMaterials()) {
  const rowGroup = new THREE.Group();
  rowGroup.name = 'OrdnanceShowcaseRow';

  const displaySpec = [
    { type: 'TENGDEN-POD', code: 'TD-POD', sub: '重型防区外载荷', xOff: 0.0, zOff: 0.12, yH: 0.44, zSpan: 0.82, pedestalH: 0.33, rBody: 0.125 },
    { type: 'TENGDEN-POD', code: 'TD-POD', sub: '多用途巡航布撒器', xOff: -0.52, zOff: -0.02, yH: 0.42, zSpan: 0.82, pedestalH: 0.31, rBody: 0.125 },
    { type: 'FT-7-GLIDE', code: 'FT-7', sub: '平面弹翼滑翔炸弹', xOff: -1.06, zOff: 0.04, yH: 0.38, zSpan: 0.64, pedestalH: 0.29, rBody: 0.072 },
    { type: 'FT-9', code: 'FT-9', sub: '50KG 精确制导炸弹', xOff: -1.58, zOff: -0.04, yH: 0.35, zSpan: 0.56, pedestalH: 0.27, rBody: 0.074 },
    { type: 'AR-2-WHITE', code: 'AR-2', sub: '20KG 轻型空地导弹', xOff: -2.06, zOff: -0.08, yH: 0.32, zSpan: 0.44, pedestalH: 0.25, rBody: 0.048 },
  ];

  for (const item of displaySpec) {
    const itemGrp = new THREE.Group();
    itemGrp.position.set(item.xOff, 0, item.zOff);

    // Munition natively points +Z (nose forward, parallel to UAV nose!)
    const munition = buildMunitionMesh(item.type, mats, 'airshow');
    munition.position.y = item.yH;
    itemGrp.add(munition);

    // Sculpted Flanged Steel Exhibition Cradles with Rubber V-Saddle Pads & Weapon Plaque
    const plaqueMat = new THREE.MeshStandardMaterial({
      map: createOrdnancePlaqueTexture(item.code, item.sub),
      roughness: 0.48,
      metalness: 0.18,
    });

    for (const zDir of [-1, 1]) {
      const zPos = zDir * (item.zSpan * 0.5);

      // Chamfered steel pedestal column
      const stand = new THREE.Mesh(
        new RoundedBoxGeometry(0.18, item.pedestalH, 0.095, 2, 0.008),
        mats.cradleBlue
      );
      stand.position.set(0, item.pedestalH * 0.5 + 0.012, zPos);
      stand.castShadow = true;
      stand.receiveShadow = true;
      itemGrp.add(stand);

      // Twin neoprene-padded V-saddle cheeks cradling the cylindrical munition body
      for (const sx of [-1, 1]) {
        const cheek = new THREE.Mesh(
          new RoundedBoxGeometry(0.034, 0.056, 0.105, 2, 0.006),
          mats.cableRubber
        );
        cheek.position.set(
          sx * (item.rBody * 0.72 + 0.014),
          item.yH - item.rBody * 0.72,
          zPos
        );
        cheek.rotation.z = sx * -0.45;
        itemGrp.add(cheek);
      }

      // Flanged dark steel footplate with 4 corner anchor bolts
      const basePlate = new THREE.Mesh(
        new RoundedBoxGeometry(0.25, 0.016, 0.16, 2, 0.004),
        mats.cncAnodizedDark
      );
      basePlate.position.set(0, 0.008, zPos);
      basePlate.receiveShadow = true;
      itemGrp.add(basePlate);

      for (const bx of [-0.095, 0.095]) {
        for (const bz of [-0.055, 0.055]) {
          const bolt = new THREE.Mesh(
            new THREE.CylinderGeometry(0.006, 0.006, 0.012, 6),
            mats.cncSilver
          );
          bolt.position.set(bx, 0.018, zPos + bz);
          itemGrp.add(bolt);
        }
      }

      // Forward-facing exhibition weapon nameplate on the front pedestal
      if (zDir > 0) {
        const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.145, 0.072), plaqueMat);
        plaque.userData.noAO = true;
        plaque.position.set(0, item.pedestalH * 0.56, zPos + 0.049);
        itemGrp.add(plaque);
      }
    }

    rowGroup.add(itemGrp);
  }

  return rowGroup;
}
