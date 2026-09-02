const THREE_NS = window.THREE;
if (!THREE_NS) {
  document.getElementById("helpText").textContent = "Three.js did not load. Keep three.min.js next to index.html.";
  throw new Error("Three.js did not load");
}
const isMobile = /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(navigator.userAgent);

const ui = {
  helpText: document.getElementById("helpText"),
  debugStatus: document.getElementById("debugStatus"),
  crosshair: document.getElementById("crosshair"),
  joystickKnob: document.getElementById("joystickKnob"),
  musicButton: document.getElementById("musicButton"),
  messageOverlay: document.getElementById("messageOverlay"),
  messageText: document.getElementById("messageText"),
  closeMessage: document.getElementById("closeMessage")
};

function setStatus(text) {
  if (ui.debugStatus) ui.debugStatus.textContent = text;
}

ui.helpText.textContent = isMobile
  ? "Drag right side to look. Use left side to move. Tap lanterns when the crosshair glows."
  : "Click to enter. WASD/ZQSD to move. Aim and click glowing lanterns.";

const MESSAGES = [
  "I love you",
  "I'll be there for you",
  "I lOooOoOoVE YOuuUu",
  "Love you love you LoVe you lovE you love You love yOu love yoU LOVEEEEEEEE YOUUU",
  "hehheheeh",
  "je t'aime mon amour",
  "repose toi tout ira bien",
  "JE T'AIME JE T'AIME JE T'AIME att j'ai oublié de te dire....que.. JE T'AIME",
  "♡",
  "EHHHH VIENS ME PARLER AU LIEU DE JOUER MDRR",
  "es ce que tu sais que je sais que tu sais que NOUS SAVONS que JE T'AIME PLUS ah bah oui la tu peux pas me contredire heheeh (je t'aime plus, je maintiens)",
  "tu me manques..."
];

const flowerTypes = [
  { stem: [30, 100, 25], petal: [220, 40, 40], glow: [255, 80, 80] },
  { stem: [30, 100, 25], petal: [240, 240, 240], glow: [200, 220, 255] },
  { stem: [25, 90, 30], petal: [60, 80, 200], glow: [100, 130, 255] },
  { stem: [30, 100, 25], petal: [240, 220, 30], glow: [255, 240, 80] },
  { stem: [25, 85, 30], petal: [180, 60, 200], glow: [220, 120, 255] },
  { stem: [30, 100, 25], petal: [240, 100, 60], glow: [255, 140, 100] }
];

const flowerTextureCache = {};
let grassTexture = null;

const WORLD = {
  size: 36,
  eyeHeight: 1.7,
  walkLimit: 34,
  heightCache: new Map()
};

const MOON_POSITION = new THREE_NS.Vector3(20, 55, -30);
const MOON_GAZE_SECONDS = new URLSearchParams(window.location.search).get("moonTest") === "1" ? 5 : 30 * 60;
const CONSTELLATION_GAZE_SECONDS = 12;
const LAKE_INNER_RADIUS = 20.65;
const LAKE_OUTER_RADIUS = 22.35;
const LAKE_Y = 0.62;

const scene = new THREE_NS.Scene();
setStatus("Three.js loaded. Creating scene...");
scene.background = new THREE_NS.Color(0x0d1530);
scene.fog = new THREE_NS.FogExp2(0x0d1530, 0.012);

const camera = new THREE_NS.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, WORLD.eyeHeight, 6);

let renderer = null;
try {
  renderer = new THREE_NS.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  if ("outputColorSpace" in renderer) renderer.outputColorSpace = THREE_NS.SRGBColorSpace;
  renderer.shadowMap.enabled = false;
  renderer.domElement.style.position = "fixed";
  renderer.domElement.style.inset = "0";
  renderer.domElement.style.zIndex = "1";
  document.body.appendChild(renderer.domElement);
  setStatus("Renderer ready. Building voxel valley...");
} catch (error) {
  setStatus(`WebGL failed: ${error.message}. Showing fallback valley.`);
  drawFallbackValley(`WebGL failed: ${error.message}`);
}

const clock = new THREE_NS.Clock();
const raycaster = new THREE_NS.Raycaster();
const center = new THREE_NS.Vector2(0, 0);
const tempMatrix = new THREE_NS.Matrix4();
const tempVector = new THREE_NS.Vector3();
const tempQuat = new THREE_NS.Quaternion();
const tempScale = new THREE_NS.Vector3();

const state = {
  yaw: 0,
  pitch: 0.28,
  keys: new Set(),
  pointerLocked: false,
  joystick: new THREE_NS.Vector2(),
  joystickTouchId: null,
  lookTouchId: null,
  lookStartX: 0,
  lookStartY: 0,
  highlightedLantern: null,
  activeMessage: null,
  lastMessage: null,
  overview: true,
  moonLookSeconds: 0,
  moonLoveRevealed: false,
  moonLoveText: null,
  constellationLookSeconds: 0,
  constellationRevealed: false,
  constellationGroup: null,
  music: null,
  boat: null,
  onBoat: false
};

const vegetation = [];
const lanterns = [];
const fireflies = [];
const rareFlowers = [];
const koiFish = [];
let materials;

try {
  if (renderer) {
    materials = createMaterials();
    buildScene();
    setupControls();
    setupMessageUi();
    setOverviewCamera();
    if (window.BirthdayEvent) {
      window.BirthdayEvent.init({ THREE: THREE_NS, scene, camera, renderer, isMobile });
    }
    animate();
    setStatus("Valley rendered. Click to enter first-person mode.");
  }
} catch (error) {
  setStatus(`Build failed: ${error.message}`);
  drawFallbackValley(`Build failed: ${error.message}`);
  throw error;
}

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function drawFallbackValley(reason) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.position = "fixed";
  canvas.style.inset = "0";
  canvas.style.zIndex = "1";
  document.body.appendChild(canvas);

  const rand = seededRandom(2026);
  const fallbackFlowerColors = [
    [220, 40, 40],
    [240, 240, 240],
    [60, 80, 200],
    [240, 220, 30],
    [180, 60, 200],
    [240, 100, 60]
  ];
  const flowers = [];
  const lanternDots = [];
  for (let i = 0; i < 850; i += 1) {
    const angle = rand() * Math.PI * 2;
    const radius = Math.pow(rand(), 0.55);
    flowers.push({
      x: 0.5 + Math.cos(angle) * radius * 0.42,
      y: 0.66 + Math.sin(angle) * radius * 0.22,
      c: fallbackFlowerColors[Math.floor(rand() * fallbackFlowerColors.length)]
    });
  }
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    const radius = 0.12 + rand() * 0.34;
    lanternDots.push({
      x: 0.5 + Math.cos(angle) * radius,
      y: 0.26 + rand() * 0.24 + Math.sin(angle) * 0.08,
      phase: rand() * Math.PI * 2
    });
  }

  function draw(time) {
    const w = canvas.width;
    const h = canvas.height;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#0d1530";
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "#dde4f0";
    ctx.fillRect(w * 0.72, h * 0.12, 42, 42);
    ctx.fillStyle = "#bbc4d4";
    ctx.fillRect(w * 0.72 + 12, h * 0.12 + 15, 8, 8);
    ctx.fillRect(w * 0.72 + 25, h * 0.12 + 9, 5, 5);

    for (let i = 0; i < 90; i += 1) {
      const x = (i * 97) % w;
      const y = 20 + ((i * 43) % Math.max(1, h * 0.45));
      ctx.fillStyle = i % 3 === 0 ? "#ffffff" : "#dbe7ff";
      ctx.fillRect(x, y, 2, 2);
    }

    ctx.fillStyle = "#303846";
    for (let i = 0; i < 24; i += 1) {
      const x = (i / 23) * w;
      const peak = h * (0.28 + Math.sin(i * 1.7) * 0.05);
      ctx.beginPath();
      ctx.moveTo(x - w * 0.12, h * 0.67);
      ctx.lineTo(x, peak);
      ctx.lineTo(x + w * 0.14, h * 0.67);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = "#1f6d27";
    ctx.fillRect(0, h * 0.55, w, h * 0.45);
    ctx.fillStyle = "#2b8732";
    ctx.fillRect(w * 0.16, h * 0.58, w * 0.68, h * 0.34);

    for (const flower of flowers) {
      const x = Math.floor(flower.x * w);
      const y = Math.floor(flower.y * h);
      const [r, g, b] = flower.c;
      ctx.fillStyle = "#1b5f20";
      ctx.fillRect(x, y + 6, 2, 8);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x - 3, y, 8, 8);
      ctx.fillStyle = "#fff9aa";
      ctx.fillRect(x, y + 2, 2, 2);
    }

    for (const lantern of lanternDots) {
      const flicker = Math.sin(time * 0.004 + lantern.phase) * 0.5 + 0.5;
      const x = Math.floor(lantern.x * w);
      const y = Math.floor((lantern.y + Math.sin(time * 0.001 + lantern.phase) * 0.012) * h);
      ctx.fillStyle = `rgba(255, 190, 80, ${0.18 + flicker * 0.25})`;
      ctx.fillRect(x - 20, y - 20, 40, 40);
      ctx.fillStyle = "#fffaf0";
      ctx.fillRect(x - 8, y - 10, 16, 20);
      ctx.fillStyle = "#c4a96b";
      ctx.fillRect(x - 10, y - 12, 20, 3);
      ctx.fillRect(x - 10, y + 10, 20, 3);
      ctx.fillStyle = "#ffcc66";
      ctx.fillRect(x - 4, y - 4, 8, 8);
    }

    setStatus(`Fallback valley is visible. ${reason}`);
    requestAnimationFrame(draw);
  }

  window.addEventListener("resize", () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });
  requestAnimationFrame(draw);
}

function hash(x, y) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) & 0xff) / 255;
}

function createPixelTexture(colorFn, size = 16) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a = 255] = colorFn(x, y, size);
      const i = (y * size + x) * 4;
      image.data[i] = r;
      image.data[i + 1] = g;
      image.data[i + 2] = b;
      image.data[i + 3] = a;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE_NS.CanvasTexture(canvas);
  texture.magFilter = THREE_NS.NearestFilter;
  texture.minFilter = THREE_NS.NearestFilter;
  texture.colorSpace = THREE_NS.SRGBColorSpace;
  return texture;
}

function createMaterials() {
  const grassTop = createPixelTexture((x, y) => {
    const n = hash(x, y);
    return [24 + n * 18, 82 + n * 42, 22 + n * 18];
  });
  const grassSide = createPixelTexture((x, y, s) => {
    const n = hash(x, y);
    if (y < s / 3) return [24 + n * 14, 76 + n * 36, 18 + n * 12];
    return [100 + n * 36, 70 + n * 26, 42 + n * 18];
  });
  const dirt = createPixelTexture((x, y) => {
    const n = hash(x, y);
    return [105 + n * 34, 70 + n * 24, 42 + n * 18];
  });
  const stone = createPixelTexture((x, y) => {
    const n = hash(x, y);
    const v = 86 + n * 50;
    return [v, v + 3, v + 7];
  });
  const andesite = createPixelTexture((x, y) => {
    const n = hash(x, y);
    const v = 105 + n * 42;
    return [v - 5, v, v + 5];
  });

  return {
    grass: [
      new THREE_NS.MeshLambertMaterial({ map: grassSide }),
      new THREE_NS.MeshLambertMaterial({ map: grassSide }),
      new THREE_NS.MeshLambertMaterial({ map: grassTop }),
      new THREE_NS.MeshLambertMaterial({ map: dirt }),
      new THREE_NS.MeshLambertMaterial({ map: grassSide }),
      new THREE_NS.MeshLambertMaterial({ map: grassSide })
    ],
    dirt: new THREE_NS.MeshLambertMaterial({ map: dirt }),
    stone: new THREE_NS.MeshLambertMaterial({ map: stone }),
    andesite: new THREE_NS.MeshLambertMaterial({ map: andesite }),
    lanternFrame: new THREE_NS.MeshLambertMaterial({ color: 0xc4a96b }),
    lanternPaper: new THREE_NS.MeshBasicMaterial({ map: createLanternTexture(), transparent: true, opacity: 0.9 }),
    lanternSign: new THREE_NS.MeshLambertMaterial({ color: 0x8b6914 }),
    lake: new THREE_NS.MeshBasicMaterial({
      color: 0x1f8fe8,
      transparent: true,
      opacity: 0.78,
      side: THREE_NS.DoubleSide,
      depthWrite: false,
      depthTest: false
    }),
    boatWood: new THREE_NS.MeshLambertMaterial({ color: 0x7b4a28 }),
    boatTrim: new THREE_NS.MeshLambertMaterial({ color: 0xd1ad73 })
  };
}

function buildScene() {
  scene.add(new THREE_NS.AmbientLight(0x2233aa, 0.65));

  const moonLight = new THREE_NS.DirectionalLight(0x99aadd, 1.1);
  moonLight.position.set(15, 40, -10);
  scene.add(moonLight);

  scene.add(new THREE_NS.HemisphereLight(0x1a2550, 0x0a1a0a, 0.38));

  setStatus("Building sky...");
  buildSky();
  setStatus("Building blocky mountains...");
  buildTerrain();
  setStatus("Filling the mountain lake...");
  buildLakeAndBoat();
  setStatus("Planting flowers and grass...");
  buildFlowers();
  setStatus("Growing rare flowers...");
  buildRareFlowers();
  setStatus("Waking fireflies...");
  buildFireflies();
  setStatus("Hanging lanterns...");
  buildLanterns();
}

function getHeight(x, z) {
  const key = `${Math.round(x)}:${Math.round(z)}`;
  if (WORLD.heightCache.has(key)) return WORLD.heightCache.get(key);

  const dist = Math.hypot(x, z);
  const valleyRadius = 20;
  const mountainStart = 24;
  let height = 0;

  if (dist < valleyRadius) {
    height = 0;
  } else if (dist < mountainStart) {
    height = Math.floor(((dist - valleyRadius) / (mountainStart - valleyRadius)) * 2);
  } else {
    const angle = Math.atan2(z, x);
    const noise1 = Math.sin(angle * 3.7 + 1.2) * 4;
    const noise2 = Math.cos(angle * 5.3 + 0.8) * 2.5;
    const noise3 = Math.sin(angle * 8.1 + 3.1) * 1.5;
    const baseHeight = (dist - mountainStart) * 0.9 + noise1 + noise2 + noise3;
    height = Math.floor(Math.min(baseHeight, 9 + noise1 + noise2));
  }

  WORLD.heightCache.set(key, height);
  return height;
}

function buildTerrain() {
  const size = WORLD.size;
  const maxBlocks = 42000;
  const box = new THREE_NS.BoxGeometry(1, 1, 1);
  const grass = new THREE_NS.InstancedMesh(box, materials.grass, maxBlocks);
  const dirt = new THREE_NS.InstancedMesh(box, materials.dirt, maxBlocks);
  const stone = new THREE_NS.InstancedMesh(box, materials.stone, maxBlocks);
  const andesite = new THREE_NS.InstancedMesh(box, materials.andesite, maxBlocks);
  let grassCount = 0;
  let dirtCount = 0;
  let stoneCount = 0;
  let andesiteCount = 0;
  const rand = seededRandom(42);

  for (let x = -size; x <= size; x += 1) {
    for (let z = -size; z <= size; z += 1) {
      const height = getHeight(x, z);
      for (let y = 0; y <= height; y += 1) {
        tempMatrix.setPosition(x, y - 0.5, z);
        if (y === height) {
          if (height <= 2 || rand() > 0.45) grass.setMatrixAt(grassCount++, tempMatrix);
          else stone.setMatrixAt(stoneCount++, tempMatrix);
        } else if (y >= height - 2) {
          if (rand() > 0.7) andesite.setMatrixAt(andesiteCount++, tempMatrix);
          else dirt.setMatrixAt(dirtCount++, tempMatrix);
        } else if (rand() > 0.3) {
          stone.setMatrixAt(stoneCount++, tempMatrix);
        } else {
          andesite.setMatrixAt(andesiteCount++, tempMatrix);
        }
      }
    }
  }

  grass.count = grassCount;
  dirt.count = dirtCount;
  stone.count = stoneCount;
  andesite.count = andesiteCount;
  [grass, dirt, stone, andesite].forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
  });
}

function buildLakeAndBoat() {
  const water = new THREE_NS.Mesh(
    new THREE_NS.RingGeometry(LAKE_INNER_RADIUS, LAKE_OUTER_RADIUS, 96),
    materials.lake
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = LAKE_Y;
  water.renderOrder = 4;
  scene.add(water);

  const glow = new THREE_NS.Mesh(
    new THREE_NS.RingGeometry(LAKE_INNER_RADIUS + 0.08, LAKE_OUTER_RADIUS - 0.08, 96),
    new THREE_NS.MeshBasicMaterial({
      color: 0x7ab6ff,
      transparent: true,
      opacity: 0.2,
      side: THREE_NS.DoubleSide,
      depthWrite: false,
      depthTest: false
    })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = LAKE_Y + 0.015;
  glow.renderOrder = 5;
  scene.add(glow);

  const depthShadow = new THREE_NS.Mesh(
    new THREE_NS.RingGeometry(LAKE_INNER_RADIUS + 0.25, LAKE_OUTER_RADIUS - 0.25, 96),
    new THREE_NS.MeshBasicMaterial({
      color: 0x052a55,
      transparent: true,
      opacity: 0.28,
      side: THREE_NS.DoubleSide,
      depthWrite: false,
      depthTest: false
    })
  );
  depthShadow.rotation.x = -Math.PI / 2;
  depthShadow.position.y = LAKE_Y - 0.24;
  depthShadow.renderOrder = 3;
  scene.add(depthShadow);

  buildLakeShoreline();

  state.boat = createRowboat();
  scene.add(state.boat.group);
  buildKoiFish();
}

function buildLakeShoreline() {
  const block = new THREE_NS.BoxGeometry(1, 0.18, 1);
  const inner = new THREE_NS.InstancedMesh(block, materials.grass, 180);
  const outer = new THREE_NS.InstancedMesh(block, materials.stone, 220);
  const mountainFoot = new THREE_NS.InstancedMesh(new THREE_NS.BoxGeometry(1, 0.55, 1), materials.grass, 420);
  let innerCount = 0;
  let outerCount = 0;
  let footCount = 0;

  for (let i = 0; i < 180; i += 1) {
    const angle = (i / 180) * Math.PI * 2;
    const radius = LAKE_INNER_RADIUS - 0.45 + Math.sin(i * 1.9) * 0.08;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    tempMatrix.setPosition(x, LAKE_Y + 0.02, z);
    inner.setMatrixAt(innerCount++, tempMatrix);
  }

  for (let i = 0; i < 220; i += 1) {
    const angle = (i / 220) * Math.PI * 2;
    const radius = LAKE_OUTER_RADIUS + 0.45 + Math.sin(i * 2.3) * 0.08;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    tempMatrix.setPosition(x, LAKE_Y + 0.08, z);
    outer.setMatrixAt(outerCount++, tempMatrix);
  }

  for (let ring = 0; ring < 3; ring += 1) {
    const samples = 132 + ring * 18;
    const radius = LAKE_OUTER_RADIUS + 1.0 + ring * 0.82;
    for (let i = 0; i < samples; i += 1) {
      const angle = (i / samples) * Math.PI * 2;
      const wobble = Math.sin(i * 1.3 + ring * 2.1) * 0.12;
      const x = Math.cos(angle) * (radius + wobble);
      const z = Math.sin(angle) * (radius + wobble);
      tempMatrix.setPosition(x, getHeight(x, z) + 0.02, z);
      mountainFoot.setMatrixAt(footCount++, tempMatrix);
    }
  }

  inner.count = innerCount;
  outer.count = outerCount;
  mountainFoot.count = footCount;
  inner.instanceMatrix.needsUpdate = true;
  outer.instanceMatrix.needsUpdate = true;
  mountainFoot.instanceMatrix.needsUpdate = true;
  scene.add(inner, outer, mountainFoot);
}

function createRowboat() {
  const group = new THREE_NS.Group();
  const hull = new THREE_NS.Mesh(new THREE_NS.BoxGeometry(1.45, 0.38, 3.05), materials.boatWood);
  hull.position.y = 0.22;
  group.add(hull);

  const bow = new THREE_NS.Mesh(new THREE_NS.BoxGeometry(0.95, 0.34, 0.48), materials.boatWood);
  bow.position.set(0, 0.25, -1.68);
  bow.rotation.x = 0.28;
  group.add(bow);

  const stern = bow.clone();
  stern.position.z = 1.68;
  stern.rotation.x = -0.28;
  group.add(stern);

  for (const z of [-0.55, 0.55]) {
    const seat = new THREE_NS.Mesh(new THREE_NS.BoxGeometry(1.12, 0.09, 0.28), materials.boatTrim);
    seat.position.set(0, 0.48, z);
    group.add(seat);
  }

  const leftOar = new THREE_NS.Mesh(new THREE_NS.BoxGeometry(0.09, 0.07, 2.75), materials.boatTrim);
  leftOar.position.set(-1.08, 0.48, 0);
  leftOar.rotation.y = 0.95;
  group.add(leftOar);

  const rightOar = leftOar.clone();
  rightOar.position.x = 0.9;
  rightOar.rotation.y = -0.95;
  group.add(rightOar);

  return {
    group,
    angle: Math.PI / 2,
    radius: (LAKE_INNER_RADIUS + LAKE_OUTER_RADIUS) * 0.5,
    speed: 0.045,
    bobPhase: 1.7
  };
}

function createFlowerTexture(flower) {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  const [sr, sg, sb] = flower.stem;
  ctx.fillStyle = `rgb(${sr},${sg},${sb})`;
  ctx.fillRect(7, 14, 2, 18);
  ctx.fillRect(5, 20, 3, 2);
  ctx.fillRect(9, 24, 3, 2);
  const [gr, gg, gb] = flower.glow;
  ctx.fillStyle = `rgba(${gr},${gg},${gb},0.3)`;
  ctx.fillRect(1, 1, 14, 14);
  const [pr, pg, pb] = flower.petal;
  ctx.fillStyle = `rgb(${pr},${pg},${pb})`;
  ctx.fillRect(3, 3, 10, 10);
  ctx.fillStyle = `rgb(${Math.min(255, pr + 40)},${Math.min(255, pg + 40)},${Math.min(255, pb + 20)})`;
  ctx.fillRect(5, 5, 6, 6);
  ctx.fillStyle = `rgb(${gr},${gg},${gb})`;
  ctx.fillRect(4, 4, 2, 2);
  ctx.fillRect(10, 4, 2, 2);
  ctx.fillRect(4, 10, 2, 2);
  ctx.fillRect(10, 10, 2, 2);
  const tex = new THREE_NS.CanvasTexture(canvas);
  tex.magFilter = THREE_NS.NearestFilter;
  tex.minFilter = THREE_NS.NearestFilter;
  tex.colorSpace = THREE_NS.SRGBColorSpace;
  return tex;
}

function getFlowerTexture(index) {
  if (!flowerTextureCache[index]) flowerTextureCache[index] = createFlowerTexture(flowerTypes[index]);
  return flowerTextureCache[index];
}

function getGrassTexture() {
  if (grassTexture) return grassTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 24;
  const ctx = canvas.getContext("2d");
  const colors = ["#1e6b18", "#237a1c", "#198514", "#2a7d20"];
  const drawBlade = (x, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, 16, 2, 8);
    ctx.fillRect(x, 10, 2, 8);
    ctx.fillRect(x + 1, 5, 1, 6);
  };
  drawBlade(0, colors[0]);
  drawBlade(3, colors[2]);
  drawBlade(5, colors[1]);
  grassTexture = new THREE_NS.CanvasTexture(canvas);
  grassTexture.magFilter = THREE_NS.NearestFilter;
  grassTexture.minFilter = THREE_NS.NearestFilter;
  return grassTexture;
}

function buildFlowers() {
  const rand = seededRandom(123);
  const flowerCount = isMobile ? 620 : 950;
  const grassCount = isMobile ? 700 : 1100;
  for (let i = 0; i < flowerCount; i += 1) {
    const slope = i > flowerCount * 0.65;
    const angle = rand() * Math.PI * 2;
    const dist = slope ? 20 + rand() * 17 : Math.sqrt(rand()) * 19;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    spawnFlower(rand, x, getHeight(x, z) + 0.5, z);
  }

  const grassTex = getGrassTexture();
  for (let i = 0; i < grassCount; i += 1) {
    const slope = i > grassCount * 0.7;
    const angle = rand() * Math.PI * 2;
    const dist = slope ? 20 + rand() * 15 : Math.pow(rand(), 0.4) * 19;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    const mat = new THREE_NS.SpriteMaterial({ map: grassTex, transparent: true, alphaTest: 0.1 });
    const sprite = new THREE_NS.Sprite(mat);
    sprite.scale.set(0.4, 0.7, 0.4);
    sprite.position.set(x, getHeight(x, z) + 0.35, z);
    sprite.userData.baseX = x;
    sprite.userData.baseZ = z;
    sprite.userData.phase = rand() * Math.PI * 2;
    vegetation.push(sprite);
    scene.add(sprite);
  }
}

function spawnFlower(rand, x, y, z) {
  const typeIndex = Math.floor(rand() * flowerTypes.length);
  const mat = new THREE_NS.SpriteMaterial({ map: getFlowerTexture(typeIndex), transparent: true, alphaTest: 0.1 });
  const sprite = new THREE_NS.Sprite(mat);
  sprite.scale.set(0.6, 1.0, 0.6);
  sprite.position.set(x, y, z);
  sprite.userData.baseX = x;
  sprite.userData.baseZ = z;
  sprite.userData.phase = rand() * Math.PI * 2;
  vegetation.push(sprite);
  scene.add(sprite);

  if (rand() > 0.9) {
    const [r, g, b] = flowerTypes[typeIndex].glow;
    const light = new THREE_NS.PointLight(new THREE_NS.Color(r / 255, g / 255, b / 255), 0.2, 4, 2);
    light.position.set(x, y + 0.2, z);
    scene.add(light);
  }
}

function buildRareFlowers() {
  const rare = [
    { angle: 0.18, color: [255, 255, 255], glow: 0xdff7ff },
    { angle: 1.36, color: [255, 115, 210], glow: 0xff83e0 },
    { angle: 2.58, color: [120, 210, 255], glow: 0x86dcff },
    { angle: 3.85, color: [255, 236, 92], glow: 0xffeb7a },
    { angle: 5.08, color: [170, 110, 255], glow: 0xb889ff }
  ];

  rare.forEach((flower, index) => {
    const radius = 19.2 + (index % 2) * 0.7;
    const x = Math.cos(flower.angle) * radius;
    const z = Math.sin(flower.angle) * radius;
    const sprite = createRareFlowerSprite(flower.color);
    sprite.position.set(x, getHeight(x, z) + 0.75, z);
    sprite.scale.set(1.05, 1.65, 1.05);
    sprite.userData.baseX = x;
    sprite.userData.baseZ = z;
    sprite.userData.phase = index * 1.37;
    rareFlowers.push(sprite);
    vegetation.push(sprite);
    scene.add(sprite);

    const light = new THREE_NS.PointLight(flower.glow, 0.85, 8, 2);
    light.position.set(x, sprite.position.y + 0.7, z);
    scene.add(light);
  });
}

function createRareFlowerSprite(color) {
  const canvas = document.createElement("canvas");
  canvas.width = 24;
  canvas.height = 40;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#286b28";
  ctx.fillRect(11, 16, 3, 24);
  ctx.fillRect(7, 27, 5, 2);
  ctx.fillRect(14, 31, 5, 2);
  const [r, g, b] = color;
  ctx.fillStyle = `rgba(${r},${g},${b},0.22)`;
  ctx.fillRect(1, 1, 22, 22);
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(7, 4, 10, 16);
  ctx.fillRect(4, 7, 16, 10);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(10, 9, 5, 5);
  const texture = new THREE_NS.CanvasTexture(canvas);
  texture.magFilter = THREE_NS.NearestFilter;
  texture.minFilter = THREE_NS.NearestFilter;
  texture.colorSpace = THREE_NS.SRGBColorSpace;
  return new THREE_NS.Sprite(new THREE_NS.SpriteMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.1
  }));
}

function createGlowTexture(size = 32) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,250,190,1)");
  gradient.addColorStop(0.22, "rgba(255,220,90,0.82)");
  gradient.addColorStop(0.58, "rgba(180,255,150,0.24)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE_NS.CanvasTexture(canvas);
  texture.colorSpace = THREE_NS.SRGBColorSpace;
  texture.magFilter = THREE_NS.LinearFilter;
  texture.minFilter = THREE_NS.LinearFilter;
  return texture;
}

function buildFireflies() {
  const rand = seededRandom(314);
  const count = isMobile ? 55 : 95;
  const texture = createGlowTexture();
  for (let i = 0; i < count; i += 1) {
    const angle = rand() * Math.PI * 2;
    const dist = 4 + rand() * 24;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    const sprite = new THREE_NS.Sprite(new THREE_NS.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      opacity: 0.72,
      blending: THREE_NS.AdditiveBlending
    }));
    sprite.scale.setScalar(0.18 + rand() * 0.2);
    sprite.position.set(x, getHeight(x, z) + 1.2 + rand() * 4.4, z);
    sprite.userData.base = sprite.position.clone();
    sprite.userData.phase = rand() * Math.PI * 2;
    sprite.userData.speed = 0.35 + rand() * 0.55;
    sprite.userData.radius = 0.35 + rand() * 0.95;
    fireflies.push(sprite);
    scene.add(sprite);
  }
}

function createKoiTexture(colors) {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 16;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 32, 16);
  ctx.fillStyle = colors.body;
  ctx.fillRect(8, 5, 17, 6);
  ctx.fillRect(11, 3, 10, 10);
  ctx.fillStyle = colors.spot;
  ctx.fillRect(12, 4, 5, 4);
  ctx.fillRect(20, 8, 4, 3);
  ctx.fillStyle = colors.tail;
  ctx.fillRect(3, 3, 6, 4);
  ctx.fillRect(3, 9, 6, 4);
  ctx.fillStyle = "#0b1118";
  ctx.fillRect(24, 6, 2, 2);
  const texture = new THREE_NS.CanvasTexture(canvas);
  texture.magFilter = THREE_NS.NearestFilter;
  texture.minFilter = THREE_NS.NearestFilter;
  texture.colorSpace = THREE_NS.SRGBColorSpace;
  return texture;
}

function buildKoiFish() {
  const palettes = [
    { body: "#fff7e6", spot: "#e94a2f", tail: "#fff7e6" },
    { body: "#f4f0dc", spot: "#202020", tail: "#e94a2f" },
    { body: "#ffd880", spot: "#f06b32", tail: "#fff3c4" },
    { body: "#ffffff", spot: "#f06b32", tail: "#ffffff" }
  ];
  const geo = new THREE_NS.PlaneGeometry(1.45, 0.68);
  const rand = seededRandom(515);
  const count = 20;
  for (let i = 0; i < count; i += 1) {
    const mat = new THREE_NS.MeshBasicMaterial({
      map: createKoiTexture(palettes[i % palettes.length]),
      transparent: true,
      side: THREE_NS.DoubleSide,
      depthWrite: false,
      depthTest: false
    });
    const mesh = new THREE_NS.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 7;
    const angle = rand() * Math.PI * 2;
    const radius = LAKE_INNER_RADIUS + 0.7 + rand() * (LAKE_OUTER_RADIUS - LAKE_INNER_RADIUS - 1.4);
    koiFish.push({
      mesh,
      angle,
      radius,
      speed: 0.42 + rand() * 0.18,
      phase: rand() * Math.PI * 2
    });
    scene.add(mesh);
  }
}

function createLanternTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fffaf0";
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = "#fff8e0";
  ctx.fillRect(2, 2, 12, 12);
  ctx.fillStyle = "#fff5cc";
  ctx.fillRect(4, 4, 8, 8);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(6, 6, 4, 4);
  ctx.fillStyle = "#c4a96b";
  ctx.fillRect(0, 0, 16, 1);
  ctx.fillRect(0, 15, 16, 1);
  ctx.fillRect(0, 0, 1, 16);
  ctx.fillRect(15, 0, 1, 16);
  ctx.fillRect(0, 7, 16, 2);
  ctx.fillRect(7, 0, 2, 16);
  const tex = new THREE_NS.CanvasTexture(canvas);
  tex.magFilter = THREE_NS.NearestFilter;
  tex.minFilter = THREE_NS.NearestFilter;
  tex.colorSpace = THREE_NS.SRGBColorSpace;
  return tex;
}

function buildLanterns() {
  const rand = seededRandom(77);
  const positions = [];

  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + rand() * 0.5;
    const dist = 3 + rand() * 8;
    positions.push({ x: Math.cos(angle) * dist, y: 3 + rand() * 2, z: Math.sin(angle) * dist });
  }
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2 + rand() * 0.8;
    const dist = 8 + rand() * 10;
    positions.push({ x: Math.cos(angle) * dist, y: 5 + rand() * 3, z: Math.sin(angle) * dist });
  }
  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * Math.PI * 2 + rand() * 0.6;
    const dist = 16 + rand() * 8;
    positions.push({ x: Math.cos(angle) * dist, y: 8 + rand() * 4, z: Math.sin(angle) * dist });
  }

  positions.forEach((pos, i) => {
    const lantern = createLantern(pos, rand() * Math.PI * 2 + i * 0.7, MESSAGES[i % MESSAGES.length]);
    lanterns.push(lantern);
    scene.add(lantern.group);
    scene.add(lantern.light);
  });
}

function createLantern(pos, phase, message) {
  const group = new THREE_NS.Group();
  const body = new THREE_NS.Mesh(new THREE_NS.BoxGeometry(0.7, 0.9, 0.7), materials.lanternPaper);
  group.add(body);

  const capTop = new THREE_NS.Mesh(new THREE_NS.BoxGeometry(0.45, 0.12, 0.45), materials.lanternFrame);
  capTop.position.y = 0.51;
  group.add(capTop);

  const capBottom = new THREE_NS.Mesh(new THREE_NS.BoxGeometry(0.45, 0.1, 0.45), materials.lanternFrame);
  capBottom.position.y = -0.5;
  group.add(capBottom);

  const rope = new THREE_NS.Mesh(new THREE_NS.BoxGeometry(0.04, 0.3, 0.04), new THREE_NS.MeshLambertMaterial({ color: 0x5a4020 }));
  rope.position.y = -0.7;
  group.add(rope);

  const sign = new THREE_NS.Mesh(new THREE_NS.BoxGeometry(0.7, 0.35, 0.08), materials.lanternSign);
  sign.position.y = -1.02;
  group.add(sign);

  group.position.set(pos.x, pos.y, pos.z);
  const light = new THREE_NS.PointLight(0xffcc66, 1.7, 12, 1.5);
  light.position.copy(group.position);
  return {
    group,
    light,
    base: new THREE_NS.Vector3(pos.x, pos.y, pos.z),
    phase,
    message,
    approachTarget: new THREE_NS.Vector3(),
    isApproaching: false
  };
}

function buildSky() {
  const starCount = 450;
  const geo = new THREE_NS.BufferGeometry();
  const positions = new Float32Array(starCount * 3);
  const rand = seededRandom(9);
  for (let i = 0; i < starCount; i += 1) {
    const theta = rand() * Math.PI * 2;
    const phi = rand() * Math.PI * 0.5 + 0.1;
    const r = 80;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi) + 10;
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  geo.setAttribute("position", new THREE_NS.BufferAttribute(positions, 3));

  const starCanvas = document.createElement("canvas");
  starCanvas.width = 4;
  starCanvas.height = 4;
  const starCtx = starCanvas.getContext("2d");
  starCtx.fillStyle = "#ffffff";
  starCtx.fillRect(0, 0, 4, 4);
  const starTex = new THREE_NS.CanvasTexture(starCanvas);
  starTex.magFilter = THREE_NS.NearestFilter;

  scene.add(new THREE_NS.Points(geo, new THREE_NS.PointsMaterial({
    map: starTex,
    color: 0xffffff,
    size: 1,
    transparent: true,
    opacity: 0.85,
    depthWrite: false
  })));

  const moonCanvas = document.createElement("canvas");
  moonCanvas.width = 32;
  moonCanvas.height = 32;
  const ctx = moonCanvas.getContext("2d");
  for (let y = 0; y < 32; y += 1) {
    for (let x = 0; x < 32; x += 1) {
      const dx = x - 16;
      const dy = y - 16;
      if (Math.hypot(dx, dy) < 13) {
        const crater = Math.hypot(dx - 3, dy + 2) < 3 || Math.hypot(dx + 5, dy - 4) < 2.5;
        ctx.fillStyle = crater ? "#bbc4d4" : "#dde4f0";
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  const moonTex = new THREE_NS.CanvasTexture(moonCanvas);
  moonTex.magFilter = THREE_NS.NearestFilter;
  moonTex.minFilter = THREE_NS.NearestFilter;
  const moon = new THREE_NS.Sprite(new THREE_NS.SpriteMaterial({ map: moonTex, transparent: true }));
  moon.scale.set(12, 12, 1);
  moon.position.copy(MOON_POSITION);
  scene.add(moon);

  state.moonLoveText = createMoonLoveText();
  state.moonLoveText.position.set(MOON_POSITION.x + 14, MOON_POSITION.y + 1, MOON_POSITION.z);
  state.moonLoveText.visible = false;
  scene.add(state.moonLoveText);

  state.constellationGroup = createConstellationMessage();
  state.constellationGroup.position.set(MOON_POSITION.x - 22, MOON_POSITION.y - 2, MOON_POSITION.z + 6);
  state.constellationGroup.visible = false;
  scene.add(state.constellationGroup);
}

function createMoonLoveText() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "bold 54px ui-monospace, Menlo, Consolas, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fillText("I LOVE YOU", 258, 66);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("I LOVE YOU", 256, 64);

  const texture = new THREE_NS.CanvasTexture(canvas);
  texture.colorSpace = THREE_NS.SRGBColorSpace;
  texture.magFilter = THREE_NS.LinearFilter;
  texture.minFilter = THREE_NS.LinearFilter;

  const sprite = new THREE_NS.Sprite(new THREE_NS.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false
  }));
  sprite.scale.set(18, 4.5, 1);
  return sprite;
}

function createConstellationMessage() {
  const group = new THREE_NS.Group();
  const starTexture = createGlowTexture(24);
  const starMaterial = new THREE_NS.SpriteMaterial({
    map: starTexture,
    color: 0xeaf4ff,
    transparent: true,
    depthWrite: false,
    opacity: 0.95,
    blending: THREE_NS.AdditiveBlending
  });

  const heart = [
    [-5, 1.8], [-4, 3], [-2.7, 3.3], [-1.7, 2.4], [0, 1.1],
    [1.7, 2.4], [2.7, 3.3], [4, 3], [5, 1.8],
    [4.2, 0.2], [2.6, -1.4], [1.2, -2.8], [0, -3.8],
    [-1.2, -2.8], [-2.6, -1.4], [-4.2, 0.2]
  ];

  for (let i = 0; i < heart.length; i += 1) {
    const star = new THREE_NS.Sprite(starMaterial.clone());
    star.position.set(heart[i][0] * 0.65, heart[i][1] * 0.65 + 1.4, 0);
    star.scale.setScalar(i % 4 === 0 ? 0.75 : 0.52);
    star.userData.phase = i * 0.51;
    group.add(star);
  }

  const lines = new THREE_NS.BufferGeometry();
  const linePoints = [];
  for (const point of heart) {
    linePoints.push(point[0] * 0.65, point[1] * 0.65 + 1.4, -0.03);
  }
  linePoints.push(heart[0][0] * 0.65, heart[0][1] * 0.65 + 1.4, -0.03);
  lines.setAttribute("position", new THREE_NS.Float32BufferAttribute(linePoints, 3));
  group.add(new THREE_NS.Line(lines, new THREE_NS.LineBasicMaterial({
    color: 0xdcecff,
    transparent: true,
    opacity: 0.34
  })));

  const textCanvas = document.createElement("canvas");
  textCanvas.width = 512;
  textCanvas.height = 128;
  const ctx = textCanvas.getContext("2d");
  ctx.font = "bold 46px ui-monospace, Menlo, Consolas, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("I LOVE YOU", 256, 64);
  const textTexture = new THREE_NS.CanvasTexture(textCanvas);
  textTexture.colorSpace = THREE_NS.SRGBColorSpace;
  const text = new THREE_NS.Sprite(new THREE_NS.SpriteMaterial({
    map: textTexture,
    transparent: true,
    depthWrite: false
  }));
  text.position.set(0, -3.8, 0);
  text.scale.set(11, 2.75, 1);
  group.add(text);

  return group;
}

function setupControls() {
  if (!isMobile) {
    renderer.domElement.addEventListener("click", () => {
      if (state.overview) {
        enterFirstPerson();
        setStatus("First-person mode. WASD/ZQSD to move. Aim at lanterns and click.");
      }
      if (!document.pointerLockElement) {
        renderer.domElement.requestPointerLock();
        return;
      }
      interactWithWorld();
    });
    document.addEventListener("pointerlockchange", () => {
      state.pointerLocked = document.pointerLockElement === renderer.domElement;
      ui.helpText.textContent = state.pointerLocked
        ? "WASD/ZQSD to move. Aim at a lantern and click."
        : "Click to enter. WASD/ZQSD to move. Aim and click glowing lanterns.";
    });
    document.addEventListener("mousemove", (event) => {
      if (!state.pointerLocked) return;
      state.yaw -= event.movementX * 0.002;
      state.pitch -= event.movementY * 0.002;
      state.pitch = THREE_NS.MathUtils.clamp(state.pitch, -Math.PI / 2.5, Math.PI / 2.5);
      updateCameraRotation();
    });
  } else {
    setupMobileControls();
  }

  window.addEventListener("keydown", (event) => {
    state.keys.add(event.key.toLowerCase());
    if (event.key === "Escape" && state.activeMessage) closeMessage();
  });
  window.addEventListener("keyup", (event) => state.keys.delete(event.key.toLowerCase()));
  window.addEventListener("resize", onResize);
}

function setupMobileControls() {
  let lookX = 0;
  let lookY = 0;
  renderer.domElement.addEventListener("touchstart", (event) => {
    if (state.overview) {
      enterFirstPerson();
      setStatus("Mobile first-person mode. Left side moves, right side looks.");
    }
    for (const touch of event.changedTouches) {
      if (touch.clientX < window.innerWidth * 0.38 && state.joystickTouchId === null) {
        state.joystickTouchId = touch.identifier;
        updateJoystick(touch);
      } else if (state.lookTouchId === null) {
        state.lookTouchId = touch.identifier;
        lookX = touch.clientX;
        lookY = touch.clientY;
        state.lookStartX = touch.clientX;
        state.lookStartY = touch.clientY;
      }
    }
  }, { passive: true });

  renderer.domElement.addEventListener("touchmove", (event) => {
    for (const touch of event.changedTouches) {
      if (touch.identifier === state.joystickTouchId) {
        updateJoystick(touch);
      } else if (touch.identifier === state.lookTouchId) {
        const dx = touch.clientX - lookX;
        const dy = touch.clientY - lookY;
        lookX = touch.clientX;
        lookY = touch.clientY;
        state.yaw -= dx * 0.004;
        state.pitch -= dy * 0.003;
        state.pitch = THREE_NS.MathUtils.clamp(state.pitch, -Math.PI / 2.5, Math.PI / 2.5);
        updateCameraRotation();
      }
    }
    event.preventDefault();
  }, { passive: false });

  renderer.domElement.addEventListener("touchend", clearTouch);
  renderer.domElement.addEventListener("touchcancel", clearTouch);
}

function clearTouch(event) {
  for (const touch of event.changedTouches) {
    if (touch.identifier === state.joystickTouchId) {
      state.joystickTouchId = null;
      state.joystick.set(0, 0);
      if (ui.joystickKnob) ui.joystickKnob.style.transform = "translate(0px, 0px)";
    } else if (touch.identifier === state.lookTouchId) {
      const drag = Math.hypot(touch.clientX - state.lookStartX, touch.clientY - state.lookStartY);
      state.lookTouchId = null;
      if (drag < 12) interactWithWorld();
    }
  }
}

function updateJoystick(touch) {
  const x = THREE_NS.MathUtils.clamp((touch.clientX / (window.innerWidth * 0.38)) * 2 - 1, -1, 1);
  const y = THREE_NS.MathUtils.clamp((touch.clientY / window.innerHeight) * 2 - 1, -1, 1);
  state.joystick.set(x, y);
  if (ui.joystickKnob) {
    ui.joystickKnob.style.transform = `translate(${x * 34}px, ${y * 34}px)`;
  }
}

function setupMessageUi() {
  ui.closeMessage.addEventListener("click", closeMessage);
  ui.messageOverlay.addEventListener("click", closeMessage);
  document.getElementById("messageCard").addEventListener("click", (event) => event.stopPropagation());
  if (ui.musicButton) {
    let lastMusicPress = 0;
    const handleMusicPress = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const now = performance.now();
      if (now - lastMusicPress < 450) return;
      lastMusicPress = now;
      toggleMusic();
    };
    if (window.PointerEvent) {
      ui.musicButton.addEventListener("pointerup", handleMusicPress);
    } else {
      ui.musicButton.addEventListener("touchend", handleMusicPress, { passive: false });
      ui.musicButton.addEventListener("click", handleMusicPress);
    }
  }
}

function toggleMusic() {
  if (!state.music) {
    state.music = createSoftMusic();
  }

  if (state.music.playing) {
    state.music.stop();
    ui.musicButton.classList.remove("on");
    ui.musicButton.textContent = "Music";
  } else {
    state.music.start();
    ui.musicButton.classList.add("on");
    ui.musicButton.textContent = "On";
  }
}

function createSoftMusic() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    setStatus("Audio is not supported in this browser.");
    return { playing: false, start() { }, stop() { } };
  }

  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = isMobile ? 0.28 : 0.16;
  master.connect(context.destination);

  let playing = false;
  let timers = [];
  let startedAt = 0;
  const scale = [0, 2, 4, 7, 9, 12, 14, 16];
  const melody = [4, 5, 7, 5, 4, 2, 0, 2, 4, 7, 9, 7, 5, 4, 2, 0];
  const bass = [0, -5, -3, -7];

  function noteToFreq(semitone, octaveOffset = 0) {
    return 220 * Math.pow(2, (semitone + octaveOffset * 12) / 12);
  }

  function schedulePluck(time, freq, duration, gainValue) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, time);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1800, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(gainValue, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start(time);
    osc.stop(time + duration + 0.05);
  }

  function playStartChime(time) {
    [0, 7, 12].forEach((interval, index) => {
      schedulePluck(time + index * 0.08, noteToFreq(interval, 2), 1.25, isMobile ? 0.16 : 0.085);
    });
  }

  function schedulePad(time, root) {
    [0, 7, 12].forEach((interval) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(noteToFreq(root + interval, -1), time);
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(0.018, time + 1.4);
      gain.gain.linearRampToValueAtTime(0.0001, time + 7.8);
      osc.connect(gain);
      gain.connect(master);
      osc.start(time);
      osc.stop(time + 8.1);
    });
  }

  function scheduleLoop() {
    if (!playing) return;
    const now = context.currentTime;
    const baseTime = Math.max(now + 0.08, startedAt);
    for (let bar = 0; bar < 4; bar += 1) {
      const root = bass[bar % bass.length];
      schedulePad(baseTime + bar * 4, root);
      for (let step = 0; step < 4; step += 1) {
        const t = baseTime + bar * 4 + step;
        const note = scale[(bar + step) % scale.length] + root;
        schedulePluck(t, noteToFreq(note, 1), 1.6, 0.035);
      }
    }
    for (let i = 0; i < melody.length; i += 1) {
      const note = melody[i];
      schedulePluck(baseTime + i, noteToFreq(note, 2), 1.1, i % 4 === 0 ? 0.032 : 0.022);
    }
    startedAt = baseTime + 16;
    timers.push(setTimeout(scheduleLoop, 15000));
  }

  return {
    get playing() {
      return playing;
    },
    start() {
      context.resume().then(() => {
        playing = true;
        startedAt = context.currentTime + 0.1;
        playStartChime(context.currentTime + 0.03);
        scheduleLoop();
        setStatus("Music on.");
      }).catch(() => {
        setStatus("Tap Music again to unlock phone audio.");
      });
    },
    stop() {
      playing = false;
      timers.forEach((timer) => clearTimeout(timer));
      timers = [];
      setStatus("Music off.");
    }
  };
}

function updateCameraRotation() {
  camera.rotation.order = "YXZ";
  camera.rotation.x = state.pitch;
  camera.rotation.y = state.yaw;
  camera.rotation.z = 0;
}

function setOverviewCamera() {
  state.overview = true;
  camera.position.set(0, 18, 27);
  camera.lookAt(0, 1.5, 0);
}

function enterFirstPerson() {
  state.overview = false;
  camera.position.set(0, WORLD.eyeHeight, 6);
  state.yaw = 0;
  state.pitch = 0;
  camera.rotation.set(0, 0, 0, "YXZ");
  updateCameraRotation();
}

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.033);
  const elapsed = clock.getElapsedTime();

  // Événement anniversaire
  if (window.BirthdayEvent && window.BirthdayEvent.isActive()) {
    window.BirthdayEvent.update(delta, elapsed);
    return;
  }

  // Logique normale du jeu
  updateBoat(delta, elapsed);
  updatePlayer();
  updateTargeting();
  updateMoonGaze();
  updateConstellation(delta, elapsed);
  updateVegetation(elapsed);
  updateFireflies(elapsed);
  updateKoiFish(elapsed);
  updateLanterns(elapsed);

  renderer.render(scene, camera);
}



function updatePlayer() {
  if (state.overview) {
    const time = clock.getElapsedTime();
    camera.position.x = Math.sin(time * 0.18) * 20;
    camera.position.z = 27 + Math.cos(time * 0.18) * 7;
    camera.position.y = 17 + Math.sin(time * 0.12) * 2;
    camera.lookAt(0, 1.5, 0);
    return;
  }

  if (state.onBoat && state.boat) {
    const boat = state.boat.group;
    camera.position.set(boat.position.x, boat.position.y + 1.25, boat.position.z);
    return;
  }

  const inputX =
    (state.keys.has("d") || state.keys.has("arrowright") ? 1 : 0) -
    (state.keys.has("a") || state.keys.has("q") || state.keys.has("arrowleft") ? 1 : 0) +
    state.joystick.x;
  const inputZ =
    (state.keys.has("s") || state.keys.has("arrowdown") ? 1 : 0) -
    (state.keys.has("w") || state.keys.has("z") || state.keys.has("arrowup") ? 1 : 0) +
    state.joystick.y;
  const yawOnly = new THREE_NS.Euler(0, state.yaw, 0);
  const direction = new THREE_NS.Vector3(inputX, 0, inputZ);
  if (direction.lengthSq() > 0.001) {
    direction.normalize().applyEuler(yawOnly);
    camera.position.addScaledVector(direction,  * (isMobile ? 4.2 : 5.2));
  }
  const radius = Math.hypot(camera.position.x, camera.position.z);
  if (radius > WORLD.walkLimit) {
    camera.position.x *= WORLD.walkLimit / radius;
    camera.position.z *= WORLD.walkLimit / radius;
  }
  const groundY = getHeight(camera.position.x, camera.position.z);
  const lakeDepth = getLakeDepthAt(camera.position.x, camera.position.z);
  camera.position.y = groundY + WORLD.eyeHeight - lakeDepth;
}

function getLakeDepthAt(x, z) {
  const radius = Math.hypot(x, z);
  if (radius < LAKE_INNER_RADIUS || radius > LAKE_OUTER_RADIUS) return 0;
  const center = (LAKE_INNER_RADIUS + LAKE_OUTER_RADIUS) * 0.5;
  const halfWidth = (LAKE_OUTER_RADIUS - LAKE_INNER_RADIUS) * 0.5;
  const t = 1 - Math.min(1, Math.abs(radius - center) / halfWidth);
  return 0.72 * t;
}

function updateBoat(delta, time) {
  if (!state.boat) return;
  const boat = state.boat;
  boat.angle += delta * boat.speed;
  const x = Math.cos(boat.angle) * boat.radius;
  const z = Math.sin(boat.angle) * boat.radius;
  boat.group.position.set(x, LAKE_Y + 0.26 + Math.sin(time * 1.25 + boat.bobPhase) * 0.045, z);
  boat.group.rotation.y = -boat.angle + Math.PI / 2;
  boat.group.rotation.z = Math.sin(time * 1.1 + boat.bobPhase) * 0.025;
}

function updateVegetation(time) {
  for (const item of vegetation) {
    const windX = Math.sin(time * 1.2 + item.userData.phase) * 0.06 +
      Math.sin(time * 2.3 + item.userData.phase * 1.5) * 0.025;
    const windZ = Math.cos(time * 1.1 + item.userData.phase * 0.8) * 0.03;
    item.position.x = item.userData.baseX + windX;
    item.position.z = item.userData.baseZ + windZ;
  }
}

function updateFireflies(time) {
  for (const fly of fireflies) {
    const phase = fly.userData.phase;
    const radius = fly.userData.radius;
    const speed = fly.userData.speed;
    const base = fly.userData.base;
    fly.position.x = base.x + Math.sin(time * speed + phase) * radius;
    fly.position.y = base.y + Math.sin(time * speed * 1.7 + phase * 0.8) * 0.42;
    fly.position.z = base.z + Math.cos(time * speed * 0.9 + phase) * radius;
    fly.material.opacity = 0.35 + (Math.sin(time * 2.3 + phase) * 0.5 + 0.5) * 0.55;
  }
}

function updateKoiFish(time) {
  for (const koi of koiFish) {
    koi.angle += koi.speed * 0.016;
    const wiggle = Math.sin(time * 1.6 + koi.phase) * 0.18;
    const radius = koi.radius + wiggle;
    koi.mesh.position.set(
      Math.cos(koi.angle) * radius,
      LAKE_Y + 0.095,
      Math.sin(koi.angle) * radius
    );
    koi.mesh.rotation.z = -koi.angle - Math.PI / 2 + Math.sin(time * 3 + koi.phase) * 0.18;
  }
}

function updateLanterns(time) {
  for (const lantern of lanterns) {
    if (lantern.isApproaching) {
      lantern.group.position.lerp(lantern.approachTarget, 0.04);
    } else {
      lantern.group.position.y = lantern.base.y + Math.sin(time * 0.8 + lantern.phase) * 0.18;
      lantern.group.position.x = lantern.base.x;
      lantern.group.position.z = lantern.base.z;
    }
    lantern.group.rotation.y = Math.sin(time * 0.3 + lantern.phase) * 0.08;
    lantern.light.position.copy(lantern.group.position);
    lantern.light.intensity = (state.highlightedLantern === lantern ? 2.4 : 1.6) + Math.sin(time * 2.1 + lantern.phase) * 0.25;
  }
}

function updateTargeting() {
  if (state.activeMessage || (!isMobile && !state.pointerLocked)) {
    setHighlightedLantern(null);
    return;
  }
  setHighlightedLantern(findLanternInView());
}

function updateMoonGaze() {
  if (!state.moonLoveText || state.moonLoveRevealed || state.overview) return;

  const cameraDirection = new THREE_NS.Vector3();
  const moonDirection = new THREE_NS.Vector3();
  camera.getWorldDirection(cameraDirection);
  moonDirection.subVectors(MOON_POSITION, camera.position).normalize();

  const lookingAtMoon = cameraDirection.dot(moonDirection) > 0.992;
  if (!lookingAtMoon) return;

  state.moonLookSeconds += delta;
  if (state.moonLookSeconds >= MOON_GAZE_SECONDS) {
    state.moonLoveRevealed = true;
    state.moonLoveText.visible = true;
  }
}

function updateConstellation(delta, time) {
  if (!state.constellationGroup || state.overview) return;

  const cameraDirection = new THREE_NS.Vector3();
  camera.getWorldDirection(cameraDirection);
  const lookingHigh = cameraDirection.y > 0.52;

  if (!state.constellationRevealed && lookingHigh) {
    state.constellationLookSeconds += delta; if (state.constellationLookSeconds >= CONSTELLATION_GAZE_SECONDS) {
      state.constellationRevealed = true;
      state.constellationGroup.visible = true;
    }
  }

  if (!state.constellationGroup.visible) return;
  state.constellationGroup.children.forEach((child, index) => {
    if (child.isSprite && child.material) {
      child.material.opacity = 0.72 + Math.sin(time * 2.1 + index * 0.6) * 0.18;
    }
  });
}

function findLanternInView() {
  raycaster.setFromCamera(center, camera);
  const meshes = [];
  for (const lantern of lanterns) {
    lantern.group.traverse((child) => {
      if (child.isMesh) {
        child.userData.lantern = lantern;
        meshes.push(child);
      }
    });
  }
  const hits = raycaster.intersectObjects(meshes, false);
  if (!hits.length || hits[0].distance > 28) return null;
  return hits[0].object.userData.lantern;
}

function setHighlightedLantern(lantern) {
  if (state.highlightedLantern === lantern) return;
  state.highlightedLantern = lantern;
  ui.crosshair.classList.toggle("active", Boolean(lantern));
}

function interactWithWorld() {
  if (tryBoatInteraction()) return;
  interactWithLantern();
}

function tryBoatInteraction() {
  if (!state.boat || state.activeMessage || state.overview) return false;

  if (state.onBoat) {
    state.onBoat = false;
    const boat = state.boat.group;
    camera.position.set(boat.position.x + 1.35, getHeight(boat.position.x + 1.35, boat.position.z) + WORLD.eyeHeight, boat.position.z);
    setStatus("You stepped off the boat.");
    return true;
  }

  const distance = camera.position.distanceTo(state.boat.group.position);
  if (distance > 5.8) return false;
  state.onBoat = true;
  state.velocity?.set?.(0, 0, 0);
  setStatus("You boarded the rowboat. Tap/click again to leave.");
  return true;
}

function interactWithLantern() {
  const lantern = state.highlightedLantern || findLanternInView();
  if (!lantern || state.activeMessage) return;
  let message = lantern.message;
  if (message === state.lastMessage) {
    const other = lanterns.find((candidate) => candidate.message !== message);
    if (other) message = other.message;
  }
  state.lastMessage = message;
  state.activeMessage = message;

  const dir = new THREE_NS.Vector3();
  camera.getWorldDirection(dir);
  lantern.approachTarget.copy(camera.position).addScaledVector(dir, 2.6);
  lantern.approachTarget.y = camera.position.y + 0.15;
  lantern.isApproaching = true;

  ui.messageText.textContent = message;
  ui.messageOverlay.classList.add("open");
  ui.messageOverlay.setAttribute("aria-hidden", "false");
}

function closeMessage() {
  state.activeMessage = null;
  ui.messageOverlay.classList.remove("open");
  ui.messageOverlay.setAttribute("aria-hidden", "true");
  for (const lantern of lanterns) lantern.isApproaching = false;
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
