/*
 * noel-world.js  —  ÉTAPE 1 : core + lac central + renard de feu
 * ------------------------------------------------------------
 * Monde de Noël en première personne, à brancher sur birthday-event.js
 * (voir les 4 petites modifications à la fin de ce fichier).
 *
 * Contenu de cette étape :
 *   CORE   : mains + lanterne, écharpe, buée, givre/chaleur, jour/nuit (30 min),
 *            météo (6 états), aurores (violette S / bleue centre / verte N),
 *            déplacement (marche, course, glisse sur la glace), interactions [E]
 *   LAC    : Grand Sapin, patinoire + patins, guirlandes, lanternes flottantes,
 *            24 fenêtres de l'Avent (4 mini-scènes), bancs, braseros
 *   RENARD : renard de feu qui suit, dort, joue, se laisse caresser
 *
 * Étapes suivantes (à ajouter comme fichiers séparés qui utilisent NoelWorld.H) :
 *   noel-suisse.js, noel-allemagne.js, noel-nordique.js, noel-chalet.js,
 *   noel-habitants.js, noel-fetes.js
 *
 * Paramètres de test :  ?noelTime=0.9   ?noelWeather=storm|heavy|light|clear|fog|wind
 * ------------------------------------------------------------
 */
(function () {
  "use strict";

  const PARAMS = new URLSearchParams(window.location.search);

  // ============================================================
  // 1. CONFIGURATION
  // ============================================================
  const CFG = {
    dayDuration: 1800,       // 1 jour du monde = 30 min réelles
    startTime: 0.745,        // on arrive à la tombée du jour
    eyeHeight: 1.7,
    walkSpeed: 4.2,
    runSpeed: 7.4,
    skateSpeed: 10,
    lakeRadius: 34,
    walkLimit: 175,
    spawn: { x: 0, z: 37 },  // rive sud du lac, face au Grand Sapin
    weatherMin: 110,
    weatherMax: 200
  };

  // Emplacement des zones (pour les prochaines étapes). Le lac est à l'origine.
  // Sud (+z) = Suisse / violet · Est = Allemagne / bleu · Nord (-z) = Nordique / vert
  const ZONES = {
    lac: { x: 0, z: 0, r: 60 },
    suisse: { x: 0, z: 125, r: 48 },
    allemagne: { x: 125, z: 0, r: 48 },
    nordique: { x: 0, z: -125, r: 48 },
    chalet: { x: -80, z: 0, r: 26 }
  };

  const WEATHERS = {
    light: { label: "Neige légère", density: 0.42, size: 0.15, fall: 1.5, wind: 0.5, fog: 1.0, gloom: 0.0, mist: 0.05, cold: 0.0 },
    heavy: { label: "Gros flocons", density: 0.75, size: 0.34, fall: 1.1, wind: 0.3, fog: 1.5, gloom: 0.12, mist: 0.06, cold: 0.05 },
    storm: { label: "Tempête douce", density: 1.0, size: 0.2, fall: 3.2, wind: 3.6, fog: 2.8, gloom: 0.3, mist: 0.08, cold: 0.2 },
    clear: { label: "Ciel clair étoilé", density: 0.0, size: 0.15, fall: 1.2, wind: 0.2, fog: 0.65, gloom: -0.25, mist: 0.03, cold: 0.1 },
    fog: { label: "Brouillard sur le lac", density: 0.1, size: 0.13, fall: 0.8, wind: 0.1, fog: 3.4, gloom: 0.1, mist: 0.34, cold: 0.05 },
    wind: { label: "Vent de montagne", density: 0.25, size: 0.11, fall: 1.0, wind: 5.5, fog: 1.2, gloom: 0.05, mist: 0.05, cold: 0.15 }
  };
  const WEATHER_WEIGHTS = { light: 3, heavy: 2, storm: 1, clear: 2, fog: 1.3, wind: 1 };

  // p, ciel/brouillard, ambiante, intensité amb., couleur lumière, intensité lumière, aurore, étoiles
  const KEYS = [
    [0.00, 0x050b20, 0x3a4270, 0.62, 0x9db4ff, 0.42, 1.0, 1.0],
    [0.20, 0x050b20, 0x3a4270, 0.62, 0x9db4ff, 0.42, 1.0, 1.0],
    [0.26, 0x1c2c62, 0x4a5488, 0.68, 0xa8b8ff, 0.40, 0.7, 0.8],
    [0.31, 0xd98a72, 0x8a6a80, 0.80, 0xffb27a, 0.75, 0.15, 0.2],
    [0.38, 0x8fbde6, 0xa8b8d0, 0.95, 0xfff0d8, 1.0, 0.0, 0.0],
    [0.62, 0x8fbde6, 0xa8b8d0, 0.95, 0xfff0d8, 1.0, 0.0, 0.0],
    [0.69, 0xf0aa6a, 0xa08070, 0.85, 0xffa860, 0.85, 0.0, 0.0],
    [0.73, 0xd9604f, 0x7a5a78, 0.75, 0xff8a5a, 0.55, 0.05, 0.15],
    [0.79, 0x2e4c94, 0x4a5a94, 0.72, 0x9fb4ff, 0.42, 0.45, 0.6],   // long crépuscule bleu
    [0.87, 0x142856, 0x3e4a80, 0.66, 0x9db4ff, 0.42, 0.95, 0.95],
    [0.93, 0x050b20, 0x3a4270, 0.62, 0x9db4ff, 0.42, 1.0, 1.0],
    [1.00, 0x050b20, 0x3a4270, 0.62, 0x9db4ff, 0.42, 1.0, 1.0]
  ];

  // ============================================================
  // 2. ÉTAT
  // ============================================================
  const W = {
    built: false, THREE: null, scene: null, camera: null, renderer: null,
    isMobile: false, getAudio: () => null, group: null,
    t: 0, time: CFG.startTime,
    sky: {}, keys: { shift: false },
    vel: { x: 0, z: 0 }, speed: 0, skating: false, sit: null, pendingYaw: null,
    walkPhase: 0, stepAccum: 0, scrapeTimer: 0, idleTime: 0,
    colliders: [], interactables: [], target: null, tickers: [], heat: [],
    warmth: 0, frost: 0, hotUntil: 0, reach: 0, raise: 0,
    auroraPulse: 0, auroraEnergy: 0.4,
    weatherId: "light", weatherTimer: 90, cur: {},
    dom: {}, lanterns: [], windows: [], fires: [], garlands: [], twinkles: [],
    fox: null, hands: null, breath: null, snowfall: null, hearts: []
  };

  // ============================================================
  // 3. OUTILS (géométries/matériaux en cache, textures pixel-art)
  // ============================================================
  const _geo = {};
  function geo(w, h, d) {
    const k = w + "|" + h + "|" + d;
    if (!_geo[k]) _geo[k] = new W.THREE.BoxGeometry(w, h, d);
    return _geo[k];
  }
  const _lam = {};
  function lam(color, emissive, ei) {
    const k = color + "|" + (emissive || 0) + "|" + (ei || 0);
    if (!_lam[k]) {
      _lam[k] = new W.THREE.MeshLambertMaterial({ color, emissive: emissive || 0x000000, emissiveIntensity: ei || 0 });
    }
    return _lam[k];
  }
  const _bas = {};
  function bas(color) {
    if (!_bas[color]) _bas[color] = new W.THREE.MeshBasicMaterial({ color });
    return _bas[color];
  }
  function box(w, h, d, material, x, y, z, parent) {
    const m = new W.THREE.Mesh(geo(w, h, d), material);
    m.position.set(x || 0, y || 0, z || 0);
    if (parent) parent.add(m);
    return m;
  }

  const _tex = {};
  function pixTex(key, size, draw, repeat) {
    if (_tex[key]) return _tex[key];
    const THREE = W.THREE;
    const c = document.createElement("canvas");
    c.width = size; c.height = size;
    draw(c.getContext("2d"), size);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    _tex[key] = t;
    return t;
  }
  function grid8(shades, a, b) {
    return (ctx, size) => {
      const cell = size / 8;
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          ctx.fillStyle = shades[(x * a + y * b) % shades.length];
          ctx.fillRect(x * cell, y * cell, cell, cell);
        }
      }
    };
  }
  const snowTex = () => pixTex("n_snow", 16, grid8(["#f7fbff", "#eef5ff", "#e4eefc", "#f2f8ff", "#dbe8fb"], 5, 3), [260, 260]);
  const iceTex = () => pixTex("n_ice", 16, (ctx, size) => {
    grid8(["#7fb0d6", "#8bbbe0", "#74a6cf", "#95c4e6"], 5, 3)(ctx, size);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillRect(1, 1, 3, 1); ctx.fillRect(9, 6, 2, 2); ctx.fillRect(4, 12, 4, 1);
  }, [16, 16]);
  const pineTex = () => pixTex("n_pine", 16, grid8(["#1c3a22", "#24522c", "#193420", "#2c5c34"], 1, 1));
  const barkTex = () => pixTex("n_bark", 16, grid8(["#4a3320", "#5a3f27", "#3a2718"], 3, 7));
  const stoneTex = () => pixTex("n_stone", 16, grid8(["#5c6068", "#71767e", "#484c53"], 5, 3));
  const rockTex = () => pixTex("n_rock", 16, grid8(["#3c4666", "#454f70", "#333c58", "#4a5478"], 3, 7));
  const mtnSnowTex = () => pixTex("n_mtnsnow", 16, grid8(["#ffffff", "#f5f9ff", "#eaf2ff"], 5, 3));
  function plasterTex(hex) {
    return pixTex("n_plaster_" + hex, 16, (ctx, size) => {
      ctx.fillStyle = hex; ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = "#3a2a18";
      ctx.fillRect(0, 0, size, 2); ctx.fillRect(0, size - 2, size, 2);
      ctx.fillRect(0, 0, 2, size); ctx.fillRect(size - 2, 0, 2, size);
      for (let i = 2; i < size - 2; i += 1) { ctx.fillRect(i, i, 1, 1); ctx.fillRect(size - 1 - i, i, 1, 1); }
    });
  }
  const moonTex = () => pixTex("n_moon", 32, (ctx, size) => {
    const cell = size / 16;
    const shades = ["#f3f6ff", "#e8edfb", "#dfe6f7", "#eef1fb", "#d7dff2"];
    for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) {
      const dx = x - 7.5, dy = y - 7.5;
      if (Math.sqrt(dx * dx + dy * dy) > 7.5) continue;
      ctx.fillStyle = shades[(x * 3 + y * 5) % shades.length];
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
    ctx.fillStyle = "#c7d0ea";
    [[4, 5], [10, 4], [8, 9], [5, 11]].forEach(([x, y]) => ctx.fillRect(x * cell, y * cell, cell * 1.5, cell * 1.5));
  });
  const heartTex = () => pixTex("n_heart", 8, (ctx) => {
    ctx.clearRect(0, 0, 8, 8);
    ctx.fillStyle = "#ff5a7a";
    [[1, 1], [2, 1], [5, 1], [6, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2],
    [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [2, 4], [3, 4], [4, 4], [5, 4], [3, 5], [4, 5]]
      .forEach(([x, y]) => ctx.fillRect(x, y, 1, 1));
    ctx.fillStyle = "#ffb3c1"; ctx.fillRect(1, 2, 1, 1);
  });

  // Textures douces (non pixel) : halo chaud et brume
  let _glowT = null, _softT = null;
  function radialTex(stops) {
    const c = document.createElement("canvas");
    c.width = 64; c.height = 64;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    stops.forEach(([o, col]) => g.addColorStop(o, col));
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return new W.THREE.CanvasTexture(c);
  }
  const glowTex = () => _glowT || (_glowT = radialTex([[0, "rgba(255,215,160,0.95)"], [0.4, "rgba(255,170,90,0.45)"], [1, "rgba(255,170,90,0)"]]));
  const softTex = () => _softT || (_softT = radialTex([[0, "rgba(255,255,255,0.7)"], [1, "rgba(255,255,255,0)"]]));

  function glowSprite(parent, x, y, z, scale, color, opacity) {
    const THREE = W.THREE;
    const m = new THREE.SpriteMaterial({
      map: glowTex(), color: color == null ? 0xffffff : color, transparent: true,
      opacity: opacity == null ? 0.9 : opacity, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false
    });
    const s = new THREE.Sprite(m);
    s.position.set(x, y, z);
    s.scale.setScalar(scale);
    if (parent) parent.add(s);
    return s;
  }

  const smooth = (v, a, b) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const rnd = (a, b) => a + Math.random() * (b - a);
  function nearZone(x, z) {
    for (const k in ZONES) {
      if (k === "lac") continue;
      const zn = ZONES[k];
      if (Math.hypot(x - zn.x, z - zn.z) < zn.r) return true;
    }
    return false;
  }

  // ============================================================
  // 4. DOM : givre, invite d'interaction, message, bouton mobile
  // ============================================================
  function makeFrostImage() {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 512;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(256, 256, 150, 256, 256, 362);
    g.addColorStop(0, "rgba(190,225,255,0)");
    g.addColorStop(0.55, "rgba(200,230,255,0.10)");
    g.addColorStop(1, "rgba(235,247,255,0.8)");
    x.fillStyle = g; x.fillRect(0, 0, 512, 512);
    x.lineCap = "round";
    for (let i = 0; i < 360; i += 1) {
      const side = i % 4;
      let px, py, ang;
      if (side === 0) { px = Math.random() * 512; py = 0; ang = Math.PI / 2; }
      else if (side === 1) { px = Math.random() * 512; py = 512; ang = -Math.PI / 2; }
      else if (side === 2) { px = 0; py = Math.random() * 512; ang = 0; }
      else { px = 512; py = Math.random() * 512; ang = Math.PI; }
      ang += (Math.random() - 0.5) * 1.2;
      x.strokeStyle = "rgba(240,250,255," + (0.15 + Math.random() * 0.35) + ")";
      x.lineWidth = 0.8 + Math.random() * 1.8;
      x.beginPath(); x.moveTo(px, py);
      const steps = 5 + Math.floor(Math.random() * 14);
      for (let s = 0; s < steps; s += 1) {
        px += Math.cos(ang) * 8; py += Math.sin(ang) * 8;
        ang += (Math.random() - 0.5) * 0.7;
        x.lineTo(px, py);
      }
      x.stroke();
    }
    return c.toDataURL();
  }

  function injectDom() {
    const style = document.createElement("style");
    style.textContent = `
      #noelFrost { position: fixed; inset: 0; z-index: 89; pointer-events: none; opacity: 0; background-size: 100% 100%; background-repeat: no-repeat; }
      #noelPrompt { position: fixed; left: 50%; bottom: 84px; transform: translateX(-50%); z-index: 95; display: none;
        padding: 8px 16px; border-radius: 999px; background: rgba(12, 9, 19, 0.55); border: 1px solid rgba(255, 215, 139, 0.35);
        color: #ffe6b0; font: 600 0.9rem ui-monospace, Menlo, Consolas, monospace; letter-spacing: 0.02em;
        backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); text-shadow: 0 0 10px rgba(255,183,77,0.6); pointer-events: auto; cursor: pointer; }
      #noelPrompt.show { display: block; }
      #noelPrompt b { color: #fff; background: rgba(255,255,255,0.16); padding: 1px 7px; border-radius: 6px; margin-right: 8px; }
      #noelToast { position: fixed; left: 50%; top: 14%; transform: translateX(-50%); z-index: 95; pointer-events: none;
        color: #fff4d8; font: 500 1rem Georgia, serif; text-shadow: 0 0 14px rgba(255,190,106,0.9), 0 1px 3px #000;
        opacity: 0; transition: opacity 0.8s ease; text-align: center; max-width: 80vw; }
      #noelToast.show { opacity: 1; }
    `;
    document.head.appendChild(style);
    const mk = (id) => { const d = document.createElement("div"); d.id = id; document.body.appendChild(d); return d; };
    W.dom.frost = mk("noelFrost");
    W.dom.frost.style.backgroundImage = "url(" + makeFrostImage() + ")";
    W.dom.prompt = mk("noelPrompt");
    W.dom.toast = mk("noelToast");
    W.dom.prompt.addEventListener("click", interact);
    W.dom.prompt.addEventListener("touchstart", (e) => { e.preventDefault(); interact(); }, { passive: false });
  }

  let _toastTimer = null;
  function say(text, ms) {
    W.dom.toast.textContent = text;
    W.dom.toast.classList.add("show");
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => W.dom.toast.classList.remove("show"), ms || 2800);
  }

  // ============================================================
  // 5. CIEL, LUMIÈRES, AURORE, JOUR/NUIT
  // ============================================================
  const AURORA_VERT = `
    varying vec2 vUv; varying vec3 vWorld;
    void main() {
      vUv = uv;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`;
  const AURORA_FRAG = `
    varying vec2 vUv; varying vec3 vWorld;
    uniform float uTime; uniform float uEnergy; uniform float uAlpha;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p); vec2 f = fract(p);
      float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }
    float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i += 1) { v += a * noise(p); p *= 2.0; a *= 0.5; } return v; }
    void main() {
      float zz = clamp(vWorld.z / 260.0, -1.0, 1.0);          // + = sud
      float wS = smoothstep(0.05, 0.75, zz);
      float wN = smoothstep(0.05, 0.75, -zz);
      float wC = clamp(1.0 - wS - wN, 0.0, 1.0);
      vec3 violet = vec3(0.58, 0.30, 0.95);
      vec3 blue   = vec3(0.22, 0.50, 1.00);
      vec3 green  = vec3(0.20, 1.00, 0.55);
      vec3 col = violet * wS + blue * wC + green * wN;
      // au-dessus du lac les trois couleurs se rejoignent
      float join = smoothstep(0.5, 1.0, vUv.y);
      col = mix(col, (violet + blue + green) * 0.55, join * 0.55);
      float t = uTime * 0.06 * (0.6 + uEnergy);
      float n = fbm(vec2(vUv.x * 14.0 + t, vUv.y * 1.8 - t * 0.5));
      float rays = fbm(vec2(vUv.x * 60.0 + t * 2.0, 3.0));
      float band = smoothstep(0.3, 0.75, n) * smoothstep(0.02, 0.25, vUv.y) * smoothstep(1.0, 0.35, vUv.y);
      band *= 0.6 + 0.7 * rays;
      float a = band * (0.32 + 0.6 * uEnergy) * uAlpha;
      gl_FragColor = vec4(col, a);
    }`;

  function buildSky() {
    const THREE = W.THREE;
    const sky = new THREE.Group();
    sky.name = "noelSky";
    W.group.add(sky);
    W.sky.group = sky;
    W.scene.background = new THREE.Color(0x142856);
    W.scene.fog = new THREE.FogExp2(0x142856, 0.0042);

    // Étoiles
    const N = 900;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const y = 0.03 + Math.pow(Math.random(), 0.8) * 0.97;
      const r = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(a) * r * 420; pos[i * 3 + 1] = y * 420; pos[i * 3 + 2] = Math.sin(a) * r * 420;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    W.sky.stars = new THREE.Points(sg, new THREE.PointsMaterial({
      color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false
    }));
    W.sky.stars.frustumCulled = false;
    sky.add(W.sky.stars);

    // Soleil (halo) et lune pixel
    W.sky.sun = glowSprite(sky, 0, 0, 0, 110, 0xffa860, 0.9);
    W.sky.sunCore = glowSprite(sky, 0, 0, 0, 34, 0xfff2cc, 1);
    W.sky.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex(), transparent: true, fog: false, depthWrite: false }));
    W.sky.moon.scale.set(34, 34, 1);
    sky.add(W.sky.moon);

    // Dôme d'aurores : violet au sud, bleu au centre, vert au nord
    const mat = new THREE.ShaderMaterial({
      vertexShader: AURORA_VERT, fragmentShader: AURORA_FRAG,
      uniforms: { uTime: { value: 0 }, uEnergy: { value: 0.4 }, uAlpha: { value: 1 } },
      transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending, fog: false
    });
    const dome = new THREE.Mesh(new THREE.CylinderGeometry(300, 300, 140, 72, 1, true), mat);
    dome.position.y = 70;
    dome.frustumCulled = false;
    sky.add(dome);
    W.sky.dome = dome;
    W.sky.auroraMat = mat;

    // Lumières globales (aucune ombre : on reste léger)
    W.sky.amb = new THREE.AmbientLight(0x4a5a94, 0.7);
    W.sky.dir = new THREE.DirectionalLight(0x9db4ff, 0.4);
    W.group.add(W.sky.amb, W.sky.dir);
    W.sky.sunDir = new THREE.Vector3();
    W.sky.moonDir = new THREE.Vector3();
  }

  const _tmpA = { c: null, d: null, s: null, e: null };
  function updateSky(delta) {
    const THREE = W.THREE, S = W.sky, cur = W.cur;
    W.time = (W.time + delta / CFG.dayDuration) % 1;
    const p = W.time;

    let i = 0;
    while (i < KEYS.length - 2 && p >= KEYS[i + 1][0]) i += 1;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = (p - a[0]) / (b[0] - a[0]);
    const T = _tmpA;
    const mixCol = (out, ha, hb) => { T.c.setHex(ha); T.d.setHex(hb); out.copy(T.c).lerp(T.d, t); };

    mixCol(T.s, a[1], b[1]);
    const gloom = cur.gloom || 0;
    T.s.multiplyScalar(Math.max(0.6, Math.min(1.1, 1 - gloom * 0.6)));
    W.scene.background.copy(T.s);
    W.scene.fog.color.copy(T.s);
    W.scene.fog.density = 0.0042 * (cur.fog || 1);

    mixCol(S.amb.color, a[2], b[2]);
    S.amb.intensity = (a[3] + (b[3] - a[3]) * t) * (1 - gloom * 0.3);
    mixCol(S.dir.color, a[4], b[4]);
    S.dir.intensity = (a[5] + (b[5] - a[5]) * t);
    const aur = a[6] + (b[6] - a[6]) * t;
    const stars = a[7] + (b[7] - a[7]) * t;
    W.night = stars;

    const ang = (p - 0.25) * Math.PI * 2;
    S.sunDir.set(Math.cos(ang), Math.sin(ang), -0.25).normalize();
    S.moonDir.set(-Math.cos(ang), -Math.sin(ang) * 0.9 + 0.05, 0.2).normalize();
    const sunUp = S.sunDir.y > -0.05;
    const L = sunUp ? S.sunDir : S.moonDir;
    S.dir.position.copy(L).multiplyScalar(100);

    S.sun.position.copy(S.sunDir).multiplyScalar(380);
    S.sunCore.position.copy(S.sunDir).multiplyScalar(379);
    S.sun.visible = S.sunCore.visible = S.sunDir.y > -0.14;
    S.sun.material.opacity = 0.9 * smooth(S.sunDir.y, -0.14, 0.05) * (1 - Math.max(0, gloom) * 1.2);
    S.sunCore.material.opacity = S.sun.material.opacity;
    S.moon.position.copy(S.moonDir).multiplyScalar(380);
    S.moon.visible = S.moonDir.y > -0.05;
    S.moon.material.opacity = smooth(S.moonDir.y, -0.05, 0.12) * smooth(stars, 0.05, 0.5);

    const starK = Math.max(0, Math.min(1, stars * (1 - gloom * 2.2)));
    S.stars.material.opacity = starK;
    S.stars.visible = starK > 0.01;
    S.auroraMat.uniforms.uAlpha.value = Math.max(0, Math.min(1.2, aur * (1 - gloom * 1.4)));
    S.dome.visible = S.auroraMat.uniforms.uAlpha.value > 0.01;

    S.group.position.set(W.camera.position.x, 0, W.camera.position.z);
  }

  // ============================================================
  // 6. MÉTÉO
  // ============================================================
  function pickWeather() {
    let total = 0;
    const ids = Object.keys(WEATHERS).filter((k) => k !== W.weatherId);
    ids.forEach((k) => { total += WEATHER_WEIGHTS[k]; });
    let r = Math.random() * total;
    for (const k of ids) { r -= WEATHER_WEIGHTS[k]; if (r <= 0) return k; }
    return ids[0];
  }
  function setWeather(id, quiet) {
    if (!WEATHERS[id]) return;
    W.weatherId = id;
    W.weatherTimer = rnd(CFG.weatherMin, CFG.weatherMax);
    if (!quiet) say(WEATHERS[id].label, 3200);
  }
  function updateWeather(delta) {
    W.weatherTimer -= delta;
    if (W.weatherTimer <= 0) setWeather(pickWeather(), false);
    const target = WEATHERS[W.weatherId];
    const k = 1 - Math.exp(-delta / 6);
    for (const key in target) {
      if (key === "label") continue;
      W.cur[key] += (target[key] - W.cur[key]) * k;
    }
  }

  function buildSnowfall() {
    const THREE = W.THREE;
    const N = 3200;
    const pos = new Float32Array(N * 3);
    const sf = new Float32Array(N);
    const cx = CFG.spawn.x, cz = CFG.spawn.z;
    for (let i = 0; i < N; i += 1) {
      pos[i * 3] = cx + rnd(-36, 36); pos[i * 3 + 1] = rnd(0, 34); pos[i * 3 + 2] = cz + rnd(-36, 36);
      sf[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.15, transparent: true, opacity: 0.9, depthWrite: false }));
    pts.frustumCulled = false;
    W.group.add(pts);
    W.snowfall = { pts, pos, sf, N };
  }
  function updateSnowfall(delta) {
    const s = W.snowfall, cp = W.camera.position, cur = W.cur;
    const count = Math.floor(s.N * cur.density);
    s.pts.visible = count > 20;
    s.pts.geometry.setDrawRange(0, count);
    s.pts.material.size = cur.size;
    if (!s.pts.visible) return;
    const p = s.pos, BX = 36;
    for (let i = 0; i < count; i += 1) {
      const f = s.sf[i];
      let x = p[i * 3] + cur.wind * delta * (0.6 + f * 0.8);
      let y = p[i * 3 + 1] - cur.fall * delta * (0.6 + f * 0.8);
      let z = p[i * 3 + 2] + cur.wind * 0.18 * delta;
      if (x < cp.x - BX) x += BX * 2; else if (x > cp.x + BX) x -= BX * 2;
      if (z < cp.z - BX) z += BX * 2; else if (z > cp.z + BX) z -= BX * 2;
      if (y < 0) y += 34;
      p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z;
    }
    s.pts.geometry.attributes.position.needsUpdate = true;
  }

  // ============================================================
  // 7. DÉCOR : sol, forêt, montagnes
  // ============================================================
  function buildGround() {
    const THREE = W.THREE;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshLambertMaterial({ map: snowTex() }));
    ground.rotation.x = -Math.PI / 2;
    W.group.add(ground);
  }

  function buildForest() {
    const THREE = W.THREE;
    const pts = [];
    let tries = 0;
    while (pts.length < 420 && tries < 9000) {
      tries += 1;
      const a = Math.random() * Math.PI * 2, r = 66 + Math.random() * 115;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (nearZone(x, z)) continue;
      pts.push({ x, z, s: 0.9 + Math.random() * 1.4, ry: Math.random() * Math.PI });
    }
    const trunkMat = new THREE.MeshLambertMaterial({ map: barkTex() });
    const pineMat = new THREE.MeshLambertMaterial({ map: pineTex() });
    const capMat = lam(0xf4f8ff);
    const defs = [{ w: 0.32, h: 1.1, d: 0.32, y: 0.55, m: trunkMat }];
    for (let i = 0; i < 4; i += 1) {
      const size = 2.1 - i * 0.42, ys = 1.1 + i * 0.95 * 0.78;
      defs.push({ w: size, h: 0.95, d: size, y: ys + 0.475, m: pineMat });
      defs.push({ w: size + 0.06, h: 0.12, d: size + 0.06, y: ys + 0.95, m: capMat });
    }
    const dummy = new THREE.Object3D();
    defs.forEach((def) => {
      const g = new THREE.BoxGeometry(def.w, def.h, def.d);
      g.translate(0, def.y, 0);
      const im = new THREE.InstancedMesh(g, def.m, pts.length);
      pts.forEach((p, i) => {
        dummy.position.set(p.x, 0, p.z); dummy.rotation.y = p.ry; dummy.scale.setScalar(p.s);
        dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
      im.frustumCulled = false;
      W.group.add(im);
    });
    pts.forEach((p) => W.colliders.push({ x: p.x, z: p.z, r: 0.45 * p.s }));
  }

  function buildMountains() {
    const THREE = W.THREE;
    const rockMat = new THREE.MeshLambertMaterial({ map: rockTex(), flatShading: true });
    const snowMat = new THREE.MeshLambertMaterial({ map: mtnSnowTex(), flatShading: true });
    for (let i = 0; i < 28; i += 1) {
      const a = (i / 28) * Math.PI * 2 + rnd(-0.06, 0.06);
      const r = 235 + Math.random() * 22;
      const height = 45 + Math.random() * 45, base = 30 + Math.random() * 18;
      const g = new THREE.Group();
      const tiers = 6;
      let y = 0;
      for (let k = 0; k < tiers; k += 1) {
        const tt = k / (tiers - 1), size = base * (1 - tt * 0.82), th = height / tiers;
        const b = new THREE.Mesh(geo(size, th, size), tt > 0.55 ? snowMat : rockMat);
        b.position.set(rnd(-1, 1) * base * 0.07, y + th / 2, rnd(-1, 1) * base * 0.07);
        b.rotation.y = Math.random() * 0.3;
        g.add(b);
        y += th * 0.92;
      }
      g.position.set(Math.cos(a) * r, -2, Math.sin(a) * r);
      W.group.add(g);
    }
  }

  // ============================================================
  // 8. LAC CENTRAL
  // ============================================================
  function buildLake() {
    const THREE = W.THREE;
    const R = CFG.lakeRadius;
    const ice = new THREE.Mesh(
      new THREE.CircleGeometry(R, 56),
      new THREE.MeshStandardMaterial({ map: iceTex(), color: 0xcfe6ff, roughness: 0.18, metalness: 0.3, emissive: 0x0a1a30, emissiveIntensity: 0.35 })
    );
    ice.rotation.x = -Math.PI / 2;
    ice.position.y = 0.03;
    W.group.add(ice);

    // Muret de blocs de pierre enneigés tout autour
    const n = 96;
    const rim = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.5, 1.0), new THREE.MeshLambertMaterial({ map: stoneTex() }), n);
    const d = new THREE.Object3D();
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      d.position.set(Math.cos(a) * (R + 0.5), 0.2, Math.sin(a) * (R + 0.5));
      d.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
      d.updateMatrix();
      rim.setMatrixAt(i, d.matrix);
    }
    rim.frustumCulled = false;
    W.group.add(rim);

    // Reflets sur la glace
    const gp = new Float32Array(200 * 3);
    for (let i = 0; i < 200; i += 1) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (R - 1);
      gp[i * 3] = Math.cos(a) * r; gp[i * 3 + 1] = 0.08; gp[i * 3 + 2] = Math.sin(a) * r;
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute("position", new THREE.BufferAttribute(gp, 3));
    W.glints = new THREE.Points(gg, new THREE.PointsMaterial({ color: 0xcfe8ff, size: 0.13, transparent: true, opacity: 0.7, depthWrite: false }));
    W.glints.frustumCulled = false;
    W.group.add(W.glints);

    // Brume basse (monte quand la météo est "brouillard")
    const mistMat = new THREE.SpriteMaterial({ map: softTex(), transparent: true, opacity: 0.05, depthWrite: false, fog: false });
    W.mistMat = mistMat;
    W.mist = [];
    for (let i = 0; i < 26; i += 1) {
      const s = new THREE.Sprite(mistMat);
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (R - 2);
      s.position.set(Math.cos(a) * r, rnd(0.6, 1.8), Math.sin(a) * r);
      s.scale.setScalar(rnd(14, 24));
      s.userData = { a, r, sp: rnd(0.01, 0.03), y: s.position.y };
      W.group.add(s);
      W.mist.push(s);
    }
  }

  // ---- Grand Sapin -------------------------------------------------
  function squareRing(half, theta) {
    const c = Math.cos(theta), s = Math.sin(theta);
    const r = half / Math.max(Math.abs(c), Math.abs(s));
    return [r * c, r * s];
  }
  function buildGrandSapin() {
    const THREE = W.THREE;
    const g = new THREE.Group();
    g.name = "grandSapin";
    const barkM = new THREE.MeshLambertMaterial({ map: barkTex() });
    const pineM = new THREE.MeshLambertMaterial({ map: pineTex() });
    const TIERS = 9;
    const sizeOf = (i) => 15 - i * 1.5;
    const yOf = (i) => 2.2 + i * 2.5;
    box(2, 3, 2, barkM, 0, 1.5, 0, g);
    for (let i = 0; i < TIERS; i += 1) {
      box(sizeOf(i), 3, sizeOf(i), pineM, 0, yOf(i), 0, g);
      box(sizeOf(i) + 0.1, 0.22, sizeOf(i) + 0.1, lam(0xf4f8ff), 0, yOf(i) + 1.5, 0, g);
    }
    const tierAt = (y) => Math.max(0, Math.min(TIERS - 1, Math.floor((y - 1) / 2.5)));
    const halfAt = (y) => sizeOf(tierAt(y)) / 2 + 0.12;
    const d = new THREE.Object3D();
    const col = new THREE.Color();

    // Boules de Noël
    const palette = [0xc23a3a, 0xd9a94a, 0x3a6fbf, 0xf3f2ee, 0x8a3ab0];
    const NB = 240;
    const balls = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x2a2a2a }), NB);
    for (let i = 0; i < NB; i += 1) {
      const y = rnd(2.4, 22.6), [x, z] = squareRing(halfAt(y), Math.random() * Math.PI * 2);
      d.position.set(x, y, z); d.rotation.set(0, Math.random(), 0); d.updateMatrix();
      balls.setMatrixAt(i, d.matrix);
      balls.setColorAt(i, col.setHex(palette[i % palette.length]));
    }
    balls.frustumCulled = false;
    g.add(balls);

    // Ruban en spirale (rouge/or)
    const NR = 220;
    const ribbon = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x442200 }), NR);
    for (let i = 0; i < NR; i += 1) {
      const t = i / NR, y = 2.6 + t * 20.5;
      const [x, z] = squareRing(halfAt(y) + 0.05, t * Math.PI * 2 * 4.5);
      d.position.set(x, y, z); d.rotation.set(0, 0, 0); d.updateMatrix();
      ribbon.setMatrixAt(i, d.matrix);
      ribbon.setColorAt(i, col.setHex(i % 2 ? 0xd9a94a : 0xc23a3a));
    }
    ribbon.frustumCulled = false;
    g.add(ribbon);

    // Petites lumières : 3 groupes qui clignotent en décalé
    const lightColors = [0xfff0c8, 0xffcf8a, 0xffa5c0, 0x9fd7ff];
    for (let k = 0; k < 3; k += 1) {
      const NL = 90;
      const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), m, NL);
      for (let i = 0; i < NL; i += 1) {
        const y = rnd(2.2, 22.8), [x, z] = squareRing(halfAt(y) + 0.1, Math.random() * Math.PI * 2);
        d.position.set(x, y, z); d.rotation.set(0, 0, 0); d.updateMatrix();
        im.setMatrixAt(i, d.matrix);
        im.setColorAt(i, col.setHex(lightColors[(i + k) % lightColors.length]));
      }
      im.frustumCulled = false;
      g.add(im);
      W.twinkles.push({ mat: m, phase: k * 2.1 });
    }

    // Étoile lumineuse au sommet
    const starM = lam(0xffe37a, 0xffcf5c, 1);
    const sy = yOf(TIERS - 1) + 3.4;
    box(0.7, 0.7, 0.7, starM, 0, sy, 0, g);
    [[0.65, 0, 0], [-0.65, 0, 0], [0, 0, 0.65], [0, 0, -0.65], [0, 0.65, 0], [0, -0.55, 0]].forEach(([x, y, z]) => box(0.36, 0.36, 0.36, starM, x, sy + y, z, g));
    glowSprite(g, 0, sy, 0, 10, 0xffdf8a, 0.85);
    const light = new THREE.PointLight(0xffd98a, 1.4, 70, 1);
    light.position.set(0, sy - 2, 0);
    g.add(light);

    // Cadeaux au pied du sapin
    const gifts = [[0xc23a3a, 0xd9a94a], [0x1e4a2a, 0xf3f2ee], [0x1e2a4a, 0xd9a94a], [0xd9a94a, 0xc23a3a], [0xf3e2b0, 0x1e4a2a]];
    for (let i = 0; i < 14; i += 1) {
      const a = (i / 14) * Math.PI * 2 + rnd(-0.1, 0.1), r = rnd(9.5, 12.5), s = rnd(0.9, 1.9);
      const [bc, rc] = gifts[i % gifts.length];
      const gg = new THREE.Group();
      box(s, s * 0.85, s, lam(bc), 0, s * 0.425, 0, gg);
      box(s + 0.06, s * 0.88, s * 0.2, lam(rc, rc, 0.2), 0, s * 0.43, 0, gg);
      box(s * 0.2, s * 0.88, s + 0.06, lam(rc, rc, 0.2), 0, s * 0.43, 0, gg);
      box(s * 0.35, s * 0.25, s * 0.2, lam(rc, rc, 0.2), 0, s * 0.98, 0, gg);
      gg.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      gg.rotation.y = Math.random() * Math.PI;
      g.add(gg);
    }

    W.group.add(g);
    W.colliders.push({ x: 0, z: 0, r: 8.4 });
  }

  // ---- Guirlandes -------------------------------------------------
  function buildGarlands() {
    const THREE = W.THREE;
    const N = 18, R = 41, TOP = 6.5;
    const woodM = new THREE.MeshLambertMaterial({ map: barkTex() });
    const tops = [];
    for (let i = 0; i < N; i += 1) {
      const a = (i / N) * Math.PI * 2;
      const x = Math.cos(a) * R, z = Math.sin(a) * R;
      box(0.28, TOP, 0.28, woodM, x, TOP / 2, z, W.group);
      box(0.6, 0.4, 0.6, lam(0xffe0a0, 0xff9a3d, 1), x, TOP + 0.2, z, W.group);
      glowSprite(W.group, x, TOP + 0.2, z, 3.2, 0xffb35c, 0.8);
      W.colliders.push({ x, z, r: 0.3 });
      tops.push(new THREE.Vector3(x, TOP, z));
    }
    const groups = [[], [], []];
    const colors = [0xffcf8a, 0xc23a3a, 0x3a6fbf, 0xd9a94a, 0x3a8f4a, 0xffa5c0];
    for (let i = 0; i < N; i += 1) {
      const A = tops[i], B = tops[(i + 1) % N];
      const mid = A.clone().add(B).multiplyScalar(0.5); mid.y -= 3.2;
      const curve = new THREE.QuadraticBezierCurve3(A, mid, B);
      W.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(20)), new THREE.LineBasicMaterial({ color: 0x2a2a2a })));
      for (let k = 1; k < 14; k += 1) {
        groups[k % 3].push({ p: curve.getPoint(k / 14), c: colors[(i + k) % colors.length] });
      }
    }
    const d = new THREE.Object3D(), col = new THREE.Color();
    groups.forEach((list, gi) => {
      const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), m, list.length);
      list.forEach((it, i) => {
        d.position.copy(it.p); d.rotation.set(0, 0, 0); d.updateMatrix();
        im.setMatrixAt(i, d.matrix); im.setColorAt(i, col.setHex(it.c));
      });
      im.frustumCulled = false;
      W.group.add(im);
      W.twinkles.push({ mat: m, phase: gi * 2.1 + 1 });
    });
  }

  // ---- Braseros (sources de chaleur) ------------------------------
  function buildBraziers() {
    const THREE = W.THREE;
    const stoneM = new THREE.MeshLambertMaterial({ map: stoneTex() });
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + 0.4, r = 37;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const g = new THREE.Group();
      box(1.3, 0.9, 1.3, stoneM, 0, 0.45, 0, g);
      box(1.0, 0.1, 1.0, lam(0x201410), 0, 0.92, 0, g);
      const flames = [];
      [[0, 0, 0.7], [0.25, -0.2, 0.5], [-0.25, 0.2, 0.55], [0, 0.25, 0.4]].forEach(([fx, fz, fh], k) => {
        const f = box(0.34, fh, 0.34, lam(k % 2 ? 0xffb03a : 0xff6a1a, k % 2 ? 0xffc040 : 0xff5a10, 1), fx, 1.2, fz, g);
        f.userData.ph = k * 1.7;
        flames.push(f);
      });
      const glow = glowSprite(g, 0, 1.5, 0, 7, 0xff9a4a, 0.85);
      if (i < 2) {
        const l = new THREE.PointLight(0xff9a4a, 1.3, 20, 1);
        l.position.set(0, 1.6, 0);
        g.add(l);
      }
      g.position.set(x, 0, z);
      W.group.add(g);
      W.fires.push({ flames, glow });
      W.heat.push({ x, z, r: 9, s: 1 });
      W.colliders.push({ x, z, r: 0.9 });
    }
  }

  // ---- Bancs + patins ---------------------------------------------
  function buildBenches() {
    const THREE = W.THREE;
    const wood = new THREE.MeshLambertMaterial({ map: barkTex() });
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2 + 0.2, r = 37.8;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const g = new THREE.Group();
      box(2.3, 0.12, 0.6, wood, 0, 0.5, 0, g);
      box(2.3, 0.5, 0.1, wood, 0, 0.85, 0.3, g);
      [-1, 1].forEach((s) => box(0.12, 0.5, 0.5, wood, s * 1.0, 0.25, 0, g));
      box(2.4, 0.1, 0.7, lam(0xf4f8ff), 0, 0.6, 0, g);   // un peu de neige
      g.position.set(x, 0, z);
      g.lookAt(0, 0, 0);
      W.group.add(g);
      W.colliders.push({ x, z, r: 1.1 });

      const yaw = Math.atan2(x, z);   // regarder vers le centre : forward = (-x,-z)
      addInteractable({
        pos: new THREE.Vector3(x, 0.6, z), radius: 3.2, cone: 0.5,
        label: () => "S'asseoir",
        action: () => { W.sit = { x: x * 0.985, z: z * 0.985 }; W.pendingYaw = yaw; W.vel.x = W.vel.z = 0; }
      });

      if (i === 2) {
        // patins posés sur ce banc
        const skates = new THREE.Group();
        [-0.12, 0.12].forEach((sx) => {
          box(0.16, 0.16, 0.36, lam(0x2a1a12), sx, 0.7, 0, skates);
          box(0.05, 0.07, 0.44, lam(0xd8dee6, 0x334455, 0.3), sx, 0.6, 0, skates);
        });
        skates.position.set(-0.55, 0, 0);
        g.add(skates);
        W.skatesObj = skates;
        const wp = skates.getWorldPosition(new THREE.Vector3());
        addInteractable({
          pos: new THREE.Vector3(wp.x, 0.7, wp.z), radius: 3.6, cone: 0.35,
          label: () => W.skating ? "Retirer les patins" : "Chausser les patins",
          action: () => setSkating(!W.skating)
        });
      }
    }
  }
  function setSkating(on) {
    W.skating = on;
    if (W.skatesObj) W.skatesObj.visible = !on;
    say(on ? "Tu as chaussé les patins. Glisse sur le lac !" : "Tu as retiré les patins.", 2600);
  }

  // ---- Lanternes flottantes ----------------------------------------
  function buildLanternStand() {
    const THREE = W.THREE;
    const a = Math.PI * 0.4, r = 37;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const g = new THREE.Group();
    const wood = new THREE.MeshLambertMaterial({ map: barkTex() });
    box(2.0, 0.12, 1.0, wood, 0, 0.95, 0, g);
    [[-0.85, -0.4], [0.85, -0.4], [-0.85, 0.4], [0.85, 0.4]].forEach(([lx, lz]) => box(0.12, 0.95, 0.12, wood, lx, 0.47, lz, g));
    for (let i = 0; i < 5; i += 1) {
      box(0.34, 0.42, 0.34, lam(0xffd9a0, 0xff9a3d, 0.9), -0.8 + i * 0.4, 1.28, 0, g);
    }
    glowSprite(g, 0, 1.4, 0, 5, 0xffb35c, 0.7);
    g.position.set(x, 0, z);
    g.lookAt(0, 0, 0);
    W.group.add(g);
    W.colliders.push({ x, z, r: 1.2 });
    addInteractable({
      pos: new THREE.Vector3(x, 1.2, z), radius: 3.6, cone: 0.4,
      label: () => "Allumer une lanterne flottante",
      action: () => releaseLantern(x * 0.97, 1.6, z * 0.97, true)
    });
  }
  function releaseLantern(x, y, z, fromPlayer) {
    const THREE = W.THREE;
    if (W.lanterns.length > 60) { const old = W.lanterns.shift(); W.group.remove(old.mesh); }
    const g = new THREE.Group();
    box(0.5, 0.7, 0.5, lam(0xffd9a0, 0xff9a3d, 1), 0, 0, 0, g);
    box(0.6, 0.08, 0.6, lam(0x5a3a22), 0, 0.4, 0, g);
    const glow = glowSprite(g, 0, 0, 0, 3.2, 0xffb35c, 0.85);
    g.position.set(x, y, z);
    W.group.add(g);
    W.lanterns.push({ mesh: g, glow, age: 0, vy: rnd(0.55, 0.95), ph: Math.random() * 6 });
    if (fromPlayer) say("Elle monte dans le ciel…", 2400);
  }
  function updateLanterns(delta) {
    for (let i = W.lanterns.length - 1; i >= 0; i -= 1) {
      const l = W.lanterns[i];
      l.age += delta;
      l.mesh.position.y += l.vy * delta;
      l.mesh.position.x += (W.cur.wind * 0.25 + Math.sin(W.t * 0.4 + l.ph) * 0.15) * delta;
      l.mesh.rotation.y += delta * 0.2;
      l.glow.material.opacity = (0.65 + Math.sin(W.t * 6 + l.ph) * 0.15) * (1 - smooth(l.age, 60, 90));
      if (l.age > 90) { W.group.remove(l.mesh); W.lanterns.splice(i, 1); }
    }
    W.ambientLanternIn -= delta;
    if (W.ambientLanternIn <= 0) {
      W.ambientLanternIn = rnd(12, 22);
      const a = Math.random() * Math.PI * 2, r = rnd(6, CFG.lakeRadius - 4);
      releaseLantern(Math.cos(a) * r, 1.4, Math.sin(a) * r, false);
    }
  }

  // ---- Fenêtres de l'Avent -----------------------------------------
  function numberTex(n) {
    const c = document.createElement("canvas");
    c.width = 128; c.height = 96;
    const x = c.getContext("2d");
    x.fillStyle = "#7a1f24"; x.fillRect(0, 0, 128, 96);
    x.strokeStyle = "#e8c060"; x.lineWidth = 6; x.strokeRect(5, 5, 118, 86);
    x.fillStyle = "#ffe6a0"; x.font = "700 64px Georgia, serif";
    x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(String(n), 64, 50);
    return new W.THREE.CanvasTexture(c);
  }

  // Mini-scène 0 : théâtre d'ombres
  function miniShadow() {
    const THREE = W.THREE, g = new THREE.Group();
    box(3.4, 3.8, 0.05, bas(0xffe6b0), 0, 0, -1.25, g);
    const wood = lam(0x5a3320);
    box(3.7, 0.25, 0.4, wood, 0, 2.0, -1.0, g); box(3.7, 0.25, 0.4, wood, 0, -2.0, -1.0, g);
    [-1, 1].forEach((s) => box(0.2, 4.2, 0.4, wood, s * 1.78, 0, -1.0, g));
    const blk = bas(0x1a1210);
    box(0.9, 0.6, 0.05, blk, -1.0, -1.5, -1.2, g);
    const roof = box(0.65, 0.65, 0.05, blk, -1.0, -1.05, -1.2, g); roof.rotation.z = Math.PI / 4;
    [[0.7, 0.3, -1.8], [0.5, 0.3, -1.5], [0.3, 0.3, -1.2]].forEach(([w, h, y]) => box(w, h, 0.05, blk, 1.1, y, -1.2, g));
    const moon = new THREE.Mesh(new THREE.CircleGeometry(0.26, 12), bas(0xfff3c0));
    moon.position.set(0.7, 1.4, -1.22); g.add(moon);
    const sleigh = new THREE.Group();
    box(0.5, 0.16, 0.05, blk, 0, 0, 0, sleigh); box(0.16, 0.2, 0.05, blk, -0.2, 0.16, 0, sleigh);
    box(0.3, 0.14, 0.05, blk, 0.5, 0.05, 0, sleigh); box(0.1, 0.12, 0.05, blk, 0.7, 0.14, 0, sleigh);
    sleigh.position.z = -1.19; g.add(sleigh);
    const stars = [[-1.2, 1.4], [-0.4, 1.0], [0.1, 1.6], [1.2, 0.9], [-0.9, 0.5], [1.3, 1.5]].map(([sx, sy]) => box(0.09, 0.09, 0.03, bas(0xffcf5c), sx, sy, -1.21, g));
    return {
      group: g,
      update(t) {
        sleigh.position.x = -1.6 + ((t * 0.25) % 1) * 3.2;
        sleigh.position.y = 0.5 + Math.sin(t * 1.6) * 0.18;
        sleigh.rotation.z = Math.cos(t * 1.6) * 0.15;
        stars.forEach((s, i) => s.scale.setScalar(0.7 + 0.5 * Math.abs(Math.sin(t * 2 + i))));
      }
    };
  }
  // Mini-scène 1 : train électrique
  function miniTrain() {
    const THREE = W.THREE, g = new THREE.Group();
    box(3.4, 0.15, 2.4, lam(0x3a2a18), 0, -1.75, 0, g);
    box(3.3, 0.06, 2.3, lam(0xf4f8ff), 0, -1.64, 0, g);
    const A = 1.25, B = 0.75;
    for (let i = 0; i < 30; i += 1) {
      const th = (i / 30) * Math.PI * 2;
      const tie = box(0.28, 0.04, 0.08, lam(0x5a3a22), Math.cos(th) * A, -1.6, Math.sin(th) * B, g);
      tie.rotation.y = Math.atan2(-A * Math.sin(th), B * Math.cos(th)) + Math.PI / 2;
    }
    const house = new THREE.Group();
    box(0.5, 0.4, 0.5, lam(0x8a2f2f), 0, 0.2, 0, house);
    box(0.62, 0.14, 0.62, lam(0xf3f8ff), 0, 0.46, 0, house);
    box(0.14, 0.14, 0.02, bas(0xffd48a), 0, 0.22, 0.26, house);
    house.position.set(-0.2, -1.6, 0.05); g.add(house);
    [[0.6, 0.2], [0.85, -0.15]].forEach(([tx, tz]) => {
      box(0.1, 0.2, 0.1, lam(0x5a3a22), tx, -1.5, tz, g);
      box(0.4, 0.3, 0.4, lam(0x1e5a2a), tx, -1.3, tz, g);
    });
    const units = [];
    [[0xc23a3a, 0.5, 0.3], [0x3a6fbf, 0.42, 0.3], [0x3a8f4a, 0.42, 0.3]].forEach(([c, d, h], i) => {
      const u = new THREE.Group();
      box(0.24, h, d, lam(c), 0, h / 2 + 0.06, 0, u);
      if (i === 0) box(0.1, 0.16, 0.1, lam(0x2a2a2a), 0, 0.42, 0.14, u);
      g.add(u); units.push(u);
    });
    return {
      group: g,
      update(t) {
        units.forEach((u, i) => {
          const th = t * 0.7 - i * 0.42;
          u.position.set(Math.cos(th) * A, -1.6, Math.sin(th) * B);
          u.rotation.y = Math.atan2(-A * Math.sin(th), B * Math.cos(th));
        });
      }
    };
  }
  // Mini-scène 2 : automate
  function miniAutomaton() {
    const THREE = W.THREE, g = new THREE.Group();
    box(2.4, 0.9, 1.7, lam(0x7a4a24), 0, -1.55, 0, g);
    box(2.5, 0.08, 1.8, lam(0xd9a94a), 0, -1.08, 0, g);
    const drum = new THREE.Group(); drum.position.y = -0.95; g.add(drum);
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.22, 12), lam(0xc23a3a));
    drum.add(cyl);
    [0, 1, 2].forEach((i) => { const s = box(0.1, 0.24, 0.5, lam(0xffe37a), Math.cos(i * 2.1) * 0.5, 0, Math.sin(i * 2.1) * 0.5, drum); s.rotation.y = -i * 2.1; });
    const dancer = new THREE.Group(); dancer.position.y = 0.1; drum.add(dancer);
    box(0.32, 0.6, 0.22, lam(0x3a6fbf), 0, 0.42, 0, dancer);
    box(0.28, 0.28, 0.28, lam(0xf0d0b0), 0, 0.85, 0, dancer);
    box(0.34, 0.2, 0.34, lam(0xc23a3a), 0, 1.08, 0, dancer);
    const arms = [-1, 1].map((s) => { const a = new THREE.Group(); a.position.set(s * 0.22, 0.65, 0); box(0.1, 0.4, 0.1, lam(0x3a6fbf), 0, -0.18, 0, a); dancer.add(a); return a; });
    const gear = new THREE.Group(); gear.position.set(-0.85, -0.5, -0.5); g.add(gear);
    box(0.7, 0.14, 0.1, lam(0xd9a94a), 0, 0, 0, gear); box(0.14, 0.7, 0.1, lam(0xd9a94a), 0, 0, 0, gear);
    const crank = new THREE.Group(); crank.position.set(1.25, -1.5, 0); g.add(crank);
    box(0.06, 0.06, 0.5, lam(0xb0b6bd), 0, 0, 0.25, crank); box(0.3, 0.06, 0.06, lam(0xb0b6bd), 0.15, 0, 0.5, crank);
    return {
      group: g,
      update(t) {
        drum.rotation.y = t * 0.8;
        dancer.position.y = 0.1 + Math.abs(Math.sin(t * 2.4)) * 0.08;
        arms[0].rotation.z = 0.6 + Math.sin(t * 2.4) * 0.5; arms[1].rotation.z = -0.6 - Math.sin(t * 2.4) * 0.5;
        gear.rotation.z = -t * 1.6; crank.rotation.z = t * 3;
      }
    };
  }
  // Mini-scène 3 : marionnettes
  function miniPuppets() {
    const THREE = W.THREE, g = new THREE.Group();
    const red = lam(0x9a2a30);
    box(3.2, 3.6, 0.05, lam(0x1e2a4a), 0, 0, -1.25, g);
    for (let i = 0; i < 7; i += 1) box(0.08, 0.08, 0.03, bas(0xffe37a), rnd(-1.4, 1.4), rnd(0.2, 1.6), -1.21, g);
    box(3.4, 0.12, 1.8, lam(0x5a3320), 0, -2.0, -0.3, g);
    [-1, 1].forEach((s) => box(0.7, 4.0, 0.3, red, s * 1.5, 0, 0.6, g));
    box(3.6, 0.5, 0.35, red, 0, 1.85, 0.6, g);
    box(2.4, 0.08, 0.08, lam(0x3a2314), 0, 1.6, -0.3, g);
    const pups = [[-0.5, 0x3a6fbf], [0.5, 0xc23a3a]].map(([px, c]) => {
      const piv = new THREE.Group(); piv.position.set(px, 1.6, -0.3); g.add(piv);
      box(0.02, 1.0, 0.02, bas(0x222222), 0, -0.5, 0, piv);
      const body = new THREE.Group(); body.position.y = -1.3; piv.add(body);
      box(0.3, 0.45, 0.2, lam(c), 0, 0, 0, body);
      box(0.24, 0.24, 0.24, lam(0xf0d0b0), 0, 0.36, 0, body);
      box(0.26, 0.1, 0.26, lam(0x2a2a2a), 0, 0.52, 0, body);
      const legs = [-1, 1].map((s) => { const l = new THREE.Group(); l.position.set(s * 0.08, -0.24, 0); box(0.09, 0.36, 0.09, lam(0x2a2a2a), 0, -0.16, 0, l); body.add(l); return l; });
      return { piv, legs };
    });
    return {
      group: g,
      update(t) {
        pups.forEach((p, i) => {
          p.piv.rotation.z = Math.sin(t * 1.6 + i * 1.3) * 0.32;
          p.legs[0].rotation.x = Math.sin(t * 4 + i) * 0.6; p.legs[1].rotation.x = -Math.sin(t * 4 + i) * 0.6;
        });
      }
    };
  }
  const MINIS = [miniShadow, miniTrain, miniAutomaton, miniPuppets];

  function buildAdventWindows() {
    const THREE = W.THREE;
    const N = 24, R = 54;
    const plasters = ["#c23a3a", "#1e4a2a", "#f0e6d2", "#2a3f6a", "#c9a24a", "#8a3a5a"];
    const roofM = lam(0x8a2f2f), snowM = lam(0xf3f8ff), darkM = lam(0x3a2314);
    for (let i = 0; i < N; i += 1) {
      const a = (i / N) * Math.PI * 2;
      const x = Math.cos(a) * R, z = Math.sin(a) * R;
      const g = new THREE.Group();
      const wallM = new THREE.MeshLambertMaterial({ map: plasterTex(plasters[i % plasters.length]) });
      // façade percée d'une grande fenêtre (cavité 4 x 4.6, y 2.9 → 7.5)
      box(2.5, 11, 3, wallM, -3.25, 5.5, 0, g);
      box(2.5, 11, 3, wallM, 3.25, 5.5, 0, g);
      box(4, 2.9, 3, wallM, 0, 1.45, 0, g);
      box(4, 3.5, 3, wallM, 0, 9.25, 0, g);
      box(4, 4.6, 0.2, bas(0xffe6b0), 0, 5.2, -1.4, g);
      // toit à deux pans + neige
      const rl = box(9.8, 0.25, 2.8, roofM, 0, 11.9, -0.9, g); rl.rotation.x = -0.55;
      const rr = box(9.8, 0.25, 2.8, roofM, 0, 11.9, 0.9, g); rr.rotation.x = 0.55;
      const sl = box(9.9, 0.14, 1.2, snowM, 0, 12.45, -1.55, g); sl.rotation.x = -0.55;
      const sr = box(9.9, 0.14, 1.2, snowM, 0, 12.45, 1.55, g); sr.rotation.x = 0.55;
      // cadre de la fenêtre
      box(4.3, 0.18, 0.2, darkM, 0, 7.6, 1.55, g); box(4.3, 0.18, 0.2, darkM, 0, 2.8, 1.55, g);
      [-1, 1].forEach((s) => box(0.18, 4.8, 0.2, darkM, s * 2.1, 5.2, 1.55, g));
      // volets qui s'ouvrent
      const shutM = lam(i % 2 ? 0x2f6b3a : 0x9a2a30);
      const shutters = [-1, 1].map((s) => {
        const piv = new THREE.Group(); piv.position.set(s * 2, 5.2, 1.6); g.add(piv);
        box(2, 4.6, 0.12, shutM, -s * 1, 0, 0, piv);
        box(0.5, 0.5, 0.16, lam(0xffe37a, 0xffcf5c, 0.6), -s * 1, 0, 0.02, piv);
        return piv;
      });
      // numéro
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), new THREE.MeshBasicMaterial({ map: numberTex(i + 1) }));
      sign.position.set(0, 8.7, 1.56); g.add(sign);
      // lueur de la fenêtre
      const wglow = glowSprite(g, 0, 5.2, 2.2, 9, 0xffc772, 0.0);
      const lampL = glowSprite(g, -3.6, 3.4, 1.7, 2.4, 0xffb35c, 0.6);
      const lampR = glowSprite(g, 3.6, 3.4, 1.7, 2.4, 0xffb35c, 0.6);
      void lampL; void lampR;

      g.position.set(x, 0, z);
      g.lookAt(0, 0, 0);
      g.updateMatrixWorld(true);
      W.group.add(g);
      W.colliders.push({ x, z, r: 4.6 });

      const win = { index: i + 1, shutters, glow: wglow, k: 0, open: false, mini: null, root: g };
      W.windows.push(win);
      addInteractable({
        pos: g.localToWorld(new THREE.Vector3(0, 5.2, 2.5)), radius: 9, cone: 0.5,
        label: () => (win.open ? "Refermer" : "Ouvrir") + " la fenêtre n°" + win.index,
        action: () => {
          win.open = !win.open;
          if (win.open && !win.mini) {
            win.mini = MINIS[i % MINIS.length]();
            win.mini.group.position.set(0, 5.2, -0.1);
            win.root.add(win.mini.group);
          }
        }
      });
    }
  }
  function updateWindows(delta) {
    W.windows.forEach((w) => {
      w.k += ((w.open ? 1 : 0) - w.k) * Math.min(1, delta * 2.2);
      w.shutters[0].rotation.y = -1.7 * w.k;
      w.shutters[1].rotation.y = 1.7 * w.k;
      w.glow.material.opacity = 0.75 * w.k;
      if (w.mini && w.k > 0.05) w.mini.update(W.t);
    });
  }

  // ============================================================
  // 9. MAINS, ÉCHARPE, BUÉE, GIVRE
  // ============================================================
  function buildHands() {
    const THREE = W.THREE, cam = W.camera;
    const hands = new THREE.Group();
    cam.add(hands);
    const wool = lam(0x2c4a7a), glove = lam(0x6b3a22), dark = lam(0x2a1a12), red = lam(0xb8302f);

    const L = new THREE.Group(); L.position.set(-0.30, -0.34, -0.55); hands.add(L);
    box(0.16, 0.16, 0.42, wool, 0, 0, 0.16, L);
    box(0.13, 0.13, 0.14, glove, 0, 0, -0.1, L);
    const lant = new THREE.Group(); lant.position.set(0.02, -0.15, -0.12); L.add(lant);
    box(0.02, 0.1, 0.02, dark, 0, 0.13, 0, lant);
    box(0.15, 0.19, 0.15, lam(0xffd9a0, 0xff9a3d, 1), 0, 0, 0, lant);
    box(0.19, 0.03, 0.19, dark, 0, 0.11, 0, lant);
    box(0.19, 0.03, 0.19, dark, 0, -0.11, 0, lant);
    const lg = glowSprite(lant, 0, 0, 0, 0.9, 0xffb35c, 0.55);
    const light = new THREE.PointLight(0xffb35c, 1.5, 18, 1);
    lant.add(light);

    const R = new THREE.Group(); R.position.set(0.30, -0.36, -0.5); hands.add(R);
    box(0.16, 0.16, 0.42, wool, 0, 0, 0.16, R);
    box(0.13, 0.13, 0.14, glove, 0, 0, -0.1, R);

    const scarf = new THREE.Group(); scarf.position.set(0.02, -0.46, -0.42); hands.add(scarf);
    box(0.62, 0.1, 0.14, red, 0, 0, 0, scarf);
    const tail = box(0.1, 0.34, 0.06, red, 0.2, -0.2, 0.05, scarf);

    W.hands = { group: hands, L, R, scarf, tail, light, lg };
  }
  function updateHands(delta, look) {
    const H = W.hands;
    const raiseT = smooth(look.pitch, 0.35, 0.85);
    W.raise += (raiseT - W.raise) * Math.min(1, delta * 6);
    const sp = Math.min(1, W.speed / 5);
    const bobX = Math.sin(W.walkPhase) * 0.012 * sp, bobY = Math.abs(Math.sin(W.walkPhase)) * -0.016 * sp;
    H.group.position.set(bobX, bobY, 0);
    const idle = Math.sin(W.t * 1.3) * 0.004;
    H.L.position.set(-0.30 + 0.10 * W.raise, -0.34 + 0.30 * W.raise + idle, -0.55 - 0.05 * W.raise);
    H.L.rotation.x = 0.9 * W.raise;
    H.light.intensity = 1.45 + W.raise * 0.5 + Math.sin(W.t * 9) * 0.06;
    H.lg.material.opacity = 0.5 + Math.sin(W.t * 7) * 0.06;
    W.reach = Math.max(0, W.reach - delta * 2.4);
    const r = Math.sin(W.reach * Math.PI);
    H.R.position.set(0.30 - 0.1 * r, -0.36 + 0.2 * r + idle, -0.5 - 0.22 * r);
    H.R.rotation.x = 0.4 * r;
    H.scarf.rotation.z = Math.sin(W.t * 2 + 1) * 0.03 + W.cur.wind * 0.01 * Math.sin(W.t * 9);
    H.tail.rotation.z = Math.sin(W.t * 3) * 0.12 * (0.4 + W.cur.wind * 0.2);
  }

  function buildBreath() {
    const THREE = W.THREE;
    const puffs = [];
    for (let i = 0; i < 5; i += 1) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), transparent: true, opacity: 0, depthWrite: false, fog: false }));
      s.visible = false;
      W.camera.add(s);
      puffs.push({ s, age: 99 });
    }
    W.breath = { puffs, timer: 2, i: 0 };
  }
  function updateBreath(delta) {
    const B = W.breath, cold = W.frost;
    B.timer -= delta;
    if (B.timer <= 0) {
      B.timer = W.keys.shift && W.speed > 3 ? 1.6 : 3.6;
      const p = B.puffs[B.i++ % B.puffs.length];
      p.age = 0; p.s.visible = true;
    }
    B.puffs.forEach((p) => {
      if (p.age > 1.8) { p.s.visible = false; return; }
      p.age += delta;
      const t = p.age / 1.8;
      p.s.position.set(0.02 + t * 0.1, -0.16 + t * 0.14, -0.5 - t * 0.35);
      p.s.scale.setScalar(0.1 + t * 0.4);
      p.s.material.opacity = 0.42 * Math.max(0.15, cold) * (1 - t) * Math.min(1, t * 8);
    });
  }

  function updateWarmth(delta) {
    const p = W.camera.position;
    let target = 0;
    W.heat.forEach((h) => {
      const d = Math.hypot(p.x - h.x, p.z - h.z);
      if (d < h.r) target = Math.max(target, Math.sqrt(1 - d / h.r) * h.s);
    });
    if (W.t < W.hotUntil) target = Math.max(target, 0.85);
    W.warmth += (target - W.warmth) * Math.min(1, delta * 1.5);
    const cold = 0.5 + 0.25 * (W.night || 0) + (W.cur.cold || 0);
    const frost = Math.max(0, Math.min(1, cold * (1 - W.warmth * 1.1)));
    W.frost += (frost - W.frost) * Math.min(1, delta * 2);
    W.dom.frost.style.opacity = (W.frost * 0.9).toFixed(3);
  }

  // ============================================================
  // 10. RENARD DE FEU
  // ============================================================
  function buildFox() {
    const THREE = W.THREE;
    const g = new THREE.Group();
    g.name = "renardDeFeu";
    const orange = lam(0xe8641c, 0x7a2a05, 0.35), white = lam(0xf4ecdc), dark = lam(0x2a1a12);

    const bodyG = new THREE.Group(); bodyG.position.y = 0.5; g.add(bodyG);
    box(0.44, 0.4, 0.9, orange, 0, 0, 0, bodyG);
    box(0.3, 0.1, 0.6, white, 0, -0.18, 0, bodyG);

    const headG = new THREE.Group(); headG.position.set(0, 0.78, -0.55); g.add(headG);
    box(0.4, 0.36, 0.36, orange, 0, 0, 0, headG);
    box(0.2, 0.16, 0.24, white, 0, -0.06, -0.28, headG);
    box(0.07, 0.06, 0.05, dark, 0, -0.02, -0.41, headG);
    [-1, 1].forEach((s) => {
      box(0.12, 0.2, 0.08, orange, s * 0.13, 0.26, 0.02, headG);
      box(0.1, 0.07, 0.07, dark, s * 0.13, 0.36, 0.02, headG);
      box(0.05, 0.05, 0.03, dark, s * 0.1, 0.05, -0.19, headG);
    });

    const legsG = new THREE.Group(); g.add(legsG);
    const legs = [[-0.15, -0.3], [0.15, -0.3], [-0.15, 0.3], [0.15, 0.3]].map(([lx, lz]) => {
      const l = new THREE.Group(); l.position.set(lx, 0.34, lz);
      box(0.12, 0.34, 0.12, dark, 0, -0.17, 0, l);
      legsG.add(l);
      return l;
    });

    // Queue de feu : 3 segments emboîtés, de plus en plus chauds vers le bout
    const tailG = new THREE.Group(); tailG.position.set(0, 0.62, 0.45); g.add(tailG);
    box(0.24, 0.24, 0.4, lam(0xe8641c, 0xff5a10, 0.8), 0, 0, 0.2, tailG);
    const t2 = new THREE.Group(); t2.position.z = 0.4; tailG.add(t2);
    box(0.26, 0.26, 0.4, lam(0xff8a2a, 0xff8a1a, 0.9), 0, 0, 0.2, t2);
    const t3 = new THREE.Group(); t3.position.z = 0.4; t2.add(t3);
    box(0.2, 0.2, 0.32, lam(0xffd040, 0xffc030, 1), 0, 0, 0.16, t3);
    const tip = new THREE.Object3D(); tip.position.z = 0.34; t3.add(tip);
    const tipGlow = glowSprite(t3, 0, 0, 0.3, 1.3, 0xffa030, 0.8);
    const light = new THREE.PointLight(0xff8a3a, 1.0, 11, 1);
    light.position.set(0, 1.0, 0.3);
    g.add(light);

    const spawn = new THREE.Vector3(CFG.spawn.x + 2.2, 0, CFG.spawn.z + 0.5);
    g.position.copy(spawn);
    W.group.add(g);

    // étincelles qui s'échappent du bout de la queue
    const NS = 24;
    const sp = new Float32Array(NS * 3), sc = new Float32Array(NS * 3), life = new Float32Array(NS);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    sg.setAttribute("color", new THREE.BufferAttribute(sc, 3));
    const sparks = new THREE.Points(sg, new THREE.PointsMaterial({
      size: 0.14, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false
    }));
    sparks.frustumCulled = false;
    W.group.add(sparks);

    W.fox = {
      group: g, bodyG, headG, legsG, legs, tailG, t2, t3, tip, tipGlow, light,
      sparks, sp, sc, life, sparkI: 0, sparkTimer: 0,
      heading: 0, phase: 0, sleepK: 0, happy: 0, tailAmp: 0.3, mode: "stand",
      orbit: 0, sleeping: false, hopT: 0,
      interact: addInteractable({
        pos: new THREE.Vector3(), radius: 3.2, cone: 0.6,
        label: () => "Caresser le renard",
        action: () => petFox()
      })
    };
  }
  function petFox() {
    const f = W.fox;
    f.happy = 1;
    W.auroraPulse = 1;
    for (let i = 0; i < 3; i += 1) spawnHeart(f.group.position.x + rnd(-0.25, 0.25), 1.3 + i * 0.3, f.group.position.z + rnd(-0.25, 0.25));
    say("Le renard ronronne… l'aurore se met à danser.", 2600);
  }
  function spawnHeart(x, y, z) {
    const THREE = W.THREE;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex(), transparent: true, depthWrite: false, fog: false }));
    s.scale.set(0.32, 0.32, 1);
    s.position.set(x, y, z);
    W.group.add(s);
    W.hearts.push({ s, age: 0 });
  }
  function updateHearts(delta) {
    for (let i = W.hearts.length - 1; i >= 0; i -= 1) {
      const h = W.hearts[i];
      h.age += delta;
      h.s.position.y += delta * 0.7;
      h.s.material.opacity = 1 - smooth(h.age, 0.6, 1.5);
      if (h.age > 1.5) { W.group.remove(h.s); W.hearts.splice(i, 1); }
    }
  }

  function updateFox(delta, look) {
    const f = W.fox, cam = W.camera.position, p = f.group.position;
    const dx = cam.x - p.x, dz = cam.z - p.z, dist = Math.hypot(dx, dz);
    const still = W.speed < 0.25;
    W.idleTime = still ? W.idleTime + delta : 0;
    if (!still) f.sleeping = false;

    let speed = 0, tx = null, tz = null, faceX = dx, faceZ = dz;
    f.mode = "stand";
    if (dist > 3.4) {
      speed = Math.min(9, (dist - 2.2) * 2.4); tx = cam.x; tz = cam.z; f.mode = "run";
    } else if (!still && dist > 2.0) {
      speed = Math.max(1.5, W.speed * 0.95); tx = cam.x; tz = cam.z; f.mode = "trot";
    } else if (still) {
      if (W.idleTime > 7 || f.sleeping) {
        f.sleeping = true;
        const cs = Math.cos(look.yaw), sn = Math.sin(look.yaw);
        const gx = cam.x + cs * 0.9 + sn * 0.5, gz = cam.z - sn * 0.9 + cs * 0.5;   // à côté et derrière
        const ex = gx - p.x, ez = gz - p.z, ed = Math.hypot(ex, ez);
        if (ed > 0.2) { speed = 2.4; tx = gx; tz = gz; f.mode = "trot"; } else { f.mode = "sleep"; }
      } else if (W.idleTime > 2.5) {
        f.orbit += delta * 0.9;
        const gx = cam.x + Math.cos(f.orbit) * 2.5, gz = cam.z + Math.sin(f.orbit) * 2.5;
        const ex = gx - p.x, ez = gz - p.z;
        if (Math.hypot(ex, ez) > 0.3) { speed = 3.6; tx = gx; tz = gz; f.mode = "play"; }
        f.hopT += delta;
      }
    }
    if (tx !== null) {
      const ex = tx - p.x, ez = tz - p.z, ed = Math.hypot(ex, ez) || 1;
      const step = Math.min(ed, speed * delta);
      p.x += (ex / ed) * step; p.z += (ez / ed) * step;
      faceX = ex; faceZ = ez;
    }
    // orientation (le renard regarde vers -z local → forward = (-sin, -cos))
    const want = Math.atan2(-faceX, -faceZ);
    let da = want - f.heading;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    f.heading += da * Math.min(1, delta * (tx !== null ? 8 : 4));
    f.group.rotation.y = f.heading;

    // sommeil
    const sleepT = f.mode === "sleep" ? 1 : 0;
    f.sleepK += (sleepT - f.sleepK) * Math.min(1, delta * 2.5);
    const k = f.sleepK;
    f.bodyG.position.y = 0.5 - 0.3 * k;
    f.legsG.scale.y = 1 - 0.75 * k;
    f.headG.position.y = 0.78 - 0.36 * k;
    f.headG.rotation.x = 0.5 * k;

    // marche / rebonds
    const moving = speed > 0.3;
    f.phase += speed * delta * 3.2;
    f.legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(f.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.7 : 0; });
    let hop = 0;
    if (f.mode === "play") hop = Math.abs(Math.sin(f.hopT * 5)) * 0.35;
    else if (f.mode === "run") hop = Math.abs(Math.sin(f.phase)) * 0.1;
    p.y = hop;

    // queue
    f.happy = Math.max(0, f.happy - delta * 0.35);
    const ampT = 0.25 + (dist < 4 ? 0.2 : 0) + f.happy * 0.7 + (f.mode === "play" ? 0.3 : 0) - k * 0.15;
    f.tailAmp += (ampT - f.tailAmp) * Math.min(1, delta * 3);
    const wag = Math.sin(W.t * (3 + f.happy * 6));
    f.tailG.rotation.x = -0.55 + k * 0.5;
    f.tailG.rotation.y = wag * f.tailAmp * 0.5 + k * 0.9;
    f.t2.rotation.y = Math.sin(W.t * 4 - 1) * f.tailAmp * 0.5 + k * 0.5;
    f.t3.rotation.y = Math.sin(W.t * 4 - 2) * f.tailAmp * 0.6;
    f.tipGlow.material.opacity = 0.65 + Math.sin(W.t * 11) * 0.15;
    f.light.intensity = 0.9 + Math.sin(W.t * 8) * 0.15;

    // zone d'interaction qui suit le renard
    f.interact.pos.set(p.x, 0.6, p.z);

    // étincelles
    f.sparkTimer -= delta;
    if (f.sparkTimer <= 0) {
      f.sparkTimer = 0.07;
      const wp = f.tip.getWorldPosition(f.tmpV || (f.tmpV = new W.THREE.Vector3()));
      const i = f.sparkI++ % f.life.length;
      f.sp[i * 3] = wp.x + rnd(-0.05, 0.05); f.sp[i * 3 + 1] = wp.y; f.sp[i * 3 + 2] = wp.z + rnd(-0.05, 0.05);
      f.life[i] = 1;
    }
    for (let i = 0; i < f.life.length; i += 1) {
      if (f.life[i] > 0) {
        f.life[i] -= delta * 0.9;
        f.sp[i * 3 + 1] += delta * 0.7;
        f.sp[i * 3] += Math.sin(W.t * 3 + i) * delta * 0.15;
      }
      const l = Math.max(0, f.life[i]);
      f.sc[i * 3] = l; f.sc[i * 3 + 1] = l * 0.55; f.sc[i * 3 + 2] = l * 0.12;
    }
    f.sparks.geometry.attributes.position.needsUpdate = true;
    f.sparks.geometry.attributes.color.needsUpdate = true;
  }

  // ============================================================
  // 11. INTERACTIONS [E] + DÉPLACEMENT
  // ============================================================
  function addInteractable(o) { W.interactables.push(o); return o; }

  const _fw = { v: null };
  function findTarget() {
    const cam = W.camera;
    if (!_fw.v) _fw.v = new W.THREE.Vector3();
    cam.getWorldDirection(_fw.v);
    const f = _fw.v, cp = cam.position;
    let best = null, bestScore = 1e9;
    for (const it of W.interactables) {
      if (it.enabled && !it.enabled()) continue;
      const dx = it.pos.x - cp.x, dy = it.pos.y - cp.y, dz = it.pos.z - cp.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > it.radius || d < 0.001) continue;
      const dot = (dx * f.x + dy * f.y + dz * f.z) / d;
      if (dot < (it.cone == null ? 0.55 : it.cone)) continue;
      const score = d * (2 - dot);
      if (score < bestScore) { bestScore = score; best = it; }
    }
    return best;
  }
  function updatePrompt() {
    W.target = W.sit ? null : findTarget();
    const el = W.dom.prompt;
    if (W.target) {
      el.innerHTML = (W.isMobile ? "" : "<b>E</b>") + W.target.label();
      el.classList.add("show");
    } else {
      el.classList.remove("show");
    }
  }
  function interact() {
    if (!W.built || !W.target) return;
    W.reach = 1;
    W.target.action();
  }

  let _noise = null;
  function playNoise(freq, q, gainV, dur) {
    try {
      const a = W.getAudio();
      if (!a) return;
      const ctx = a.context;
      if (!_noise) {
        const n = Math.floor(ctx.sampleRate * 0.15);
        _noise = ctx.createBuffer(1, n, ctx.sampleRate);
        const d = _noise.getChannelData(0);
        for (let i = 0; i < n; i += 1) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
      }
      const src = ctx.createBufferSource(); src.buffer = _noise;
      const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.setValueAtTime(gainV, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      src.connect(f); f.connect(g); g.connect(a.master);
      src.start();
    } catch (e) { /* audio indisponible : on continue sans son */ }
  }

  function updatePlayer(delta, keys, look, camera) {
    if (!W.built) return;
    delta = Math.min(delta, 0.1);
    const fwd = keys.has("z") || keys.has("w") || keys.has("arrowup");
    const back = keys.has("s") || keys.has("arrowdown");
    const left = keys.has("q") || keys.has("a") || keys.has("arrowleft");
    const right = keys.has("d") || keys.has("arrowright");
    const ix = (right ? 1 : 0) - (left ? 1 : 0), iz = (back ? 1 : 0) - (fwd ? 1 : 0);
    const moving = ix !== 0 || iz !== 0;
    const p = camera.position;

    if (W.pendingYaw !== null) { look.yaw = W.pendingYaw; W.pendingYaw = null; }
    if (W.sit) {
      if (moving) { W.sit = null; }
      else {
        p.x += (W.sit.x - p.x) * Math.min(1, delta * 6); p.z += (W.sit.z - p.z) * Math.min(1, delta * 6);
        p.y += (1.12 - p.y) * Math.min(1, delta * 5);
        W.speed = 0; W.vel.x = W.vel.z = 0;
        return;
      }
    }

    const dist = Math.hypot(p.x, p.z);
    const onIce = dist < CFG.lakeRadius - 0.3;
    if (W.skating && dist > CFG.lakeRadius + 3) setSkating(false);

    let maxSp = W.keys.shift ? CFG.runSpeed : CFG.walkSpeed, accel = 30, fric = 14;
    if (onIce) {
      if (W.skating) { maxSp = CFG.skateSpeed; accel = 5.5; fric = 0.55; }
      else { maxSp = CFG.walkSpeed * 0.85; accel = 7; fric = 2.2; }
    } else if (W.skating) { maxSp = CFG.walkSpeed * 0.6; accel = 12; fric = 6; }

    if (moving) {
      const len = Math.hypot(ix, iz), lx = ix / len, lz = iz / len;
      const cs = Math.cos(look.yaw), sn = Math.sin(look.yaw);
      const wx = (lx * cs + lz * sn) * maxSp, wz = (-lx * sn + lz * cs) * maxSp;
      const k = Math.min(1, accel * delta);
      W.vel.x += (wx - W.vel.x) * k; W.vel.z += (wz - W.vel.z) * k;
    } else {
      const k = Math.exp(-fric * delta);
      W.vel.x *= k; W.vel.z *= k;
    }
    p.x += W.vel.x * delta; p.z += W.vel.z * delta;

    for (const c of W.colliders) {
      const dx = p.x - c.x, dz = p.z - c.z;
      const minD = c.r + 0.35;
      if (dx * dx + dz * dz < minD * minD) {
        const d = Math.hypot(dx, dz) || 0.0001;
        p.x = c.x + (dx / d) * minD; p.z = c.z + (dz / d) * minD;
      }
    }
    const rr = Math.hypot(p.x, p.z);
    if (rr > CFG.walkLimit) { p.x *= CFG.walkLimit / rr; p.z *= CFG.walkLimit / rr; }

    W.speed = Math.hypot(W.vel.x, W.vel.z);
    const gliding = W.skating && onIce;
    W.walkPhase += W.speed * delta * 1.7 * (gliding ? 0.15 : 1);
    const base = gliding ? 1.6 : CFG.eyeHeight;
    const bob = gliding ? Math.sin(W.t * 1.6) * 0.012 : Math.sin(W.walkPhase * 2) * 0.035 * Math.min(1, W.speed / 4);
    p.y += (base + bob - p.y) * Math.min(1, delta * 10);

    // sons de pas / de lames
    if (gliding) {
      if (W.speed > 1.2) { W.scrapeTimer -= delta; if (W.scrapeTimer <= 0) { W.scrapeTimer = 0.17; playNoise(2600 + W.speed * 260, 3, 0.05 + W.speed * 0.008, 0.16); } }
    } else if (W.speed > 0.8) {
      W.stepAccum += W.speed * delta;
      if (W.stepAccum > 1.75) { W.stepAccum = 0; playNoise(onIce ? 3000 : 1400, 0.9, 0.16, 0.11); }
    }
  }

  // ============================================================
  // 12. BOUCLE DE MISE À JOUR
  // ============================================================
  function update(delta, elapsed, look, camera) {
    if (!W.built) return;
    delta = Math.min(delta, 0.1);
    W.t += delta;

    updateWeather(delta);
    updateSky(delta);
    updateSnowfall(delta);
    updateWarmth(delta);
    updateHands(delta, look);
    updateBreath(delta);
    updateFox(delta, look);
    updateHearts(delta);
    updateWindows(delta);
    updateLanterns(delta);

    // aurore : réagit à la lanterne levée, au renard et aux caresses
    W.auroraPulse = Math.max(0, W.auroraPulse - delta * 0.15);
    const eT = 0.35 + W.raise * 0.55 + (W.fox.tailAmp - 0.25) * 0.4 + W.auroraPulse * 0.6;
    W.auroraEnergy += (eT - W.auroraEnergy) * Math.min(1, delta * 1.5);
    W.sky.auroraMat.uniforms.uEnergy.value = Math.max(0.1, Math.min(1.4, W.auroraEnergy));
    W.sky.auroraMat.uniforms.uTime.value = W.t;

    W.fires.forEach((fi, i) => {
      fi.flames.forEach((fl) => { fl.scale.y = 0.75 + 0.45 * Math.abs(Math.sin(W.t * 7 + fl.userData.ph + i)); });
      fi.glow.material.opacity = 0.75 + Math.sin(W.t * 9 + i) * 0.12;
    });
    W.twinkles.forEach((tw) => { tw.mat.color.setScalar(0.4 + 0.6 * (0.5 + 0.5 * Math.sin(W.t * 1.8 + tw.phase))); });
    W.glints.material.opacity = 0.5 + Math.sin(W.t * 2.6) * 0.2;
    W.mistMat.opacity += (W.cur.mist - W.mistMat.opacity) * Math.min(1, delta);
    W.mist.forEach((m) => {
      m.userData.a += m.userData.sp * delta;
      m.position.x = Math.cos(m.userData.a) * m.userData.r;
      m.position.z = Math.sin(m.userData.a) * m.userData.r;
      m.position.y = m.userData.y + Math.sin(W.t * 0.5 + m.userData.a * 3) * 0.2;
    });

    updatePrompt();
    W.tickers.forEach((fn) => fn(delta, W.t, look, camera));
  }

  // ============================================================
  // 13. API PUBLIQUE
  // ============================================================
  function build(ctx, opts) {
    if (W.built) return W.group;
    const THREE = ctx.THREE;
    W.THREE = THREE; W.scene = ctx.scene; W.camera = ctx.camera; W.renderer = ctx.renderer;
    W.isMobile = !!ctx.isMobile;
    if (opts && opts.getAudio) W.getAudio = opts.getAudio;
    _tmpA.c = new THREE.Color(); _tmpA.d = new THREE.Color(); _tmpA.s = new THREE.Color();
    W.ambientLanternIn = 6;
    for (const k in WEATHERS.light) if (k !== "label") W.cur[k] = WEATHERS.light[k];

    const g = new THREE.Group();
    g.name = "noelWorld";
    W.scene.add(g);
    W.group = g;
    W.camera.far = Math.max(W.camera.far, 900);
    W.camera.updateProjectionMatrix();

    injectDom();
    buildSky();
    buildGround();
    buildForest();
    buildMountains();
    buildLake();
    buildGrandSapin();
    buildGarlands();
    buildBraziers();
    buildBenches();
    buildLanternStand();
    buildAdventWindows();
    buildSnowfall();
    W.scene.add(W.camera);        // détache la caméra de la barque
    W.camera.position.set(CFG.spawn.x, CFG.eyeHeight, CFG.spawn.z);
    W.camera.rotation.set(0, 0, 0, "YXZ");
    buildHands();
    buildBreath();
    buildFox();

    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (k === "shift") W.keys.shift = true;
      if (k === "e" && !e.repeat) interact();
    });
    window.addEventListener("keyup", (e) => { if (e.key.toLowerCase() === "shift") W.keys.shift = false; });

    if (PARAMS.get("noelTime")) W.time = parseFloat(PARAMS.get("noelTime")) % 1;
    if (PARAMS.get("noelWeather")) setWeather(PARAMS.get("noelWeather"), true);
    const hint = document.getElementById("bdayHint");
    if (hint) hint.textContent = ctx.isMobile
      ? "Glisser pour regarder autour de vous"
      : "ZQSD / WASD marcher · Maj courir · E interagir · Glisser pour regarder · Regarde le ciel avec ta lanterne";

    W.built = true;
    updateSky(0);
    return g;
  }

  // Petits outils exposés pour les prochaines étapes (Suisse, Allemagne, etc.)
  const H = {
    W, CFG, ZONES, geo, lam, bas, box, pixTex, grid8, glowSprite, smooth, rnd, say,
    barkTex, stoneTex, snowTex, iceTex, pineTex, plasterTex,
    addInteractable, addTicker: (fn) => W.tickers.push(fn),
    addCollider: (x, z, r) => W.colliders.push({ x, z, r }),
    addHeatSource: (x, z, r, s) => W.heat.push({ x, z, r, s: s == null ? 1 : s }),
    warmUp: (seconds) => { W.hotUntil = W.t + seconds; },     // boisson chaude : le givre fond
    releaseLantern, playNoise
  };

  window.NoelWorld = {
    build, update, updatePlayer,
    isBuilt: () => W.built,
    walkLimit: CFG.walkLimit,
    setTime: (p) => { W.time = ((p % 1) + 1) % 1; },
    setWeather: (id) => setWeather(id, false),
    H
  };
})();

/* ==================================================================
 * BRANCHEMENT SUR birthday-event.js  (4 modifications)
 * ==================================================================
 * 0) index.html : charger ce fichier AVANT birthday-event.js
 *      <script src="noel-world.js"></script>
 *
 * 1) Dans CONFIG (birthday-event.js) ajouter :
 *      useNoelWorld: true,   // false = ancienne clairière enneigée
 *
 * 2) Tout début de buildSnowScene() :
 *      if (CONFIG.useNoelWorld && window.NoelWorld) {
 *        const g = window.NoelWorld.build(S.ctx, {
 *          getAudio: () => { const c = ensureAudio(); return c ? { context: c, master: S.audio.master } : null; }
 *        });
 *        S.snow.group = g;
 *        S.look.yaw = 0; S.look.pitch = 0.02;
 *        S.snow.keys.clear();
 *        return;
 *      }
 *
 * 3) Tout début de updateSnowScene(delta, elapsed) :
 *      if (window.NoelWorld && window.NoelWorld.isBuilt()) {
 *        applyLook();
 *        window.NoelWorld.updatePlayer(delta, S.snow.keys, S.look, S.ctx.camera);
 *        window.NoelWorld.update(delta, elapsed, S.look, S.ctx.camera);
 *        if (S.snow.textSprite && now() - S.phaseStartedAt >= CONFIG.snowSceneMinDuration) {
 *          S.snow.textSprite.material.opacity = Math.min(1, S.snow.textSprite.material.opacity + delta * 0.3);
 *          S.phase = PHASE.FINALE;
 *        }
 *        return;
 *      }
 *
 * 4) Dans startLakeArrival(), juste après  S.ctx.scene.add(skyText);  ajouter :
 *      if (CONFIG.useNoelWorld && window.NoelWorld) skyText.position.set(0, 60, -80);
 * ================================================================== */