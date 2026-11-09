import * as THREE from "three";

/* ------------------------------------------------------------------ *
 * 场景环境：天空、太阳、云、草地、树木、花丛、石头和岸边的小水桶。
 * 全部使用程序化几何体，保证离线打开时也有完整的画面。
 * ------------------------------------------------------------------ */

export const SUN_DIRECTION = new THREE.Vector3(-0.82, 0.14, -0.55).normalize();
const SKY_HORIZON = new THREE.Color(0xffe2bc);
const SKY_TOP = new THREE.Color(0x4b9ad6);
const SKY_SUN = new THREE.Color(0xffd18a);
const FOG_COLOR = 0xf6e3c9;

function mulberry32(seed) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSky() {
  const geometry = new THREE.SphereGeometry(140, 32, 20);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: SKY_TOP },
      uHorizon: { value: SKY_HORIZON },
      uSunColor: { value: SKY_SUN },
      uSunDir: { value: SUN_DIRECTION },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      varying vec3 vDir;

      void main() {
        float h = clamp(vDir.y * 2.15 + 0.01, 0.0, 1.0);
        vec3 color = mix(uHorizon, uTop, pow(h, 0.55));
        float sunGlow = pow(max(dot(normalize(vDir), uSunDir), 0.0), 10.0);
        float haze = pow(1.0 - h, 4.0) * 0.12;
        color += uSunColor * sunGlow * 0.42 + vec3(haze);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(geometry, material);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  return sky;
}

function makeGlowTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, "rgba(255, 247, 222, 1)");
  gradient.addColorStop(0.16, "rgba(255, 227, 168, 0.95)");
  gradient.addColorStop(0.42, "rgba(255, 196, 120, 0.36)");
  gradient.addColorStop(1, "rgba(255, 180, 100, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeSun() {
  const group = new THREE.Group();

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture(),
      color: 0xffffff,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      fog: false,
      transparent: true,
    }),
  );
  glow.scale.setScalar(34);
  group.add(glow);

  const core = new THREE.Sprite(
    new THREE.SpriteMaterial({
      color: 0xfff6dc,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      fog: false,
      transparent: true,
      opacity: 0.9,
    }),
  );
  core.scale.setScalar(11);
  group.add(core);

  group.position.copy(SUN_DIRECTION).multiplyScalar(105);
  return group;
}

function makeCloud(random) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: 0xfffdf8,
    roughness: 1,
    metalness: 0,
    emissive: 0xffe8d2,
    emissiveIntensity: 0.32,
    transparent: true,
    opacity: 0.94,
    fog: false,
  });
  const puffs = 4 + Math.floor(random() * 3);
  for (let i = 0; i < puffs; i++) {
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(0.7 + random() * 0.55, 18, 12),
      material,
    );
    puff.position.set(
      (i - (puffs - 1) / 2) * 1.05 + (random() - 0.5) * 0.4,
      random() * 0.5,
      (random() - 0.5) * 0.7,
    );
    puff.scale.set(1.15, 0.82, 1);
    group.add(puff);
  }
  return group;
}

function makeClouds(random) {
  const clouds = new THREE.Group();
  const placements = [
    [-45, 9, -60, 1.7],
    [-20, 12, -70, 2.0],
    [-65, 13, -35, 1.6],
    [2, 11, -75, 1.8],
    [-34, 8.5, -82, 1.4],
    [30, 14, -58, 1.7],
  ];
  for (const [x, y, z, scale] of placements) {
    const cloud = makeCloud(random);
    cloud.position.set(x, y, z);
    cloud.scale.setScalar(scale);
    cloud.userData.speed = 0.12 + random() * 0.18;
    clouds.add(cloud);
  }
  return clouds;
}

function makeHills(random) {
  const group = new THREE.Group();
  const spots = [
    [-26, -3, -46, 30, 9],
    [8, -4, -58, 38, 12],
    [42, -4, -22, 30, 10],
    [-48, -4, 12, 34, 11],
    [28, -5, 38, 34, 9],
    [-16, -4, 46, 26, 8],
  ];
  for (const [x, y, z, width, height] of spots) {
    const hill = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 14),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(
          0.26 + random() * 0.03,
          0.32,
          0.62,
        ),
        roughness: 1,
      }),
    );
    hill.scale.set(width, height, width * 0.55);
    hill.position.set(x, y, z);
    group.add(hill);
  }
  return group;
}

function makeTree(x, z, scale, random) {
  const tree = new THREE.Group();
  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: 0x7c5638,
    roughness: 0.95,
  });
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14 * scale, 0.26 * scale, 1.9 * scale, 8),
    trunkMaterial,
  );
  trunk.position.y = 0.95 * scale;
  trunk.castShadow = true;
  tree.add(trunk);

  const colors = [0x5f9e4b, 0x6fae58, 0x4e8b43, 0x79b45f];
  const blobs = 9;
  for (let i = 0; i < blobs; i++) {
    const foliage = new THREE.Mesh(
      new THREE.SphereGeometry(
        (0.38 + random() * 0.33) * scale,
        14,
        10,
      ),
      new THREE.MeshStandardMaterial({
        color: colors[Math.floor(random() * colors.length)],
        roughness: 0.92,
        flatShading: true,
      }),
    );
    const angle = random() * Math.PI * 2;
    const spread = (0.25 + random() * 0.9) * scale;
    foliage.position.set(
      Math.cos(angle) * spread,
      (1.85 + random() * 1.15) * scale,
      Math.sin(angle) * spread,
    );
    foliage.castShadow = true;
    tree.add(foliage);
  }

  // 顶部再补一团，让树冠更饱满
  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(0.62 * scale, 14, 10),
    new THREE.MeshStandardMaterial({
      color: colors[Math.floor(random() * colors.length)],
      roughness: 0.92,
      flatShading: true,
    }),
  );
  crown.position.y = 2.75 * scale;
  crown.castShadow = true;
  tree.add(crown);

  tree.position.set(x, 0, z);
  tree.rotation.y = random() * Math.PI * 2;
  return tree;
}

function makeBush(x, z, scale, random) {
  const bush = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(0.27, 0.35, 0.4 + random() * 0.1),
    roughness: 0.95,
    flatShading: true,
  });
  for (let i = 0; i < 3; i++) {
    const blob = new THREE.Mesh(
      new THREE.SphereGeometry((0.35 + random() * 0.25) * scale, 12, 10),
      material,
    );
    blob.position.set((i - 1) * 0.42 * scale, 0.32 * scale, random() * 0.3);
    blob.castShadow = true;
    bush.add(blob);
  }
  bush.position.set(x, 0, z);
  return bush;
}

function makeFlower(x, z, random) {
  const group = new THREE.Group();
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.016, 0.24, 4),
    new THREE.MeshStandardMaterial({ color: 0x4f8b42, roughness: 0.9 }),
  );
  stem.position.y = 0.12;
  group.add(stem);

  const palette = [0xfff4e6, 0xffd66b, 0xffafc4, 0xc9b6ff];
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.045 + random() * 0.03, 8, 6),
    new THREE.MeshStandardMaterial({
      color: palette[Math.floor(random() * palette.length)],
      roughness: 0.6,
      emissive: 0x332211,
      emissiveIntensity: 0.05,
    }),
  );
  head.position.y = 0.26;
  head.scale.set(1, 0.65, 1);
  group.add(head);

  group.position.set(x, 0, z);
  return group;
}

function makeGrassTuft(x, z, random) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(0.26, 0.4, 0.32 + random() * 0.08),
    roughness: 1,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(
      new THREE.ConeGeometry(0.035, 0.26 + random() * 0.16, 4),
      material,
    );
    blade.position.set((random() - 0.5) * 0.14, 0.14, (random() - 0.5) * 0.14);
    blade.rotation.z = (random() - 0.5) * 0.4;
    blade.rotation.x = (random() - 0.5) * 0.3;
    group.add(blade);
  }
  group.position.set(x, 0, z);
  return group;
}

function makeReeds(x, z, random) {
  const group = new THREE.Group();
  const stemMaterial = new THREE.MeshStandardMaterial({
    color: 0x5d8f48,
    roughness: 0.85,
  });
  const tipMaterial = new THREE.MeshStandardMaterial({
    color: 0x8a5a32,
    roughness: 0.9,
  });
  for (let i = 0; i < 7; i++) {
    const height = 0.9 + random() * 0.8;
    const angle = random() * Math.PI * 2;
    const radius = random() * 0.32;
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.02, height, 4),
      stemMaterial,
    );
    stem.position.set(Math.cos(angle) * radius, height / 2, Math.sin(angle) * radius);
    stem.rotation.z = (random() - 0.5) * 0.16;
    group.add(stem);

    if (random() > 0.35) {
      const tip = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.035, 0.16, 4, 6),
        tipMaterial,
      );
      tip.position.set(
        stem.position.x,
        height + 0.06,
        stem.position.z,
      );
      tip.rotation.z = stem.rotation.z;
      group.add(tip);
    }
  }
  group.position.set(x, 0, z);
  return group;
}

function makeRock(x, z, scale, random) {
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(scale, 0),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.11, 0.08, 0.45 + random() * 0.15),
      roughness: 0.95,
      flatShading: true,
    }),
  );
  rock.position.set(x, scale * 0.4, z);
  rock.rotation.set(random() * 3, random() * 3, random() * 3);
  rock.scale.y = 0.65;
  rock.castShadow = true;
  rock.receiveShadow = true;
  return rock;
}

function makeBucket() {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({
    color: 0x9b6b42,
    roughness: 0.9,
  });
  const hoop = new THREE.MeshStandardMaterial({
    color: 0x5b5b58,
    roughness: 0.5,
    metalness: 0.4,
  });

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.28, 0.56, 18, 1, true),
    wood.clone(),
  );
  body.material.side = THREE.DoubleSide;
  body.position.y = 0.28;
  body.castShadow = true;
  group.add(body);

  const bottom = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 0.04, 18),
    wood,
  );
  bottom.position.y = 0.03;
  group.add(bottom);

  for (const y of [0.1, 0.48]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(y > 0.2 ? 0.335 : 0.3, 0.018, 6, 24),
      hoop,
    );
    ring.position.y = y;
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
  }

  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.36, 0.018, 6, 24, Math.PI),
    hoop,
  );
  handle.position.y = 0.55;
  handle.rotation.z = 0;
  group.add(handle);

  // 桶里探出尾巴的小鱼
  const fishOrange = new THREE.MeshStandardMaterial({
    color: 0xf47f3c,
    roughness: 0.55,
  });
  const fishLight = new THREE.MeshStandardMaterial({
    color: 0xffd9a8,
    roughness: 0.6,
  });

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(0.3, 18),
    new THREE.MeshStandardMaterial({
      color: 0x2f6e78,
      roughness: 0.2,
      metalness: 0.1,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.42;
  group.add(water);

  const fishBody = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 12, 10),
    fishOrange,
  );
  fishBody.scale.set(0.7, 0.55, 1.3);
  fishBody.position.set(0.08, 0.5, -0.06);
  fishBody.rotation.z = 0.5;
  group.add(fishBody);

  const tail = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.2, 6),
    fishLight,
  );
  tail.position.set(0.12, 0.64, -0.02);
  tail.rotation.z = -0.7;
  tail.scale.z = 0.4;
  group.add(tail);

  return group;
}

function makeBirds(random) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: 0x4f5a58 });
  const birds = [];
  for (let i = 0; i < 3; i++) {
    const bird = new THREE.Group();
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.06), material);
    left.position.x = -0.25;
    bird.add(left);
    const right = left.clone();
    right.position.x = 0.25;
    bird.add(right);
    bird.userData = {
      left,
      right,
      radius: 7 + i * 2,
      speed: 0.18 + random() * 0.08,
      offset: random() * Math.PI * 2,
      flap: random() * Math.PI * 2,
    };
    bird.scale.setScalar(1.6);
    birds.push(bird);
    group.add(bird);
  }
  group.position.set(-16, 22, -34);
  return { group, birds };
}

function makeGrassTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const random = mulberry32(9271);

  ctx.fillStyle = "#7bb45a";
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 120; i++) {
    const x = random() * size;
    const y = random() * size;
    const r = 12 + random() * 40;
    const shade = random() > 0.5 ? "106,160,72" : "142,196,104";
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, `rgba(${shade},0.16)`);
    gradient.addColorStop(1, `rgba(${shade},0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  for (let i = 0; i < 4200; i++) {
    const x = random() * size;
    const y = random() * size;
    const height = 2 + random() * 7;
    const lean = (random() - 0.5) * 3;
    const shade = 84 + Math.floor(random() * 60);
    ctx.strokeStyle = `rgba(${shade - 30},${shade + 60},${shade - 20},0.5)`;
    ctx.lineWidth = 0.7 + random() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + lean, y - height);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(24, 24);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function createGround(random) {
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(60, 72),
    new THREE.MeshStandardMaterial({
      map: makeGrassTexture(),
      color: 0xffffff,
      roughness: 1,
      metalness: 0,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  return ground;
}

export function createEnvironment(scene) {
  const random = mulberry32(20261109);
  const root = new THREE.Group();
  root.name = "environment";
  scene.add(root);

  root.add(makeSky());
  root.add(makeSun());
  root.add(makeHills(random));
  root.add(createGround(random));

  const clouds = makeClouds(random);
  root.add(clouds);

  // 草地上的颜色斑块，让大片草坪不那么单调
  for (let i = 0; i < 14; i++) {
    const patch = new THREE.Mesh(
      new THREE.CircleGeometry(1.2 + random() * 2.6, 18),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.26, 0.3, 0.5 + random() * 0.08),
        roughness: 1,
        transparent: true,
        opacity: 0.16,
      }),
    );
    patch.rotation.x = -Math.PI / 2;
    const angle = random() * Math.PI * 2;
    const radius = 6 + random() * 18;
    patch.position.set(
      Math.cos(angle) * radius,
      0.002,
      Math.sin(angle) * radius,
    );
    patch.receiveShadow = true;
    root.add(patch);
  }

  const trees = [
    [11.5, -1.5, 1.25],
    [14.5, 4.2, 1.5],
    [10.5, -6.5, 1.05],
    [7.8, -9.2, 0.9],
    [-9.5, -8.0, 1.1],
    [-8.8, 3.6, 1.3],
    [-5.6, 7.4, 0.9],
    [16.5, -4.0, 1.2],
  ];
  for (const [x, z, scale] of trees) {
    const tree = makeTree(x, z, scale, random);
    tree.name = `tree-${x}-${z}`;
    root.add(tree);
  }

  for (let i = 0; i < 5; i++) {
    const angle = random() * Math.PI * 2;
    const radius = 8 + random() * 6;
    root.add(
      makeBush(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        0.8 + random() * 0.5,
        random,
      ),
    );
  }

  // 岸边的小水桶
  const bucket = makeBucket();
  bucket.position.set(-2.45, 0, 1.35);
  bucket.rotation.y = 0.6;
  root.add(bucket);

  // 花、草丛、石头：避开池塘和猫
  const pond = { x: 4.7, z: 0.9, rx: 4.05, rz: 3.05 };
  const isFree = (x, z, margin = 0) => {
    const nx = (x - pond.x) / (pond.rx + margin);
    const nz = (z - pond.z) / (pond.rz + margin);
    if (nx * nx + nz * nz < 1) return false;
    if (Math.hypot(x + 0.9, z - 0.1) < 2.1) return false;
    if (Math.hypot(x + 2.45, z - 1.35) < 0.7) return false;
    return true;
  };

  for (let i = 0; i < 30; i++) {
    let x = 0;
    let z = 0;
    let attempts = 0;
    do {
      const angle = random() * Math.PI * 2;
      const radius = 1.8 + random() * 9.5;
      x = Math.cos(angle) * radius;
      z = Math.sin(angle) * radius;
      attempts++;
    } while (!isFree(x, z, 0.15) && attempts < 30);
    if (isFree(x, z, 0.15)) root.add(makeFlower(x, z, random));
  }

  for (let i = 0; i < 55; i++) {
    let x = 0;
    let z = 0;
    let attempts = 0;
    do {
      const angle = random() * Math.PI * 2;
      const radius = 2 + random() * 13;
      x = Math.cos(angle) * radius;
      z = Math.sin(angle) * radius;
      attempts++;
    } while (!isFree(x, z, 0.1) && attempts < 30);
    if (isFree(x, z, 0.1)) root.add(makeGrassTuft(x, z, random));
  }

  for (let i = 0; i < 8; i++) {
    const angle = random() * Math.PI * 2;
    const radius = 4.6 + random() * 1.2;
    const x = pond.x + Math.cos(angle) * (pond.rx + 0.25);
    const z = pond.z + Math.sin(angle) * (pond.rz + 0.25);
    root.add(makeRock(x, z, 0.18 + random() * 0.22, random));
  }

  const reedSpots = [
    [6.6, 3.6],
    [8.2, 0.6],
    [7.5, -1.7],
    [2.6, 5.2],
  ];
  for (const [x, z] of reedSpots) root.add(makeReeds(x, z, random));

  const birds = makeBirds(random);
  root.add(birds.group);

  return {
    root,
    update(t, dt) {
      for (const cloud of clouds.children) {
        cloud.position.x += cloud.userData.speed * dt;
        if (cloud.position.x > 46) cloud.position.x = -46;
      }
      for (const bird of birds.birds) {
        const { radius, speed, offset, left, right } = bird.userData;
        const angle = t * speed + offset;
        bird.position.set(
          Math.cos(angle) * radius,
          Math.sin(angle * 1.7) * 0.8,
          Math.sin(angle) * radius * 0.6,
        );
        bird.rotation.y = -angle + Math.PI / 2;
        const flap = Math.sin(t * 5 + offset) * 0.35;
        left.rotation.z = flap;
        right.rotation.z = -flap;
      }
    },
  };
}

export { FOG_COLOR, mulberry32 };
