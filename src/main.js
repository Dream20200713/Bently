import * as THREE from "three";
import { createEnvironment, SUN_DIRECTION, FOG_COLOR } from "./environment.js";
import { Pond } from "./pond.js";
import { Kitten } from "./kitten.js";
import { FishingStory } from "./fishing.js";

/* ------------------------------------------------------------------ *
 * 小猫钓鱼 · 三维实时动画
 * 入口：渲染器、相机、灯光、小动画的循环。
 * ------------------------------------------------------------------ */

const canvas = document.querySelector("#scene");
const loader = document.querySelector("#loader");
const hint = document.querySelector(".hint");

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(FOG_COLOR, 26, 88);

function showWebGLFallback() {
  const message =
    "当前浏览器无法启动 WebGL 三维画面，请使用最新版 Chrome、Edge、Firefox 或 Safari 观看。";
  if (loader) {
    loader.innerHTML = `<p style="max-width: 28em; line-height: 1.8; text-align: center;">${message}</p>`;
    loader.classList.remove("is-hidden");
  }
}

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
} catch (error) {
  console.error(error);
  showWebGLFallback();
  throw error;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const camera = new THREE.PerspectiveCamera(
  40,
  window.innerWidth / window.innerHeight,
  0.1,
  260,
);

const CAMERA_TARGET = new THREE.Vector3(1.7, 1.15, 0.55);
const cameraOffset = new THREE.Vector3(6.5, 3.3, 9.0);

const isPortrait = () => window.innerWidth / window.innerHeight < 0.9;
if (isPortrait()) {
  camera.fov = 52;
  cameraOffset.set(8.2, 4.2, 11.2);
  camera.updateProjectionMatrix();
}
camera.position.copy(CAMERA_TARGET).add(cameraOffset);

/* ------------------------------- 灯光 ------------------------------- */

const hemisphere = new THREE.HemisphereLight(0xc6e8ff, 0x7c9a58, 1.35);
scene.add(hemisphere);

const sun = new THREE.DirectionalLight(0xffd7a1, 2.6);
sun.position.copy(SUN_DIRECTION).multiplyScalar(30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 2;
sun.shadow.camera.far = 70;
sun.shadow.camera.left = -14;
sun.shadow.camera.right = 14;
sun.shadow.camera.top = 14;
sun.shadow.camera.bottom = -14;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.035;
scene.add(sun);
scene.add(sun.target);
sun.target.position.set(2, 0, 1);

const fill = new THREE.DirectionalLight(0xcfe4ff, 0.55);
fill.position.set(12, 8, 14);
scene.add(fill);

const rim = new THREE.DirectionalLight(0xffe5c4, 0.35);
rim.position.set(-8, 4, 10);
scene.add(rim);

/* ------------------------------- 场景 ------------------------------- */

const environment = createEnvironment(scene);
const pond = new Pond(scene);

const kitten = new Kitten();
kitten.group.position.set(-0.9, 0, 0.1);
kitten.group.rotation.y = Math.PI / 2;
scene.add(kitten.group);

const story = new FishingStory(scene, kitten);

/* ----------------------------- 相机控制 ----------------------------- */

const spherical = new THREE.Spherical().setFromVector3(cameraOffset);
const sphericalGoal = spherical.clone();
const pointers = new Map();
let dragging = false;
let lastX = 0;
let lastY = 0;
let pinchDistance = 0;
let pinchRadius = 0;

function pointerDistance() {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

canvas.addEventListener("pointerdown", (event) => {
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  canvas.setPointerCapture(event.pointerId);
  if (pointers.size === 1) {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
  } else if (pointers.size === 2) {
    dragging = false;
    pinchDistance = pointerDistance();
    pinchRadius = sphericalGoal.radius;
  }
});

canvas.addEventListener("pointermove", (event) => {
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (pointers.size >= 2) {
    const distance = pointerDistance();
    if (pinchDistance > 0) {
      sphericalGoal.radius = THREE.MathUtils.clamp(
        pinchRadius * (pinchDistance / Math.max(distance, 1)),
        7,
        18,
      );
    }
    return;
  }

  if (!dragging) return;
  const dx = event.clientX - lastX;
  const dy = event.clientY - lastY;
  lastX = event.clientX;
  lastY = event.clientY;
  sphericalGoal.theta -= dx * 0.0045;
  sphericalGoal.phi = THREE.MathUtils.clamp(
    sphericalGoal.phi - dy * 0.004,
    0.62,
    1.44,
  );
});

const endDrag = (event) => {
  pointers.delete(event.pointerId);
  if (pointers.size === 0) {
    dragging = false;
  } else if (pointers.size === 1) {
    const remaining = [...pointers.values()][0];
    dragging = true;
    lastX = remaining.x;
    lastY = remaining.y;
  }
  if (pointers.size < 2) pinchDistance = 0;
  if (canvas.hasPointerCapture?.(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
};
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    sphericalGoal.radius = THREE.MathUtils.clamp(
      sphericalGoal.radius + event.deltaY * 0.0022,
      7,
      18,
    );
  },
  { passive: false },
);

canvas.addEventListener("dblclick", () => {
  sphericalGoal.setFromVector3(cameraOffset);
});

function updateCamera(dt) {
  const damping = 1 - Math.exp(-8 * dt);
  spherical.theta += (sphericalGoal.theta - spherical.theta) * damping;
  spherical.phi += (sphericalGoal.phi - spherical.phi) * damping;
  spherical.radius += (sphericalGoal.radius - spherical.radius) * damping;
  camera.position
    .setFromSpherical(spherical)
    .add(CAMERA_TARGET);
  camera.lookAt(CAMERA_TARGET);
}

/* ------------------------------ 动画循环 ----------------------------- */

const clock = new THREE.Clock();
let elapsed = 0;
let paused = false;
let fixedTime = 0;
let pauseAtTime = null;

const debug = {
  ready: false,
  seek(seconds) {
    fixedTime = seconds;
    paused = true;
    pauseAtTime = null;
    elapsed = seconds;
  },
  play() {
    paused = false;
  },
  pause() {
    fixedTime = elapsed;
    paused = true;
  },
  pauseAt(seconds) {
    if (seconds <= elapsed) {
      elapsed = Math.max(0, seconds - 2);
      fixedTime = elapsed;
    }
    pauseAtTime = seconds;
    paused = false;
  },
  stepBy(seconds) {
    paused = true;
    const steps = Math.max(1, Math.round(seconds * 60));
    const step = seconds / steps;
    for (let i = 0; i < steps; i++) {
      elapsed += step;
      environment.update(elapsed, step);
      pond.update(elapsed);
      story.update(elapsed, step);
    }
    fixedTime = elapsed;
  },
  get paused() {
    return paused;
  },
  get time() {
    return elapsed;
  },
};
window.__kittenFishing = debug;

function animate() {
  const delta = Math.min(clock.getDelta(), 0.05);
  const dt = paused ? 0 : delta;
  if (!paused) {
    elapsed += dt;
    if (pauseAtTime !== null && elapsed >= pauseAtTime) {
      elapsed = pauseAtTime;
      fixedTime = pauseAtTime;
      paused = true;
      pauseAtTime = null;
    }
  }
  const time = paused ? fixedTime : elapsed;

  updateCamera(dt);
  environment.update(time, dt);
  pond.update(time);
  story.update(time, dt);
  renderer.render(scene, camera);

  if (!debug.ready) {
    debug.ready = true;
    loader.classList.add("is-hidden");
    window.setTimeout(() => {
      if (hint) hint.style.opacity = "0";
    }, 12000);
  }

  requestAnimationFrame(animate);
}

window.addEventListener("resize", () => {
  const previousPortrait = camera.fov === 52;
  camera.aspect = window.innerWidth / window.innerHeight;
  if (isPortrait() !== previousPortrait) {
    camera.fov = isPortrait() ? 52 : 40;
  }
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
});

try {
  animate();
} catch (error) {
  console.error(error);
  showWebGLFallback();
}
