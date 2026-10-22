import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';

import {
  AVENUE_EVERY,
  GRID_SIZE,
  LAST_STAGE,
  MAX_HEIGHT,
  MIN_HEIGHT,
  avenuePosition,
  buildCity,
} from './cityLayout';
import type { CityBlock, ZoneId } from './cityLayout';

export interface CitySceneOptions {
  readonly reducedMotion: boolean;
  /** Screen position, in CSS pixels, of the top of the selected block. */
  readonly onAnchor: (x: number, y: number, inView: boolean) => void;
}

export interface CityScene {
  setMotion(reduced: boolean, paused: boolean): void;
  setProgress(progress: number): void;
  resize(): void;
  dispose(): void;
}

// Values mirror src/styles/tokens.css; WebGL cannot read custom properties.
const ENAMEL_900 = 0x08214f;
const ENAMEL_800 = 0x0b2c6b;
const ENAMEL_700 = 0x0f3a8a;
const ENAMEL_600 = 0x1a4fb3;
const ENAMEL_100 = 0xe1e9f7;
const HERE = 0xf2b705;
const ZONE_COLORS: Record<ZoneId, number> = {
  centro: 0xc8402a,
  oeste: 0x1c8257,
  sul: 0x7446bd,
  norte: 0xb85a06,
  leste: 0x0b7f99,
};

const BLOCK_SIZE = 0.72;
const SLAB_COUNT = 3;
const SLAB_GAP = 0.3;
const PULSES_PER_LANE = 8;
const LANE_HALF_LENGTH = 12.5;
const FOG_NEAR = 34;
const FOG_FAR = 92;
/** A portrait viewport pulls the camera back by this factor to keep the blocks in frame. */
const PORTRAIT_PULLBACK = 1.5;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(from: number, to: number, value: number): number {
  const t = clamp01((value - from) / (to - from));
  return t * t * (3 - 2 * t);
}

interface Pose {
  readonly position: Vector3;
  readonly target: Vector3;
}

export function mountCityScene(
  canvas: HTMLCanvasElement,
  options: CitySceneOptions,
): CityScene | null {
  let renderer: WebGLRenderer;

  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch {
    // No WebGL: the page keeps its solid enamel ground and stays fully readable.
    return null;
  }

  const blocks = buildCity();
  const found = blocks.find((block) => block.selected);

  if (!found) {
    renderer.dispose();
    return null;
  }

  const selected: CityBlock = found;

  const scene = new Scene();
  scene.background = new Color(ENAMEL_800);
  const fog = new Fog(ENAMEL_800, FOG_NEAR, FOG_FAR);
  scene.fog = fog;

  const camera = new PerspectiveCamera(38, 1, 0.1, 240);

  scene.add(new HemisphereLight(0xe8efff, ENAMEL_900, 1.25));
  const sun = new DirectionalLight(0xffffff, 1.9);
  sun.position.set(-7, 12, 9);
  scene.add(sun);

  const groundGeometry = new PlaneGeometry(420, 420);
  const groundMaterial = new MeshLambertMaterial({ color: ENAMEL_900 });
  const ground = new Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Unit-height box with its base on the ground, so scaling Y sets the height.
  const blockGeometry = new BoxGeometry(BLOCK_SIZE, 1, BLOCK_SIZE);
  blockGeometry.translate(0, 0.5, 0);
  const blockMaterial = new MeshLambertMaterial({ color: 0xffffff });
  const city = new InstancedMesh(blockGeometry, blockMaterial, blocks.length);
  scene.add(city);

  const slabMaterial = new MeshLambertMaterial({
    color: HERE,
    emissive: HERE,
    emissiveIntensity: 0.18,
  });
  const slabs: Mesh[] = [];
  for (let index = 0; index < SLAB_COUNT; index += 1) {
    const slab = new Mesh(blockGeometry, slabMaterial);
    slab.position.set(selected.x, 0, selected.z);
    slabs.push(slab);
    scene.add(slab);
  }

  // Collector pulses run along the avenues and only show in the plan view.
  const lanes: number[] = [];
  for (let index = AVENUE_EVERY - 1; index < GRID_SIZE - 1; index += AVENUE_EVERY) {
    lanes.push(avenuePosition(index));
  }
  const pulseCount = lanes.length * 2 * PULSES_PER_LANE;
  const pulsePositions = new Float32Array(pulseCount * 3);
  const pulseGeometry = new BufferGeometry();
  pulseGeometry.setAttribute('position', new BufferAttribute(pulsePositions, 3));
  const pulseMaterial = new PointsMaterial({
    color: 0xffffff,
    size: 0.26,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const pulses = new Points(pulseGeometry, pulseMaterial);
  pulses.frustumCulled = false;
  scene.add(pulses);

  const focus = new Vector3(selected.x, 0, selected.z);
  const poses: readonly Pose[] = [
    { position: new Vector3(-17, 13, 21), target: new Vector3(0, 0.6, 0) },
    {
      position: new Vector3(focus.x - 9, 19, focus.z + 15),
      target: new Vector3(focus.x + 3, 0, focus.z),
    },
    {
      position: new Vector3(focus.x - 6, 7.5, focus.z + 8),
      target: new Vector3(focus.x, 0.8, focus.z),
    },
    {
      position: new Vector3(focus.x - 3.8, 5.8, focus.z + 5),
      target: new Vector3(focus.x, 3, focus.z),
    },
    {
      position: new Vector3(focus.x + 2, 30, focus.z + 2.4),
      target: new Vector3(focus.x + 2, 0, focus.z + 2),
    },
  ];

  const dummy = new Object3D();
  const color = new Color();
  const mono = new Color();
  const zoneColor = new Color();
  const low = new Color(ENAMEL_600);
  const high = new Color(ENAMEL_100);
  const dim = new Color(ENAMEL_700);
  const white = new Color(0xffffff);
  const position = new Vector3();
  const target = new Vector3();
  const offset = new Vector3();
  const anchor = new Vector3();

  let width = 1;
  let height = 1;
  let wanted = 0;
  let current = 0;
  let painted = -1;
  let visible = true;
  let frame = 0;
  let last = performance.now();
  let elapsed = 0;
  let reduced = options.reducedMotion;
  let paused = false;

  function paintCity(progress: number): void {
    const zoneMix = smoothstep(0.4, 1, progress) * (1 - smoothstep(1.2, 1.9, progress));
    const focusMix = smoothstep(1.3, 2, progress) * (1 - smoothstep(3.3, 4, progress));
    const split = smoothstep(2.5, 3, progress) * (1 - smoothstep(3.3, 3.8, progress));
    const plan = smoothstep(3.3, 4, progress);
    const heightScale = 1 - 0.94 * plan;

    blocks.forEach((block, index) => {
      dummy.position.set(block.x, 0, block.z);
      dummy.scale.set(1, block.selected ? 0.0001 : block.height * heightScale, 1);
      dummy.updateMatrix();
      city.setMatrixAt(index, dummy.matrix);

      const relief = (block.height - MIN_HEIGHT) / (MAX_HEIGHT - MIN_HEIGHT);
      mono.copy(low).lerp(high, Math.pow(relief, 1.2));
      zoneColor.setHex(ZONE_COLORS[block.zone]).lerp(white, 0.1 + relief * 0.3);
      color.copy(mono).lerp(zoneColor, zoneMix);

      const distance = Math.hypot(block.col - selected.col, block.row - selected.row);
      color.lerp(dim, focusMix * smoothstep(2.5, 6, distance) * 0.78);
      color.lerp(low, plan * 0.55);
      city.setColorAt(index, color);
    });

    city.instanceMatrix.needsUpdate = true;
    if (city.instanceColor) {
      city.instanceColor.needsUpdate = true;
    }

    const slabHeight = (selected.height / SLAB_COUNT) * heightScale;
    slabs.forEach((slab, index) => {
      slab.scale.set(1, slabHeight, 1);
      slab.position.y = index * (slabHeight + split * SLAB_GAP);
    });

    pulseMaterial.opacity = plan * 0.9;
    pulses.visible = plan > 0.01;
  }

  function movePulses(seconds: number): void {
    let cursor = 0;

    lanes.forEach((lane, laneIndex) => {
      for (let direction = 0; direction < 2; direction += 1) {
        for (let index = 0; index < PULSES_PER_LANE; index += 1) {
          const speed = 1.6 + ((laneIndex + index + direction) % 3) * 0.5;
          const phase = (index / PULSES_PER_LANE) * LANE_HALF_LENGTH * 2;
          const along =
            ((seconds * speed + phase + laneIndex * 3.1) % (LANE_HALF_LENGTH * 2)) -
            LANE_HALF_LENGTH;

          pulsePositions[cursor] = direction === 0 ? along : lane;
          pulsePositions[cursor + 1] = 0.14;
          pulsePositions[cursor + 2] = direction === 0 ? lane : along;
          cursor += 3;
        }
      }
    });

    const attribute = pulseGeometry.getAttribute('position');
    attribute.needsUpdate = true;
  }

  function placeCamera(progress: number, seconds: number): void {
    const index = Math.min(LAST_STAGE - 1, Math.floor(progress));
    const from = poses[index];
    const to = poses[index + 1];

    if (!from || !to) {
      return;
    }

    const t = smoothstep(0, 1, progress - index);
    position.copy(from.position).lerp(to.position, t);
    target.copy(from.target).lerp(to.target, t);

    const portrait = width < height;
    offset
      .copy(position)
      .sub(target)
      .multiplyScalar(portrait ? PORTRAIT_PULLBACK : 1);

    if (!reduced && !paused) {
      const plan = smoothstep(3.3, 4, progress);
      offset.applyAxisAngle(camera.up, Math.sin(seconds * 0.16) * 0.07 * (1 - plan));
    }

    camera.position.copy(target).add(offset);
    camera.lookAt(target);
  }

  function reportAnchor(): void {
    const top = slabs[SLAB_COUNT - 1];

    if (!top) {
      return;
    }

    anchor.set(selected.x, top.position.y + top.scale.y, selected.z).project(camera);
    const inView = anchor.z < 1 && Math.abs(anchor.x) < 1 && Math.abs(anchor.y) < 1;
    options.onAnchor(((anchor.x + 1) / 2) * width, ((1 - anchor.y) / 2) * height, inView);
  }

  function render(now: number): void {
    frame = requestAnimationFrame(render);

    const delta = Math.min((now - last) / 1000, 0.1);
    last = now;

    if (!visible || document.hidden) {
      return;
    }

    if (!reduced && !paused) elapsed += delta;
    current =
      reduced || paused
        ? Math.round(wanted)
        : current + (wanted - current) * (1 - Math.exp(-delta * 6));

    if (Math.abs(current - painted) > 0.002) {
      paintCity(current);
      painted = current;
    }
    if (pulses.visible && !reduced && !paused) {
      movePulses(elapsed);
    }

    placeCamera(current, elapsed);
    renderer.render(scene, camera);
    reportAnchor();
  }

  function resize(): void {
    width = Math.max(1, canvas.clientWidth);
    height = Math.max(1, canvas.clientHeight);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, width < 700 ? 1.5 : 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;

    // Copy sits on the left on a wide screen and at the bottom on a narrow one,
    // so the scene is shifted towards the free side.
    if (width < height) {
      camera.setViewOffset(width, height, 0, height * 0.1, width, height);
      fog.near = FOG_NEAR * PORTRAIT_PULLBACK;
      fog.far = FOG_FAR * PORTRAIT_PULLBACK;
    } else {
      camera.setViewOffset(width, height, -width * 0.17, 0, width, height);
      fog.near = FOG_NEAR;
      fog.far = FOG_FAR;
    }
    camera.updateProjectionMatrix();
  }

  const observer = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
  });
  observer.observe(canvas);

  resize();
  paintCity(0);
  painted = 0;
  frame = requestAnimationFrame(render);

  return {
    setMotion(nextReduced: boolean, nextPaused: boolean): void {
      reduced = nextReduced;
      paused = nextPaused;
    },
    setProgress(progress: number): void {
      wanted = Math.min(LAST_STAGE, Math.max(0, progress));
    },
    resize,
    dispose(): void {
      cancelAnimationFrame(frame);
      observer.disconnect();
      groundGeometry.dispose();
      groundMaterial.dispose();
      blockGeometry.dispose();
      blockMaterial.dispose();
      slabMaterial.dispose();
      pulseGeometry.dispose();
      pulseMaterial.dispose();
      city.dispose();
      renderer.dispose();
    },
  };
}
