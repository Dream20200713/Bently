import * as THREE from "three";
import { WATER_LEVEL } from "./pond.js";

/* ------------------------------------------------------------------ *
 * 钓鱼的小剧情：浮标轻轻晃动 → 小鱼咬钩 → 橘猫提竿 → 小鱼跃出水面。
 * 循环周期 16 秒。
 * ------------------------------------------------------------------ */

const CYCLE = 16;
const NIBBLE_START = 5.0;
const STRIKE_START = 6.4;
const JUMP_START = 7.0;
const JUMP_END = 8.55;
const RELAX_START = 9.6;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const smoothstep = (from, to, value) => {
  const t = clamp((value - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
};
const damp = (current, target, speed, dt) =>
  current + (target - current) * (1 - Math.exp(-speed * dt));

function createBobber() {
  const group = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({
    color: 0xfff6e8,
    roughness: 0.45,
  });
  const red = new THREE.MeshStandardMaterial({
    color: 0xe24a3e,
    roughness: 0.4,
    emissive: 0x5a0d08,
    emissiveIntensity: 0.25,
  });

  const bottom = new THREE.Mesh(
    new THREE.ConeGeometry(0.1, 0.3, 18),
    white,
  );
  bottom.rotation.x = Math.PI;
  bottom.position.y = 0.18;
  group.add(bottom);

  const top = new THREE.Mesh(
    new THREE.SphereGeometry(0.105, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    red,
  );
  top.position.y = 0.33;
  group.add(top);

  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.015, 0.16, 6),
    red,
  );
  antenna.position.y = 0.45;
  group.add(antenna);

  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), red);
  tip.position.y = 0.53;
  group.add(tip);

  group.traverse((child) => {
    if (child.isMesh) child.castShadow = true;
  });
  return group;
}

function createFish() {
  const group = new THREE.Group();
  const orange = new THREE.MeshStandardMaterial({
    color: 0xf27f3e,
    roughness: 0.5,
  });
  const cream = new THREE.MeshStandardMaterial({
    color: 0xffe6bd,
    roughness: 0.55,
  });
  const dark = new THREE.MeshBasicMaterial({ color: 0x2a2520 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 14), orange);
  body.scale.set(1.75, 0.95, 0.62);
  group.add(body);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), cream);
  belly.scale.set(1.1, 0.32, 0.45);
  belly.position.set(0.04, -0.11, 0);
  group.add(belly);

  // 锦鲤式的白斑
  const patch = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 9), cream);
  patch.scale.set(0.9, 0.52, 0.28);
  patch.position.set(-0.14, 0.05, 0.1);
  patch.rotation.z = 0.3;
  group.add(patch);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), orange);
  head.scale.set(0.8, 0.8, 0.75);
  head.position.set(0.25, 0.02, 0);
  group.add(head);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.26, 5), cream);
  tail.rotation.z = Math.PI / 2;
  tail.position.set(-0.32, 0, 0);
  tail.scale.z = 0.35;
  tail.userData.baseRotation = tail.rotation.z;
  group.add(tail);

  const finMaterial = new THREE.MeshStandardMaterial({
    color: 0xffb066,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
  const dorsal = new THREE.Mesh(
    new THREE.ConeGeometry(0.07, 0.16, 4),
    finMaterial,
  );
  dorsal.position.set(-0.02, 0.16, 0);
  dorsal.rotation.x = 0.3;
  dorsal.scale.z = 0.3;
  group.add(dorsal);

  for (let side = -1; side <= 1; side += 2) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), dark);
    eye.position.set(0.29, 0.05, side * 0.065);
    group.add(eye);

    const fin = new THREE.Mesh(
      new THREE.ConeGeometry(0.05, 0.13, 4),
      finMaterial,
    );
    fin.rotation.z = Math.PI / 2;
    fin.rotation.x = side * 0.7;
    fin.position.set(0.05, -0.02, side * 0.11);
    fin.scale.z = 0.25;
    group.add(fin);
  }

  group.userData.tail = tail;
  group.traverse((child) => {
    if (child.isMesh) child.castShadow = true;
  });
  group.visible = false;
  return group;
}

class RipplePool {
  constructor(scene, count = 24) {
    this.items = [];
    const geometry = new THREE.RingGeometry(0.5, 0.58, 48);
    for (let i = 0; i < count; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xdff8ef,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 2;
      scene.add(mesh);
      this.items.push({ mesh, material, age: 0, life: 1, maxScale: 2, active: false });
    }
  }

  spawn(x, z, { scale = 1, life = 1.4, strength = 0.45 } = {}) {
    const item = this.items.find((entry) => !entry.active) ?? this.items[0];
    item.active = true;
    item.age = 0;
    item.life = life;
    item.maxScale = scale;
    item.strength = strength;
    item.mesh.position.set(x, WATER_LEVEL + 0.045, z);
    item.mesh.visible = true;
    item.mesh.scale.setScalar(0.2);
    item.material.opacity = strength;
  }

  update(dt) {
    for (const item of this.items) {
      if (!item.active) continue;
      item.age += dt;
      const t = item.age / item.life;
      if (t >= 1) {
        item.active = false;
        item.mesh.visible = false;
        continue;
      }
      const scale = 0.2 + t * item.maxScale;
      item.mesh.scale.setScalar(scale);
      item.material.opacity = (1 - t) * item.strength;
    }
  }
}

class SplashPool {
  constructor(scene, count = 36) {
    this.items = [];
    const material = new THREE.MeshBasicMaterial({ color: 0xe8fbf6 });
    const geometry = new THREE.SphereGeometry(1, 6, 5);
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      scene.add(mesh);
      this.items.push({
        mesh,
        velocity: new THREE.Vector3(),
        age: 0,
        life: 0,
        active: false,
        size: 1,
      });
    }
  }

  burst(x, y, z, strength = 1) {
    let emitted = 0;
    for (const item of this.items) {
      if (item.active) continue;
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.5 + Math.random() * 1.4) * strength;
      item.active = true;
      item.age = 0;
      item.life = 0.5 + Math.random() * 0.55;
      item.size = 0.018 + Math.random() * 0.035;
      item.mesh.position.set(
        x + Math.cos(angle) * 0.08,
        y,
        z + Math.sin(angle) * 0.08,
      );
      item.velocity.set(
        Math.cos(angle) * speed * 0.55,
        1.1 + Math.random() * 1.3 * strength,
        Math.sin(angle) * speed * 0.55,
      );
      item.mesh.scale.setScalar(item.size);
      item.mesh.visible = true;
      emitted++;
      if (emitted >= 16) break;
    }
  }

  update(dt) {
    for (const item of this.items) {
      if (!item.active) continue;
      item.age += dt;
      const t = item.age / item.life;
      if (t >= 1) {
        item.active = false;
        item.mesh.visible = false;
        continue;
      }
      item.velocity.y -= 5.2 * dt;
      item.mesh.position.addScaledVector(item.velocity, dt);
      item.mesh.scale.setScalar(item.size * (1 - t * 0.75));
      if (item.mesh.position.y < WATER_LEVEL) {
        item.active = false;
        item.mesh.visible = false;
      }
    }
  }
}

export class FishingStory {
  constructor(scene, kitten) {
    this.scene = scene;
    this.kitten = kitten;
    this.catPos = kitten.group.position.clone();

    this.bobber = createBobber();
    scene.add(this.bobber);
    this.bobber.position.set(3.05, WATER_LEVEL, 0.55);

    this.fish = createFish();
    scene.add(this.fish);
    this.fishStart = new THREE.Vector3(3.3, WATER_LEVEL + 0.02, 1.1);
    this.fishEnd = new THREE.Vector3(4.95, WATER_LEVEL + 0.02, 1.65);
    this.fish.scale.setScalar(1.12);

    this.ripples = new RipplePool(scene);
    this.splashes = new SplashPool(scene);

    this.lineGeometry = new THREE.BufferGeometry();
    this.linePoints = new Float32Array(14 * 3);
    this.lineGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.linePoints, 3),
    );
    this.line = new THREE.Line(
      this.lineGeometry,
      new THREE.LineBasicMaterial({
        color: 0xf6ecd8,
        transparent: true,
        opacity: 0.72,
      }),
    );
    this.line.frustumCulled = false;
    scene.add(this.line);

    this.headYaw = -0.12;
    this.headPitch = 0.25;
    this.rippleTimer = 0.5;
    this.cycle = -1;
    this.splashStartDone = false;
    this.splashEndDone = false;
    this.strikeRippleDone = false;

    this.rodTip = new THREE.Vector3();
    this.bobberTop = new THREE.Vector3();
    this.temp = new THREE.Vector3();
    this.fishTarget = new THREE.Vector3();
  }

  update(t, dt) {
    const cycleTime = t % CYCLE;
    if (cycleTime < this.cycle) {
      this.splashStartDone = false;
      this.splashEndDone = false;
      this.strikeRippleDone = false;
      this.rippleTimer = 0;
    }
    this.cycle = cycleTime;
    const ct = cycleTime;

    const nibble = smoothstep(NIBBLE_START, NIBBLE_START + 0.5, ct);
    const relax = smoothstep(RELAX_START, RELAX_START + 1.4, ct);
    const excitement =
      nibble * (1 - relax) * 1.0 +
      smoothstep(6.3, 6.7, ct) * (1 - smoothstep(9.0, 9.8, ct)) * 0.35;
    const clampedExcitement = clamp(excitement, 0, 1);

    // 浮标：平时轻轻起伏，咬钩时向下沉
    let bob =
      Math.sin(t * 1.9) * 0.026 + Math.sin(t * 3.3 + 1.2) * 0.011;
    let nibbleDip = 0;
    if (ct >= NIBBLE_START && ct <= STRIKE_START) {
      const pulse = Math.max(
        0,
        Math.sin((ct - NIBBLE_START) * 9.5),
      );
      nibbleDip = Math.pow(pulse, 6) * 0.085;
    }
    const strikeDip =
      0.17 *
      smoothstep(STRIKE_START, STRIKE_START + 0.16, ct) *
      (1 - smoothstep(STRIKE_START + 0.3, STRIKE_START + 0.7, ct));
    const bobberY = WATER_LEVEL - 0.07 + bob - nibbleDip - strikeDip;
    this.bobber.position.set(3.05, bobberY, 0.55);
    this.bobber.rotation.z = Math.sin(t * 1.7) * 0.06 - strikeDip * 1.6;
    this.bobber.rotation.x = Math.sin(t * 1.3 + 0.6) * 0.05;

    this.bobberTop.set(
      this.bobber.position.x,
      this.bobber.position.y + 0.53,
      this.bobber.position.z,
    );

    // 小鱼跃出水面
    const jumpU = (ct - JUMP_START) / (JUMP_END - JUMP_START);
    const fishVisible = jumpU >= 0 && jumpU <= 1;
    this.fish.visible = fishVisible;
    if (fishVisible) {
      const u = jumpU;
      const height = 1.45;
      const x = THREE.MathUtils.lerp(this.fishStart.x, this.fishEnd.x, u);
      const z = THREE.MathUtils.lerp(this.fishStart.z, this.fishEnd.z, u);
      const y = WATER_LEVEL + 0.05 + 4 * height * u * (1 - u);
      this.fish.position.set(x, y, z);
      const vx = (this.fishEnd.x - this.fishStart.x) / 1.55;
      const vy = (4 * height * (1 - 2 * u)) / 1.55;
      this.fish.rotation.z = Math.atan2(vy, vx) * 0.95;
      this.fish.rotation.x = Math.sin(u * Math.PI * 2) * 0.5;
      this.fish.rotation.y = Math.sin(u * Math.PI) * 0.25;
      const tail = this.fish.userData.tail;
      tail.rotation.z = tail.userData.baseRotation + Math.sin(t * 26) * 0.5;
      this.fishTarget.copy(this.fish.position).add(new THREE.Vector3(0, 0.12, 0));
    }

    // 水花与涟漪
    if (ct >= JUMP_START && !this.splashStartDone) {
      this.splashStartDone = true;
      this.splashes.burst(
        this.fishStart.x,
        WATER_LEVEL + 0.04,
        this.fishStart.z,
        1.1,
      );
      this.ripples.spawn(this.fishStart.x, this.fishStart.z, {
        scale: 1.7,
        life: 1.6,
        strength: 0.5,
      });
      this.ripples.spawn(this.fishStart.x, this.fishStart.z, {
        scale: 2.6,
        life: 2.1,
        strength: 0.35,
      });
    }
    if (ct >= JUMP_END && !this.splashEndDone) {
      this.splashEndDone = true;
      this.splashes.burst(
        this.fishEnd.x,
        WATER_LEVEL + 0.04,
        this.fishEnd.z,
        1.3,
      );
      this.ripples.spawn(this.fishEnd.x, this.fishEnd.z, {
        scale: 2.2,
        life: 1.9,
        strength: 0.55,
      });
    }
    if (ct >= STRIKE_START + 0.2 && !this.strikeRippleDone) {
      this.strikeRippleDone = true;
      this.ripples.spawn(this.bobber.position.x, this.bobber.position.z, {
        scale: 1.3,
        life: 1.1,
        strength: 0.55,
      });
    }

    this.rippleTimer -= dt;
    if (this.rippleTimer <= 0) {
      if (ct >= NIBBLE_START && ct < 9.2) {
        this.ripples.spawn(this.bobber.position.x, this.bobber.position.z, {
          scale: 0.9 + Math.random() * 0.4,
          life: 1.2,
          strength: 0.32,
        });
        this.rippleTimer = 0.5;
      } else {
        this.rippleTimer = 2.4;
        this.ripples.spawn(this.bobber.position.x, this.bobber.position.z, {
          scale: 0.7,
          life: 1.6,
          strength: 0.18,
        });
      }
    }

    this.ripples.update(dt);
    this.splashes.update(dt);

    // 小猫的头部看向浮标 / 跃起的小鱼
    const lookTarget = fishVisible
      ? this.fishTarget
      : this.temp
          .copy(this.bobber.position)
          .add(new THREE.Vector3(0, 0.3, 0));
    const dx = lookTarget.x - this.catPos.x;
    const dz = lookTarget.z - this.catPos.z;
    const horizontal = Math.hypot(dx, dz);
    const targetYaw = clamp(Math.atan2(-dz, dx), -0.62, 0.62);
    const targetPitch = clamp(
      -Math.atan2(lookTarget.y - 2.0, horizontal),
      -0.5,
      0.55,
    );
    const followSpeed = fishVisible ? 9 : 3.2;
    this.headYaw = damp(this.headYaw, targetYaw, followSpeed, dt);
    this.headPitch = damp(this.headPitch, targetPitch, followSpeed, dt);

    // 提竿动作
    let rodOffset = 0.06 * smoothstep(5.0, 5.6, ct) * (1 - smoothstep(6.2, 6.5, ct));
    rodOffset += 0.16 * smoothstep(6.4, 6.55, ct) * (1 - smoothstep(6.55, 6.8, ct));
    rodOffset -=
      0.45 *
      smoothstep(6.6, 7.2, ct) *
      (1 - smoothstep(8.8, 9.9, ct));
    rodOffset += Math.sin(t * 1.6) * 0.006;
    this.kitten.rodAssembly.rotation.x = 0.96 + rodOffset;

    // 身体前倾 / 后仰
    let lean = 0;
    lean += 0.5 * smoothstep(5.1, 5.8, ct) * (1 - smoothstep(6.3, 6.5, ct));
    lean -= 0.6 * smoothstep(6.5, 6.9, ct) * (1 - smoothstep(8.9, 9.8, ct));
    this.kitten.update(t, dt, {
      excitement: clampedExcitement,
      headYaw: this.headYaw,
      headPitch: this.headPitch,
      lean,
      earPerk: 0.15 + clampedExcitement * 0.85,
    });

    // 钓鱼线：竿尖到浮标，松弛下垂
    this.kitten.getRodTipWorld(this.rodTip);
    const points = this.linePoints;
    const sag = 0.16 * (1 - clampedExcitement * 0.55);
    for (let i = 0; i < 14; i++) {
      const u = i / 13;
      const x = THREE.MathUtils.lerp(this.rodTip.x, this.bobberTop.x, u);
      const z = THREE.MathUtils.lerp(this.rodTip.z, this.bobberTop.z, u);
      let y = THREE.MathUtils.lerp(this.rodTip.y, this.bobberTop.y, u);
      y -= Math.sin(u * Math.PI) * sag;
      y += Math.sin(t * 2.6 + u * 5) * 0.008 * Math.sin(u * Math.PI);
      points[i * 3] = x;
      points[i * 3 + 1] = y;
      points[i * 3 + 2] = z;
    }
    this.lineGeometry.attributes.position.needsUpdate = true;
  }
}
