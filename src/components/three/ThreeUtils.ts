import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function detectSoftwareWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export function createConfiguredRenderer(
  width: number,
  height: number,
  isSoftwareGl: boolean,
  lightweightMode = false,
): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl && !lightweightMode,
    powerPreference: lightweightMode ? 'low-power' : 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.setPixelRatio(isSoftwareGl || lightweightMode ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.setSize(Math.max(1, width), Math.max(1, height));
  renderer.shadowMap.enabled = !isSoftwareGl && !lightweightMode;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}

export function applyStudioEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  pmremGenerator.dispose();
  return envTex;
}

/**
 * Converts selenographic/geographic (lat, lon) in degrees to Three.js spherical coordinates
 * where lat=0, lon=0 sits on +Z (or rotated via group offset if GLB prime meridian differs).
 */
export function latLonToVec3(latDeg: number, lonDeg: number, radius: number, target = new THREE.Vector3()): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - latDeg);
  const theta = THREE.MathUtils.degToRad(lonDeg + 90);
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  return target.set(x, y, z);
}

export function vec3ToLatLon(vec: THREE.Vector3): { lat: number; lon: number } {
  const r = vec.length() || 1;
  const lat = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(vec.y / r, -1, 1)));
  // Inverse of x = -r sin(phi) cos(lon+90) = r sin(phi) sin(lon), z = r sin(phi) cos(lon)
  const lon = THREE.MathUtils.radToDeg(Math.atan2(vec.x, vec.z));
  return {
    lat: Number(lat.toFixed(3)),
    lon: Number(lon.toFixed(3)),
  };
}

export function scheduleAfterDraw(renderer: THREE.WebGLRenderer, cb: () => void): number {
  try {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    if (gl && typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          window.setTimeout(cb, 70);
        }
      };
      return window.setTimeout(poll, 5);
    }
  } catch {
    // fallback if WebGL1
  }
  return window.setTimeout(cb, 80);
}

/**
 * Composite 8-part procedural Lunar Lander THREE.Group (bottom-center pivot at y=0).
 */
export function buildLunarLanderGroup(): { group: THREE.Group; plume: THREE.Mesh } {
  const group = new THREE.Group();

  const goldFoilMat = new THREE.MeshStandardMaterial({
    color: 0xd4a024,
    metalness: 0.88,
    roughness: 0.24,
  });
  const alloyMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    metalness: 0.72,
    roughness: 0.36,
  });
  const darkCarbonMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.35,
    roughness: 0.65,
  });
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x06b6d4,
    metalness: 0.2,
    roughness: 0.15,
    emissive: 0x083344,
  });

  // 1. Octagonal descent stage
  const descentStage = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.25, 0.9, 8), goldFoilMat);
  descentStage.position.y = 1.15;
  descentStage.castShadow = true;
  group.add(descentStage);

  // 2. Ascent cabin body
  const ascentCabin = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.95, 1.15), alloyMat);
  ascentCabin.position.y = 2.05;
  ascentCabin.castShadow = true;
  group.add(ascentCabin);

  // 3. Forward crew viewport visor
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.32, 0.12), windowMat);
  visor.position.set(0, 2.15, 0.58);
  group.add(visor);

  // 4. Descent engine bell
  const engineBell = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.48, 0.65, 16, 1, true), darkCarbonMat);
  engineBell.material.side = THREE.DoubleSide;
  engineBell.position.y = 0.55;
  group.add(engineBell);

  // 5. Exhaust plume cone (toggled by throttle)
  const plumeMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const plume = new THREE.Mesh(new THREE.ConeGeometry(0.45, 2.0, 14, 1, true), plumeMat);
  plume.rotation.x = Math.PI;
  plume.position.y = -0.6;
  plume.visible = false;
  group.add(plume);

  // 6-9. Four landing gear struts & circular footpads
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2 + Math.PI / 4;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.45, 8), alloyMat);
    strut.position.set(cos * 1.28, 0.65, sin * 1.28);
    strut.rotation.z = cos * 0.45;
    strut.rotation.x = -sin * 0.45;
    strut.castShadow = true;
    group.add(strut);

    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.08, 12), goldFoilMat);
    pad.position.set(cos * 1.62, 0.04, sin * 1.62);
    pad.receiveShadow = true;
    group.add(pad);
  }

  // 10. High-gain S-band dish antenna
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.4), alloyMat);
  dish.material.side = THREE.DoubleSide;
  dish.position.set(0.45, 2.75, 0.15);
  dish.rotation.x = Math.PI * 0.75;
  group.add(dish);

  return { group, plume };
}

/**
 * Composite 8-part procedural Lunar Rover THREE.Group (bottom-center pivot at y=0).
 */
export function buildLunarRoverGroup(): THREE.Group {
  const group = new THREE.Group();

  const frameMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.75, roughness: 0.3 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.85, roughness: 0.25 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.3, roughness: 0.75 });
  const solarMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.65, roughness: 0.2, emissive: 0x082f49 });

  // 1. Warm Electronics Box chassis
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.42, 1.8), goldMat);
  chassis.position.y = 0.58;
  chassis.castShadow = true;
  group.add(chassis);

  // 2. Solar deck wing
  const solarDeck = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 1.25), solarMat);
  solarDeck.position.set(0, 0.84, -0.15);
  solarDeck.castShadow = true;
  group.add(solarDeck);

  // 3. Camera mast pole
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.9, 10), frameMat);
  mast.position.set(0.32, 1.25, 0.62);
  group.add(mast);

  // 4. Stereo NavCam head
  const camHead = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.18, 0.2), frameMat);
  camHead.position.set(0.32, 1.72, 0.65);
  group.add(camHead);

  // 5. High-gain dish
  const hga = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.08, 0.12, 16), frameMat);
  hga.position.set(-0.42, 1.15, -0.5);
  hga.rotation.x = 0.45;
  group.add(hga);

  // 6-9. Four mesh-tire wheels
  const wheelOffsets: Array<[number, number]> = [
    [-0.88, 0.68],
    [0.88, 0.68],
    [-0.88, -0.68],
    [0.88, -0.68],
  ];
  for (const [wx, wz] of wheelOffsets) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.22, 16), wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.28, wz);
    wheel.castShadow = true;
    group.add(wheel);

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.24, 12), frameMat);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(wx, 0.28, wz);
    group.add(hub);
  }

  return group;
}

/**
 * Generates seamless procedural lunar regolith micro-crater albedo + bump textures
 * for close-up high-detail terrain shading (e.g., Shackleton Crater Rim).
 */
export function createLunarRegolithTextures(): {
  albedoMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 256;
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const aCtx = albedoCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;

  // Base regolith grain
  aCtx.fillStyle = '#9aa3b0';
  aCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  // Deterministic pseudo-random generator for consistent lunar micro-craters
  let seed = 19690720;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // Fine mineral grain speckles
  for (let i = 0; i < 3200; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 0.6 + rand() * 1.4;
    const v = Math.floor(115 + rand() * 75);
    aCtx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
    aCtx.fillRect(x, y, r, r);

    const bv = Math.floor(95 + rand() * 70);
    bCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
    bCtx.fillRect(x, y, r, r);
  }

  // Multi-scale micro-impact craters with bright ejecta rims and dark bowls
  for (let i = 0; i < 85; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const cr = 2.5 + rand() * 14;

    const bGrad = bCtx.createRadialGradient(cx, cy, 0, cx, cy, cr);
    bGrad.addColorStop(0, '#202020');
    bGrad.addColorStop(0.62, '#525252');
    bGrad.addColorStop(0.82, '#e2e2e2');
    bGrad.addColorStop(1, 'rgba(128,128,128,0)');
    bCtx.fillStyle = bGrad;
    bCtx.beginPath();
    bCtx.arc(cx, cy, cr, 0, Math.PI * 2);
    bCtx.fill();

    const aGrad = aCtx.createRadialGradient(cx, cy, 0, cx, cy, cr);
    aGrad.addColorStop(0, 'rgba(55,62,74,0.65)');
    aGrad.addColorStop(0.65, 'rgba(110,118,130,0.25)');
    aGrad.addColorStop(0.84, 'rgba(218,226,238,0.45)');
    aGrad.addColorStop(1, 'rgba(154,163,176,0)');
    aCtx.fillStyle = aGrad;
    aCtx.beginPath();
    aCtx.arc(cx, cy, cr, 0, Math.PI * 2);
    aCtx.fill();
  }

  const albedoMap = new THREE.CanvasTexture(albedoCanvas);
  albedoMap.wrapS = THREE.RepeatWrapping;
  albedoMap.wrapT = THREE.RepeatWrapping;
  albedoMap.repeat.set(6, 6);
  albedoMap.colorSpace = THREE.SRGBColorSpace;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(6, 6);

  return { albedoMap, bumpMap };
}

