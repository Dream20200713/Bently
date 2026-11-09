import * as THREE from "three";

/* ------------------------------------------------------------------ *
 * 小猫模型：全部由基础几何体搭建，不依赖任何外部贴图或模型文件。
 * 局部坐标：+Z 为猫的正面，+Y 向上，脚底位于 y = 0。
 * ------------------------------------------------------------------ */

const FUR = 0xf09c52;
const FUR_LIGHT = 0xffe4c2;
const FUR_DARK = 0xcc7734;
const PINK = 0xef9d99;
const EYE_GREEN = 0x7fae63;
const INK = 0x2c2420;
const COLLAR = 0xd94f4a;
const BELL = 0xf2c14e;

const UP = new THREE.Vector3(0, 1, 0);

function smoothstepJS(from, to, value) {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.82,
    metalness: 0.02,
    ...options,
  });
}

const furMat = material(FUR);
const furLightMat = material(FUR_LIGHT, { roughness: 0.9 });
const furDarkMat = material(FUR_DARK);
const pinkMat = material(PINK, { roughness: 0.7 });
const eyeWhiteMat = material(0xfff8ea, { roughness: 0.28 });
const irisMat = material(EYE_GREEN, { roughness: 0.35 });
const irisDarkMat = material(0x27301f, { roughness: 0.3 });
const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const mouthMat = new THREE.MeshBasicMaterial({ color: 0x5a3a2c });
const whiskerMat = new THREE.MeshBasicMaterial({
  color: 0xfffbf0,
  transparent: true,
  opacity: 0.95,
});
const collarMat = material(COLLAR, { roughness: 0.55 });
const bellMat = material(BELL, {
  roughness: 0.28,
  metalness: 0.65,
});
const woodMat = material(0x8a5c34, { roughness: 0.8 });
const rodMat = material(0xc9a26a, { roughness: 0.65 });
const reelMat = material(0x5b5148, { metalness: 0.55, roughness: 0.45 });

function sphere(radius, mat, scale = [1, 1, 1], segments = 32) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, segments, Math.round(segments * 0.75)),
    mat,
  );
  mesh.scale.set(...scale);
  return mesh;
}

function capsule(radius, length, mat, segments = 10) {
  return new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, length, segments, segments * 2),
    mat,
  );
}

function capsuleBetween(start, end, radius, mat) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const mesh = capsule(radius, Math.max(length - radius * 2, 0.01), mat);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, direction.normalize());
  return mesh;
}

function cone(radius, height, mat, segments = 24) {
  return new THREE.Mesh(new THREE.ConeGeometry(radius, height, segments), mat);
}

function makeContactShadowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  gradient.addColorStop(0, "rgba(40, 46, 28, 0.55)");
  gradient.addColorStop(0.55, "rgba(40, 46, 28, 0.22)");
  gradient.addColorStop(1, "rgba(40, 46, 28, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addShadows(root) {
  root.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = false;
    }
  });
}

export class Kitten {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = "kitten";
    this.pose = new THREE.Group();
    this.group.add(this.pose);

    this.time = 0;
    this.blinkTimer = 2.4 + Math.random() * 2;
    this.blink = 0;
    this.blinkDuration = 0.14;
    this.isBlinking = false;
    this.earTwitchTimer = 1.5 + Math.random() * 2;
    this.earTwitch = 0;

    this.tailSegments = [];
    this.eyes = [];
    this.ears = [];

    this.#buildBody();
    this.#buildHead();
    this.#buildPaws();
    this.#buildTail();
    this.#buildRod();

    const contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.3, 1.9),
      new THREE.MeshBasicMaterial({
        map: makeContactShadowTexture(),
        transparent: true,
        depthWrite: false,
        opacity: 0.55,
      }),
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.set(0, 0.006, 0.15);
    contactShadow.renderOrder = 1;
    contactShadow.userData.noShadow = true;
    this.pose.add(contactShadow);

    addShadows(this.group);
    // 胡须和眼睛高光不需要投影，避免闪烁
    this.pose.traverse((child) => {
      if (child.userData.noShadow) child.castShadow = false;
    });

  }

  #buildBody() {
    const body = sphere(0.7, furMat, [1.02, 1.16, 0.9]);
    body.position.set(0, 0.95, -0.06);
    this.pose.add(body);
    this.body = body;

    const chest = sphere(0.5, furLightMat, [0.92, 1.08, 0.5]);
    chest.position.set(0, 0.93, 0.4);
    this.pose.add(chest);
    this.chest = chest;

    const belly = sphere(0.46, furLightMat, [1.1, 0.7, 0.8]);
    belly.position.set(0, 0.4, 0.18);
    this.pose.add(belly);

    // 侧面的虎斑纹
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 3; i++) {
        const stripe = sphere(0.1, furDarkMat, [0.4, 2.1, 0.85]);
        stripe.position.set(
          side * 0.67,
          0.88 + i * 0.2,
          -0.04 - i * 0.02,
        );
        stripe.rotation.x = -0.12;
        stripe.rotation.z = side * 0.08;
        this.pose.add(stripe);
      }
    }

    // 背上的三条虎斑
    for (let i = -1; i <= 1; i++) {
      const stripe = sphere(0.1, furDarkMat, [1.55, 0.28, 0.65]);
      stripe.position.set(i * 0.28, 1.62 - Math.abs(i) * 0.04, -0.12);
      stripe.rotation.y = i * 0.18;
      this.pose.add(stripe);
    }

    // 后腿与脚掌
    for (let side = -1; side <= 1; side += 2) {
      const thigh = sphere(0.38, furMat, [0.9, 1.02, 1.12]);
      thigh.position.set(side * 0.45, 0.42, -0.08);
      this.pose.add(thigh);

      const foot = sphere(0.23, furMat, [1, 0.78, 1.35]);
      foot.position.set(side * 0.46, 0.17, 0.5);
      this.pose.add(foot);

      const toes = sphere(0.2, furLightMat, [0.92, 0.6, 1.12]);
      toes.position.set(side * 0.46, 0.14, 0.7);
      this.pose.add(toes);
    }

    // 领圈和铃铛
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.41, 0.052, 12, 40),
      collarMat,
    );
    collar.position.set(0, 1.44, 0.08);
    collar.rotation.x = Math.PI / 2 - 0.12;
    collar.rotation.z = 0.06;
    this.pose.add(collar);

    const bell = sphere(0.095, bellMat, [1, 1, 0.9], 20);
    bell.position.set(0, 1.36, 0.49);
    this.pose.add(bell);

    // 胸口的绒毛
    for (let i = -1; i <= 1; i++) {
      const tuft = cone(0.06, 0.16, furLightMat, 8);
      tuft.position.set(i * 0.09, 1.28 - Math.abs(i) * 0.03, 0.46);
      tuft.rotation.x = -0.5;
      tuft.rotation.z = i * 0.25;
      this.pose.add(tuft);
    }
  }

  #buildHead() {
    const headPivot = new THREE.Group();
    headPivot.position.set(0, 1.6, 0.06);
    this.pose.add(headPivot);
    this.headPivot = headPivot;

    const head = sphere(0.6, furMat, [1.03, 0.98, 0.95]);
    head.position.set(0, 0.42, 0.04);
    headPivot.add(head);
    this.head = head;

    const forehead = sphere(0.52, furMat, [1, 0.7, 0.9]);
    forehead.position.set(0, 0.62, 0.08);
    headPivot.add(forehead);

    // 腮边的浅色毛
    for (let side = -1; side <= 1; side += 2) {
      const cheek = sphere(0.23, furLightMat, [1, 0.82, 0.72]);
      cheek.position.set(side * 0.19, 0.25, 0.46);
      headPivot.add(cheek);
    }

    const muzzle = sphere(0.3, furLightMat, [1.05, 0.78, 0.72]);
    muzzle.position.set(0, 0.25, 0.46);
    headPivot.add(muzzle);

    const chin = sphere(0.2, furLightMat, [1, 0.8, 0.8]);
    chin.position.set(0, 0.12, 0.45);
    headPivot.add(chin);

    const nose = sphere(0.062, pinkMat, [1.25, 0.85, 0.75], 16);
    nose.position.set(0, 0.37, 0.61);
    headPivot.add(nose);

    // 微笑的嘴
    for (let side = -1; side <= 1; side += 2) {
      const mouth = new THREE.Mesh(
        new THREE.TorusGeometry(0.07, 0.011, 6, 12, Math.PI),
        mouthMat,
      );
      mouth.position.set(side * 0.062, 0.285, 0.668);
      mouth.rotation.z = Math.PI;
      mouth.userData.noShadow = true;
      headPivot.add(mouth);
    }

    // 眼睛
    for (let side = -1; side <= 1; side += 2) {
      const eye = new THREE.Group();
      eye.position.set(side * 0.255, 0.47, 0.46);
      headPivot.add(eye);
      this.eyes.push(eye);

      const white = sphere(0.16, eyeWhiteMat, [0.95, 1.08, 0.52], 24);
      eye.add(white);

      const iris = sphere(0.107, irisMat, [0.94, 1.02, 0.42], 24);
      iris.position.z = 0.085;
      eye.add(iris);

      const pupil = sphere(0.062, irisDarkMat, [0.7, 1, 0.42], 20);
      pupil.position.z = 0.135;
      eye.add(pupil);

      const glint = sphere(0.027, glintMat, [1, 1, 0.5], 12);
      glint.position.set(side * 0.032, 0.05, 0.166);
      glint.userData.noShadow = true;
      eye.add(glint);
    }

    // 额头虎斑
    for (let i = -1; i <= 1; i++) {
      const stripe = sphere(0.1, furDarkMat, [0.5, 1.5, 0.42]);
      stripe.position.set(
        i * 0.15,
        0.8 - Math.abs(i) * 0.03,
        0.49 - Math.abs(i) * 0.015,
      );
      stripe.rotation.x = -0.32;
      stripe.rotation.z = i * 0.1;
      headPivot.add(stripe);
    }

    // 脸颊条纹
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 2; i++) {
        const stripe = sphere(0.1, furDarkMat, [0.2, 0.4, 1.45]);
        stripe.position.set(
          side * 0.47,
          0.38 - i * 0.12,
          0.33,
        );
        stripe.rotation.x = -0.18;
        headPivot.add(stripe);
      }
    }

    // 耳朵
    for (let side = -1; side <= 1; side += 2) {
      const ear = new THREE.Group();
      ear.position.set(side * 0.37, 0.86, 0.0);
      ear.rotation.z = -side * 0.24;
      headPivot.add(ear);
      this.ears.push(ear);

      const outer = cone(0.24, 0.5, furMat, 24);
      outer.position.y = 0.18;
      ear.add(outer);

      const inner = cone(0.145, 0.34, pinkMat, 20);
      inner.position.set(0, 0.15, 0.07);
      ear.add(inner);

      const tuft = cone(0.05, 0.12, furLightMat, 8);
      tuft.position.set(0, 0.34, 0.03);
      ear.add(tuft);
    }

    // 头顶的呆毛
    for (let i = -1; i <= 1; i++) {
      const tuft = cone(0.045, 0.15, furLightMat, 8);
      tuft.position.set(i * 0.06, 0.99, 0.16);
      tuft.rotation.z = i * 0.4;
      tuft.rotation.x = -0.25;
      headPivot.add(tuft);
    }

    // 胡须
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 3; i++) {
        const whisker = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0075, 0.0035, 0.56, 5),
          whiskerMat,
        );
        const angle = 0.35 - i * 0.2;
        whisker.position.set(
          side * (0.3 + 0.24 * Math.cos(angle)),
          0.28 + i * 0.06,
          0.55 + 0.04 * Math.sin(angle),
        );
        whisker.rotation.z = -side * (Math.PI / 2 - 0.2 + i * 0.1);
        whisker.rotation.y = -side * 0.35;
        whisker.userData.noShadow = true;
        headPivot.add(whisker);
      }
    }
  }

  #buildPaws() {
    // 前爪捧着鱼竿
    this.rodPivot = new THREE.Group();
    this.rodPivot.position.set(0, 0.76, 0.76);
    this.pose.add(this.rodPivot);

    for (let side = -1; side <= 1; side += 2) {
      const shoulder = new THREE.Vector3(side * 0.4, 1.3, 0.3);
      const pawPos = new THREE.Vector3(side * 0.17, 0.76, 0.72);
      const arm = capsuleBetween(shoulder, pawPos, 0.145, furMat);
      this.pose.add(arm);

      const paw = sphere(0.165, furMat, [1, 0.9, 1.1]);
      paw.position.copy(pawPos);
      this.pose.add(paw);

      const pawTip = sphere(0.13, furLightMat, [1, 0.62, 1.05]);
      pawTip.position.copy(pawPos).add(new THREE.Vector3(0, -0.03, 0.1));
      this.pose.add(pawTip);
    }
  }

  #buildTail() {
    const segments = 30;
    const radial = 10;
    const count = (segments + 1) * radial;

    const positions = new Float32Array(count * 3);
    const normals = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const indices = [];

    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < radial; j++) {
        const a = i * radial + j;
        const b = i * radial + ((j + 1) % radial);
        const c = (i + 1) * radial + j;
        const d = (i + 1) * radial + ((j + 1) % radial);
        indices.push(a, b, c, b, d, c);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2.5);

    const orange = new THREE.Color(FUR);
    const cream = new THREE.Color(FUR_LIGHT);
    const color = new THREE.Color();
    for (let i = 0; i <= segments; i++) {
      const u = i / segments;
      color.copy(orange).lerp(cream, smoothstepJS(0.62, 0.98, u));
      for (let j = 0; j < radial; j++) {
        const index = (i * radial + j) * 3;
        colors[index] = color.r;
        colors[index + 1] = color.g;
        colors[index + 2] = color.b;
      }
    }

    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.88,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const tail = new THREE.Mesh(geometry, material);
    tail.castShadow = true;
    tail.frustumCulled = false;
    this.pose.add(tail);

    this.tail = tail;
    this.tailSegments = segments;
    this.tailRadial = radial;
    this.tailPositions = positions;
    this.tailNormals = normals;

    this.tailCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.5, -0.58),
      new THREE.Vector3(-0.4, 0.58, -0.96),
      new THREE.Vector3(-0.92, 0.82, -1.02),
      new THREE.Vector3(-1.2, 1.22, -0.86),
      new THREE.Vector3(-1.24, 1.66, -0.6),
      new THREE.Vector3(-1.0, 1.94, -0.38),
    ]);

    this.tailBasePoints = [];
    for (let i = 0; i <= segments; i++) {
      this.tailBasePoints.push(
        this.tailCurve.getPointAt(i / segments),
      );
    }

    // 用平行传输为静态曲线建立稳定的截面方向
    this.tailFrames = [];
    let normal = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i <= segments; i++) {
      const prev = this.tailBasePoints[Math.max(0, i - 1)];
      const next = this.tailBasePoints[Math.min(segments, i + 1)];
      const tangent = new THREE.Vector3().subVectors(next, prev).normalize();
      normal
        .addScaledVector(tangent, -normal.dot(tangent))
        .normalize();
      const binormal = new THREE.Vector3()
        .crossVectors(tangent, normal)
        .normalize();
      this.tailFrames.push({
        tangent,
        normal: normal.clone(),
        binormal,
      });
    }
  }

  #buildRod() {
    const assembly = new THREE.Group();
    assembly.rotation.x = 0.96;
    this.rodPivot.add(assembly);
    this.rodAssembly = assembly;

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.033, 3.0, 10),
      rodMat,
    );
    shaft.position.y = 1.5;
    assembly.add(shaft);

    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.05, 0.52, 12),
      woodMat,
    );
    handle.position.y = 0.26;
    assembly.add(handle);

    const butt = sphere(0.055, woodMat, [1, 1, 1], 16);
    butt.position.y = 0.02;
    assembly.add(butt);

    const reel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.085, 0.07, 20),
      reelMat,
    );
    reel.position.set(0.075, 0.52, 0.01);
    reel.rotation.z = Math.PI / 2;
    assembly.add(reel);

    const reelHandle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.13, 6),
      reelMat,
    );
    reelHandle.position.set(0.14, 0.52, 0.01);
    reelHandle.rotation.z = Math.PI / 2;
    assembly.add(reelHandle);
    this.reel = reel;

    // 鱼竿尖，钓鱼线从这里垂下
    this.rodTip = new THREE.Object3D();
    this.rodTip.position.y = 3.02;
    assembly.add(this.rodTip);

    // 前导环
    for (const y of [1.15, 2.15]) {
      const guide = new THREE.Mesh(
        new THREE.TorusGeometry(0.03, 0.008, 5, 12),
        reelMat,
      );
      guide.position.set(0, y, 0.02);
      guide.rotation.x = Math.PI / 2;
      assembly.add(guide);
    }

  }

  update(t, dt, pose) {
    this.time = t;

    const excitement = pose.excitement ?? 0;
    const headYaw = pose.headYaw ?? 0;
    const headPitch = pose.headPitch ?? 0;
    const lean = pose.lean ?? 0;
    const earPerk = pose.earPerk ?? 0;

    // 呼吸起伏
    const breath = Math.sin(t * 1.9) * 0.012;
    this.body.scale.set(1.02, 1.16 + breath, 0.9);
    this.chest.scale.set(0.92, 1.08 + breath * 0.8, 0.5);

    // 身体前倾 / 激动时轻轻抬起
    this.pose.rotation.x = lean * 0.09;
    this.pose.position.y = excitement * 0.02 + Math.sin(t * 1.9) * 0.004;

    // 头部：跟随浮标和小鱼，另外叠加一点呼吸和好奇的偏头
    this.headPivot.rotation.y =
      headYaw + Math.sin(t * 0.7) * 0.012 + excitement * 0.03;
    this.headPivot.rotation.x =
      headPitch + Math.sin(t * 1.1 + 0.4) * 0.012 - excitement * 0.02;
    this.headPivot.rotation.z = Math.sin(t * 0.5) * 0.015 + excitement * 0.02;

    // 眨眼
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0 && !this.isBlinking) {
      this.isBlinking = true;
      this.blink = 0;
      this.blinkTimer = 2.6 + Math.random() * 3.2;
    }
    if (this.isBlinking) {
      this.blink += dt / this.blinkDuration;
      if (this.blink >= 1) {
        this.isBlinking = false;
        this.blink = 0;
      }
    }
    const blinkAmount = this.isBlinking
      ? 1 - Math.sin(Math.min(this.blink, 1) * Math.PI)
      : 1;
    const eyeScale = 1 + excitement * 0.1;
    for (const eye of this.eyes) {
      eye.scale.set(eyeScale, Math.max(0.07, blinkAmount) * eyeScale, 1);
    }

    // 耳朵抖动 + 警觉时竖起
    this.earTwitchTimer -= dt;
    if (this.earTwitchTimer <= 0) {
      this.earTwitch = 1;
      this.earTwitchTimer = 2.2 + Math.random() * 3.4;
    }
    this.earTwitch = Math.max(0, this.earTwitch - dt * 4.5);
    const twitch = Math.sin(this.time * 42) * this.earTwitch * 0.12;
    this.ears.forEach((ear, index) => {
      const side = index === 0 ? -1 : 1;
      ear.rotation.z =
        -side * 0.24 - side * earPerk * 0.06 + side * twitch * 0.4;
      ear.rotation.x = -earPerk * 0.16 + twitch;
    });

    // 尾巴：开心时摆得更快、幅度更大
    const wagSpeed = 2.4 + excitement * 6;
    const wagAmount = 0.09 + excitement * 0.42;
    const {
      tailPositions: positions,
      tailNormals: normals,
      tailSegments,
      tailRadial,
      tailFrames,
    } = this;
    for (let i = 0; i <= tailSegments; i++) {
      const u = i / tailSegments;
      const base = this.tailBasePoints[i];
      const frame = tailFrames[i];
      const sway =
        Math.sin(t * wagSpeed - u * 2.6) *
        wagAmount *
        Math.pow(u, 1.35) *
        1.5;
      const centerX = base.x + sway * 0.45;
      const centerY =
        base.y + Math.sin(t * wagSpeed * 0.5 - u * 2.0) * 0.03 * u;
      const centerZ = base.z + sway * 0.75;
      const radius = 0.17 * (1 - u * 0.56) + 0.012;

      for (let j = 0; j < tailRadial; j++) {
        const angle = (j / tailRadial) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const dx =
          frame.normal.x * cos + frame.binormal.x * sin;
        const dy =
          frame.normal.y * cos + frame.binormal.y * sin;
        const dz =
          frame.normal.z * cos + frame.binormal.z * sin;
        const index = (i * tailRadial + j) * 3;
        positions[index] = centerX + dx * radius;
        positions[index + 1] = centerY + dy * radius;
        positions[index + 2] = centerZ + dz * radius;
        normals[index] = dx;
        normals[index + 1] = dy;
        normals[index + 2] = dz;
      }
    }
    this.tail.geometry.attributes.position.needsUpdate = true;
    this.tail.geometry.attributes.normal.needsUpdate = true;

    // 偶尔转一下卷线器
    this.reel.rotation.x += dt * 0.4;
  }

  getRodTipWorld(target = new THREE.Vector3()) {
    this.group.updateMatrixWorld(true);
    return this.rodTip.getWorldPosition(target);
  }
}
