import * as THREE from 'three';
import { WEAPON_STATIONS_META } from '../models/MunitionsSystem.js';

const DEFAULT_ORDNANCE_SUMMARY = {
  stationCode: 'ALL STATIONS · 6× BRU',
  badge: 'FULL STRIKE CONFIGURATION',
  title: '12枚精确制导弹药混合满挂',
  en: 'CM-502KG · FT-9 · AR-4 DUAL EJECTOR RACKS',
  mass: '680 KG (含双联复合挂架)',
  range: '20.0 – 40.0 KM 多梯度打击',
  guidance: '毫米波 / 红外成像 / 北斗激光复合',
  warhead: '重型聚能破甲 / 高爆侵彻杀伤',
};

export function createHudController({
  camera,
  uav,
  hangar,
  scene,
  audio,
  onSelectCameraPreset,
  onFocusStationCamera,
  onResetEnvironmentLighting,
  onCaptureSnapshot,
}) {
  const hudRoot = document.getElementById('hud-root');
  const spatialLayer = document.getElementById('spatial-layer');
  const calloutSvg = document.getElementById('callout-svg');
  const calloutPinsContainer = document.getElementById('callout-pins');
  const btnRestoreHud = document.getElementById('btn-restore-hud');
  const shutterFlash = document.getElementById('shutter-flash');

  const elAzm = document.getElementById('hud-azm');
  const elElv = document.getElementById('hud-elv');
  const elFov = document.getElementById('hud-fov');

  const elVariantBtn = document.getElementById('btn-variant');
  const elVariantLabel = document.getElementById('label-variant');
  const elSpecMtow = document.getElementById('spec-mtow');
  const elSpecPayload = document.getElementById('spec-payload');

  const btnInfo = document.getElementById('btn-info');
  const btnPins = document.getElementById('btn-pins');
  const btnAudio = document.getElementById('btn-audio');
  const btnSnapshot = document.getElementById('btn-snapshot');
  const btnClean = document.getElementById('btn-clean');

  const btnEngine = document.getElementById('sys-engine');
  const stateEngine = document.getElementById('state-engine');
  const rpmWidget = document.getElementById('rpm-widget');
  const rpmFill = document.getElementById('rpm-fill');
  const rpmText = document.getElementById('rpm-text');

  const btnLaser = document.getElementById('sys-laser');
  const stateLaser = document.getElementById('state-laser');
  const btnFcs = document.getElementById('sys-fcs');
  const stateFcs = document.getElementById('state-fcs');
  const btnLights = document.getElementById('sys-lights');
  const stateLights = document.getElementById('state-lights');

  // Contextual Gunsmith Ordnance Drawer
  const ordnanceDrawer = document.getElementById('ordnance-drawer');
  const btnCloseDrawer = document.getElementById('btn-close-drawer');
  const ordStationCode = document.getElementById('ord-station-code');
  const ordTypeBadge = document.getElementById('ord-type-badge');
  const ordTitle = document.getElementById('ord-title');
  const ordEn = document.getElementById('ord-en');
  const ordMass = document.getElementById('ord-mass');
  const ordRange = document.getElementById('ord-range');
  const ordGuidance = document.getElementById('ord-guidance');
  const ordWarhead = document.getElementById('ord-warhead');
  const btnFocusOrdnance = document.getElementById('btn-focus-ordnance');
  const btnResetStation = document.getElementById('btn-reset-station');

  const pylonMatrix = document.getElementById('pylon-matrix');
  const camPresetButtons = Array.from(document.querySelectorAll('.cam-tab'));
  const atmoButtons = Array.from(document.querySelectorAll('.atmo-btn'));
  const liveryButtons = Array.from(document.querySelectorAll('[data-livery]'));

  let pinsEnabled = true;
  let cleanMode = false;
  let drawerPinned = false;
  let drawerHovering = false;
  let hoveredStation3d = null;
  let selectedStationId = null;

  function syncDrawerVisibility() {
    const shouldOpen =
      !cleanMode &&
      (drawerPinned || drawerHovering || hoveredStation3d !== null || selectedStationId !== null);
    ordnanceDrawer.classList.toggle('open', shouldOpen);
    btnInfo.classList.toggle('active', drawerPinned || selectedStationId !== null);
  }

  function setHoveredStation(stationId) {
    if (hoveredStation3d === stationId) return;
    hoveredStation3d = stationId;
    for (const [id, btn] of slotElements.entries()) {
      btn.classList.toggle('hover-3d', id === stationId && id !== selectedStationId);
    }
    if (!selectedStationId) {
      uav.munitions.setHighlightedStation(stationId);
      if (stationId) {
        const meta = WEAPON_STATIONS_META.find((m) => m.id === stationId);
        if (meta) {
          audio.playUiChirp('hover');
          populateOrdnanceCard(meta, getStationMissileCount(meta));
        }
      } else {
        populateOrdnanceCard(null);
      }
      syncDrawerVisibility();
    }
  }

  // ============================================================================
  // 1. BUILD 6-STATION UNDERWING PYLON RAIL
  // ============================================================================
  const slotElements = new Map();

  function getStationMissileCount(meta) {
    const isTri = uav.state.triEngineVariant;
    if (
      !isTri &&
      (meta.id === 'STA-01' ||
        meta.id === 'STA-02' ||
        meta.id === 'STA-05' ||
        meta.id === 'STA-06')
    ) {
      return 1;
    }
    return 2;
  }

  function renderPylonMatrix() {
    pylonMatrix.innerHTML = '';
    slotElements.clear();
    const isTri = uav.state.triEngineVariant;

    WEAPON_STATIONS_META.forEach((meta, idx) => {
      if (idx === 3) {
        const axis = document.createElement('div');
        axis.className = 'fuselage-axis';
        axis.innerHTML = `<span>▲</span>${isTri ? '3-ENG' : '2-ENG'}`;
        pylonMatrix.appendChild(axis);
      }

      const activeCount = getStationMissileCount(meta);
      const shortWep = meta.weaponType === 'CM-502KG' ? 'CM-502' : meta.weaponType;

      const btn = document.createElement('button');
      btn.className = 'pylon-slot' + (selectedStationId === meta.id ? ' active' : '');
      btn.innerHTML = `
        <div class="pylon-head">
          <span>${meta.id}</span>
          <span class="missile-pips">
            <i class="missile-pip"></i>
            <i class="missile-pip ${activeCount < 2 ? 'off' : ''}"></i>
          </span>
        </div>
        <div class="pylon-wep">${activeCount}× ${shortWep}</div>
      `;

      btn.addEventListener('mouseenter', () => {
        audio.playUiChirp('hover');
        drawerHovering = true;
        if (!selectedStationId) {
          uav.munitions.setHighlightedStation(meta.id);
          populateOrdnanceCard(meta, activeCount);
        }
        syncDrawerVisibility();
      });

      btn.addEventListener('mouseleave', () => {
        drawerHovering = false;
        if (!selectedStationId) {
          uav.munitions.setHighlightedStation(null);
          populateOrdnanceCard(null);
        }
        syncDrawerVisibility();
      });

      btn.addEventListener('click', () => {
        audio.playUiChirp('lock');
        if (selectedStationId === meta.id) {
          selectStation(null, false);
        } else {
          selectStation(meta.id, true);
        }
      });

      pylonMatrix.appendChild(btn);
      slotElements.set(meta.id, btn);
    });
  }

  function populateOrdnanceCard(meta, countOverride = 2) {
    if (!meta) {
      const isTri = uav.state.triEngineVariant;
      ordStationCode.textContent = DEFAULT_ORDNANCE_SUMMARY.stationCode;
      ordTypeBadge.textContent = isTri
        ? 'FULL STRIKE CONFIGURATION'
        : 'RECON-STRIKE CONFIGURATION';
      ordTitle.textContent = isTri
        ? '12枚精确制导弹药混合满挂'
        : '8枚远程察打精确弹药挂载';
      ordEn.textContent = DEFAULT_ORDNANCE_SUMMARY.en;
      ordMass.textContent = isTri ? DEFAULT_ORDNANCE_SUMMARY.mass : '500 KG (混挂构型)';
      ordRange.textContent = DEFAULT_ORDNANCE_SUMMARY.range;
      ordGuidance.textContent = DEFAULT_ORDNANCE_SUMMARY.guidance;
      ordWarhead.textContent = DEFAULT_ORDNANCE_SUMMARY.warhead;
      return;
    }

    ordStationCode.textContent = `${meta.id}  //  ${meta.code}`;
    ordTypeBadge.textContent = `${meta.side}双联复合挂点`;
    ordTitle.textContent = meta.name;
    ordEn.textContent = meta.enName;
    ordMass.textContent =
      countOverride === 1 ? meta.massKg.replace('2 ×', '1 ×') : meta.massKg;
    ordRange.textContent = meta.rangeKm;
    ordGuidance.textContent = meta.guidance;
    ordWarhead.textContent = meta.warhead;
  }

  function selectStation(stationId, flyCamera = true) {
    selectedStationId = stationId;
    for (const [id, btn] of slotElements.entries()) {
      btn.classList.toggle('active', id === stationId);
    }
    uav.munitions.setHighlightedStation(stationId);

    if (!stationId) {
      populateOrdnanceCard(null);
      syncDrawerVisibility();
      return;
    }

    const meta = WEAPON_STATIONS_META.find((m) => m.id === stationId);
    if (meta) {
      populateOrdnanceCard(meta, getStationMissileCount(meta));
      syncDrawerVisibility();
      if (flyCamera) {
        setActiveCamButton(null);
        onFocusStationCamera(meta);
      }
    }
  }

  renderPylonMatrix();
  populateOrdnanceCard(null);

  // ============================================================================
  // 2. BUILD GUNSMITH HAIRLINE 3D CALLOUT PINS
  // ============================================================================
  const screenOffsets = [
    { dx: 102, dy: -56 }, // 01 SATCOM dorsal dome
    { dx: 106, dy: 52 },  // 02 EO/IR-380 gimbal turret
    { dx: -82, dy: -58 }, // 03 Tri-engine propulsion
    { dx: -112, dy: 56 }, // 04 12x Ordnance racks
    { dx: -76, dy: -46 }, // 05 H-Tail & Ventral fins
  ];

  const pinRecords = uav.calloutAnchors.map((anchor, idx) => {
    const pinEl = document.createElement('div');
    pinEl.className = 'callout-pin';
    pinEl.innerHTML = `
      <span class="pin-code">${anchor.code}</span>
      <span class="pin-title">${anchor.title}</span>
    `;
    pinEl.title = anchor.sub;
    pinEl.addEventListener('click', () => {
      audio.playUiChirp('lock');
      selectStation(null, false);
      setActiveCamButton(anchor.camPreset);
      onSelectCameraPreset(anchor.camPreset);
    });
    calloutPinsContainer.appendChild(pinEl);

    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    pathEl.setAttribute('fill', 'none');
    pathEl.setAttribute('stroke', 'rgba(236, 238, 240, 0.36)');
    pathEl.setAttribute('stroke-width', '0.85');
    calloutSvg.appendChild(pathEl);

    const ringEl = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ringEl.setAttribute('r', '4.2');
    ringEl.setAttribute('fill', 'rgba(10, 12, 16, 0.45)');
    ringEl.setAttribute('stroke', 'rgba(200, 164, 100, 0.85)');
    ringEl.setAttribute('stroke-width', '1.0');
    calloutSvg.appendChild(ringEl);

    const dotEl = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dotEl.setAttribute('r', '1.4');
    dotEl.setAttribute('fill', '#eceef0');
    calloutSvg.appendChild(dotEl);

    return {
      anchor,
      pinEl,
      pathEl,
      ringEl,
      dotEl,
      offset: screenOffsets[idx % screenOffsets.length],
    };
  });

  // ============================================================================
  // 3. INTERACTIVE CONTROLS & KEYBOARD HOTKEYS
  // ============================================================================
  function setActiveCamButton(presetName) {
    for (const b of camPresetButtons) {
      b.classList.toggle('active', b.dataset.cam === presetName);
    }
  }

  for (const btn of camPresetButtons) {
    btn.addEventListener('click', () => {
      audio.playUiChirp('click');
      const preset = btn.dataset.cam;
      selectStation(null, false);
      setActiveCamButton(preset);
      onSelectCameraPreset(preset);
    });
  }

  for (const btn of liveryButtons) {
    btn.addEventListener('click', () => {
      audio.playUiChirp('lock');
      const scheme = btn.dataset.livery;
      for (const b of liveryButtons) b.classList.toggle('active', b === btn);
      uav.setLiveryScheme(scheme);
    });
  }

  for (const btn of atmoButtons) {
    btn.addEventListener('click', () => {
      audio.playUiChirp('click');
      const mode = btn.dataset.atmo;
      for (const b of atmoButtons) b.classList.toggle('active', b === btn);
      hangar.setLightingAtmosphere(mode, scene);
      onResetEnvironmentLighting(mode);
    });
  }

  elVariantBtn.addEventListener('click', () => {
    audio.playUiChirp('lock');
    const nextTri = !uav.state.triEngineVariant;
    uav.setVariant(nextTri);
    elVariantLabel.textContent = nextTri ? '三发 · 12弹' : '双发 · 8弹';
    elSpecMtow.textContent = nextTri ? '3,250KG' : '2,800KG';
    elSpecPayload.textContent = nextTri ? '12× LIVE' : '8× LIVE';
    renderPylonMatrix();
    populateOrdnanceCard(
      selectedStationId
        ? WEAPON_STATIONS_META.find((m) => m.id === selectedStationId)
        : null
    );
  });

  function toggleEngine() {
    audio.playUiChirp('click');
    uav.state.engineRunning = !uav.state.engineRunning;
    btnEngine.classList.toggle('active', uav.state.engineRunning);
    stateEngine.textContent = uav.state.engineRunning ? 'RUN' : 'OFF';
    rpmWidget.classList.toggle('visible', uav.state.engineRunning);
  }

  function toggleLaser() {
    audio.playUiChirp('lock');
    uav.state.laserDesignatorActive = !uav.state.laserDesignatorActive;
    btnLaser.classList.toggle('active', uav.state.laserDesignatorActive);
    stateLaser.textContent = uav.state.laserDesignatorActive ? 'LASE' : 'SCAN';
  }

  function toggleFcs() {
    audio.playUiChirp('click');
    uav.state.fcsBitActive = !uav.state.fcsBitActive;
    btnFcs.classList.toggle('active', uav.state.fcsBitActive);
    stateFcs.textContent = uav.state.fcsBitActive ? 'TEST' : 'IDLE';
  }

  function toggleNavLights() {
    audio.playUiChirp('click');
    uav.state.navLightsActive = !uav.state.navLightsActive;
    btnLights.classList.toggle('active', uav.state.navLightsActive);
    stateLights.textContent = uav.state.navLightsActive ? 'ON' : 'OFF';
  }

  function toggleCleanMode() {
    audio.playUiChirp('click');
    cleanMode = !cleanMode;
    hudRoot.classList.toggle('clean-mode', cleanMode);
    spatialLayer.classList.toggle('hidden', cleanMode || !pinsEnabled);
    btnRestoreHud.classList.toggle('hidden', !cleanMode);
    syncDrawerVisibility();
  }

  function togglePins() {
    audio.playUiChirp('click');
    pinsEnabled = !pinsEnabled;
    btnPins.classList.toggle('active', pinsEnabled);
    spatialLayer.classList.toggle('hidden', cleanMode || !pinsEnabled);
  }

  function toggleDrawerPinned() {
    audio.playUiChirp('click');
    if (selectedStationId) {
      selectStation(null, false);
      drawerPinned = false;
    } else {
      drawerPinned = !drawerPinned;
    }
    syncDrawerVisibility();
  }

  function toggleAudio() {
    const isNowOn = audio.setEnabled(!audio.isEnabled());
    btnAudio.classList.toggle('active', isNowOn);
    if (isNowOn) audio.playUiChirp('lock');
  }

  function triggerSnapshot() {
    audio.playUiChirp('lock');
    if (shutterFlash) {
      shutterFlash.classList.add('flash');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => shutterFlash.classList.remove('flash'));
      });
    }
    if (onCaptureSnapshot) onCaptureSnapshot();
  }

  btnEngine.addEventListener('click', toggleEngine);
  btnLaser.addEventListener('click', toggleLaser);
  btnFcs.addEventListener('click', toggleFcs);
  btnLights.addEventListener('click', toggleNavLights);
  btnClean.addEventListener('click', toggleCleanMode);
  btnRestoreHud.addEventListener('click', toggleCleanMode);
  btnPins.addEventListener('click', togglePins);
  btnInfo.addEventListener('click', toggleDrawerPinned);
  if (btnSnapshot) btnSnapshot.addEventListener('click', triggerSnapshot);
  btnCloseDrawer.addEventListener('click', () => {
    drawerPinned = false;
    selectStation(null, false);
  });
  btnAudio.addEventListener('click', toggleAudio);

  btnFocusOrdnance.addEventListener('click', () => {
    audio.playUiChirp('lock');
    if (selectedStationId) {
      const meta = WEAPON_STATIONS_META.find((m) => m.id === selectedStationId);
      if (meta) onFocusStationCamera(meta);
    } else {
      setActiveCamButton('ordnance');
      onSelectCameraPreset('ordnance');
    }
  });

  btnResetStation.addEventListener('click', () => {
    audio.playUiChirp('click');
    drawerPinned = false;
    selectStation(null, false);
    setActiveCamButton('hero');
    onSelectCameraPreset('hero');
  });

  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const k = e.key.toLowerCase();
    if (k === 'h') toggleCleanMode();
    else if (k === 'p') triggerSnapshot();
    else if (k === 'c') togglePins();
    else if (k === 'i') toggleDrawerPinned();
    else if (k === 'm') toggleAudio();
    else if (k === 'e') toggleEngine();
    else if (k === 't') toggleLaser();
    else if (k === 'f') toggleFcs();
    else if (k === 'n') toggleNavLights();
    else if (k >= '1' && k <= '6') {
      const presets = ['hero', 'ordnance', 'nose', 'tail', 'top', 'orbit'];
      const chosen = presets[parseInt(k, 10) - 1];
      selectStation(null, false);
      setActiveCamButton(chosen);
      onSelectCameraPreset(chosen);
    }
  });

  // ============================================================================
  // 4. PER-FRAME TELEMETRY & SPATIAL CALLOUT PROJECTION
  // ============================================================================
  const tmpVec = new THREE.Vector3();

  function update(controlsTarget) {
    if (uav.state.engineRunning || uav.state.propRpmFactor > 0.01) {
      rpmWidget.classList.add('visible');
      const rpm = Math.round(uav.state.propRpmFactor * 2450);
      rpmFill.style.width = `${(uav.state.propRpmFactor * 100).toFixed(1)}%`;
      rpmText.textContent = `${rpm} RPM`;
    } else {
      rpmWidget.classList.remove('visible');
    }

    const dx = camera.position.x - controlsTarget.x;
    const dy = camera.position.y - controlsTarget.y;
    const dz = camera.position.z - controlsTarget.z;
    const dist = Math.hypot(dx, dy, dz);

    let azm = Math.round((Math.atan2(dx, dz) * 180) / Math.PI);
    if (azm < 0) azm += 360;
    const elv = Math.round(
      (Math.asin(THREE.MathUtils.clamp(dy / Math.max(0.01, dist), -1, 1)) * 180) / Math.PI
    );
    const focalMm = Math.round(
      (24 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)))) * 1.5
    );

    elAzm.textContent = `${String(azm).padStart(3, '0')}°`;
    elElv.textContent = `${elv >= 0 ? '+' : ''}${String(elv).padStart(2, '0')}°`;
    elFov.textContent = `${focalMm}MM`;

    if (cleanMode || !pinsEnabled) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const hideClose = selectedStationId !== null || dist < 6.4;
    const placedBadges = [];

    for (const rec of pinRecords) {
      // Context-aware hemisphere filtering so nose callouts don't bleed across rear tail views
      const rearViewOcclusion =
        camera.position.z < -2.6 &&
        (rec.anchor.id === 'satcom' || rec.anchor.id === 'eoir');
      const noseViewOcclusion =
        camera.position.z > 4.2 && dist < 7.0 && rec.anchor.id === 'empennage';

      if (hideClose || rearViewOcclusion || noseViewOcclusion) {
        rec.pinEl.style.opacity = '0';
        rec.pinEl.style.pointerEvents = 'none';
        rec.pathEl.style.opacity = '0';
        rec.ringEl.style.opacity = '0';
        rec.dotEl.style.opacity = '0';
        continue;
      }

      tmpVec.copy(rec.anchor.localPos);
      uav.group.localToWorld(tmpVec);
      tmpVec.project(camera);

      const inView =
        tmpVec.z > 0 &&
        tmpVec.z < 0.992 &&
        tmpVec.x > -0.78 &&
        tmpVec.x < 0.78 &&
        tmpVec.y > -0.68 &&
        tmpVec.y < 0.76;

      if (!inView) {
        rec.pinEl.style.opacity = '0';
        rec.pinEl.style.pointerEvents = 'none';
        rec.pathEl.style.opacity = '0';
        rec.ringEl.style.opacity = '0';
        rec.dotEl.style.opacity = '0';
        continue;
      }

      const sx = (tmpVec.x * 0.5 + 0.5) * vw;
      const sy = (-tmpVec.y * 0.5 + 0.5) * vh;

      const bx = THREE.MathUtils.clamp(sx + rec.offset.dx, 135, vw - 145);
      let by = THREE.MathUtils.clamp(sy + rec.offset.dy, 76, vh - 96);

      for (const prev of placedBadges) {
        if (Math.abs(bx - prev.x) < 195 && Math.abs(by - prev.y) < 32) {
          by = THREE.MathUtils.clamp(prev.y + (by >= prev.y ? 34 : -34), 76, vh - 96);
        }
      }
      placedBadges.push({ x: bx, y: by });

      const elbowX = sx + (bx - sx) * 0.42;
      const elbowY = by;

      rec.pinEl.style.opacity = '1';
      rec.pinEl.style.pointerEvents = 'auto';
      rec.pinEl.style.left = `${bx}px`;
      rec.pinEl.style.top = `${by}px`;

      rec.ringEl.style.opacity = '1';
      rec.ringEl.setAttribute('cx', sx.toFixed(1));
      rec.ringEl.setAttribute('cy', sy.toFixed(1));

      rec.dotEl.style.opacity = '1';
      rec.dotEl.setAttribute('cx', sx.toFixed(1));
      rec.dotEl.setAttribute('cy', sy.toFixed(1));

      rec.pathEl.style.opacity = '1';
      rec.pathEl.setAttribute(
        'points',
        `${sx.toFixed(1)},${sy.toFixed(1)} ${elbowX.toFixed(1)},${elbowY.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}`
      );
    }
  }

  return {
    update,
    selectStation,
    setHoveredStation,
    setActiveCamButton,
  };
}
