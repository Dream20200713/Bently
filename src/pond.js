import * as THREE from "three";
import { SUN_DIRECTION } from "./environment.js";

export const POND = { x: 4.7, z: 0.9, rx: 4.05, rz: 3.05 };
export const WATER_LEVEL = 0.03;

/* ------------------------------------------------------------------ *
 * 池塘：程序化的椭圆水面、浅滩、水波和睡莲。
 * ------------------------------------------------------------------ */

function createWaterGeometry(rx, rz, rings = 22, segments = 96) {
  const positions = [];
  const indices = [];

  for (let i = 0; i <= rings; i++) {
    const r = i / rings;
    for (let j = 0; j <= segments; j++) {
      const angle = (j / segments) * Math.PI * 2;
      positions.push(Math.cos(angle) * r * rx, 0, Math.sin(angle) * r * rz);
    }
  }

  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * (segments + 1) + j;
      const b = a + segments + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function createWaterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uRx: { value: POND.rx },
      uRz: { value: POND.rz },
      uSunDir: { value: SUN_DIRECTION },
      uDeep: { value: new THREE.Color(0x2c737f) },
      uShallow: { value: new THREE.Color(0x63b0a5) },
      uSky: { value: new THREE.Color(0xbfe6ee) },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uRx;
      uniform float uRz;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vRadius;
      varying float vHeight;

      float waveHeight(vec2 p) {
        float r = length(vec2(p.x / uRx, p.y / uRz));
        float edge = 1.0 - smoothstep(0.55, 1.0, r);
        float w1 = sin(r * 9.0 - uTime * 1.9) * 0.55;
        float w2 = sin(p.x * 2.2 + uTime * 1.15) * 0.3;
        float w3 = sin(p.y * 3.1 - uTime * 0.85 + 1.7) * 0.25;
        return (w1 + w2 + w3) * 0.028 * (0.35 + edge);
      }

      void main() {
        vec2 p = position.xz;
        float h = waveHeight(p);
        float eps = 0.12;
        float hx = waveHeight(p + vec2(eps, 0.0));
        float hz = waveHeight(p + vec2(0.0, eps));
        vNormal = normalize(vec3(-(hx - h) / eps, 1.0, -(hz - h) / eps));
        vHeight = h;
        vRadius = length(vec2(p.x / uRx, p.y / uRz));

        vec3 transformed = vec3(position.x, h, position.z);
        vec4 world = modelMatrix * vec4(transformed, 1.0);
        vWorldPos = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uSky;
      uniform float uTime;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vRadius;
      varying float vHeight;

      void main() {
        vec3 n = normalize(vNormal);
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(1.0 - clamp(dot(viewDir, n), 0.0, 1.0), 3.0);

        vec3 color = mix(uDeep, uShallow, 0.32 + 0.35 * clamp(vHeight * 14.0 + 0.5, 0.0, 1.0));
        color = mix(color, uSky, 0.34 + fresnel * 0.4);

        vec3 halfDir = normalize(uSunDir + viewDir);
        float spec = pow(max(dot(n, halfDir), 0.0), 120.0);
        color += vec3(1.0, 0.88, 0.66) * spec * 0.7;

        // 柔和的阳光倒影
        vec3 reflected = reflect(-viewDir, n);
        float sunPath = pow(max(dot(reflected, uSunDir), 0.0), 24.0);
        color += vec3(1.0, 0.75, 0.42) * sunPath * 0.22;

        // 靠近岸边稍微浅一点
        float shore = smoothstep(0.82, 1.0, vRadius);
        color = mix(color, uShallow * 1.15, shore * 0.45);

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
}

function createLilyPad(x, z, radius, rotation) {
  const geometry = new THREE.CircleGeometry(radius, 28, 0.4, Math.PI * 2 - 0.8);
  const material = new THREE.MeshStandardMaterial({
    color: 0x4e8f54,
    roughness: 0.7,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  const pad = new THREE.Mesh(geometry, material);
  pad.rotation.x = -Math.PI / 2;
  pad.rotation.z = rotation;
  pad.position.set(x, WATER_LEVEL + 0.035, z);
  pad.receiveShadow = true;
  return pad;
}


function createDragonfly() {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x2f7f86,
    roughness: 0.35,
    metalness: 0.35,
    emissive: 0x0c3034,
    emissiveIntensity: 0.3,
  });
  const wingMaterial = new THREE.MeshBasicMaterial({
    color: 0xdff4ff,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.028, 0.28, 4, 8),
    bodyMaterial,
  );
  body.rotation.z = Math.PI / 2;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 12, 8),
    bodyMaterial,
  );
  head.position.x = 0.17;
  group.add(head);

  for (let side = -1; side <= 1; side += 2) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.032, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x182326 }),
    );
    eye.position.set(0.19, 0.035, side * 0.035);
    group.add(eye);
  }

  const wings = [];
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 2; i++) {
      const pivot = new THREE.Group();
      pivot.position.set(0.05 - i * 0.14, 0.03, 0);
      group.add(pivot);

      const wing = new THREE.Mesh(
        new THREE.CircleGeometry(0.17, 18),
        wingMaterial,
      );
      wing.scale.set(1.35, 0.32, 1);
      wing.rotation.x = -Math.PI / 2;
      wing.position.z = side * 0.16;
      pivot.add(wing);
      wings.push({ pivot, side, phase: i * 0.6 });
    }
  }

  group.userData.wings = wings;
  return group;
}

export class Pond {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = "pond";
    scene.add(this.group);

    const material = createWaterMaterial();
    this.material = material;
    const water = new THREE.Mesh(
      createWaterGeometry(POND.rx, POND.rz),
      material,
    );
    water.position.set(POND.x, WATER_LEVEL, POND.z);
    water.receiveShadow = false;
    this.water = water;
    this.group.add(water);

    this.dragonfly = createDragonfly();
    this.dragonfly.scale.setScalar(0.9);
    this.group.add(this.dragonfly);

    // 浅浅的池塘底，从岸边往中间颜色更深
    const bed = new THREE.Mesh(
      new THREE.CircleGeometry(1, 64),
      new THREE.MeshStandardMaterial({
        color: 0x255a52,
        roughness: 1,
      }),
    );
    bed.rotation.x = -Math.PI / 2;
    bed.scale.set(POND.rx * 1.01, POND.rz * 1.01, 1);
    bed.position.set(POND.x, WATER_LEVEL - 0.35, POND.z);
    this.group.add(bed);

    // 沙滩边沿
    const shore = new THREE.Mesh(
      new THREE.RingGeometry(0.995, 1.14, 120, 1),
      new THREE.MeshStandardMaterial({
        color: 0xd8c08a,
        roughness: 1,
      }),
    );
    shore.rotation.x = -Math.PI / 2;
    shore.scale.set(POND.rx, POND.rz, 1);
    shore.position.set(
      POND.x,
      WATER_LEVEL + 0.028,
      POND.z,
    );
    shore.receiveShadow = true;
    this.group.add(shore);

    // 睡莲
    this.pads = [];
    const placements = [
      [2.6, 1.3, 0.36, 0.6],
      [5.7, 2.3, 0.42, 2.2],
      [7.0, 0.2, 0.3, 4.0],
      [4.4, -1.0, 0.34, 1.2],
      [3.3, 2.4, 0.24, 3.1],
    ];
    for (const [x, z, radius, rotation] of placements) {
      const pad = createLilyPad(x, z, radius, rotation);
      pad.userData.phase = rotation * 2;
      this.group.add(pad);
      this.pads.push(pad);
    }

    const lotusMaterial = new THREE.MeshStandardMaterial({
      color: 0xffc3d4,
      roughness: 0.55,
    });
    for (const [x, z] of [
      [5.9, 2.3],
      [7.0, 0.2],
    ]) {
      const lotus = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const petal = new THREE.Mesh(
          new THREE.SphereGeometry(0.07, 8, 6),
          lotusMaterial,
        );
        petal.scale.set(0.55, 0.3, 1.2);
        const angle = (i / 5) * Math.PI * 2;
        petal.position.set(
          Math.cos(angle) * 0.06,
          0.04,
          Math.sin(angle) * 0.06,
        );
        petal.rotation.y = -angle;
        petal.rotation.x = -0.4;
        lotus.add(petal);
      }
      lotus.position.set(x, WATER_LEVEL + 0.06, z);
      this.group.add(lotus);
    }
  }

  update(t) {
    this.material.uniforms.uTime.value = t;

    if (this.dragonfly) {
      const fly = this.dragonfly;
      const x = 5.7 + Math.sin(t * 0.47) * 0.75;
      const z = 2.0 + Math.sin(t * 0.7 + 1.3) * 0.35;
      fly.position.set(x, WATER_LEVEL + 0.9 + Math.sin(t * 1.8) * 0.07, z);
      const vx = Math.cos(t * 0.47) * 0.8 * 0.47;
      const vz = Math.cos(t * 0.7 + 1.3) * 0.45 * 0.7;
      fly.rotation.y = Math.atan2(-vz, vx);
      for (const wing of fly.userData.wings) {
        wing.pivot.rotation.x =
          wing.side * Math.sin(t * 34 + wing.phase) * 0.7;
      }
    }
    for (const pad of this.pads) {
      pad.position.y =
        WATER_LEVEL + 0.035 + Math.sin(t * 1.25 + pad.userData.phase) * 0.008;
      pad.rotation.z = Math.sin(t * 0.6 + pad.userData.phase) * 0.05;
    }
  }
}
