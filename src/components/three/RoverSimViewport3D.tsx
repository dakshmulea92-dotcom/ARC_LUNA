import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { ProfilePoint, TerrainAnalysisResult } from '../../types/lunar';
import {
  applyStudioEnvironment,
  buildLunarRoverGroup,
  createConfiguredRenderer,
  detectSoftwareWebGL,
  scheduleAfterDraw,
} from './ThreeUtils';

interface RoverSimViewport3DProps {
  terrain: TerrainAnalysisResult;
  routePoints: ProfilePoint[];
  progressPct: number; // 0..100
  lightweightMode: boolean;
}

export function RoverSimViewport3D({
  terrain,
  routePoints,
  progressPct,
  lightweightMode,
}: RoverSimViewport3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef(progressPct);
  progressRef.current = progressPct;
  const syncRoverRef = useRef<() => void>(() => {});
  const zoomPresetRef = useRef<(preset: 'rover' | 'moon') => void>(() => {});
  const [zoomedOutMoon, setZoomedOutMoon] = useState(false);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const width = container.clientWidth || 720;
    const height = container.clientHeight || 420;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070c);

    const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 450);
    camera.position.set(16, 13, 22);

    const renderer = createConfiguredRenderer(width, height, isSoftwareGl, lightweightMode);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const envTex = applyStudioEnvironment(renderer, scene);
    if ('environmentIntensity' in scene) {
      (scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity = 0.08;
    }

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.minDistance = 4;
    controls.maxDistance = 135;
    controls.maxPolarAngle = Math.PI * 0.85;

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 2.8);
    keyLight.position.set(35, 28, 22);
    keyLight.castShadow = !isSoftwareGl && !lightweightMode;
    scene.add(keyLight);
    scene.add(new THREE.HemisphereLight(0x334155, 0x05070c, 0.18));

    // Subtle background starfield
    const starCount = lightweightMode ? 120 : 280;
    const starGeo = new THREE.SphereGeometry(0.14, 5, 5);
    const starMat = new THREE.MeshBasicMaterial({ color: 0xcbd5e1 });
    const stars = new THREE.InstancedMesh(starGeo, starMat, starCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < starCount; i++) {
      const theta = ((i * 137.508) % 360) * (Math.PI / 180);
      const u = ((i * 0.6180339887) % 1) * 2 - 1;
      const r = 170 + (i % 7) * 12;
      const s = Math.sqrt(1 - u * u);
      dummy.position.set(r * s * Math.cos(theta), r * u, r * s * Math.sin(theta));
      dummy.updateMatrix();
      stars.setMatrixAt(i, dummy.matrix);
    }
    stars.computeBoundingSphere();
    scene.add(stars);

    const n = terrain.gridSize;
    const spanUnits = 36;
    const relief = Math.max(50, terrain.elevationStats.reliefM);
    const heightScale = 5.0 / relief;
    const centerElev = terrain.centerElevationM;

    const planeGeo = new THREE.PlaneGeometry(spanUnits, spanUnits, n - 1, n - 1);
    planeGeo.rotateX(-Math.PI / 2);
    const posAttr = planeGeo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(posAttr.count * 3);

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const idx = r * n + c;
        const y = (terrain.elevationGrid[r][c] - centerElev) * heightScale;
        posAttr.setY(idx, y);
        const slope = terrain.slopeGrid[r][c];
        const col = new THREE.Color(slope > 12 ? 0xfbbf24 : slope > 6 ? 0xdbeafe : 0xf8fafc);
        colors[idx * 3] = col.r;
        colors[idx * 3 + 1] = col.g;
        colors[idx * 3 + 2] = col.b;
      }
    }
    planeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    planeGeo.computeVertexNormals();

    const localTerrainGroup = new THREE.Group();
    scene.add(localTerrainGroup);

    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.03,
      envMapIntensity: 0.06,
    });
    const terrainMesh = new THREE.Mesh(planeGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    localTerrainGroup.add(terrainMesh);

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
        requestRender();
      },
    );

    const kmToUnits = spanUnits / (terrain.radiusKm * 2);
    const cosLat = Math.max(0.05, Math.cos(THREE.MathUtils.degToRad(terrain.centerLat)));
    const routeVectors: THREE.Vector3[] = routePoints.map((pt) => {
      const dLatKm = (pt.lat - terrain.centerLat) * (Math.PI / 180) * 1737.4;
      const dLonKm = (pt.lon - terrain.centerLon) * (Math.PI / 180) * 1737.4 * cosLat;
      const x = THREE.MathUtils.clamp(dLonKm * kmToUnits, -spanUnits / 2 + 1, spanUnits / 2 - 1);
      const z = THREE.MathUtils.clamp(-dLatKm * kmToUnits, -spanUnits / 2 + 1, spanUnits / 2 - 1);
      const y = (pt.elevationM - centerElev) * heightScale + 0.15;
      return new THREE.Vector3(x, y, z);
    });

    let lineGeo: THREE.BufferGeometry | null = null;
    let lineMat: THREE.LineBasicMaterial | null = null;
    if (routeVectors.length >= 2) {
      lineGeo = new THREE.BufferGeometry().setFromPoints(routeVectors);
      lineMat = new THREE.LineBasicMaterial({ color: 0x06b6d4 });
      localTerrainGroup.add(new THREE.Line(lineGeo, lineMat));
    }

    const rover = buildLunarRoverGroup();
    rover.scale.setScalar(0.95);
    localTerrainGroup.add(rover);

    // Full Moon Globe beneath/around patch — smoothly revealed when zoomed out
    const MOON_GLOBE_CENTER = new THREE.Vector3(0, -26, 0);
    const MOON_GLOBE_RADIUS = 24;
    const moonBackdropGroup = new THREE.Group();
    moonBackdropGroup.position.copy(MOON_GLOBE_CENTER);
    moonBackdropGroup.visible = false;
    scene.add(moonBackdropGroup);

    const fallbackMoon = new THREE.Mesh(
      new THREE.SphereGeometry(MOON_GLOBE_RADIUS, 40, 28),
      new THREE.MeshStandardMaterial({
        color: 0x64748b,
        roughness: 0.94,
        metalness: 0.02,
        envMapIntensity: 0.06,
      }),
    );
    moonBackdropGroup.add(fallbackMoon);

    const sitePin = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee }),
    );
    sitePin.position.set(0, MOON_GLOBE_RADIUS + 0.3, 0);
    moonBackdropGroup.add(sitePin);

    let loadedMoonRoot: THREE.Object3D | null = null;
    const gltfLoader = new GLTFLoader();
    gltfLoader.load('/nasa-models/moon_small.glb', (gltf) => {
      if (disposed) return;
      const root = gltf.scene;
      const box = new THREE.Box3().setFromObject(root);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      root.position.sub(center);
      const wrap = new THREE.Group();
      wrap.add(root);
      wrap.scale.setScalar((MOON_GLOBE_RADIUS * 2) / maxDim);
      wrap.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
          if (mat && mat.isMeshStandardMaterial) {
            mat.roughness = 0.94;
            mat.envMapIntensity = 0.06;
          }
        }
      });
      moonBackdropGroup.remove(fallbackMoon);
      fallbackMoon.geometry.dispose();
      (fallbackMoon.material as THREE.Material).dispose();
      moonBackdropGroup.add(wrap);
      loadedMoonRoot = wrap;
      requestRender();
    });

    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let disposed = false;
    let cameraTargetPos: THREE.Vector3 | null = null;
    let controlsTargetGoal: THREE.Vector3 | null = null;

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
        const alpha = isSoftwareGl ? 0.35 : 0.14;
        if (cameraTargetPos) {
          camera.position.lerp(cameraTargetPos, alpha);
          if (camera.position.distanceTo(cameraTargetPos) < 0.15) {
            camera.position.copy(cameraTargetPos);
            cameraTargetPos = null;
          } else {
            renderDirty = true;
          }
        }
        if (controlsTargetGoal) {
          controls.target.lerp(controlsTargetGoal, alpha);
          if (controls.target.distanceTo(controlsTargetGoal) < 0.15) {
            controls.target.copy(controlsTargetGoal);
            controlsTargetGoal = null;
          } else {
            renderDirty = true;
          }
        }

        const camDist = camera.position.distanceTo(new THREE.Vector3(0, 0, 0));
        const showMoon = camDist > 48;
        moonBackdropGroup.visible = showMoon;
        localTerrainGroup.visible = camDist <= 68;
        setZoomedOutMoon((prev) => (prev !== showMoon ? showMoon : prev));

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

    zoomPresetRef.current = (preset) => {
      if (preset === 'moon') {
        controlsTargetGoal = MOON_GLOBE_CENTER.clone();
        cameraTargetPos = new THREE.Vector3(0, -18, 86);
      } else {
        controlsTargetGoal = new THREE.Vector3(0, 0, 0);
        cameraTargetPos = new THREE.Vector3(16, 13, 22);
      }
      requestRender();
    };

    const syncRover = () => {
      if (routeVectors.length >= 2) {
        const t = THREE.MathUtils.clamp(progressRef.current / 100, 0, 1);
        const scaled = t * (routeVectors.length - 1);
        const i0 = Math.min(routeVectors.length - 2, Math.floor(scaled));
        const f = scaled - i0;
        const pos = routeVectors[i0].clone().lerp(routeVectors[i0 + 1], f);
        rover.position.copy(pos);
        const nextPos = routeVectors[Math.min(routeVectors.length - 1, i0 + 1)];
        if (nextPos.distanceTo(pos) > 0.001) {
          rover.lookAt(nextPos.x, pos.y, nextPos.z);
        }
      }
      requestRender();
    };
    syncRoverRef.current = syncRover;

    controls.addEventListener('change', requestRender);
    controls.addEventListener('start', () => {
      cameraTargetPos = null;
      controlsTargetGoal = null;
    });

    const onResize = () => {
      if (!container || disposed) return;
      const w = container.clientWidth || 720;
      const h = container.clientHeight || 420;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    window.addEventListener('resize', onResize);

    syncRover();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      starGeo.dispose();
      starMat.dispose();
      planeGeo.dispose();
      terrainMat.dispose();
      wacTexture?.dispose();
      lineGeo?.dispose();
      lineMat?.dispose();
      if (loadedMoonRoot) {
        loadedMoonRoot.traverse((obj) => {
          const m = obj as THREE.Mesh;
          if (m.geometry) m.geometry.dispose();
        });
      }
      envTex.dispose();
      renderer.dispose();
    };
  }, [terrain, routePoints, lightweightMode]);

  useEffect(() => {
    syncRoverRef.current();
  }, [progressPct]);

  return (
    <div className="relative w-full h-full min-h-[400px] bg-[#05070C] border border-slate-800 rounded-lg overflow-hidden">
      <div ref={mountRef} className="w-full h-full min-h-[400px]" />
      <div className="pointer-events-none absolute top-3 left-3 bg-[#07090E]/90 border border-slate-800 px-3 py-1.5 rounded text-xs">
        <span className="text-violet-300 font-medium">
          {zoomedOutMoon ? 'Zoomed Out: Full Moon Globe View' : 'Simulated 3D Rover Traverse'}
        </span>
        <span className="text-slate-400 ml-2">
          {zoomedOutMoon
            ? 'NASA SVS 14959 Moon visible · Cyan pin marks traverse site'
            : 'NASA LOLA DEM + LRO WAC 303ppd Orbital Mosaic · Zoom out to view full Moon'}
        </span>
      </div>

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-[#0B101B]/95 border border-slate-700 rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => zoomPresetRef.current('rover')}
          className="px-2.5 py-1 rounded text-cyan-300 hover:bg-slate-800 cursor-pointer"
        >
          Focus Rover Traverse
        </button>
        <button
          type="button"
          onClick={() => zoomPresetRef.current('moon')}
          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 cursor-pointer"
        >
          Zoom Out (View Moon)
        </button>
      </div>
    </div>
  );
}
