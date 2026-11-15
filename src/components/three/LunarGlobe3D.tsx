import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLOBAL_LAUNCH_FACILITIES, LUNAR_SITE_PRESETS, NASA_3D_ASSETS } from '../../lib/nasaCatalog';
import type { TerrainAnalysisResult } from '../../types/lunar';
import {
  applyStudioEnvironment,
  buildLunarLanderGroup,
  buildLunarRoverGroup,
  createConfiguredRenderer,
  detectSoftwareWebGL,
  latLonToVec3,
  scheduleAfterDraw,
  vec3ToLatLon,
} from './ThreeUtils';

export interface EarthSelectionInfo {
  lat: number;
  lon: number;
  label: string;
  facilityId?: string;
}

interface LunarGlobe3DProps {
  selectedLat: number;
  selectedLon: number;
  subsolarLat: number;
  subsolarLon: number;
  utcIso?: string;
  lightweightMode: boolean;
  externalPreset?: { id: CameraPreset; seq: number } | null;
  onSelectCoordinate: (lat: number, lon: number, label?: string) => void;
  onSelectEarthLocation?: (info: EarthSelectionInfo) => void;
}

export type CameraPreset =
  | 'front'
  | 'north'
  | 'south'
  | 'selected'
  | 'shackleton'
  | 'earth-null'
  | 'earth-moon';

const MOON_RADIUS = 1.0;
// True physical Earth:Moon diameter ratio 12,756 km / 3,474.8 km = 3.67:1
const EARTH_MOON_SIZE_RATIO = 3.67;
const EARTH_RADIUS = MOON_RADIUS * EARTH_MOON_SIZE_RATIO;
const EARTH_POS = new THREE.Vector3(0, 0.25, 12.4);

const SHACKLETON_LAT = -89.66;
const SHACKLETON_LON = 129.2;

export function LunarGlobe3D({
  selectedLat,
  selectedLon,
  subsolarLat,
  subsolarLon,
  utcIso,
  lightweightMode,
  externalPreset,
  onSelectCoordinate,
  onSelectEarthLocation,
}: LunarGlobe3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [useGridModel, setUseGridModel] = useState(false);
  const [showSunModel, setShowSunModel] = useState(true);
  const [showEarthModel, setShowEarthModel] = useState(true);
  const [showGridLines, setShowGridLines] = useState(true);
  const [showTerminator, setShowTerminator] = useState(true);
  const [loadingPct, setLoadingPct] = useState<number>(0);
  const [earthLoaded, setEarthLoaded] = useState<boolean>(false);
  const [shackletonCloseUp, setShackletonCloseUp] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const cameraPresetRef = useRef<(preset: CameraPreset) => void>(() => {});
  const onSelectRef = useRef(onSelectCoordinate);
  onSelectRef.current = onSelectCoordinate;
  const onSelectEarthRef = useRef(onSelectEarthLocation);
  onSelectEarthRef.current = onSelectEarthLocation;

  const targetCoordsRef = useRef({
    selectedLat,
    selectedLon,
    subsolarLat,
    subsolarLon,
    utcIso: utcIso ?? new Date().toISOString(),
  });
  targetCoordsRef.current = {
    selectedLat,
    selectedLon,
    subsolarLat,
    subsolarLon,
    utcIso: utcIso ?? new Date().toISOString(),
  };

  const togglesRef = useRef({ showSunModel, showEarthModel, showGridLines, showTerminator });
  togglesRef.current = { showSunModel, showEarthModel, showGridLines, showTerminator };

  const syncVisualsRef = useRef<() => void>(() => {});

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 560;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04060b);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.004, 240);
    camera.position.set(0, 0.28, 3.45);

    const renderer = createConfiguredRenderer(width, height, isSoftwareGl, lightweightMode);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const envTex = applyStudioEnvironment(renderer, scene);
    if ('environmentIntensity' in scene) {
      (scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity = 0.08;
    }

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 1.04;
    controls.maxDistance = 42.0;

    // Solar key light driving crisp day/night hemispheres across Moon, Earth, and Shackleton Rim
    const sunLight = new THREE.DirectionalLight(0xfff9ed, 3.25);
    sunLight.castShadow = !isSoftwareGl && !lightweightMode;
    scene.add(sunLight);

    const fillLight = new THREE.HemisphereLight(0x1e293b, 0x030509, 0.11);
    scene.add(fillLight);

    // Subtle procedural starfield (InstancedMesh)
    const starCount = lightweightMode ? 180 : 450;
    const starGeo = new THREE.SphereGeometry(0.06, 6, 6);
    const starMat = new THREE.MeshBasicMaterial({ color: 0xcbd5e1 });
    const stars = new THREE.InstancedMesh(starGeo, starMat, starCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < starCount; i++) {
      const theta = ((i * 137.508) % 360) * (Math.PI / 180);
      const u = ((i * 0.6180339887) % 1) * 2 - 1;
      const r = 68 + (i % 9) * 6;
      const s = Math.sqrt(1 - u * u);
      dummy.position.set(r * s * Math.cos(theta), r * u, r * s * Math.sin(theta));
      dummy.updateMatrix();
      stars.setMatrixAt(i, dummy.matrix);
    }
    stars.computeBoundingSphere();
    scene.add(stars);

    // -----------------------------------------------------------------------
    // 1. MOON ROOT GROUP (Radius = 1.0, Diameter = 2.0)
    // -----------------------------------------------------------------------
    const moonGroup = new THREE.Group();
    scene.add(moonGroup);

    const fallbackMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.92,
      metalness: 0.04,
      envMapIntensity: 0.06,
    });
    const fallbackSphere = new THREE.Mesh(new THREE.SphereGeometry(MOON_RADIUS, 48, 32), fallbackMat);
    moonGroup.add(fallbackSphere);

    // Selenographic latitude/longitude grid overlay
    const gridGroup = new THREE.Group();
    const gridMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.22 });
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts: THREE.Vector3[] = [];
      for (let lon = -180; lon <= 180; lon += 6) {
        pts.push(latLonToVec3(lat, lon, 1.006));
      }
      gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }
    for (let lon = -180; lon < 180; lon += 30) {
      const pts: THREE.Vector3[] = [];
      for (let lat = -90; lat <= 90; lat += 5) {
        pts.push(latLonToVec3(lat, lon, 1.006));
      }
      gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }
    gridGroup.visible = togglesRef.current.showGridLines;
    moonGroup.add(gridGroup);

    // Astronomical Day/Night Terminator Ring around Moon
    const termPts: THREE.Vector3[] = [];
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      termPts.push(new THREE.Vector3(Math.cos(a) * 1.009, Math.sin(a) * 1.009, 0));
    }
    const terminatorMat = new THREE.LineBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.65,
    });
    const terminatorRing = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(termPts), terminatorMat);
    moonGroup.add(terminatorRing);

    // Preset landing site markers on Moon
    const markerGroup = new THREE.Group();
    const moonMarkerTargets: THREE.Mesh[] = [];
    for (const preset of LUNAR_SITE_PRESETS) {
      const color =
        preset.category === 'Apollo Historical'
          ? 0xf59e0b
          : preset.category === 'South Pole' || preset.category === 'North Pole'
            ? 0x06b6d4
            : 0x94a3b8;
      const pin = new THREE.Mesh(
        new THREE.SphereGeometry(0.017, 12, 12),
        new THREE.MeshBasicMaterial({ color }),
      );
      latLonToVec3(preset.lat, preset.lon, 1.014, pin.position);
      pin.userData = { preset };
      markerGroup.add(pin);
      moonMarkerTargets.push(pin);
    }
    moonGroup.add(markerGroup);

    // Active selected lunar site ring + beacon
    const selectedMarker = new THREE.Group();
    const beaconSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 14, 14),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee }),
    );
    const beaconRing = new THREE.Mesh(
      new THREE.RingGeometry(0.03, 0.043, 24),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee, side: THREE.DoubleSide }),
    );
    selectedMarker.add(beaconSphere, beaconRing);
    moonGroup.add(selectedMarker);

    // Invisible Moon raycast proxy
    const moonRaycastSphere = new THREE.Mesh(
      new THREE.SphereGeometry(MOON_RADIUS, 48, 32),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    moonGroup.add(moonRaycastSphere);

    // -----------------------------------------------------------------------
    // 2. HYPER-REALISTIC SHACKLETON CRATER RIM DIORAMA + DEPLOYED ROVER
    //    Anchored at (-89.66°, 129.2°); visible when zoomed in, hidden on zoom-out
    // -----------------------------------------------------------------------
    const shackletonAnchorVec = latLonToVec3(SHACKLETON_LAT, SHACKLETON_LON, 1.0);
    const shackletonNormal = shackletonAnchorVec.clone().normalize();

    const shackletonGroup = new THREE.Group();
    shackletonGroup.position.copy(shackletonAnchorVec);
    shackletonGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), shackletonNormal);
    shackletonGroup.visible = false;
    moonGroup.add(shackletonGroup);

    const PATCH_SPAN = 0.14;
    const PATCH_RES = lightweightMode ? 48 : 80;
    const patchGeo = new THREE.PlaneGeometry(PATCH_SPAN, PATCH_SPAN, PATCH_RES, PATCH_RES);
    patchGeo.rotateX(-Math.PI / 2);

    const patchMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.02,
      envMapIntensity: 0.06,
    });

    // Pure NASA LOLA LDEM_16 elevation interpolator (zero synthetic craters or fake noise)
    const shackletonHeightFn = (lx: number, lz: number, lolaTerrain?: TerrainAnalysisResult | null) => {
      const r = Math.hypot(lx, lz);
      const maxR = PATCH_SPAN * 0.48;
      // Smooth edge blend back down to lunar sphere surface (r >= maxR -> 0)
      const edgeFade = THREE.MathUtils.smoothstep(maxR - r, 0, maxR * 0.25);
      // Physical sphere drop-off so circular patch hugs lunar curvature seamlessly
      const sphereCurvature = -(r * r) * 0.5;

      if (!lolaTerrain) {
        return { y: sphereCurvature + 0.0003 * edgeFade, r, elevRelM: 0 };
      }

      const gN = lolaTerrain.gridSize;
      const u = THREE.MathUtils.clamp(lx / PATCH_SPAN + 0.5, 0, 1) * (gN - 1);
      const v = THREE.MathUtils.clamp(lz / PATCH_SPAN + 0.5, 0, 1) * (gN - 1);
      const r0 = Math.min(gN - 2, Math.floor(v));
      const c0 = Math.min(gN - 2, Math.floor(u));
      const fx = u - c0;
      const fy = v - r0;
      const e00 = lolaTerrain.elevationGrid[r0][c0];
      const e10 = lolaTerrain.elevationGrid[r0][c0 + 1];
      const e01 = lolaTerrain.elevationGrid[r0 + 1][c0];
      const e11 = lolaTerrain.elevationGrid[r0 + 1][c0 + 1];
      const elevInterp = (e00 * (1 - fx) + e10 * fx) * (1 - fy) + (e01 * (1 - fx) + e11 * fx) * fy;
      const elevRelM = elevInterp - lolaTerrain.centerElevationM;

      // Scale real LOLA Shackleton topographic relief (~4.2 km bowl-to-rim relief)
      const relief = (elevRelM / 4200) * 0.0115 * edgeFade;
      return { y: sphereCurvature + relief + 0.0004 * edgeFade, r, elevRelM };
    };

    const rebuildShackletonMesh = (lolaTerrain?: TerrainAnalysisResult | null) => {
      const pAttr = patchGeo.attributes.position as THREE.BufferAttribute;
      const vColors = new Float32Array(pAttr.count * 3);
      const col = new THREE.Color();

      for (let i = 0; i < pAttr.count; i++) {
        const lx = pAttr.getX(i);
        const lz = pAttr.getZ(i);
        const { y, elevRelM } = shackletonHeightFn(lx, lz, lolaTerrain);
        pAttr.setY(i, y);

        if (!lolaTerrain) {
          col.setHex(0xdbe3ee);
        } else if (elevRelM < -1200) {
          // Deep shadowed Shackleton interior floor (LOLA measured)
          col.setHex(0x64748b);
        } else if (elevRelM > 250) {
          // Elevated sunlit Shackleton Connecting Ridge / Rim (LOLA measured)
          col.setHex(0xffffff);
        } else {
          col.setHex(0xd8e0eb);
        }
        vColors[i * 3] = col.r;
        vColors[i * 3 + 1] = col.g;
        vColors[i * 3 + 2] = col.b;
      }
      pAttr.needsUpdate = true;
      patchGeo.setAttribute('color', new THREE.BufferAttribute(vColors, 3));
      patchGeo.computeVertexNormals();
    };
    rebuildShackletonMesh(null);

    const shackletonTerrainMesh = new THREE.Mesh(patchGeo, patchMat);
    shackletonTerrainMesh.receiveShadow = true;
    shackletonTerrainMesh.castShadow = true;
    shackletonGroup.add(shackletonTerrainMesh);

    // Drape real NASA LRO WAC 303ppd Orbital Mosaic onto the Shackleton Crater Rim LOLA mesh
    let shackletonWacTex: THREE.Texture | null = null;
    const wacTexLoader = new THREE.TextureLoader();
    wacTexLoader.load(
      `/api/nasa/moon-trek/tile?layer=wac&lat=${SHACKLETON_LAT}&lon=${SHACKLETON_LON}&z=4`,
      (tex) => {
        if (disposed) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        shackletonWacTex = tex;
        patchMat.map = tex;
        patchMat.needsUpdate = true;
        requestRender();
      },
    );

    // Scattered 3D Ejecta Boulders on Shackleton Rim Crest (InstancedMesh seated on real LOLA elevation)
    const BOULDER_COUNT = lightweightMode ? 36 : 64;
    const boulderGeo = new THREE.IcosahedronGeometry(0.00046, 0);
    const boulderMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.9,
      metalness: 0.05,
      envMapIntensity: 0.08,
    });
    const boulders = new THREE.InstancedMesh(boulderGeo, boulderMat, BOULDER_COUNT);
    boulders.castShadow = true;
    boulders.receiveShadow = true;

    const placeBoulders = (lolaTerrain?: TerrainAnalysisResult | null) => {
      const bDummy = new THREE.Object3D();
      for (let i = 0; i < BOULDER_COUNT; i++) {
        const ang = (i * 2.39996) % (Math.PI * 2);
        const rad = 0.0175 + ((i * 0.618033) % 1) * 0.026;
        const bx = Math.cos(ang) * rad;
        const bz = Math.sin(ang) * rad;
        const { y } = shackletonHeightFn(bx, bz, lolaTerrain);
        bDummy.position.set(bx, y + 0.00018, bz);
        bDummy.rotation.set(i * 0.7, i * 1.3, i * 0.4);
        const s = 0.55 + ((i * 0.37) % 1) * 1.35;
        bDummy.scale.set(s, s * 0.72, s * 1.15);
        bDummy.updateMatrix();
        boulders.setMatrixAt(i, bDummy.matrix);
      }
      boulders.instanceMatrix.needsUpdate = true;
    };
    placeBoulders(null);
    shackletonGroup.add(boulders);

    // Lander Base Station parked on Shackleton Rim crest + Deployed Rover driving out along Rim
    const { group: rimLander } = buildLunarLanderGroup();
    rimLander.scale.setScalar(0.0014);
    const landerBaseX = 0.0195;
    const landerBaseZ = 0.003;
    const updateRimCraftPositions = (lolaTerrain?: TerrainAnalysisResult | null) => {
      const { y: ly } = shackletonHeightFn(landerBaseX, landerBaseZ, lolaTerrain);
      rimLander.position.set(landerBaseX, ly, landerBaseZ);
    };
    updateRimCraftPositions(null);
    shackletonGroup.add(rimLander);

    const rimRover = buildLunarRoverGroup();
    rimRover.scale.setScalar(0.0018);
    shackletonGroup.add(rimRover);

    // Subtle Rover Traverse Path Ribbon along sunlit Shackleton Rim crest
    const roverPathPts: THREE.Vector3[] = [];
    const buildRoverPath = (lolaTerrain?: TerrainAnalysisResult | null) => {
      roverPathPts.length = 0;
      for (let s = 0; s <= 40; s++) {
        const t = s / 40;
        const ang = 0.15 + t * 1.45;
        const rad = 0.0195 + Math.sin(t * Math.PI) * 0.0022;
        const rx = Math.cos(ang) * rad;
        const rz = Math.sin(ang) * rad;
        const { y } = shackletonHeightFn(rx, rz, lolaTerrain);
        roverPathPts.push(new THREE.Vector3(rx, y + 0.00025, rz));
      }
    };
    buildRoverPath(null);
    const roverPathMat = new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.75 });
    const roverPathGeo = new THREE.BufferGeometry().setFromPoints(roverPathPts);
    const roverPathLine = new THREE.Line(roverPathGeo, roverPathMat);
    shackletonGroup.add(roverPathLine);

    let cachedShackletonLola: TerrainAnalysisResult | null = null;
    void fetch(`/api/lola/analyze?lat=${SHACKLETON_LAT}&lon=${SHACKLETON_LON}&radiusKm=20&gridSize=49`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: TerrainAnalysisResult | null) => {
        if (!data || disposed) return;
        cachedShackletonLola = data;
        rebuildShackletonMesh(data);
        placeBoulders(data);
        updateRimCraftPositions(data);
        buildRoverPath(data);
        roverPathGeo.setFromPoints(roverPathPts);
        syncVisuals();
      })
      .catch(() => {
        // real LOLA query failed; keep clean unperturbed curvature mesh
      });

    // -----------------------------------------------------------------------
    // 3. EARTH GROUP (Exact 3.67:1 Size Ratio vs Moon, Null Island (0°,0°) Origin)
    // -----------------------------------------------------------------------
    const earthGroup = new THREE.Group();
    earthGroup.position.copy(EARTH_POS);
    scene.add(earthGroup);

    const earthSpinGroup = new THREE.Group();
    earthGroup.add(earthSpinGroup);

    const earthFallback = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS, 40, 28),
      new THREE.MeshStandardMaterial({
        color: 0x1d4ed8,
        roughness: 0.72,
        metalness: 0.05,
        envMapIntensity: 0.06,
      }),
    );
    earthSpinGroup.add(earthFallback);

    // Null Island (0° N, 0° E) Prime Meridian + Equator Rings + Origin Buoy on Earth
    const earthRefMat = new THREE.LineBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.3 });
    const earthEqPts: THREE.Vector3[] = [];
    for (let lon = -180; lon <= 180; lon += 6) earthEqPts.push(latLonToVec3(0, lon, EARTH_RADIUS * 1.006));
    earthSpinGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(earthEqPts), earthRefMat));

    const earthPmPts: THREE.Vector3[] = [];
    for (let lat = -90; lat <= 90; lat += 6) earthPmPts.push(latLonToVec3(lat, 0, EARTH_RADIUS * 1.006));
    earthSpinGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(earthPmPts), earthRefMat));

    const earthClickTargets: THREE.Mesh[] = [];
    const nullIslandBuoy = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 14, 14),
      new THREE.MeshBasicMaterial({ color: 0x10b981 }),
    );
    latLonToVec3(0, 0, EARTH_RADIUS * 1.016, nullIslandBuoy.position);
    nullIslandBuoy.userData = { isNullIsland: true };
    earthSpinGroup.add(nullIslandBuoy);
    earthClickTargets.push(nullIslandBuoy);

    for (const fac of GLOBAL_LAUNCH_FACILITIES) {
      const facPin = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 12, 12),
        new THREE.MeshBasicMaterial({ color: fac.isNasaFacility ? 0x06b6d4 : 0xf59e0b }),
      );
      latLonToVec3(fac.lat, fac.lon, EARTH_RADIUS * 1.016, facPin.position);
      facPin.userData = { facility: fac };
      earthSpinGroup.add(facPin);
      earthClickTargets.push(facPin);
    }

    const earthRaycastSphere = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS, 36, 24),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    earthSpinGroup.add(earthRaycastSphere);

    // Earth-Moon tidal-lock reference line connecting Moon near-side (+Z) to Earth surface
    const sightlineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.25,
    });
    const sightline = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 1.04),
        new THREE.Vector3(EARTH_POS.x, EARTH_POS.y, EARTH_POS.z - EARTH_RADIUS - 0.12),
      ]),
      sightlineMat,
    );
    scene.add(sightline);

    // -----------------------------------------------------------------------
    // 4. OFFICIAL NASA SUN 3D MODEL
    // -----------------------------------------------------------------------
    const sunGroup = new THREE.Group();
    scene.add(sunGroup);

    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let disposed = false;

    let cameraTargetPos: THREE.Vector3 | null = null;
    let controlsTargetGoal: THREE.Vector3 | null = null;
    let roverPhaseT = 0;

    const updateRoverOnRim = (tVal: number) => {
      const t = Math.min(1, Math.max(0, tVal));
      const ang = 0.15 + t * 1.45;
      const rad = 0.0195 + Math.sin(t * Math.PI) * 0.0022;
      const rx = Math.cos(ang) * rad;
      const rz = Math.sin(ang) * rad;
      const { y } = shackletonHeightFn(rx, rz, cachedShackletonLola);

      const tNext = Math.min(1, t + 0.02);
      const ang2 = 0.15 + tNext * 1.45;
      const rad2 = 0.0195 + Math.sin(tNext * Math.PI) * 0.0022;
      const nx = Math.cos(ang2) * rad2;
      const nz = Math.sin(ang2) * rad2;
      const { y: ny } = shackletonHeightFn(nx, nz, cachedShackletonLola);

      rimRover.position.set(rx, y + 0.0001, rz);
      rimRover.lookAt(shackletonGroup.localToWorld(new THREE.Vector3(nx, ny + 0.0001, nz)));
    };
    updateRoverOnRim(0.35);

    const requestRender = () => {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;

        const lerpAlpha = isSoftwareGl ? 0.38 : 0.15;
        if (cameraTargetPos) {
          camera.position.lerp(cameraTargetPos, lerpAlpha);
          if (camera.position.distanceTo(cameraTargetPos) < 0.006) {
            camera.position.copy(cameraTargetPos);
            cameraTargetPos = null;
          } else {
            renderDirty = true;
          }
        }
        if (controlsTargetGoal) {
          controls.target.lerp(controlsTargetGoal, lerpAlpha);
          if (controls.target.distanceTo(controlsTargetGoal) < 0.006) {
            controls.target.copy(controlsTargetGoal);
            controlsTargetGoal = null;
          } else {
            renderDirty = true;
          }
        }

        // Dynamic OrbitControls minDistance based on what body/site is targeted
        const targetDistFromOrigin = controls.target.length();
        if (targetDistFromOrigin > 5.0) {
          controls.minDistance = EARTH_RADIUS + 1.1; // Orbiting Earth (3.67 radius)
        } else if (targetDistFromOrigin > 0.4) {
          controls.minDistance = 0.016; // Inspecting Shackleton Crater Rim & Rover close-up
        } else {
          controls.minDistance = 1.04; // Orbiting full Moon
        }

        // Check zoom distance to Shackleton Crater Rim:
        // Zoomed In -> reveal hyper-realistic Shackleton Rim & drive rover out!
        // Zoomed Out -> hide close-up patch so full Moon & 3.67:1 Earth remain pristine!
        const camDistToShackleton = camera.position.distanceTo(shackletonAnchorVec);
        const isCloseToShackleton = camDistToShackleton < 0.52;
        shackletonGroup.visible = isCloseToShackleton;
        setShackletonCloseUp((prev) => (prev !== isCloseToShackleton ? isCloseToShackleton : prev));

        // If user zooms back out while previously locked onto Shackleton surface, smoothly re-center on full Moon
        if (
          !isCloseToShackleton &&
          targetDistFromOrigin > 0.4 &&
          targetDistFromOrigin < 2.0 &&
          !controlsTargetGoal &&
          !cameraTargetPos
        ) {
          controlsTargetGoal = new THREE.Vector3(0, 0, 0);
          renderDirty = true;
        }

        if (isCloseToShackleton) {
          roverPhaseT = (roverPhaseT + (isSoftwareGl ? 0.009 : 0.0035)) % 1;
          updateRoverOnRim(roverPhaseT);
          renderDirty = true;
        }

        controls.update();
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (renderDirty && !disposed) requestRender();
        };
        if (isSoftwareGl) frameId = scheduleAfterDraw(renderer, done);
        else done();
      });
    };

    const syncVisuals = () => {
      const {
        selectedLat: sLat,
        selectedLon: sLon,
        subsolarLat: sunLat,
        subsolarLon: sunLon,
        utcIso: curIso,
      } = targetCoordsRef.current;

      const {
        showSunModel: sunVis,
        showEarthModel: earthVis,
        showGridLines: gridVis,
        showTerminator: termVis,
      } = togglesRef.current;

      const pos = latLonToVec3(sLat, sLon, 1.015);
      selectedMarker.position.copy(pos);
      selectedMarker.lookAt(pos.clone().multiplyScalar(2));

      const sunDir = latLonToVec3(sunLat, sunLon, 1.0).normalize();
      sunLight.position.copy(sunDir).multiplyScalar(34);
      sunGroup.position.copy(sunDir).multiplyScalar(24);
      sunGroup.visible = sunVis;

      terminatorRing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), sunDir);
      terminatorRing.visible = termVis;

      // Align Earth at (0°,0°) Null Island along -Z (facing Moon) when utcIso=12:00 or rotate axially with UTC time
      const ms = new Date(curIso).getTime();
      const dayFraction = Number.isFinite(ms) ? ((ms / 86400_000) % 1 + 1) % 1 : 0;
      earthSpinGroup.rotation.y = dayFraction * Math.PI * 2;
      earthGroup.visible = earthVis;
      sightline.visible = earthVis;

      gridGroup.visible = gridVis;
      requestRender();
    };
    syncVisualsRef.current = syncVisuals;

    cameraPresetRef.current = (preset) => {
      if (preset === 'front') {
        cameraTargetPos = new THREE.Vector3(0, 0.18, 3.25);
        controlsTargetGoal = new THREE.Vector3(0, 0, 0);
      } else if (preset === 'north') {
        cameraTargetPos = new THREE.Vector3(0, 3.2, 0.25);
        controlsTargetGoal = new THREE.Vector3(0, 0, 0);
      } else if (preset === 'south') {
        cameraTargetPos = new THREE.Vector3(0, -3.2, 0.25);
        controlsTargetGoal = new THREE.Vector3(0, 0, 0);
      } else if (preset === 'shackleton') {
        // Low-altitude rover/crater-rim close-up at Shackleton Crater Rim (-89.66°, 129.2°)
        const rimFocus = shackletonGroup.localToWorld(new THREE.Vector3(0.014, 0.002, 0.01));
        const camOffset = shackletonGroup.localToWorld(new THREE.Vector3(0.048, 0.022, 0.044));
        controlsTargetGoal = rimFocus;
        cameraTargetPos = camOffset;
        roverPhaseT = 0.05; // Start rover emerging from lander base!
      } else if (preset === 'earth-null') {
        setShowEarthModel(true);
        // Compute world position of Null Island (0°, 0°) on Earth's current spin
        const nullLocal = latLonToVec3(0, 0, EARTH_RADIUS + 4.8);
        const nullWorld = earthSpinGroup.localToWorld(nullLocal.clone());
        controlsTargetGoal = EARTH_POS.clone();
        cameraTargetPos = nullWorld;
      } else if (preset === 'earth-moon') {
        setShowEarthModel(true);
        // Frame both the 3.67:1 Earth and Moon cleanly side-by-side
        controlsTargetGoal = new THREE.Vector3(0, 0.1, 6.2);
        cameraTargetPos = new THREE.Vector3(18.5, 5.2, 7.2);
      } else {
        const dir = latLonToVec3(
          targetCoordsRef.current.selectedLat,
          targetCoordsRef.current.selectedLon,
          2.6,
        );
        cameraTargetPos = dir;
        controlsTargetGoal = new THREE.Vector3(0, 0, 0);
      }
      requestRender();
    };

    const gltfLoader = new GLTFLoader();
    const modelUrl = useGridModel
      ? '/nasa-models/Moon_NASA_LRO_15k_Grid_Small.glb'
      : '/nasa-models/moon_small.glb';

    setLoadError(null);
    setLoadingPct(5);

    let loadedMoonRoot: THREE.Object3D | null = null;
    gltfLoader.load(
      modelUrl,
      (gltf) => {
        if (disposed) return;
        const root = gltf.scene;
        const box = new THREE.Box3().setFromObject(root);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        root.position.sub(center);
        const wrapper = new THREE.Group();
        wrapper.add(root);
        wrapper.scale.setScalar((MOON_RADIUS * 2) / maxDim);
        wrapper.rotation.y = -Math.PI / 2;

        wrapper.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const m = child as THREE.Mesh;
            m.receiveShadow = true;
            m.castShadow = true;
            const mat = m.material as THREE.MeshStandardMaterial;
            if (mat && mat.isMeshStandardMaterial) {
              mat.roughness = 0.94;
              mat.metalness = 0.02;
              mat.envMapIntensity = 0.05;
            }
          }
        });

        moonGroup.remove(fallbackSphere);
        fallbackSphere.geometry.dispose();
        fallbackMat.dispose();
        moonGroup.add(wrapper);
        loadedMoonRoot = wrapper;
        setLoadingPct(100);
        syncVisuals();
      },
      (evt) => {
        if (evt.total > 0) {
          setLoadingPct(Math.min(99, Math.round((evt.loaded / evt.total) * 100)));
        }
      },
      (err) => {
        console.error('NASA Moon GLB load error:', err);
        setLoadError('NASA GLB asset load failed; fallback lunar sphere active.');
        setLoadingPct(100);
        syncVisuals();
      },
    );

    // Load Official NASA Earth 3D GLB (#2393) scaled to EXACT 3.67:1 diameter ratio vs Moon
    let loadedEarthRoot: THREE.Object3D | null = null;
    gltfLoader.load('/nasa-models/Earth_1_12756.glb', (gltf) => {
      if (disposed) return;
      const earthRoot = gltf.scene;
      const box = new THREE.Box3().setFromObject(earthRoot);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      earthRoot.position.sub(center);
      const wrap = new THREE.Group();
      wrap.add(earthRoot);
      // 3.67:1 diameter ratio (Earth = 7.34 units vs Moon = 2.0 units)
      wrap.scale.setScalar((EARTH_RADIUS * 2) / maxDim);
      // Align UV(0.5, 0.5) Null Island (0°, 0°) to +Z inside earthSpinGroup
      wrap.rotation.y = -Math.PI / 4;

      wrap.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const m = child as THREE.Mesh;
          m.receiveShadow = true;
          m.castShadow = true;
          const mat = m.material as THREE.MeshStandardMaterial;
          if (mat && mat.isMeshStandardMaterial) {
            mat.envMapIntensity = 0.06;
            mat.roughness = Math.max(0.55, mat.roughness);
          }
        }
      });

      earthSpinGroup.remove(earthFallback);
      earthFallback.geometry.dispose();
      (earthFallback.material as THREE.Material).dispose();
      earthSpinGroup.add(wrap);
      loadedEarthRoot = wrap;
      setEarthLoaded(true);
      syncVisuals();
    });

    // Load Official NASA Sun 3D GLB
    gltfLoader.load('/nasa-models/Sun_1_1391000.glb', (gltf) => {
      if (disposed) return;
      const sunRoot = gltf.scene;
      const box = new THREE.Box3().setFromObject(sunRoot);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      sunRoot.position.sub(center);
      const wrap = new THREE.Group();
      wrap.add(sunRoot);
      wrap.scale.setScalar(1.4 / maxDim);
      sunGroup.add(wrap);
      requestRender();
    });

    // Raycaster for Moon AND Earth click-to-select coordinates
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;

    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      // 1. Check Lunar site markers
      const markerHits = raycaster.intersectObjects(moonMarkerTargets, false);
      if (markerHits.length > 0) {
        const preset = markerHits[0].object.userData.preset as (typeof LUNAR_SITE_PRESETS)[number];
        onSelectRef.current(preset.lat, preset.lon, preset.label);
        return;
      }

      // 2. Check Earth markers (Null Island + Launch Facilities) if Earth visible
      if (earthGroup.visible) {
        const earthPinHits = raycaster.intersectObjects(earthClickTargets, false);
        if (earthPinHits.length > 0) {
          const ud = earthPinHits[0].object.userData;
          if (ud.isNullIsland) {
            onSelectEarthRef.current?.({
              lat: 0,
              lon: 0,
              label: 'Null Island Origin (0.000°, 0.000°)',
            });
          } else if (ud.facility) {
            onSelectEarthRef.current?.({
              lat: ud.facility.lat,
              lon: ud.facility.lon,
              label: ud.facility.shortName,
              facilityId: ud.facility.id,
            });
          }
          return;
        }
      }

      // 3. Raycast Moon vs Earth surfaces and pick closest hit
      const moonHits = raycaster.intersectObject(moonRaycastSphere, false);
      const earthHits = earthGroup.visible ? raycaster.intersectObject(earthRaycastSphere, false) : [];

      const moonDist = moonHits.length > 0 ? moonHits[0].distance : Infinity;
      const earthDist = earthHits.length > 0 ? earthHits[0].distance : Infinity;

      if (moonDist < earthDist && moonHits.length > 0) {
        const { lat, lon } = vec3ToLatLon(moonHits[0].point);
        onSelectRef.current(lat, lon);
      } else if (earthDist < Infinity && earthHits.length > 0) {
        const localHit = earthSpinGroup.worldToLocal(earthHits[0].point.clone());
        const { lat, lon } = vec3ToLatLon(localHit);
        const nearNull = Math.abs(lat) < 3 && Math.abs(lon) < 3;
        onSelectEarthRef.current?.({
          lat: nearNull ? 0 : lat,
          lon: nearNull ? 0 : lon,
          label: nearNull
            ? 'Null Island Origin (0.000°, 0.000°)'
            : `Earth Surface (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`,
        });
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    controls.addEventListener('change', requestRender);
    controls.addEventListener('start', () => {
      cameraTargetPos = null;
      controlsTargetGoal = null;
    });

    const onResize = () => {
      if (!container || disposed) return;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 560;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    window.addEventListener('resize', onResize);

    syncVisuals();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      starGeo.dispose();
      starMat.dispose();
      gridMat.dispose();
      terminatorMat.dispose();
      sightlineMat.dispose();
      earthRefMat.dispose();
      patchGeo.dispose();
      patchMat.dispose();
      shackletonWacTex?.dispose();
      boulderGeo.dispose();
      boulderMat.dispose();
      roverPathGeo.dispose();
      roverPathMat.dispose();
      envTex.dispose();
      [loadedMoonRoot, loadedEarthRoot].forEach((root) => {
        if (root) {
          root.traverse((obj) => {
            const m = obj as THREE.Mesh;
            if (m.geometry) m.geometry.dispose();
          });
        }
      });
      renderer.dispose();
    };
  }, [useGridModel, lightweightMode]);

  useEffect(() => {
    syncVisualsRef.current();
  }, [
    selectedLat,
    selectedLon,
    subsolarLat,
    subsolarLon,
    utcIso,
    showGridLines,
    showSunModel,
    showEarthModel,
    showTerminator,
  ]);

  useEffect(() => {
    if (externalPreset) {
      cameraPresetRef.current(externalPreset.id);
    }
  }, [externalPreset]);

  return (
    <div className="relative w-full h-full min-h-[540px] bg-[#04060B] border border-slate-800 rounded-lg overflow-hidden">
      <div ref={mountRef} className="w-full h-full min-h-[540px]" />

      {/* Top-Left Minimal Spec Label (No backdrop-blur over WebGL) */}
      <div className="pointer-events-none absolute top-3 left-3 bg-[#07090E]/90 border border-slate-800 px-3 py-2 rounded-md">
        <div className="text-xs font-medium text-slate-200">
          NASA Moon (1×) &amp; Earth (3.67×) · Null Island (0°,0°) · LRO WAC + LOLA Shackleton Rim
        </div>
        <div className="text-[11px] font-mono text-slate-400">
          {shackletonCloseUp
            ? 'Shackleton LOLA LDEM_16 49×49 + LRO WAC 303ppd: Rover out · Zoom out for full Moon'
            : 'Click Moon or Earth to pick coordinates · Zoom in to Shackleton Rim for rover deploy'}
        </div>
      </div>

      {shackletonCloseUp && (
        <div className="absolute top-3 right-3 bg-[#07090E]/95 border border-emerald-700/80 px-3 py-1.5 rounded flex items-center gap-2.5 text-xs">
          <span className="font-mono text-emerald-300">Shackleton Rim · Rover Out</span>
          <button
            type="button"
            onClick={() => cameraPresetRef.current('front')}
            className="px-2 py-0.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-medium rounded cursor-pointer"
          >
            Zoom Out (Full Moon)
          </button>
        </div>
      )}

      {!shackletonCloseUp && loadingPct < 100 && (
        <div className="pointer-events-none absolute top-3 right-3 bg-[#07090E]/90 border border-cyan-800/70 px-3 py-1.5 rounded text-xs font-mono text-cyan-300">
          Loading NASA Moon GLB ({loadingPct}%)...
        </div>
      )}

      {!shackletonCloseUp && loadingPct === 100 && !earthLoaded && showEarthModel && (
        <div className="pointer-events-none absolute top-3 right-3 bg-[#07090E]/90 border border-slate-700 px-3 py-1.5 rounded text-xs font-mono text-slate-300">
          Streaming NASA Earth GLB...
        </div>
      )}

      {loadError && (
        <div className="pointer-events-none absolute top-14 right-3 bg-rose-950/90 border border-rose-800 px-3 py-1.5 rounded text-xs text-rose-200">
          {loadError}
        </div>
      )}

      {/* Unified Bottom Control Dock */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 max-w-[97%] bg-[#0B101B]/95 border border-slate-700 rounded-lg px-3 py-2 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => cameraPresetRef.current('front')}
          className="px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800 rounded cursor-pointer whitespace-nowrap"
        >
          Full Moon
        </button>
        <button
          type="button"
          onClick={() => cameraPresetRef.current('north')}
          className="px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800 rounded cursor-pointer whitespace-nowrap"
        >
          North Pole
        </button>
        <button
          type="button"
          onClick={() => cameraPresetRef.current('south')}
          className="px-2.5 py-1 text-xs text-cyan-300 hover:bg-slate-800 rounded cursor-pointer whitespace-nowrap"
        >
          South Pole
        </button>
        <button
          type="button"
          onClick={() => {
            onSelectRef.current(SHACKLETON_LAT, SHACKLETON_LON, 'Shackleton Crater Rim');
            cameraPresetRef.current('shackleton');
          }}
          className="px-2.5 py-1 text-xs bg-emerald-600/20 border border-emerald-700 text-emerald-200 hover:bg-emerald-600/30 rounded cursor-pointer whitespace-nowrap"
        >
          Shackleton Rim + Rover
        </button>
        <button
          type="button"
          onClick={() => cameraPresetRef.current('earth-null')}
          className="px-2.5 py-1 text-xs bg-sky-600/20 border border-sky-700 text-sky-200 hover:bg-sky-600/30 rounded cursor-pointer whitespace-nowrap"
        >
          Earth (Null Island 0°,0°)
        </button>
        <button
          type="button"
          onClick={() => cameraPresetRef.current('earth-moon')}
          className="px-2.5 py-1 text-xs bg-sky-600/20 border border-sky-700 text-sky-200 hover:bg-sky-600/30 rounded cursor-pointer whitespace-nowrap"
        >
          Earth–Moon (3.67:1)
        </button>
        <button
          type="button"
          onClick={() => cameraPresetRef.current('selected')}
          className="px-2.5 py-1 text-xs bg-cyan-600/20 border border-cyan-700 text-cyan-200 hover:bg-cyan-600/30 rounded cursor-pointer whitespace-nowrap"
        >
          Focus Target
        </button>

        <span className="h-4 w-px bg-slate-700 mx-0.5" aria-hidden="true" />

        <button
          type="button"
          onClick={() => setShowEarthModel((v) => !v)}
          className={`px-2.5 py-1 text-xs rounded border cursor-pointer whitespace-nowrap ${
            showEarthModel
              ? 'bg-slate-800 text-sky-300 border-sky-800'
              : 'bg-[#07090E] text-slate-400 border-slate-700'
          }`}
        >
          Earth 3.67×
        </button>

        <button
          type="button"
          onClick={() => setShowTerminator((v) => !v)}
          className={`px-2.5 py-1 text-xs rounded border cursor-pointer whitespace-nowrap ${
            showTerminator
              ? 'bg-slate-800 text-amber-300 border-amber-800'
              : 'bg-[#07090E] text-slate-400 border-slate-700'
          }`}
        >
          Terminator
        </button>

        <button
          type="button"
          onClick={() => setUseGridModel((v) => !v)}
          className={`px-2.5 py-1 text-xs rounded border cursor-pointer whitespace-nowrap ${
            useGridModel
              ? 'bg-cyan-600 text-slate-950 border-cyan-500 font-medium'
              : 'bg-[#07090E] text-slate-300 border-slate-700 hover:border-slate-500'
          }`}
        >
          {useGridModel ? 'SVS 15k Grid' : 'SVS Surface'}
        </button>

        <button
          type="button"
          onClick={() => setShowGridLines((v) => !v)}
          className={`px-2.5 py-1 text-xs rounded border cursor-pointer whitespace-nowrap ${
            showGridLines
              ? 'bg-slate-800 text-cyan-300 border-cyan-800'
              : 'bg-[#07090E] text-slate-400 border-slate-700'
          }`}
        >
          Lat/Lon Grid
        </button>

        <button
          type="button"
          onClick={() => setShowSunModel((v) => !v)}
          className={`px-2.5 py-1 text-xs rounded border cursor-pointer whitespace-nowrap ${
            showSunModel
              ? 'bg-slate-800 text-amber-300 border-amber-800'
              : 'bg-[#07090E] text-slate-400 border-slate-700'
          }`}
        >
          Sun ({NASA_3D_ASSETS[2].id})
        </button>
      </div>
    </div>
  );
}
