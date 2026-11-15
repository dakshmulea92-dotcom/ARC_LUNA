import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLOBAL_LAUNCH_FACILITIES } from '../../lib/nasaCatalog';
import type { LaunchFacility } from '../../types/lunar';
import {
  applyStudioEnvironment,
  createConfiguredRenderer,
  detectSoftwareWebGL,
  latLonToVec3,
  scheduleAfterDraw,
  vec3ToLatLon,
} from './ThreeUtils';

interface EarthGlobe3DProps {
  selectedFacilityId: string;
  lightweightMode: boolean;
  onSelectFacility: (facility: LaunchFacility) => void;
  onSelectEarthCoord?: (lat: number, lon: number, label: string) => void;
}

export function EarthGlobe3D({
  selectedFacilityId,
  lightweightMode,
  onSelectFacility,
  onSelectEarthCoord,
}: EarthGlobe3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [loadingPct, setLoadingPct] = useState(0);
  const [earthPick, setEarthPick] = useState<{ lat: number; lon: number; label: string }>({
    lat: 0,
    lon: 0,
    label: 'Null Island Origin (0.000°, 0.000°)',
  });

  const onSelectRef = useRef(onSelectFacility);
  onSelectRef.current = onSelectFacility;
  const onSelectCoordRef = useRef(onSelectEarthCoord);
  onSelectCoordRef.current = onSelectEarthCoord;

  const focusPointRef = useRef<(lat: number, lon: number, label?: string) => void>(() => {});
  const selectedRef = useRef(selectedFacilityId);
  selectedRef.current = selectedFacilityId;
  const syncMarkersRef = useRef<() => void>(() => {});
  const firstMountRef = useRef(true);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const width = container.clientWidth || 760;
    const height = container.clientHeight || 480;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070c);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.05, 100);
    // Start centered on (0°, 0°) Null Island along +Z Prime Meridian / Equator intersection
    camera.position.set(0, 0.15, 3.05);

    const renderer = createConfiguredRenderer(width, height, isSoftwareGl, lightweightMode);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const envTex = applyStudioEnvironment(renderer, scene);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 1.45;
    controls.maxDistance = 7.0;

    const sunLight = new THREE.DirectionalLight(0xffffff, 2.3);
    sunLight.position.set(4, 2.5, 6);
    scene.add(sunLight);
    scene.add(new THREE.HemisphereLight(0x93c5fd, 0x0f172a, 0.45));

    const earthGroup = new THREE.Group();
    scene.add(earthGroup);

    const fallbackEarth = new THREE.Mesh(
      new THREE.SphereGeometry(1, 36, 24),
      new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.7 }),
    );
    earthGroup.add(fallbackEarth);

    // Equator (0° lat) & Prime Meridian (0° lon) lines intersecting at Null Island (0°, 0°)
    const refLinesGroup = new THREE.Group();
    const eqPts: THREE.Vector3[] = [];
    for (let lon = -180; lon <= 180; lon += 5) eqPts.push(latLonToVec3(0, lon, 1.005));
    const eqMat = new THREE.LineBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.35 });
    refLinesGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(eqPts), eqMat));

    const pmPts: THREE.Vector3[] = [];
    for (let lat = -90; lat <= 90; lat += 5) pmPts.push(latLonToVec3(lat, 0, 1.005));
    const pmMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.35 });
    refLinesGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pmPts), pmMat));
    earthGroup.add(refLinesGroup);

    // Null Island (0° N, 0° E) Origin Buoy Marker
    const nullIslandPin = new THREE.Mesh(
      new THREE.SphereGeometry(0.026, 14, 14),
      new THREE.MeshBasicMaterial({ color: 0x10b981 }),
    );
    latLonToVec3(0, 0, 1.02, nullIslandPin.position);
    nullIslandPin.userData = { isNullIsland: true };
    earthGroup.add(nullIslandPin);

    const nullIslandRing = new THREE.Mesh(
      new THREE.RingGeometry(0.036, 0.05, 24),
      new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide }),
    );
    latLonToVec3(0, 0, 1.021, nullIslandRing.position);
    nullIslandRing.lookAt(nullIslandRing.position.clone().multiplyScalar(2));
    earthGroup.add(nullIslandRing);

    const markerMeshes: THREE.Mesh[] = [nullIslandPin];
    for (const fac of GLOBAL_LAUNCH_FACILITIES) {
      const mat = new THREE.MeshBasicMaterial({
        color: fac.isNasaFacility ? 0x06b6d4 : 0xf59e0b,
      });
      const pin = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 12), mat);
      latLonToVec3(fac.lat, fac.lon, 1.018, pin.position);
      pin.userData = { facility: fac };
      earthGroup.add(pin);
      markerMeshes.push(pin);
    }

    const activeRing = new THREE.Mesh(
      new THREE.RingGeometry(0.035, 0.052, 24),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee, side: THREE.DoubleSide }),
    );
    earthGroup.add(activeRing);

    // Invisible Earth raycast sphere for click-anywhere lat/lon pickup
    const raycastSphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.0, 36, 24),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    earthGroup.add(raycastSphere);

    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let disposed = false;
    let cameraTargetPos: THREE.Vector3 | null = null;

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
        if (cameraTargetPos) {
          camera.position.lerp(cameraTargetPos, isSoftwareGl ? 0.35 : 0.14);
          if (camera.position.distanceTo(cameraTargetPos) < 0.015) {
            camera.position.copy(cameraTargetPos);
            cameraTargetPos = null;
          } else {
            renderDirty = true;
          }
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

    const syncMarkers = () => {
      const fac =
        GLOBAL_LAUNCH_FACILITIES.find((f) => f.id === selectedRef.current) ??
        GLOBAL_LAUNCH_FACILITIES[0];
      const pos = latLonToVec3(fac.lat, fac.lon, 1.022);
      activeRing.position.copy(pos);
      activeRing.lookAt(pos.clone().multiplyScalar(2));
      requestRender();
    };
    syncMarkersRef.current = syncMarkers;

    focusPointRef.current = (lat, lon, label) => {
      cameraTargetPos = latLonToVec3(lat, lon, 2.85);
      if (label) {
        setEarthPick({ lat, lon, label });
      }
      requestRender();
    };

    const gltfLoader = new GLTFLoader();
    gltfLoader.load(
      '/nasa-models/Earth_1_12756.glb',
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
        wrapper.scale.setScalar(2.0 / maxDim);
        // Verified GLB UV alignment: UV(0.5, 0.5) Null Island (0°,0°) aligns to +Z when rotated -45° (-PI/4)
        wrapper.rotation.y = -Math.PI / 4;

        earthGroup.remove(fallbackEarth);
        fallbackEarth.geometry.dispose();
        (fallbackEarth.material as THREE.Material).dispose();
        earthGroup.add(wrapper);
        setLoadingPct(100);
        syncMarkers();
      },
      (evt) => {
        if (evt.total > 0) setLoadingPct(Math.min(99, Math.round((evt.loaded / evt.total) * 100)));
      },
      () => {
        setLoadingPct(100);
        syncMarkers();
      },
    );

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

      const hits = raycaster.intersectObjects(markerMeshes, false);
      if (hits.length > 0) {
        const ud = hits[0].object.userData;
        if (ud.isNullIsland) {
          const info = { lat: 0, lon: 0, label: 'Null Island Origin (0.000°, 0.000°)' };
          setEarthPick(info);
          onSelectCoordRef.current?.(0, 0, info.label);
          focusPointRef.current(0, 0, info.label);
          return;
        }
        const fac = ud.facility as LaunchFacility;
        setEarthPick({ lat: fac.lat, lon: fac.lon, label: fac.shortName });
        onSelectRef.current(fac);
        return;
      }

      const surfHits = raycaster.intersectObject(raycastSphere, false);
      if (surfHits.length > 0) {
        const { lat, lon } = vec3ToLatLon(surfHits[0].point);
        const nearNull = Math.abs(lat) < 2.5 && Math.abs(lon) < 2.5;
        const label = nearNull
          ? 'Null Island Origin (0.000°, 0.000°)'
          : `Earth Pick (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`;
        const finalLat = nearNull ? 0 : lat;
        const finalLon = nearNull ? 0 : lon;
        setEarthPick({ lat: finalLat, lon: finalLon, label });
        onSelectCoordRef.current?.(finalLat, finalLon, label);
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    controls.addEventListener('change', requestRender);
    controls.addEventListener('start', () => {
      cameraTargetPos = null;
    });

    const onResize = () => {
      if (!container || disposed) return;
      const w = container.clientWidth || 760;
      const h = container.clientHeight || 480;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    window.addEventListener('resize', onResize);

    syncMarkers();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      eqMat.dispose();
      pmMat.dispose();
      envTex.dispose();
      renderer.dispose();
    };
  }, [lightweightMode]);

  useEffect(() => {
    syncMarkersRef.current();
    if (firstMountRef.current) {
      firstMountRef.current = false;
      return;
    }
    const fac = GLOBAL_LAUNCH_FACILITIES.find((f) => f.id === selectedFacilityId);
    if (fac) focusPointRef.current(fac.lat, fac.lon, fac.shortName);
  }, [selectedFacilityId]);

  return (
    <div className="relative w-full h-full min-h-[460px] bg-[#05070C] border border-slate-800 rounded-lg overflow-hidden">
      <div ref={mountRef} className="w-full h-full min-h-[460px]" />

      <div className="pointer-events-none absolute top-3 left-3 bg-[#07090E]/90 border border-slate-800 px-3 py-2 rounded-md">
        <div className="text-xs font-medium text-slate-200">
          NASA Solar System #2393 · Earth 3D Globe · (0°, 0°) Null Island Origin
        </div>
        <div className="text-[11px] font-mono text-slate-400">
          Green: Null Island (0°, 0°) · Cyan: NASA Launch Sites · Amber: International Sites
        </div>
      </div>

      {loadingPct < 100 && (
        <div className="pointer-events-none absolute top-3 right-3 bg-[#07090E]/90 border border-cyan-800/70 px-3 py-1.5 rounded text-xs font-mono text-cyan-300">
          Loading NASA Earth GLB ({loadingPct}%)...
        </div>
      )}

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-[#0B101B]/95 border border-slate-700 rounded-lg px-3 py-1.5 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-mono text-[11px] text-emerald-300">
          {earthPick.label} ({earthPick.lat.toFixed(3)}°, {earthPick.lon.toFixed(3)}°)
        </span>
        <span className="h-3.5 w-px bg-slate-700" aria-hidden="true" />
        <button
          type="button"
          onClick={() => focusPointRef.current(0, 0, 'Null Island Origin (0.000°, 0.000°)')}
          className="px-2.5 py-1 text-xs bg-emerald-600/20 border border-emerald-700 text-emerald-200 hover:bg-emerald-600/30 rounded cursor-pointer whitespace-nowrap"
        >
          Center Null Island (0°, 0°)
        </button>
      </div>
    </div>
  );
}
