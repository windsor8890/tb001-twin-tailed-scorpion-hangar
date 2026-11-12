import * as THREE from 'three';

/**
 * Generates a physically balanced High-Dynamic-Range Hangar Environment Probe
 * modeled after real aviation test hangars (clerestory daylight windows + linear high-bay softboxes
 * + neutral concrete ground bounce) so matte composites, brushed aluminum spinners,
 * chrome oleo pistons, and coated optical glass exhibit lifelike PBR reflections.
 */
export function buildHangarEnvironment(renderer, mode = 'daylight') {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();

  const presets = {
    daylight: {
      zenith: 0x101419,
      horizon: 0x1b222b,
      floor: 0x0c0e11,
      softboxColor: 0xf4f7fa,
      softboxGain: 5.2,
      clerestoryColor: 0xdce6f2,
      clerestoryGain: 4.0,
      doorColor: 0xfff0dc,
      doorGain: 6.8,
      warmRim: 0xffcfa0,
      warmGain: 2.8,
    },
    dusk: {
      zenith: 0x0b0e14,
      horizon: 0x161c26,
      floor: 0x090b0e,
      softboxColor: 0xd8e4f2,
      softboxGain: 3.8,
      clerestoryColor: 0x5c7696,
      clerestoryGain: 2.2,
      doorColor: 0xffa654,
      doorGain: 8.5,
      warmRim: 0xffb266,
      warmGain: 4.5,
    },
    inspection: {
      zenith: 0x131820,
      horizon: 0x202832,
      floor: 0x101418,
      softboxColor: 0xfafcff,
      softboxGain: 6.8,
      clerestoryColor: 0xe8f1fa,
      clerestoryGain: 4.8,
      doorColor: 0xeef5fc,
      doorGain: 5.5,
      warmRim: 0xd8e6f5,
      warmGain: 3.0,
    },
  };

  const p = presets[mode] || presets.daylight;

  const domeGeo = new THREE.SphereGeometry(64, 36, 24);
  const pos = domeGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cZ = new THREE.Color(p.zenith);
  const cH = new THREE.Color(p.horizon);
  const cF = new THREE.Color(p.floor);
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const ny = pos.getY(i) / 64;
    if (ny >= 0) {
      tmp.copy(cH).lerp(cZ, Math.pow(ny, 0.7));
    } else {
      tmp.copy(cH).lerp(cF, Math.min(1, Math.pow(-ny * 1.8, 0.85)));
    }
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  domeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  envScene.add(
    new THREE.Mesh(
      domeGeo,
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })
    )
  );

  // Overhead Linear Industrial Softbox Strips (broad soft specular bands, not harsh dots)
  const softboxGeo = new THREE.PlaneGeometry(6.8, 0.85);
  const softboxMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(p.softboxColor).multiplyScalar(p.softboxGain),
    side: THREE.DoubleSide,
  });
  for (const x of [-11.5, -3.8, 3.8, 11.5]) {
    for (const z of [-12, -4, 4, 12]) {
      const strip = new THREE.Mesh(softboxGeo, softboxMat);
      strip.position.set(x, 14.5, z);
      strip.rotation.x = Math.PI / 2;
      envScene.add(strip);
    }
  }

  // Side Translucent Clerestory Hangar Window Bands (authentic Zhuhai hangar diffused side light!)
  const clerestoryGeo = new THREE.PlaneGeometry(32, 3.6);
  const clerestoryMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(p.clerestoryColor).multiplyScalar(p.clerestoryGain),
    side: THREE.DoubleSide,
  });
  for (const side of [-1, 1]) {
    const band = new THREE.Mesh(clerestoryGeo, clerestoryMat);
    band.position.set(side * 24, 9.2, 0);
    band.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    envScene.add(band);
  }

  // Partially Open Hangar Door Aperture at +Z
  const doorPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 11),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(p.doorColor).multiplyScalar(p.doorGain),
      side: THREE.DoubleSide,
    })
  );
  doorPanel.position.set(2.0, 5.5, 27);
  doorPanel.lookAt(0, 2, 0);
  envScene.add(doorPanel);

  // Low-angle ground maintenance fill cards
  const warmMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(p.warmRim).multiplyScalar(p.warmGain),
    side: THREE.DoubleSide,
  });
  for (const side of [-1, 1]) {
    const card = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.8), warmMat);
    card.position.set(side * 15, 2.0, 5.5);
    card.lookAt(0, 1.4, 0);
    envScene.add(card);
  }

  const rt = pmrem.fromScene(envScene, 0.03);
  pmrem.dispose();
  domeGeo.dispose();
  softboxGeo.dispose();
  clerestoryGeo.dispose();
  return rt;
}
