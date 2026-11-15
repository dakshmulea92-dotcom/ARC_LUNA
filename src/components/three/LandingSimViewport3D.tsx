import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { TerrainAnalysisResult } from '../../types/lunar';
import { runLolaThreatScan, SIM_SPAN_UNITS } from '../../lib/threatDetection';
import {
  applyStudioEnvironment,
  buildLunarLanderGroup,
  createConfiguredRenderer,
  detectSoftwareWebGL,
  scheduleAfterDraw,
} from './ThreeUtils';

export interface SimTelemetryFrame {
  simTimeSec: number;
  altitudeM: number;
  verticalVelMS: number;
  horizontalVelMS: number;
  accelerationMS2: number;
  throttlePct: number;
  distanceFromTargetM: number;
  offsetNorthM: number;
  offsetEastM: number;
  localSlopeDeg: number;
  phase: 'IDLE' | 'DEORBIT_BRAKE' | 'APPROACH_EVAL' | 'HAZARD_DIVERT' | 'TERMINAL_DESCENT' | 'LANDED' | 'ABORTED';
  hazardStatus: string;
  divertActive: boolean;
  selectedPadSlopeDeg: number;
}

interface LandingSimViewport3DProps {
  terrain: TerrainAnalysisResult;
  mode: 'manual' | 'assisted' | 'autonomous';
  running: boolean;
  resetSignal: number;
  manualInput: { throttleDelta: number; pitchX: number; rollZ: number };
  lightweightMode: boolean;
  solarElevationDeg: number;
  cameraCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  onTelemetry: (frame: SimTelemetryFrame) => void;
}

export function LandingSimViewport3D({
  terrain,
  mode,
  running,
  resetSignal,
  manualInput,
  lightweightMode,
  solarElevationDeg,
  cameraCanvasRef,
  onTelemetry,
}: LandingSimViewport3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const runningRef = useRef(running);
  runningRef.current = running;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const manualRef = useRef(manualInput);
  manualRef.current = manualInput;
  const onTelemetryRef = useRef(onTelemetry);
  onTelemetryRef.current = onTelemetry;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const width = container.clientWidth || 760;
    const height = container.clientHeight || 460;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070c);
    scene.fog = new THREE.FogExp2(0x05070c, 0.008);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 400);
    camera.position.set(22, 18, 28);

    const renderer = createConfiguredRenderer(width, height, isSoftwareGl, lightweightMode);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const envTex = applyStudioEnvironment(renderer, scene);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.maxPolarAngle = Math.PI * 0.48;

    const sunRad = THREE.MathUtils.degToRad(Math.max(5, Math.min(85, solarElevationDeg)));
    const keyLight = new THREE.DirectionalLight(0xfffbeb, 2.3);
    keyLight.position.set(Math.cos(sunRad) * 40, Math.sin(sunRad) * 40 + 8, 25);
    keyLight.castShadow = !isSoftwareGl && !lightweightMode;
    scene.add(keyLight);
    scene.add(new THREE.HemisphereLight(0x475569, 0x090d16, 0.38));

    // Run deterministic multi-factor LOLA Threat Detection
    const threatScan = runLolaThreatScan(terrain, solarElevationDeg);
    const safePad = threatScan.safestPad;

    // Build 3D terrain mesh from real NASA LOLA elevationGrid
    const n = terrain.gridSize;
    const spanUnits = SIM_SPAN_UNITS;
    const minE = terrain.elevationStats.minM;
    const relief = Math.max(50, terrain.elevationStats.reliefM);
    const heightScale = 5.5 / relief;
    const centerElev = terrain.centerElevationM;

    const planeGeo = new THREE.PlaneGeometry(spanUnits, spanUnits, n - 1, n - 1);
    planeGeo.rotateX(-Math.PI / 2);
    const posAttr = planeGeo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(posAttr.count * 3);

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const idx = r * n + c;
        const elev = terrain.elevationGrid[r][c];
        const slope = terrain.slopeGrid[r][c];
        const y = (elev - centerElev) * heightScale;
        posAttr.setY(idx, y);

        const col = new THREE.Color();
        if (slope < 5) col.setHex(0xf1f5f9);
        else if (slope < 10) col.setHex(0xdbeafe);
        else if (slope < 15) col.setHex(0xfbbf24);
        else col.setHex(0xf87171);
        colors[idx * 3] = col.r;
        colors[idx * 3 + 1] = col.g;
        colors[idx * 3 + 2] = col.b;
      }
    }
    planeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    planeGeo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.03,
      flatShading: false,
    });
    const terrainMesh = new THREE.Mesh(planeGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);

    let wacTexture: THREE.Texture | null = null;
    const texLoader = new THREE.TextureLoader();
    texLoader.load(
      `/api/nasa/moon-trek/tile?layer=wac&lat=${terrain.centerLat}&lon=${terrain.centerLon}&z=4`,
      (tex) => {
        if (disposed) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        wacTexture = tex;
        terrainMat.map = tex;
        terrainMat.needsUpdate = true;
      },
    );

    const gridOverlay = new THREE.GridHelper(spanUnits, 16, 0x1e293b, 0x0f172a);
    gridOverlay.position.y = (minE - centerElev) * heightScale - 0.1;
    scene.add(gridOverlay);

    // Threat Visualization Rings (Crater hazards + Steep slope hotspots)
    const threatDisposables: Array<{ dispose: () => void }> = [];

    const craterRingMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    threatDisposables.push(craterRingMat);

    for (const cm of threatScan.craterMarkers) {
      const geo = new THREE.RingGeometry(Math.max(0.4, cm.radiusUnits * 0.88), cm.radiusUnits, 28);
      threatDisposables.push(geo);
      const mesh = new THREE.Mesh(geo, craterRingMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(cm.x, cm.y + 0.12, cm.z);
      scene.add(mesh);
    }

    const steepRingMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    threatDisposables.push(steepRingMat);

    for (const sm of threatScan.steepMarkers) {
      const geo = new THREE.RingGeometry(0.55, 0.78, 20);
      threatDisposables.push(geo);
      const mesh = new THREE.Mesh(geo, steepRingMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(sm.x, sm.y + 0.14, sm.z);
      scene.add(mesh);
    }

    // Nominal Target Ring (Cyan) & Verified Safest Divert Pad Ring (Emerald)
    const targetRingGeo = new THREE.RingGeometry(0.9, 1.15, 32);
    const targetRingMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, side: THREE.DoubleSide });
    const targetRing = new THREE.Mesh(targetRingGeo, targetRingMat);
    targetRing.rotation.x = -Math.PI / 2;
    targetRing.position.set(0, 0.08, 0);
    scene.add(targetRing);
    threatDisposables.push(targetRingGeo, targetRingMat);

    const safeRingGeo = new THREE.RingGeometry(0.85, 1.12, 32);
    const safeRingMat = new THREE.MeshBasicMaterial({
      color: safePad.safe ? 0x10b981 : 0xef4444,
      side: THREE.DoubleSide,
    });
    const safeRing = new THREE.Mesh(safeRingGeo, safeRingMat);
    safeRing.rotation.x = -Math.PI / 2;
    safeRing.position.set(safePad.x, safePad.y + 0.15, safePad.z);
    scene.add(safeRing);
    threatDisposables.push(safeRingGeo, safeRingMat);

    // Guidance Divert Line from Lander to Target/Safe Pad
    const guideLineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(4.5, 18, -3.5),
      new THREE.Vector3(safePad.x, safePad.y + 0.2, safePad.z),
    ]);
    const guideLineMat = new THREE.LineBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.7,
    });
    const guideLine = new THREE.Line(guideLineGeo, guideLineMat);
    scene.add(guideLine);
    threatDisposables.push(guideLineGeo, guideLineMat);

    // Composite Lunar Lander
    const { group: lander, plume } = buildLunarLanderGroup();
    lander.scale.setScalar(0.85);
    scene.add(lander);

    // Downward onboard nadir camera for Camera-Integrated Landing Interface
    const landerCam = new THREE.PerspectiveCamera(55, 1.33, 0.2, 200);

    const sampleGroundY = (sx: number, sz: number): { y: number; slope: number } => {
      const u = THREE.MathUtils.clamp((sx + spanUnits / 2) / spanUnits, 0, 1) * (n - 1);
      const v = THREE.MathUtils.clamp((sz + spanUnits / 2) / spanUnits, 0, 1) * (n - 1);
      const r = Math.min(n - 1, Math.max(0, Math.round(v)));
      const c = Math.min(n - 1, Math.max(0, Math.round(u)));
      return {
        y: (terrain.elevationGrid[r][c] - centerElev) * heightScale,
        slope: terrain.slopeGrid[r][c],
      };
    };

    const ALT_SCALE_M = 50;
    const state = {
      simTime: 0,
      x: 5.0,
      z: -4.0,
      altM: 900,
      vy: -22,
      vx: -2.4,
      vz: 1.8,
      phase: 'DEORBIT_BRAKE' as SimTelemetryFrame['phase'],
      aborted: false,
      landed: false,
      divertActive: false,
      hazardStatus: 'Threat scanner nominal',
    };

    const gMoon = 1.622;

    const resetSim = () => {
      state.simTime = 0;
      state.x = 5.0;
      state.z = -4.0;
      state.altM = 900;
      state.vy = -22;
      state.vx = -2.4;
      state.vz = 1.8;
      state.aborted = !safePad.safe && modeRef.current === 'autonomous';
      state.phase = state.aborted ? 'ABORTED' : 'DEORBIT_BRAKE';
      state.landed = false;
      state.divertActive = false;
      state.hazardStatus = state.aborted
        ? `SIMULATED ABORT: No safe pad <=16° slope found in LOLA corridor (min ${safePad.slopeDeg}°).`
        : `LOLA Threat Scan locked onto safe pad (${safePad.slopeDeg}° slope, ${safePad.craterClearanceKm} km crater clearance)`;
    };
    resetSim();

    let frameId = 0;
    let disposed = false;
    let lastTime = performance.now();
    let camTickCounter = 0;

    const stepPhysics = (dt: number) => {
      const ground = sampleGroundY(state.x, state.z);
      const goalX = modeRef.current === 'autonomous' ? safePad.x : 0;
      const goalZ = modeRef.current === 'autonomous' ? safePad.z : 0;

      const landerY = ground.y + state.altM / ALT_SCALE_M;
      guideLine.visible = modeRef.current === 'autonomous' && !state.landed && !state.aborted;
      if (guideLine.visible) {
        const posArr = guideLine.geometry.attributes.position as THREE.BufferAttribute;
        posArr.setXYZ(0, state.x, landerY, state.z);
        posArr.setXYZ(1, safePad.x, safePad.y + 0.2, safePad.z);
        posArr.needsUpdate = true;
      }

      if (!runningRef.current || state.landed || state.aborted) {
        lander.position.set(state.x, landerY, state.z);
        plume.visible = false;
        return;
      }

      state.simTime += dt;

      let throttleAcc = 0;
      let ax = 0;
      let az = 0;

      if (modeRef.current === 'manual') {
        const inp = manualRef.current;
        throttleAcc = THREE.MathUtils.clamp(2.2 + inp.throttleDelta * 2.4, 0, 5.0);
        ax = inp.pitchX * 1.4;
        az = inp.rollZ * 1.4;
        state.phase = state.altM > 250 ? 'APPROACH_EVAL' : 'TERMINAL_DESCENT';
        state.divertActive = false;
        state.hazardStatus =
          ground.slope > 12
            ? `THREAT WARN: High slope beneath lander (${ground.slope.toFixed(1)}°)`
            : 'Manual descent active';
      } else if (modeRef.current === 'assisted') {
        const desiredVy = state.altM > 180 ? -12 : state.altM > 35 ? -4.5 : -1.5;
        throttleAcc = THREE.MathUtils.clamp(gMoon + (desiredVy - state.vy) * 0.65, 0, 4.8);
        ax = -state.vx * 0.6 + manualRef.current.pitchX * 1.2;
        az = -state.vz * 0.6 + manualRef.current.rollZ * 1.2;
        state.phase = state.altM > 220 ? 'APPROACH_EVAL' : 'TERMINAL_DESCENT';
        state.divertActive = false;
        state.hazardStatus = `Assisted damping · Slope below ${ground.slope.toFixed(1)}°`;
      } else {
        // Autonomous threat-avoidance guidance onto verified safest LOLA pad
        const dx = goalX - state.x;
        const dz = goalZ - state.z;
        const distUnits = Math.hypot(dx, dz);

        if (state.altM > 540) {
          state.phase = 'DEORBIT_BRAKE';
          state.divertActive = false;
          state.hazardStatus = `Deorbit Braking · ${threatScan.craterThreatCount} craters & ${threatScan.steepSlopeCellCount} steep cells mapped`;
        } else if (distUnits > 0.35 && state.altM > 45) {
          state.phase = 'HAZARD_DIVERT';
          state.divertActive = true;
          state.hazardStatus = `Threat Divert Active · Steering ${Math.round(distUnits * ((terrain.radiusKm * 2000) / spanUnits))} m to verified ${safePad.slopeDeg}° pad`;
        } else {
          state.phase = 'TERMINAL_DESCENT';
          state.divertActive = false;
          state.hazardStatus = `Terminal Vertical Flare · Safe pad slope ${ground.slope.toFixed(1)}°`;
        }

        const desiredVx = THREE.MathUtils.clamp(dx * 1.4, -6, 6);
        const desiredVz = THREE.MathUtils.clamp(dz * 1.4, -6, 6);
        ax = (desiredVx - state.vx) * 1.6;
        az = (desiredVz - state.vz) * 1.6;

        // Smooth terminal flare guarantees gentle <1.2 m/s touchdown
        const desiredVy =
          state.altM > 450
            ? -20
            : state.altM > 150
              ? -10
              : state.altM > 40
                ? -3.5
                : -1.0;
        throttleAcc = THREE.MathUtils.clamp(gMoon + (desiredVy - state.vy) * 0.9, 0, 5.2);
      }

      const netAy = throttleAcc - gMoon;
      state.vy += netAy * dt;
      state.vx += ax * dt;
      state.vz += az * dt;

      state.altM += state.vy * dt;
      state.x = THREE.MathUtils.clamp(state.x + (state.vx * dt) / 10, -18, 18);
      state.z = THREE.MathUtils.clamp(state.z + (state.vz * dt) / 10, -18, 18);

      lander.rotation.z = THREE.MathUtils.clamp(-ax * 0.05, -0.25, 0.25);
      lander.rotation.x = THREE.MathUtils.clamp(az * 0.05, -0.25, 0.25);

      plume.visible = throttleAcc > 0.35;
      plume.scale.setScalar(0.6 + (throttleAcc / 5.2) * 0.7);

      if (state.altM <= 0) {
        state.altM = 0;
        const speedImpact = Math.abs(state.vy);
        if (speedImpact > 6.5 || ground.slope > 18) {
          state.aborted = true;
          state.phase = 'ABORTED';
          state.hazardStatus = `Touchdown out-of-envelope (Vz=${speedImpact.toFixed(1)} m/s, Slope=${ground.slope.toFixed(1)}°)`;
        } else {
          state.landed = true;
          state.phase = 'LANDED';
          state.hazardStatus = `SAFE TOUCHDOWN CONFIRMED · Slope ${ground.slope.toFixed(1)}° · Vz=${speedImpact.toFixed(2)} m/s`;
        }
        state.vy = 0;
        state.vx = 0;
        state.vz = 0;
        plume.visible = false;
        lander.rotation.set(0, 0, 0);
      }

      const finalGround = sampleGroundY(state.x, state.z);
      lander.position.set(state.x, finalGround.y + state.altM / ALT_SCALE_M, state.z);

      const metersPerUnit = (terrain.radiusKm * 2000) / spanUnits;
      const distMeters = Math.hypot(state.x - goalX, state.z - goalZ) * metersPerUnit;
      onTelemetryRef.current({
        simTimeSec: Number(state.simTime.toFixed(1)),
        altitudeM: Number(state.altM.toFixed(1)),
        verticalVelMS: Number(state.vy.toFixed(2)),
        horizontalVelMS: Number(Math.hypot(state.vx, state.vz).toFixed(2)),
        accelerationMS2: Number(netAy.toFixed(2)),
        throttlePct: Number(Math.min(100, (throttleAcc / 5.2) * 100).toFixed(0)),
        distanceFromTargetM: Number(distMeters.toFixed(0)),
        offsetNorthM: Number((-state.z * metersPerUnit).toFixed(0)),
        offsetEastM: Number((state.x * metersPerUnit).toFixed(0)),
        localSlopeDeg: Number(finalGround.slope.toFixed(2)),
        phase: state.phase,
        hazardStatus: state.hazardStatus,
        divertActive: state.divertActive,
        selectedPadSlopeDeg: safePad.slopeDeg,
      });
    };

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.08, (now - lastTime) / 1000);
      lastTime = now;

      stepPhysics(dt);
      controls.update();
      renderer.render(scene, camera);

      camTickCounter++;
      const feedCanvas = cameraCanvasRef.current;
      if (feedCanvas && camTickCounter % 3 === 0) {
        lander.visible = false;
        landerCam.position.set(lander.position.x, lander.position.y + 0.5, lander.position.z);
        landerCam.lookAt(lander.position.x, -5, lander.position.z);
        const origW = renderer.domElement.width;
        const origH = renderer.domElement.height;
        const fCtx = feedCanvas.getContext('2d');
        if (fCtx) {
          renderer.render(scene, landerCam);
          fCtx.drawImage(renderer.domElement, 0, 0, origW, origH, 0, 0, feedCanvas.width, feedCanvas.height);
          lander.visible = true;
          renderer.render(scene, camera);
        } else {
          lander.visible = true;
        }
      }

      if (isSoftwareGl) {
        frameId = scheduleAfterDraw(renderer, tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    const onResize = () => {
      if (!container || disposed) return;
      const w = container.clientWidth || 760;
      const h = container.clientHeight || 460;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      planeGeo.dispose();
      terrainMat.dispose();
      wacTexture?.dispose();
      threatDisposables.forEach((d) => d.dispose());
      envTex.dispose();
      renderer.dispose();
    };
  }, [terrain, resetSignal, lightweightMode, solarElevationDeg, cameraCanvasRef]);

  return (
    <div className="relative w-full h-full min-h-[440px] bg-[#05070C] border border-slate-800 rounded-lg overflow-hidden">
      <div ref={mountRef} className="w-full h-full min-h-[440px]" />
      <div className="pointer-events-none absolute top-3 left-3 bg-[#07090E]/90 border border-slate-800 px-3 py-1.5 rounded text-xs">
        <span className="text-violet-300 font-medium">Simulated 3D Descent &amp; Threat Detection</span>
        <span className="text-slate-400 ml-2">
          Cyan: Nominal Target · Green: Verified Safe Pad · Amber: Crater Hazards · Red: Steep Slopes (&gt;12°)
        </span>
      </div>
    </div>
  );
}
