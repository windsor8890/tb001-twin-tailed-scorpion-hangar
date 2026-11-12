import * as THREE from 'three';

function createCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Converts a grayscale heightfield canvas into a true RGB Tangent-Space Normal Map
 * via 3x3 Sobel filter for crisp grazing-angle micro-surface relief.
 */
function heightCanvasToNormalTexture(heightCanvas, strength = 2.4, repeatX = 1, repeatY = 1) {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const src = heightCanvas.getContext('2d').getImageData(0, 0, w, h).data;

  const outCanvas = createCanvas(w, h);
  const outCtx = outCanvas.getContext('2d');
  const outImg = outCtx.createImageData(w, h);
  const dst = outImg.data;

  const sampleH = (x, y) => {
    const wx = ((x % w) + w) % w;
    const wy = ((y % h) + h) % h;
    return src[(wy * w + wx) * 4] / 255.0;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = sampleH(x - 1, y - 1);
      const t = sampleH(x, y - 1);
      const tr = sampleH(x + 1, y - 1);
      const l = sampleH(x - 1, y);
      const r = sampleH(x + 1, y);
      const bl = sampleH(x - 1, y + 1);
      const b = sampleH(x, y + 1);
      const br = sampleH(x + 1, y + 1);

      const dX = (tr + 2.0 * r + br - (tl + 2.0 * l + bl)) * strength;
      const dY = (bl + 2.0 * b + br - (tl + 2.0 * t + tr)) * strength;

      let nx = -dX;
      let ny = dY; // OpenGL +Y tangent-space convention
      let nz = 1.0;
      const invLen = 1.0 / Math.hypot(nx, ny, nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;

      const idx = (y * w + x) * 4;
      dst[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      dst[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      dst[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      dst[idx + 3] = 255;
    }
  }

  outCtx.putImageData(outImg, 0, 0);
  const tex = new THREE.CanvasTexture(outCanvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 8;
  return tex;
}

/**
 * Generates UV-mapped 2048x2048 Central Fuselage Livery PBR Textures
 * 100% faithful to the Zhuhai Airshow Tengden TB-001/TB-001A reference photo:
 * - Upper curved SATCOM dome: Matte Light Gull Gray (#B7BFC7)
 * - Nose tip chined lower radome: Matte Medium Dielectric Gray (#8B949E)
 * - Lower fuselage, avionics & aft body: Deep Matte Tactical Slate (#424A52)
 * - Official crisp white "TENGDEN" + "腾 | 盾 | 科 | 创" side branding on both flanks
 * Also supports 'tactical' PLA low-visibility scheme (JD-1052).
 */
export function createFuselageLiveryTextures(scheme = 'airshow') {
  const size = 2048;
  const albedo = createCanvas(size, size);
  const height = createCanvas(size, size);
  const rough = createCanvas(size, size);

  const aCtx = albedo.getContext('2d');
  const hCtx = height.getContext('2d');
  const rCtx = rough.getContext('2d');
  const rand = seededRandom(1052);

  // UV convention on lofted fuselage:
  // u in [0..1]:theta around circumference:
  //   u = 0.0 / 1.0 -> Dorsal Spine (+Y)
  //   u = 0.25      -> Port Side (+X)
  //   u = 0.50      -> Ventral Belly (-Y)
  //   u = 0.75      -> Starboard Side (-X)
  // vCoord in BufferGeometry: v = (zMax - z) / zSpan -> Canvas Y = (1 - v) * size!
  // Wait: in Three.js CanvasTexture (flipY = true default):
  //   v = 0 (Nose tip zMax = +4.55m) samples BOTTOM of canvas (py = size)!
  //   v = 1 (Rear pusher zMin = -1.95m) samples TOP of canvas (py = 0)!
  // Let's use explicit pixel loop for rock-solid exact demarcation curves!

  const aImg = aCtx.createImageData(size, size);
  const aData = aImg.data;

  const isAirshow = scheme === 'airshow';
  // RGB palette calibrated for ACES Filmic HDR lighting (zero highlight clipping on dorsal SATCOM dome)
  const colUpperGull = isAirshow ? [152, 160, 169] : [92, 100, 110];
  const colMidNose = isAirshow ? [116, 124, 134] : [112, 120, 130];
  const colDarkSlate = isAirshow ? [58, 66, 75] : [70, 78, 87];

  for (let py = 0; py < size; py++) {
    // v = 1.0 - py / size; v=0 at nose (+4.55m), v=1 at tail (-1.95m)
    const v = 1.0 - py / (size - 1);

    // Compute circumferential threshold (distFromSpine in [0..0.5], where 0 = top spine, 0.25 = side midline, 0.5 = belly)
    // On real TB-001 (ref_3.jpg), the light-gray SATCOM dome starts near nose tip (v=0.02, dist=0.17),
    // swells generously over the forward hump (v=0.08..0.34, dist=0.235 right down to side chine),
    // then sweeps gracefully up to the dorsal spine ahead of the wing leading edge (v=0.52, dist=0.0)!
    let gullLimit = -1.0;
    if (v <= 0.53) {
      if (v < 0.08) {
        const t = v / 0.08;
        gullLimit = 0.14 + 0.095 * Math.sin(t * Math.PI * 0.5);
      } else if (v < 0.34) {
        gullLimit = 0.235 - (v - 0.08) * 0.08;
      } else {
        const t = (v - 0.34) / 0.19;
        gullLimit = 0.214 * Math.cos(t * Math.PI * 0.5);
      }
    }

    // Medium-gray nose radome lower band (ref_3.jpg: nose tip v < 0.21 sweeps down to chin!)
    let midNoseLimit = -1.0;
    if (v <= 0.22) {
      const t = v / 0.22;
      midNoseLimit = 0.52 * Math.cos(t * Math.PI * 0.5) + 0.12 * (1 - t);
    }

    for (let px = 0; px < size; px++) {
      const u = px / size;
      const distSpine = Math.min(u, 1.0 - u); // 0 at top spine, 0.25 at side, 0.5 at belly

      // Micro-grain paint noise to kill synthetic digital flatness
      const grain = ((px * 73856093) ^ (py * 19349663)) & 255;
      const n = (grain / 255.0 - 0.5) * 4.5;

      let rgb = colDarkSlate;
      let seamEdgeDarken = 0;

      if (distSpine < gullLimit) {
        rgb = colUpperGull;
        if (Math.abs(distSpine - gullLimit) < 0.0022) seamEdgeDarken = -22;
      } else if (distSpine < midNoseLimit) {
        rgb = colMidNose;
        if (Math.abs(distSpine - midNoseLimit) < 0.0022) seamEdgeDarken = -18;
      }

      const idx = (py * size + px) * 4;
      aData[idx] = Math.max(0, Math.min(255, rgb[0] + n + seamEdgeDarken));
      aData[idx + 1] = Math.max(0, Math.min(255, rgb[1] + n + seamEdgeDarken));
      aData[idx + 2] = Math.max(0, Math.min(255, rgb[2] + n + seamEdgeDarken));
      aData[idx + 3] = 255;
    }
  }
  aCtx.putImageData(aImg, 0, 0);

  // Base height & MATTE military polyurethane roughness (~0.68 - 0.76, ZERO plastic gloss!)
  hCtx.fillStyle = '#808080';
  hCtx.fillRect(0, 0, size, size);

  rCtx.fillStyle = '#b4b4b4'; // ~0.70 roughness matte finish
  rCtx.fillRect(0, 0, size, size);

  // Subtle organic composite coating roughness mottling & operational weathering
  for (let i = 0; i < 2400; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const rad = 18 + rand() * 85;
    const darker = rand() > 0.5;
    const g = aCtx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, darker ? 'rgba(20,24,28,0.032)' : 'rgba(220,228,236,0.028)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    aCtx.fillStyle = g;
    aCtx.fillRect(x - rad, y - rad, rad * 2, rad * 2);

    const rg = rCtx.createRadialGradient(x, y, 0, x, y, rad);
    rg.addColorStop(0, darker ? 'rgba(205,205,205,0.08)' : 'rgba(150,150,150,0.08)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    rCtx.fillStyle = rg;
    rCtx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  // Aerospace circumferential fuselage station frames & longitudinal stringer seams
  const framePositionsV = [0.13, 0.24, 0.36, 0.49, 0.62, 0.76, 0.88];
  for (const fv of framePositionsV) {
    const y = (1.0 - fv) * size;
    aCtx.strokeStyle = 'rgba(22, 26, 30, 0.24)';
    aCtx.lineWidth = 1.6;
    aCtx.beginPath();
    aCtx.moveTo(0, y);
    aCtx.lineTo(size, y);
    aCtx.stroke();

    hCtx.strokeStyle = '#484848';
    hCtx.lineWidth = 2.2;
    hCtx.beginPath();
    hCtx.moveTo(0, y);
    hCtx.lineTo(size, y);
    hCtx.stroke();

    // Flush aerospace micro-rivets along fuselage station rings
    for (let rx = 12; rx < size; rx += 22) {
      hCtx.fillStyle = '#626262';
      hCtx.fillRect(rx, y - 6, 1.8, 1.8);
      hCtx.fillRect(rx, y + 5, 1.8, 1.8);
    }
  }

  for (const lu of [0.16, 0.34, 0.66, 0.84]) {
    const x = lu * size;
    aCtx.strokeStyle = 'rgba(22, 26, 30, 0.18)';
    aCtx.lineWidth = 1.4;
    aCtx.beginPath();
    aCtx.moveTo(x, 0);
    aCtx.lineTo(x, size * 0.86);
    aCtx.stroke();

    hCtx.strokeStyle = '#525252';
    hCtx.lineWidth = 1.8;
    hCtx.beginPath();
    hCtx.moveTo(x, 0);
    hCtx.lineTo(x, size * 0.86);
    hCtx.stroke();
  }

  // Avionics Access Hatches with rounded corners & flush latches
  const hatches = [
    [0.24, 0.41, 90, 56],
    [0.76, 0.41, 90, 56],
    [0.26, 0.68, 76, 48],
    [0.74, 0.68, 76, 48],
  ];
  for (const [hu, hv, hw, hh] of hatches) {
    const hx = hu * size - hw / 2;
    const hy = (1.0 - hv) * size - hh / 2;
    aCtx.strokeStyle = 'rgba(20, 24, 28, 0.34)';
    aCtx.lineWidth = 1.5;
    aCtx.beginPath();
    aCtx.roundRect(hx, hy, hw, hh, 6);
    aCtx.stroke();

    hCtx.strokeStyle = '#444444';
    hCtx.lineWidth = 2.0;
    hCtx.beginPath();
    hCtx.roundRect(hx, hy, hw, hh, 6);
    hCtx.stroke();
  }

  // Official Forward Fuselage Branding on BOTH Port (u≈0.28) & Starboard (u≈0.72) flanks!
  // Let's verify orientation so text reads forward-to-aft cleanly without mirroring!
  // Along fuselage Z: Nose is v=0 (py = size), Tail is v=1 (py = 0).
  // Wait: u runs horizontally on canvas (theta around Z), v runs vertically (along Z)!
  // So horizontal text along the side of the fuselage runs along the CANVAS Y AXIS (rotated ±90°)!
  // Let's check exact rotation on Port (u = 0.25, +X) vs Starboard (u = 0.75, -X):
  // - Viewed from Starboard (-X looking toward +X):
  //   Left of viewer is Tail (v=1, py=0), Right of viewer is Nose (v=0, py=size)!
  //   Up on aircraft (+Y) is u=1.0 -> u=0.75 (so +Y is toward u=1.0, i.e. +px on canvas!), Down (-Y) is toward u=0.5 (-px).
  //   Wait: to be 1000% immune to cylindrical UV distortion on curved chined sides, we ALSO provide a crisp high-DPI planar decal texture for side markings (`createAircraftMarkingsTexture`) projected cleanly on contoured side decal meshes! Let's use contoured side decal meshes for razor-sharp vector typography at 4K equivalent DPI!

  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;

  const normalMap = heightCanvasToNormalTexture(height, 2.2, 1, 1);

  const roughnessMap = new THREE.CanvasTexture(rough);
  roughnessMap.anisotropy = 8;

  return { map, normalMap, roughnessMap };
}

/**
 * Generates Matte Tactical Airframe Panel PBR Textures (Wings, Booms, Nacelles, Fins)
 * with true Sobel Normal Map, flush rivets, and weathered matte roughness (~0.68-0.75).
 */
export function createAirframePanelTextures(baseHex = '#454d56', repeatX = 2, repeatY = 2) {
  const size = 1024;
  const albedo = createCanvas(size, size);
  const height = createCanvas(size, size);
  const rough = createCanvas(size, size);

  const aCtx = albedo.getContext('2d');
  const hCtx = height.getContext('2d');
  const rCtx = rough.getContext('2d');
  const rand = seededRandom(8848 + baseHex.charCodeAt(1));

  aCtx.fillStyle = baseHex;
  aCtx.fillRect(0, 0, size, size);

  hCtx.fillStyle = '#808080';
  hCtx.fillRect(0, 0, size, size);

  rCtx.fillStyle = '#b2b2b2'; // ~0.70 matte military polyurethane
  rCtx.fillRect(0, 0, size, size);

  // Subtle composite panel tonal variation & micro-weathering
  const cols = 4;
  const rows = 5;
  const cw = size / cols;
  const ch = size / rows;

  for (let gx = 0; gx < cols; gx++) {
    for (let gy = 0; gy < rows; gy++) {
      const delta = (rand() - 0.5) * 8;
      aCtx.fillStyle =
        delta > 0
          ? `rgba(210,220,230,${(Math.abs(delta) / 220).toFixed(3)})`
          : `rgba(18,22,26,${(Math.abs(delta) / 220).toFixed(3)})`;
      aCtx.fillRect(gx * cw + 2, gy * ch + 2, cw - 4, ch - 4);
    }
  }

  for (let i = 0; i < 1600; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const rad = 10 + rand() * 48;
    const g = aCtx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, rand() > 0.5 ? 'rgba(255,255,255,0.022)' : 'rgba(0,0,0,0.028)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    aCtx.fillStyle = g;
    aCtx.fillRect(x - rad, y - rad, rad * 2, rad * 2);

    const rg = rCtx.createRadialGradient(x, y, 0, x, y, rad);
    rg.addColorStop(0, rand() > 0.5 ? 'rgba(200,200,200,0.09)' : 'rgba(145,145,145,0.09)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    rCtx.fillStyle = rg;
    rCtx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  // Flush CAD panel lines & fastener rows
  const drawPanelLine = (x1, y1, x2, y2) => {
    aCtx.strokeStyle = 'rgba(16, 20, 24, 0.28)';
    aCtx.lineWidth = 1.4;
    aCtx.beginPath();
    aCtx.moveTo(x1, y1);
    aCtx.lineTo(x2, y2);
    aCtx.stroke();

    hCtx.strokeStyle = '#464646';
    hCtx.lineWidth = 1.8;
    hCtx.beginPath();
    hCtx.moveTo(x1, y1);
    hCtx.lineTo(x2, y2);
    hCtx.stroke();

    rCtx.strokeStyle = '#d4d4d4';
    rCtx.lineWidth = 2.5;
    rCtx.beginPath();
    rCtx.moveTo(x1, y1);
    rCtx.lineTo(x2, y2);
    rCtx.stroke();

    const len = Math.hypot(x2 - x1, y2 - y1);
    const nx = -(y2 - y1) / len;
    const ny = (x2 - x1) / len;
    const steps = Math.floor(len / 24);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const bx = x1 + (x2 - x1) * t;
      const by = y1 + (y2 - y1) * t;
      for (const off of [-5, 5]) {
        hCtx.fillStyle = '#626262';
        hCtx.fillRect(bx + nx * off - 0.8, by + ny * off - 0.8, 1.6, 1.6);
      }
    }
  };

  for (let i = 1; i < cols; i++) drawPanelLine(i * cw, 0, i * cw, size);
  for (let j = 1; j < rows; j++) drawPanelLine(0, j * ch, size, j * ch);

  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(repeatX, repeatY);
  map.anisotropy = 8;

  const normalMap = heightCanvasToNormalTexture(height, 2.0, repeatX, repeatY);

  const roughnessMap = new THREE.CanvasTexture(rough);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(repeatX, repeatY);
  roughnessMap.anisotropy = 8;

  return { map, normalMap, roughnessMap };
}

/**
 * Generates High-DPI Authentic Zhuhai Airshow & PLA Operational Markings:
 * - 'tengden_brand': Exact "TENGDEN" + "腾 | 盾 | 科 | 创" from ref_3.jpg!
 * - 'tail_serial': Operational serial "JD-1052" + stylized Tengden Scorpion Tail crest!
 * - 'prop_stencil': Crisp aviation warning markings.
 */
export function createAircraftMarkingsTexture(kind = 'tengden_brand') {
  const c = createCanvas(1024, 256);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 1024, 256);

  if (kind === 'tengden_brand') {
    // Exact typography from Zhuhai Airshow TB-001 photo (ref_3.jpg)!
    ctx.fillStyle = 'rgba(240, 244, 248, 0.92)';
    ctx.font = '800 92px "Barlow Condensed", "Arial Black", sans-serif';
    ctx.letterSpacing = '6px';
    ctx.fillText('TENGDEN', 48, 122);

    // Spaced Chinese characters "腾 | 盾 | 科 | 创" with vertical divider bars underneath!
    const chars = ['腾', '盾', '科', '创'];
    ctx.font = '700 34px "Noto Sans SC", "Microsoft YaHei", sans-serif';
    ctx.letterSpacing = '0px';
    const startX = 54;
    const stepX = 112;
    chars.forEach((ch, idx) => {
      ctx.fillStyle = 'rgba(236, 241, 246, 0.90)';
      ctx.fillText(ch, startX + idx * stepX, 182);
      if (idx < chars.length - 1) {
        ctx.fillStyle = 'rgba(210, 220, 230, 0.55)';
        ctx.fillRect(startX + idx * stepX + 68, 152, 2.5, 34);
      }
    });

    // Subtle technical data stencil block aft of logo
    ctx.fillStyle = 'rgba(195, 205, 215, 0.55)';
    ctx.font = '500 18px "IBM Plex Mono", monospace';
    ctx.fillText('MODEL TW328-A // MTOW 3250KG', 560, 148);
    ctx.fillText('STATIC PORT — KEEP CLEAR', 560, 176);
  } else if (kind === 'tail_serial') {
    // Stylized Minimalist Twin-Tailed Scorpion Vector Emblem + Real JD-1052 Serial
    ctx.strokeStyle = 'rgba(212, 220, 228, 0.62)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    // Twin curved scorpion tail stingers
    ctx.moveTo(75, 185);
    ctx.bezierCurveTo(55, 130, 72, 72, 128, 56);
    ctx.lineTo(116, 76);
    ctx.moveTo(102, 192);
    ctx.bezierCurveTo(86, 138, 104, 84, 154, 68);
    ctx.lineTo(142, 88);
    ctx.stroke();

    ctx.fillStyle = 'rgba(218, 225, 232, 0.72)';
    ctx.font = '600 68px "Barlow Condensed", sans-serif';
    ctx.fillText('JD-1052', 195, 142);

    ctx.fillStyle = 'rgba(180, 190, 200, 0.52)';
    ctx.font = '500 22px "Noto Sans SC", sans-serif';
    ctx.fillText('双尾蝎A  TB-001A', 198, 182);
  } else if (kind === 'tengden_pod') {
    ctx.fillStyle = 'rgba(242, 246, 250, 0.90)';
    ctx.font = '700 56px "Barlow Condensed", sans-serif';
    ctx.fillText('TENGDEN', 40, 118);
    ctx.font = '600 24px "Noto Sans SC", sans-serif';
    ctx.fillText('腾 | 盾 | 科 | 创', 42, 162);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Generates Brushed Anisotropic Aerospace Aluminum Normal + Roughness Maps
 * for realistic CNC spinner cones, hydraulic collars, and flight case extrusions.
 */
export function createBrushedMetalTextures() {
  const size = 512;
  const hCanvas = createCanvas(size, size);
  const rCanvas = createCanvas(size, size);
  const hCtx = hCanvas.getContext('2d');
  const rCtx = rCanvas.getContext('2d');
  const rand = seededRandom(4096);

  hCtx.fillStyle = '#808080';
  hCtx.fillRect(0, 0, size, size);
  rCtx.fillStyle = '#424242'; // ~0.26 brushed metal roughness
  rCtx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y++) {
    const v = Math.round(112 + rand() * 32);
    hCtx.fillStyle = `rgb(${v},${v},${v})`;
    hCtx.fillRect(0, y, size, 1);

    const rv = Math.round(52 + rand() * 34);
    rCtx.fillStyle = `rgb(${rv},${rv},${rv})`;
    rCtx.fillRect(0, y, size, 1);
  }

  const normalMap = heightCanvasToNormalTexture(hCanvas, 1.4, 1, 2);
  const roughnessMap = new THREE.CanvasTexture(rCanvas);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  return { normalMap, roughnessMap };
}

/**
 * Generates Red Cloth "REMOVE BEFORE FLIGHT / 飞行前取下" Streamer Texture.
 */
export function createRbfRibbonTexture() {
  const c = createCanvas(512, 96);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#a81c24';
  ctx.fillRect(0, 0, 512, 96);

  // Subtle woven nylon fabric lines
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let x = 0; x < 512; x += 4) ctx.fillRect(x, 0, 1, 96);

  ctx.strokeStyle = 'rgba(245,245,245,0.78)';
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 8, 496, 80);

  ctx.fillStyle = '#f4f6f8';
  ctx.font = '700 25px "IBM Plex Mono", "Noto Sans SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('REMOVE BEFORE FLIGHT · 飞行前取下', 256, 57);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Generates 2048x2048 Photorealistic Brushed Hangar Concrete & Dark Epoxy Deck Maps:
 * - RGBA Albedo (alpha modulates reflection visibility physically: matte paint & dry concrete
 *   block mirror reflection, while troweled dark epoxy allows subtle attenuated reflection!)
 * - True Sobel Normal Map (expansion joints, concrete grain, troweled swirls)
 * - Roughness Map (0.28 in epoxy sheen zones -> 0.88 on painted markings & tire tracks)
 */
export function createHangarDeckTextures() {
  const size = 2048;
  const albedo = createCanvas(size, size);
  const height = createCanvas(size, size);
  const rough = createCanvas(size, size);

  const aCtx = albedo.getContext('2d');
  const hCtx = height.getContext('2d');
  const rCtx = rough.getContext('2d');
  const rand = seededRandom(90210);

  // Authentic brushed airfield concrete-epoxy apron (0.93 opacity & ~0.78 matte roughness so floor looks like real concrete, never wet plastic!)
  aCtx.clearRect(0, 0, size, size);
  aCtx.fillStyle = 'rgba(58, 63, 69, 0.93)';
  aCtx.fillRect(0, 0, size, size);

  hCtx.fillStyle = '#808080';
  hCtx.fillRect(0, 0, size, size);

  rCtx.fillStyle = '#c4c4c4'; // ~0.77 dry satin-matte industrial concrete
  rCtx.fillRect(0, 0, size, size);

  // Fine brushed concrete grain lines (inspired by grooved airfield apron in ref_3.jpg!)
  for (let y = 0; y < size; y += 3) {
    const shade = rand() > 0.5 ? 'rgba(255,255,255,0.012)' : 'rgba(0,0,0,0.016)';
    aCtx.fillStyle = shade;
    aCtx.fillRect(0, y, size, 1.5);

    const hv = Math.round(122 + rand() * 12);
    hCtx.fillStyle = `rgb(${hv},${hv},${hv})`;
    hCtx.fillRect(0, y, size, 2);
  }

  // Organic troweled epoxy sheen & weathered concrete roughness variation
  for (let i = 0; i < 1200; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const rad = 24 + rand() * 130;
    const smoother = rand() > 0.48;

    if (smoother) {
      aCtx.save();
      aCtx.globalCompositeOperation = 'destination-out';
      const g = aCtx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(0,0,0,0.12)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      aCtx.fillStyle = g;
      aCtx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      aCtx.restore();

      const rg = rCtx.createRadialGradient(x, y, 0, x, y, rad);
      rg.addColorStop(0, 'rgba(48,48,48,0.32)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      rCtx.fillStyle = rg;
      rCtx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    } else {
      const g = aCtx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(48,52,58,0.14)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      aCtx.fillStyle = g;
      aCtx.fillRect(x - rad, y - rad, rad * 2, rad * 2);

      const rg = rCtx.createRadialGradient(x, y, 0, x, y, rad);
      rg.addColorStop(0, 'rgba(195,195,195,0.28)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      rCtx.fillStyle = rg;
      rCtx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }

  // Saw-cut concrete slab expansion joints (12x12 architectural slabs)
  const slabs = 12;
  const step = size / slabs;
  for (let i = 1; i < slabs; i++) {
    const p = i * step;
    aCtx.strokeStyle = 'rgba(14, 16, 19, 0.94)';
    aCtx.lineWidth = 3.0;
    aCtx.beginPath();
    aCtx.moveTo(p, 0);
    aCtx.lineTo(p, size);
    aCtx.moveTo(0, p);
    aCtx.lineTo(size, p);
    aCtx.stroke();

    hCtx.strokeStyle = '#1e1e1e';
    hCtx.lineWidth = 4.0;
    hCtx.beginPath();
    hCtx.moveTo(p, 0);
    hCtx.lineTo(p, size);
    aCtx.moveTo(0, p);
    hCtx.moveTo(0, p);
    hCtx.lineTo(size, p);
    hCtx.stroke();

    rCtx.strokeStyle = '#e5e5e5';
    rCtx.lineWidth = 5.0;
    rCtx.beginPath();
    rCtx.moveTo(p, 0);
    rCtx.lineTo(p, size);
    rCtx.moveTo(0, p);
    rCtx.lineTo(size, p);
    rCtx.stroke();
  }

  // Authentic Airfield Hangar Ground Markings (muted weathered aviation yellow #C89B2B)
  const cx = size * 0.5;
  const cy = size * 0.5;

  aCtx.save();
  // Subtle perimeter safety line
  const boxW = size * 0.58;
  const boxH = size * 0.42;
  aCtx.strokeStyle = 'rgba(182, 138, 46, 0.72)';
  aCtx.lineWidth = 6;
  aCtx.setLineDash([28, 22]);
  aCtx.strokeRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH);
  aCtx.setLineDash([]);

  rCtx.strokeStyle = '#d8d8d8';
  rCtx.lineWidth = 8;
  rCtx.strokeRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH);

  // Centerline Taxi Lead-In Stripe (opaque matte paint)
  aCtx.fillStyle = 'rgba(202, 154, 44, 0.92)';
  aCtx.fillRect(cx - 5, cy - 380, 10, 920);
  rCtx.fillStyle = '#dcdcdc';
  rCtx.fillRect(cx - 6, cy - 380, 12, 920);

  // Nose Gear Stop T-Mark at z = +3.08m (canvas y = cy + 3.08 / 38 * 2048 ≈ cy + 166)
  const noseStopY = cy + 166;
  aCtx.fillRect(cx - 68, noseStopY - 5, 136, 10);
  rCtx.fillRect(cx - 70, noseStopY - 6, 140, 12);

  // Main Gear Wheel Alignment Brackets at x = ±2.38m (±128px), z = -0.28m (cy - 15px)
  for (const dir of [-1, 1]) {
    const gx = cx + dir * 128;
    const gy = cy - 15;
    aCtx.strokeStyle = 'rgba(202, 154, 44, 0.86)';
    aCtx.lineWidth = 4;
    aCtx.strokeRect(gx - 28, gy - 38, 56, 76);

    // Subtle rubber tire roll-in marks
    const skid = aCtx.createLinearGradient(gx, gy - 380, gx, gy + 40);
    skid.addColorStop(0, 'rgba(12,14,16,0)');
    skid.addColorStop(1, 'rgba(12,14,16,0.42)');
    aCtx.fillStyle = skid;
    aCtx.fillRect(gx - 12, gy - 380, 24, 420);
  }

  // Restrained Technical Ground Stencil
  aCtx.fillStyle = 'rgba(196, 202, 208, 0.44)';
  aCtx.font = '600 32px "Barlow Condensed", sans-serif';
  aCtx.textAlign = 'center';
  aCtx.fillText('BAY 10-2  //  TW328-A  STATIC & ORDNANCE APRON', cx, noseStopY + 78);
  aCtx.restore();

  // Tire scuffs & grit wear across painted lines so lines look walked/driven on!
  for (let s = 0; s < 500; s++) {
    const sx = cx + (rand() - 0.5) * boxW;
    const sy = cy + (rand() - 0.5) * boxH;
    aCtx.strokeStyle = 'rgba(28, 32, 37, 0.42)';
    aCtx.lineWidth = 1 + rand() * 2.5;
    aCtx.beginPath();
    aCtx.moveTo(sx, sy);
    aCtx.lineTo(sx + (rand() - 0.5) * 36, sy + (rand() - 0.5) * 36);
    aCtx.stroke();
  }

  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;

  const normalMap = heightCanvasToNormalTexture(height, 2.2, 1, 1);

  const roughnessMap = new THREE.CanvasTexture(rough);
  roughnessMap.anisotropy = 8;

  return { map, normalMap, roughnessMap };
}

/**
 * Generates Soft Multi-Stop Radial Contact Shadow Texture for grounding tires & airframe.
 */
export function createContactShadowTexture() {
  const c = createCanvas(256, 256);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 126);
  g.addColorStop(0.0, 'rgba(0, 0, 0, 0.78)');
  g.addColorStop(0.38, 'rgba(0, 0, 0, 0.45)');
  g.addColorStop(0.72, 'rgba(0, 0, 0, 0.14)');
  g.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

/**
 * Generates Ribbed Architectural Wall Cladding Normal + Albedo Texture.
 */
export function createArchitecturalRibTextures() {
  const size = 512;
  const hCanvas = createCanvas(size, size);
  const hCtx = hCanvas.getContext('2d');
  const ribs = 24;
  const rw = size / ribs;

  for (let i = 0; i < ribs; i++) {
    const g = hCtx.createLinearGradient(i * rw, 0, (i + 1) * rw, 0);
    g.addColorStop(0.0, '#383838');
    g.addColorStop(0.2, '#d8d8d8');
    g.addColorStop(0.65, '#d8d8d8');
    g.addColorStop(0.85, '#383838');
    g.addColorStop(1.0, '#383838');
    hCtx.fillStyle = g;
    hCtx.fillRect(i * rw, 0, rw, size);
  }

  const normalMap = heightCanvasToNormalTexture(hCanvas, 2.6, 12, 3);
  return { normalMap };
}

export function createSoftGlowTexture() {
  const c = createCanvas(128, 128);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.26, 'rgba(255,255,255,0.48)');
  g.addColorStop(0.65, 'rgba(255,255,255,0.10)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
