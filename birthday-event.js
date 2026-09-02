/*
 * birthday-event.js
 * ------------------------------------------------------------
 * Scène spéciale "anniversaire de couple" pour Flower Lantern Valley.
 * Ce module ne modifie pas la logique de main.js : il s'y accroche
 * via deux points d'intégration (voir INTEGRATION.md) et prend la
 * main sur la caméra/le rendu tant que l'événement est actif.
 *
 * Tests sans attendre le 20 septembre :
 *   ?bdayTest=1        -> le compte à rebours démarre à 8 secondes
 *   ?bdayPhase=river   -> saute direct au trajet en barque
 *   ?bdayPhase=snow    -> saute direct à la clairière enneigée
 * ------------------------------------------------------------
 */

(function () {
  "use strict";

  // ============================================================
  // 1. CONFIGURATION — à personnaliser
  // ============================================================
  const CONFIG = {
    // L'événement démarre 2 minutes après l'ouverture de la page.
    // (Ancienne version basée sur le 20 septembre conservée en commentaire ci-dessous.)
    getTargetDate() {
      return new Date(Date.now() + 2 * 60 * 1000);
    },
    // getTargetDate() {
    //   const now = new Date();
    //   let target = new Date(now.getFullYear(), 8, 20, 0, 0, 0, 0); // mois 8 = septembre
    //   if (target.getTime() <= now.getTime()) {
    //     target = new Date(now.getFullYear() + 1, 8, 20, 0, 0, 0, 0);
    //   }
    //   return target;
    // },
    finalText: "Joyeux anniversaire de nos 20 mois mon amour",
    riverDuration: 34, // secondes, entre 30 et 40 comme demandé
    riverLength: 150,
    riverWidth: 7.2,
    lockEntireSite: true, // true = le site s'ouvre directement sur le compte à rebours
    snowSceneMinDuration: 9 // secondes avant l'apparition du texte final
  };

  const PARAMS = new URLSearchParams(window.location.search);
  const TEST_MODE = PARAMS.get("bdayTest") === "1";
  const FORCE_PHASE = PARAMS.get("bdayPhase"); // "river" | "snow"

  const PHASE = {
    COUNTDOWN: "countdown",
    BLACKOUT: "blackout",
    RIVER_WAKE: "river_wake",
    RIVER_RIDE: "river_ride",
    WATERFALL: "waterfall",
    WHITEOUT: "whiteout",
    SNOW_WAKE: "snow_wake",
    SNOW_SCENE: "snow_scene",
    FINALE: "finale"
  };

  // ============================================================
  // 2. ÉTAT INTERNE
  // ============================================================
  const S = {
    phase: null,
    active: false,
    ctx: null, // { THREE, scene, camera, renderer, isMobile }
    hiddenValleyNodes: [],
    dom: {},
    audio: { context: null, master: null, riverNodes: [], snowNodes: [] },
    look: { yaw: 0, pitch: 0.05, dragging: false, lastX: 0, lastY: 0, touchId: null },
    boat: null,
    river: { willows: [], fish: [], waterMesh: null, waterfallMesh: null, mist: [] },
    snow: { group: null, auroraMaterials: [], snowflakes: null, textSprite: null },
    timers: [],
    phaseStartedAt: 0
  };

  function now() {
    return performance.now() / 1000;
  }

  // ============================================================
  // 3. DOM / CSS — créés dynamiquement, aucune édition d'index.html requise
  // ============================================================
  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      #bdayRoot { position: fixed; inset: 0; z-index: 90; pointer-events: none; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      #bdayFadeBlack, #bdayFadeWhite { position: fixed; inset: 0; opacity: 0; pointer-events: none;
        transition: opacity 1.1s ease; z-index: 92; }
      #bdayFadeBlack { background: #000; }
      #bdayFadeWhite { background: #fff; }
      #bdayFadeBlack.show, #bdayFadeWhite.show { opacity: 1; }
      #bdayEyelidTop, #bdayEyelidBottom { position: fixed; left: 0; right: 0; background: #04030a; z-index: 93;
        transition: transform 1.15s cubic-bezier(0.7,0,0.3,1); pointer-events: none; }
      #bdayEyelidTop { top: 0; height: 52%; transform: translateY(-100%); }
      #bdayEyelidBottom { bottom: 0; height: 52%; transform: translateY(100%); }
      #bdayEyelidTop.closed, #bdayEyelidBottom.closed { transform: translateY(0); }
      canvas.bday-blur { filter: blur(18px); transition: filter 1.2s ease; }
      canvas.bday-sharp { filter: blur(0px); transition: filter 1.2s ease; }
      #bdayLookLayer { position: fixed; inset: 0; z-index: 88; display: none; touch-action: none; pointer-events: auto; }
      #bdayLookLayer.active { display: block; }
      #bdayHint { position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%); z-index: 94;
        color: rgba(255,255,255,0.55); font-size: 0.78rem; letter-spacing: 0.04em; text-shadow: 0 0 8px rgba(0,0,0,0.8);
        pointer-events: none; display: none; }
      #bdayHint.show { display: block; }
      #bdaySkyText { position: fixed; inset: 0; display: none; place-items: center; pointer-events: none; z-index: 40; }
    `;
    document.head.appendChild(style);
  }

  function buildDom() {
    const root = document.createElement("div");
    root.id = "bdayRoot";
    root.innerHTML = `
      <div id="bdayEyelidTop"></div>
      <div id="bdayEyelidBottom"></div>
      <div id="bdayFadeBlack"></div>
      <div id="bdayFadeWhite"></div>
      <div id="bdayLookLayer"></div>
      <div id="bdayHint">Glisser pour regarder autour de vous</div>
    `;
    document.body.appendChild(root);
    S.dom = {
      root,
      eyelidTop: root.querySelector("#bdayEyelidTop"),
      eyelidBottom: root.querySelector("#bdayEyelidBottom"),
      fadeBlack: root.querySelector("#bdayFadeBlack"),
      fadeWhite: root.querySelector("#bdayFadeWhite"),
      lookLayer: root.querySelector("#bdayLookLayer"),
      hint: root.querySelector("#bdayHint")
    };
  }

  function hideBaseUi(hidden) {
    ["hud", "crosshair", "mobileControls", "musicButton", "debugStatus"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = hidden ? "none" : "";
    });
  }

  // ============================================================
  // 4. AUDIO (synthé WebAudio, même approche que createSoftMusic)
  // ============================================================
  function ensureAudio() {
    if (S.audio.context) return S.audio.context;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    const context = new AudioContext();
    const master = context.createGain();
    master.gain.value = S.ctx.isMobile ? 0.32 : 0.22;
    master.connect(context.destination);
    S.audio.context = context;
    S.audio.master = master;
    return context;
  }

  function playWaterSplash() {
    const context = ensureAudio();
    if (!context) return;
    context.resume().catch(() => {});
    const bufferSize = context.sampleRate * 1.4;
    const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) {
      const t = i / bufferSize;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.2);
    }
    const noise = context.createBufferSource();
    noise.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 900;
    filter.Q.value = 0.7;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.5, context.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 1.3);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(S.audio.master);
    noise.start();
  }

  // Nappe + arpège original façon "conte de fées" (pentatonique, non calqué sur
  // une mélodie existante) pour la traversée en barque.
  function startAmbientLoop(target, options) {
    const context = ensureAudio();
    if (!context) return;
    context.resume().catch(() => {});
    const scale = options.scale;
    const root = options.root;
    let stepIndex = 0;
    const nodes = target === "river" ? S.audio.riverNodes : S.audio.snowNodes;

    function freq(semitone) {
      return root * Math.pow(2, semitone / 12);
    }

    function pad(time, duration, semitone, gainValue) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq(semitone), time);
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(gainValue, time + duration * 0.35);
      gain.gain.linearRampToValueAtTime(0.0001, time + duration);
      osc.connect(gain);
      gain.connect(S.audio.master);
      osc.start(time);
      osc.stop(time + duration + 0.1);
    }

    function pluck(time, semitone, duration, gainValue) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq(semitone + 12), time);
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(gainValue, time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      osc.connect(gain);
      gain.connect(S.audio.master);
      osc.start(time);
      osc.stop(time + duration + 0.05);
    }

    function loop() {
      if (!S.active) return;
      const base = context.currentTime + 0.1;
      pad(base, 6, 0, 0.05);
      pad(base, 6, 7, 0.035);
      for (let i = 0; i < 6; i += 1) {
        const note = scale[stepIndex % scale.length];
        pluck(base + i * 1.0, note, 1.4, 0.03);
        stepIndex += 1;
      }
      const id = setTimeout(loop, 6000);
      nodes.push(id);
      S.timers.push(id);
    }
    loop();
  }

  function stopAllAudioLoops() {
    S.audio.riverNodes.forEach(clearTimeout);
    S.audio.snowNodes.forEach(clearTimeout);
    S.audio.riverNodes = [];
    S.audio.snowNodes = [];
  }

  // ============================================================
  // 5. COMPTE À REBOURS
  // ============================================================
  function formatCountdown(msRemaining) {
    const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (totalSeconds >= 6000) {
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const mins = Math.floor((totalSeconds % 3600) / 60);
      return `${days}j ${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
    }
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function startCountdown() {
    S.phase = PHASE.COUNTDOWN;
    // Le compte à rebours n'est plus un écran qui bloque le jeu : c'est un texte
    // géant et lumineux posé dans le ciel de la vallée, comme le "I LOVE YOU" déjà
    // présent près de la lune. On peut continuer à se balader pendant qu'il tourne.
    buildSkyCountdown();
    let target = CONFIG.getTargetDate().getTime();
    if (TEST_MODE) target = Date.now() + 8000;

    const tick = () => {
      const remaining = target - Date.now();
      updateSkyCountdownText(formatCountdown(remaining));
      if (remaining <= 0) {
        clearInterval(intervalId);
        removeSkyCountdown();
        hideBaseUi(true);
        beginSequence();
      }
    };
    tick();
    const intervalId = setInterval(tick, 1000);
    S.timers.push(intervalId);
  }

  // ------------------------------------------------------------
  // Compte à rebours céleste : gros sprite lumineux + petites étoiles
  // scintillantes autour, dans le style "I LOVE YOU" déjà présent dans
  // la vallée mais en beaucoup plus grand.
  // ------------------------------------------------------------
  function buildSkyCountdown() {
    const { THREE, scene } = S.ctx;
    const group = new THREE.Group();
    group.name = "bdaySkyCountdown";

    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 620;
    const ctx2d = canvas.getContext("2d");
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(52, 20, 1);
    sprite.position.set(0, 34, -58);
    sprite.renderOrder = 999;
    group.add(sprite);

    // Petit halo d'étoiles scintillantes autour du chiffre, purement décoratif.
    const starGeo = new THREE.BufferGeometry();
    const starCount = 90;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 26 + Math.random() * 20;
      starPos[i * 3] = Math.cos(angle) * radius;
      starPos[i * 3 + 1] = 34 + Math.sin(angle) * 9 + (Math.random() - 0.5) * 6;
      starPos[i * 3 + 2] = -58 + (Math.random() - 0.5) * 14;
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xffe3ad, size: 0.5, transparent: true, opacity: 0.85, depthWrite: false
    }));
    stars.renderOrder = 998;
    group.add(stars);

    scene.add(group);
    S.sky = {
      group, sprite, stars, canvas, ctx: ctx2d, texture,
      startedAt: now(), raf: null, lastText: null
    };
    updateSkyCountdownText("--:--");
    tickSkyCountdown();
  }

  function updateSkyCountdownText(text) {
    if (!S.sky || S.sky.lastText === text) return;
    S.sky.lastText = text;
    const { canvas, ctx: c, texture } = S.sky;
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.textAlign = "center";
    c.textBaseline = "middle";

    c.font = "600 44px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    c.fillStyle = "rgba(255, 241, 221, 0.62)";
    c.shadowBlur = 0;
    c.fillText("U N   M O M E N T   V O U S   A T T E N D", canvas.width / 2, 92);

    const size = text.length > 6 ? 190 : 300;
    c.font = `800 ${size}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    c.shadowColor = "rgba(255, 190, 106, 0.95)";
    c.shadowBlur = 55;
    c.fillStyle = "#ffdda0";
    c.fillText(text, canvas.width / 2, canvas.height / 2 + 55);
    c.shadowBlur = 30;
    c.fillText(text, canvas.width / 2, canvas.height / 2 + 55);
    c.shadowBlur = 0;

    texture.needsUpdate = true;
  }

  function tickSkyCountdown() {
    if (!S.sky) return;
    const elapsed = now() - S.sky.startedAt;
    const pulse = 1 + Math.sin(elapsed * 1.1) * 0.025;
    S.sky.sprite.scale.set(52 * pulse, 20 * pulse, 1);
    S.sky.sprite.position.y = 34 + Math.sin(elapsed * 0.6) * 0.8;
    const starPos = S.sky.stars.geometry.attributes.position;
    for (let i = 0; i < starPos.count; i += 1) {
      const mat = S.sky.stars.material;
      mat.opacity = 0.55 + Math.sin(elapsed * 2 + i) * 0.3 * 0.5 + 0.25;
    }
    S.sky.raf = requestAnimationFrame(tickSkyCountdown);
  }

  function removeSkyCountdown() {
    if (!S.sky) return;
    if (S.sky.raf) cancelAnimationFrame(S.sky.raf);
    S.ctx.scene.remove(S.sky.group);
    S.sky = null;
  }

  // ============================================================
  // 6. TRANSITIONS (fondu noir/blanc, clignement d'yeux)
  // ============================================================
  function fade(el, show, duration) {
    return new Promise((resolve) => {
      el.style.transitionDuration = `${duration}ms`;
      el.classList.toggle("show", show);
      setTimeout(resolve, duration);
    });
  }

  function eyeBlinkWake() {
    return new Promise((resolve) => {
      const canvas = S.ctx.renderer.domElement;
      canvas.classList.add("bday-blur");
      S.dom.eyelidTop.classList.add("closed");
      S.dom.eyelidBottom.classList.add("closed");
      setTimeout(() => {
        // paupières qui s'ouvrent lentement, vue encore floue puis nette
        S.dom.eyelidTop.classList.remove("closed");
        S.dom.eyelidBottom.classList.remove("closed");
        setTimeout(() => canvas.classList.remove("bday-blur"), 250);
        setTimeout(resolve, 1250);
      }, 550);
    });
  }

  // ============================================================
  // 7. SÉQUENCE PRINCIPALE
  // ============================================================
  async function beginSequence() {
    S.active = true;
    playWaterSplash();
    S.phase = PHASE.BLACKOUT;
    await fade(S.dom.fadeBlack, true, 1200);

    hideOriginalValley();
    buildRiverScene();
    positionCameraOnBoat();

    S.phase = PHASE.RIVER_WAKE;
    await eyeBlinkWake();
    await fade(S.dom.fadeBlack, false, 800);

    S.phase = PHASE.RIVER_RIDE;
    S.phaseStartedAt = now();
    S.dom.lookLayer.classList.add("active");
    S.dom.hint.classList.add("show");
    startAmbientLoop("river", { root: 220, scale: [0, 3, 5, 7, 10, 12, 15] });
  }

  function skipToPhaseForTesting() {
    if (!FORCE_PHASE) return false;
    S.active = true;
    hideBaseUi(true);
    hideOriginalValley();
    if (FORCE_PHASE === "river") {
      buildRiverScene();
      positionCameraOnBoat();
      S.phase = PHASE.RIVER_RIDE;
      S.phaseStartedAt = now();
      S.dom.lookLayer.classList.add("active");
      S.dom.hint.classList.add("show");
      startAmbientLoop("river", { root: 220, scale: [0, 3, 5, 7, 10, 12, 15] });
    } else if (FORCE_PHASE === "snow") {
      buildSnowScene();
      S.phase = PHASE.SNOW_SCENE;
      S.phaseStartedAt = now();
      S.dom.lookLayer.classList.add("active");
      S.dom.hint.classList.add("show");
      startAmbientLoop("snow", { root: 261.6, scale: [0, 2, 4, 7, 9, 12, 16] });
    }
    return true;
  }

  function hideOriginalValley() {
    S.hiddenValleyNodes = S.ctx.scene.children.slice();
    S.hiddenValleyNodes.forEach((node) => { node.visible = false; });
    S.ctx.scene.background = new S.ctx.THREE.Color(0x040814);
    S.ctx.scene.fog = new S.ctx.THREE.FogExp2(0x040814, 0.014);
  }

  // ============================================================
  // 8. SCÈNE RIVIÈRE — barque, saules pleureurs fleuris, poissons
  // ============================================================
  function buildRiverScene() {
    const { THREE, scene } = S.ctx;
    const group = new THREE.Group();
    group.name = "bdayRiver";
    scene.add(group);
    S.river.group = group;

    // Eau : long ruban rectiligne, matière sombre et brillante avec léger flot animé
    const waterGeo = new THREE.PlaneGeometry(CONFIG.riverWidth, CONFIG.riverLength, 1, 40);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x0c2a4a, roughness: 0.22, metalness: 0.1, transparent: true, opacity: 0.92
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.02, -CONFIG.riverLength / 2 + 4);
    group.add(water);
    S.river.waterMesh = water;

    // Berges basses
    const bankGeo = new THREE.BoxGeometry(1, 0.25, CONFIG.riverLength);
    const bankMat = new THREE.MeshLambertMaterial({ color: 0x213a24 });
    [-1, 1].forEach((side) => {
      const bank = new THREE.Mesh(bankGeo, bankMat);
      bank.position.set(side * (CONFIG.riverWidth / 2 + 0.5), 0.05, -CONFIG.riverLength / 2 + 4);
      group.add(bank);
    });

    // Lumière de lune douce + points de lumière chauds des lanternes de saule
    const moonLight = new THREE.DirectionalLight(0x99b4ff, 0.35);
    moonLight.position.set(-10, 30, 10);
    group.add(moonLight);
    group.add(new THREE.AmbientLight(0x24304f, 0.55));

    // Saules pleureurs fleuris le long des deux rives
    const willowCount = Math.floor(CONFIG.riverLength / 6);
    for (let i = 0; i < willowCount; i += 1) {
      const z = 6 - i * 6 + (Math.random() - 0.5) * 1.5;
      [-1, 1].forEach((side) => {
        const x = side * (CONFIG.riverWidth / 2 + 1.4 + Math.random() * 0.8);
        group.add(buildWillow(x, z));
      });
    }

    // Poissons oranges et noirs
    S.river.fish = [];
    for (let i = 0; i < 12; i += 1) {
      const fish = buildFish();
      fish.position.set(
        (Math.random() - 0.5) * (CONFIG.riverWidth - 1.5),
        -0.15 + Math.random() * 0.1,
        6 - Math.random() * CONFIG.riverLength
      );
      group.add(fish);
      S.river.fish.push({ mesh: fish, phase: Math.random() * Math.PI * 2, speedZ: 0.4 + Math.random() * 0.3 });
    }

    // Chute d'eau à l'extrémité du parcours
    const waterfallGeo = new THREE.PlaneGeometry(CONFIG.riverWidth + 2, 9);
    const waterfallMat = new THREE.MeshBasicMaterial({
      color: 0xbfe4ff, transparent: true, opacity: 0.75, side: THREE.DoubleSide
    });
    const waterfall = new THREE.Mesh(waterfallGeo, waterfallMat);
    waterfall.position.set(0, 3.5, -CONFIG.riverLength + 4);
    group.add(waterfall);
    S.river.waterfallMesh = waterfall;

    // Brume au pied de la chute
    const mistGeo = new THREE.SphereGeometry(0.4, 6, 6);
    const mistMat = new THREE.MeshBasicMaterial({ color: 0xdfeeff, transparent: true, opacity: 0.18 });
    S.river.mist = [];
    for (let i = 0; i < 18; i += 1) {
      const puff = new THREE.Mesh(mistGeo, mistMat.clone());
      puff.position.set((Math.random() - 0.5) * 6, Math.random() * 3, -CONFIG.riverLength + 4 + (Math.random() - 0.5) * 3);
      puff.scale.setScalar(1 + Math.random());
      group.add(puff);
      S.river.mist.push(puff);
    }

    // Petites lanternes chaudes suspendues le long des berges, façon guirlande
    S.river.lanterns = [];
    const lanternCount = Math.floor(CONFIG.riverLength / 4.5);
    for (let i = 0; i < lanternCount; i += 1) {
      const z = 5 - i * 4.5 + (Math.random() - 0.5) * 1.2;
      [-1, 1].forEach((side) => {
        const x = side * (CONFIG.riverWidth / 2 + 0.9);
        const lantern = buildHangingLantern();
        lantern.position.set(x, 2.1 + Math.sin(i * 1.7) * 0.3, z);
        lantern.userData.bobPhase = Math.random() * Math.PI * 2;
        group.add(lantern);
        S.river.lanterns.push(lantern);
      });
    }
    // Une seule vraie lumière ponctuelle tous les 3 lanternes pour rester léger
    S.river.lanterns.forEach((lantern, i) => {
      if (i % 3 !== 0) return;
      const light = new THREE.PointLight(0xffb35c, 0.55, 6);
      light.position.set(0, 0, 0);
      lantern.add(light);
    });

    // Reflets scintillants à la surface de l'eau
    const sparkGeo = new THREE.BufferGeometry();
    const sparkCount = 140;
    const sparkPos = new Float32Array(sparkCount * 3);
    for (let i = 0; i < sparkCount; i += 1) {
      sparkPos[i * 3] = (Math.random() - 0.5) * (CONFIG.riverWidth - 0.6);
      sparkPos[i * 3 + 1] = 0.05;
      sparkPos[i * 3 + 2] = 5 - Math.random() * CONFIG.riverLength;
    }
    sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
    const sparkles = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
      color: 0xffdca3, size: 0.09, transparent: true, opacity: 0.75, depthWrite: false
    }));
    group.add(sparkles);
    S.river.sparkles = sparkles;

    // Barque avec sa propre petite lanterne à la proue
    S.boat = buildBoat();
    group.add(S.boat.group);
    S.boat.group.position.set(0, 0, 5);
  }

  function buildHangingLantern() {
    const { THREE } = S.ctx;
    const group = new THREE.Group();
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.7, 4),
      new THREE.MeshBasicMaterial({ color: 0x2a2015 })
    );
    cord.position.y = 0.35;
    group.add(cord);
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.4, 0.32),
      new THREE.MeshLambertMaterial({ color: 0xffcf8a, emissive: 0xff9a3d, emissiveIntensity: 0.85 })
    );
    group.add(body);
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.08, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x4a3320 })
    );
    cap.position.y = 0.24;
    group.add(cap);
    return group;
  }

  function buildWillow(x, z) {
    const { THREE } = S.ctx;
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.26, 2.6, 6),
      new THREE.MeshLambertMaterial({ color: 0x4a3320 })
    );
    trunk.position.y = 1.3;
    group.add(trunk);

    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0x2f5d3a })
    );
    canopy.position.y = 3;
    canopy.scale.set(1.2, 0.85, 1.2);
    group.add(canopy);

    // Branches pleureuses fleuries : brins qui tombent vers l'eau
    const strandMat = new THREE.MeshLambertMaterial({ color: 0xe9c7e0, emissive: 0x3a1f38, emissiveIntensity: 0.4 });
    for (let i = 0; i < 10; i += 1) {
      const angle = (i / 10) * Math.PI * 2;
      const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 2.4, 4), strandMat);
      strand.position.set(Math.cos(angle) * 1.1, 2.1, Math.sin(angle) * 1.1);
      strand.rotation.z = Math.cos(angle) * 0.15;
      strand.rotation.x = Math.sin(angle) * 0.15;
      strand.userData.swayPhase = Math.random() * Math.PI * 2;
      group.add(strand);
    }

    group.position.set(x, 0, z);
    group.userData.isWillow = true;
    group.userData.swayPhase = Math.random() * Math.PI * 2;
    S.river.willows.push(group);
    return group;
  }

  function buildFish() {
    const { THREE } = S.ctx;
    const group = new THREE.Group();
    const orange = new THREE.MeshLambertMaterial({ color: 0xff7a2e, emissive: 0x552300, emissiveIntensity: 0.25 });
    const black = new THREE.MeshLambertMaterial({ color: 0x161311 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.5), Math.random() > 0.4 ? orange : black);
    group.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.14, 0.2), body.material);
    tail.position.z = 0.32;
    group.add(tail);
    return group;
  }

  function buildBoat() {
    const { THREE } = S.ctx;
    const group = new THREE.Group();
    const wood = new THREE.MeshLambertMaterial({ color: 0x7b4a28 });
    const trim = new THREE.MeshLambertMaterial({ color: 0xd1ad73 });

    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.34, 2.7), wood);
    hull.position.y = 0.2;
    group.add(hull);

    const bow = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.3, 0.42), wood);
    bow.position.set(0, 0.22, -1.5);
    bow.rotation.x = 0.28;
    group.add(bow);

    const stern = bow.clone();
    stern.position.z = 1.5;
    stern.rotation.x = -0.28;
    group.add(stern);

    for (const z of [-0.5, 0.5]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.24), trim);
      seat.position.set(0, 0.44, z);
      group.add(seat);
    }

    // Petite lanterne à la proue pour éclairer chaudement le trajet
    const prowLantern = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.24, 0.2),
      new THREE.MeshLambertMaterial({ color: 0xffcf8a, emissive: 0xff9a3d, emissiveIntensity: 1 })
    );
    prowLantern.position.set(0.45, 0.5, -1.55);
    group.add(prowLantern);
    const prowLight = new THREE.PointLight(0xffb35c, 0.7, 5);
    prowLight.position.copy(prowLantern.position);
    group.add(prowLight);

    return { group, bobPhase: Math.random() * Math.PI * 2 };
  }

  function positionCameraOnBoat() {
    const { camera } = S.ctx;
    S.boat.group.add(camera);
    camera.position.set(0, 1.05, 0.1);
    S.look.yaw = 0;
    S.look.pitch = 0.04;
    camera.rotation.set(0, 0, 0);
  }

  // ============================================================
  // 9. SCÈNE HIVER — clairière enneigée, aurore boréale
  // ============================================================
  const AURORA_FRAGMENT = `
    varying vec2 vUv;
    uniform float uTime;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p); vec2 f = fract(p);
      float a = hash(i), b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }
    float fbm(vec2 p) {
      float v = 0.0; float amp = 0.5;
      for (int i = 0; i < 5; i += 1) { v += amp * noise(p); p *= 2.0; amp *= 0.5; }
      return v;
    }
    void main() {
      vec2 uv = vUv;
      float t = uTime * 0.05;
      float n = fbm(vec2(uv.x * 5.2 + t, uv.y * 2.4 - t * 0.4));
      float band = smoothstep(0.12, 0.8, n) * smoothstep(1.0, 0.1, uv.y) * smoothstep(0.0, 0.15, uv.y);
      vec3 green = vec3(0.18, 0.95, 0.58);
      vec3 purple = vec3(0.46, 0.3, 0.92);
      vec3 teal = vec3(0.14, 0.62, 0.9);
      vec3 col = mix(green, purple, smoothstep(0.2, 0.85, fract(uv.x * 2.0) + n * 0.3));
      col = mix(col, teal, n * 0.5);
      float alpha = band * (0.62 + 0.28 * sin(uTime * 0.35 + uv.x * 10.0));
      gl_FragColor = vec4(col, alpha);
    }
  `;
  const DOME_VERTEX = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  function buildSnowScene() {
    const { THREE, scene } = S.ctx;
    const group = new THREE.Group();
    group.name = "bdaySnow";
    scene.add(group);
    S.snow.group = group;

    scene.background = new THREE.Color(0x0a1330);
    scene.fog = new THREE.FogExp2(0x0e1c3a, 0.014);

    // Sol enneigé, légèrement vallonné
    const groundGeo = new THREE.PlaneGeometry(260, 260, 70, 70);
    const posAttr = groundGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i += 1) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const h = Math.sin(x * 0.05) * 0.6 + Math.cos(y * 0.04) * 0.5 + Math.sin((x + y) * 0.02) * 0.8;
      posAttr.setZ(i, h);
    }
    groundGeo.computeVertexNormals();
    const groundMat = new THREE.MeshStandardMaterial({ color: 0xeaf3ff, roughness: 0.85, metalness: 0.0 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    group.add(ground);

    // Sapins enneigés
    for (let i = 0; i < 70; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 10 + Math.random() * 85;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      group.add(buildSnowyPine(x, z, 1 + Math.random() * 1.4));
    }

    // Chaîne de montagnes enneigées tout autour de l'horizon
    buildMountainRange(group);

    // Un petit chalet en rondins, fumée qui monte de la cheminée
    S.snow.chimneySmoke = [];
    const chalet = buildChalet(-16, -24, 0.35);
    group.add(chalet);

    // Attelage de huskies + traîneau, prêts à partir dans la neige
    S.snow.huskies = [];
    const huskyColors = [0xf3f2ee, 0xdcd5c8, 0x8f8f96];
    for (let i = 0; i < 3; i += 1) {
      const husky = buildHusky(9 - i * 0.3, -13 - i * 1.9, Math.PI * 0.08, huskyColors[i % huskyColors.length]);
      husky.userData.phase = i * 1.4;
      group.add(husky);
      S.snow.huskies.push(husky);
    }
    group.add(buildSled(10.4, -10.4, Math.PI * 0.08));

    // Petits rennes qui broutent la neige, dispersés dans la clairière
    S.snow.reindeer = [];
    const deerSpots = [
      [-24, -10], [17, -27], [-7, -33], [23, -5], [-30, -30]
    ];
    deerSpots.forEach(([x, z], i) => {
      const deer = buildReindeer(x, z, Math.random() * Math.PI * 2);
      deer.userData.phase = i * 1.1;
      group.add(deer);
      S.snow.reindeer.push(deer);
    });

    // Lumière : lune froide + halo d'aurore
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(3, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xf3f6ff })
    );
    moon.position.set(-30, 40, -50);
    group.add(moon);
    group.add(new THREE.PointLight(0xdfe8ff, 0.6, 200));
    group.add(new THREE.AmbientLight(0x3a4a82, 0.7));
    const moonLight = new THREE.DirectionalLight(0xcdd8ff, 0.5);
    moonLight.position.copy(moon.position);
    group.add(moonLight);

    // Étoiles
    const starGeo = new THREE.BufferGeometry();
    const starCount = 600;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i += 1) {
      const r = 150 + Math.random() * 50;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.5;
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = 20 + r * Math.cos(phi) * 0.6;
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, transparent: true, opacity: 0.85 }));
    group.add(stars);

    // Aurore boréale : un vrai dôme à 360° qui enveloppe tout le ciel,
    // vu de l'intérieur, pour qu'elle occupe tout l'écran où qu'on regarde.
    S.snow.auroraMaterials = [];
    const domeGeo = new THREE.CylinderGeometry(105, 105, 95, 64, 1, true);
    const domeMat = new THREE.ShaderMaterial({
      vertexShader: DOME_VERTEX,
      fragmentShader: AURORA_FRAGMENT,
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending
    });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.position.set(0, 52, 0);
    group.add(dome);
    S.snow.auroraMaterials.push(domeMat);

    // Neige qui tombe, plus dense pour l'ambiance "cliché de Noël"
    const flakeGeo = new THREE.BufferGeometry();
    const flakeCount = 1400;
    const flakePos = new Float32Array(flakeCount * 3);
    for (let i = 0; i < flakeCount; i += 1) {
      flakePos[i * 3] = (Math.random() - 0.5) * 90;
      flakePos[i * 3 + 1] = Math.random() * 32;
      flakePos[i * 3 + 2] = (Math.random() - 0.5) * 90;
    }
    flakeGeo.setAttribute("position", new THREE.BufferAttribute(flakePos, 3));
    const flakes = new THREE.Points(flakeGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.13, transparent: true, opacity: 0.9 }));
    group.add(flakes);
    S.snow.snowflakes = flakes;

    // Caméra posée dans la clairière, face au chalet et à l'attelage
    S.ctx.camera.position.set(0, 1.7, 6);
    S.look.yaw = -0.35;
    S.look.pitch = 0.1;
  }

  // ------------------------------------------------------------
  // Montagnes enneigées à l'horizon, tout autour de la clairière
  // ------------------------------------------------------------
  function buildMountainRange(group) {
    const { THREE } = S.ctx;
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x3c4666 });
    const snowMat = new THREE.MeshLambertMaterial({ color: 0xf5f9ff });
    const count = 30;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.12;
      const radius = 118 + Math.random() * 30;
      const height = 22 + Math.random() * 26;
      const base = 10 + Math.random() * 8;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      const peak = new THREE.Mesh(new THREE.ConeGeometry(base, height, 6), rockMat);
      peak.position.set(x, height / 2 - 2, z);
      peak.rotation.y = Math.random() * Math.PI;
      group.add(peak);

      const cap = new THREE.Mesh(new THREE.ConeGeometry(base * 0.55, height * 0.4, 6), snowMat);
      cap.position.set(x, height * 0.8 - 2, z);
      cap.rotation.y = peak.rotation.y;
      group.add(cap);
    }
  }

  // ------------------------------------------------------------
  // Petit chalet en rondins avec fenêtre qui brille et cheminée qui fume
  // ------------------------------------------------------------
  function buildChalet(x, z, rotY) {
    const { THREE } = S.ctx;
    const group = new THREE.Group();
    const logMat = new THREE.MeshLambertMaterial({ color: 0x6b4527 });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x8a2f2f });
    const snowMat = new THREE.MeshLambertMaterial({ color: 0xf3f8ff });
    const doorMat = new THREE.MeshLambertMaterial({ color: 0x3a2314 });

    const walls = new THREE.Mesh(new THREE.BoxGeometry(6, 3.4, 5.4), logMat);
    walls.position.y = 1.7;
    group.add(walls);

    // Toit à deux pans
    const roofL = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.25, 3.6), roofMat);
    roofL.position.set(0, 3.6, -1.55);
    roofL.rotation.x = -0.5;
    group.add(roofL);
    const roofR = roofL.clone();
    roofR.position.z = 1.55;
    roofR.rotation.x = 0.5;
    group.add(roofR);
    const snowL = new THREE.Mesh(new THREE.BoxGeometry(6.7, 0.14, 1.4), snowMat);
    snowL.position.set(0, 4.15, -2.55);
    snowL.rotation.x = -0.5;
    group.add(snowL);
    const snowR = snowL.clone();
    snowR.position.z = 2.55;
    snowR.rotation.x = 0.5;
    group.add(snowR);

    // Cheminée
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.4, 0.55), new THREE.MeshLambertMaterial({ color: 0x4a4a52 }));
    chimney.position.set(1.6, 4.6, 0.2);
    group.add(chimney);

    // Porte
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.9, 0.1), doorMat);
    door.position.set(-1.6, 0.95, 2.71);
    group.add(door);

    // Fenêtre chaude et lumineuse
    const window1 = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffd48a })
    );
    window1.position.set(1.2, 2, 2.71);
    group.add(window1);
    const windowFrame = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.15, 0.08), new THREE.MeshLambertMaterial({ color: 0x2f1c10 }));
    windowFrame.position.set(1.2, 2, 2.68);
    group.add(windowFrame);
    const windowLight = new THREE.PointLight(0xffc772, 0.9, 12);
    windowLight.position.set(1.2, 2, 3.4);
    group.add(windowLight);

    // Congère de neige au pied des murs
    const snowdrift = new THREE.Mesh(new THREE.SphereGeometry(3.4, 10, 6), snowMat);
    snowdrift.scale.set(1.35, 0.22, 1.2);
    snowdrift.position.y = 0.05;
    group.add(snowdrift);

    // Petit sapin décoré à côté de la porte
    group.add(buildSnowyPine(-2.6, 3.3, 0.7));

    group.position.set(x, 0, z);
    group.rotation.y = rotY || 0;

    // Points de départ pour la fumée de la cheminée (en coordonnées monde)
    const smokeOrigin = new THREE.Vector3(1.6, 5.4, 0.2).applyEuler(new THREE.Euler(0, rotY || 0, 0)).add(new THREE.Vector3(x, 0, z));
    for (let i = 0; i < 8; i += 1) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xdfe4ea, transparent: true, opacity: 0.35 })
      );
      puff.position.copy(smokeOrigin);
      puff.position.y += i * 0.35;
      puff.userData.origin = smokeOrigin.clone();
      puff.userData.riseOffset = i * 0.35;
      S.snow.group.add(puff);
      S.snow.chimneySmoke.push(puff);
    }

    return group;
  }

  // ------------------------------------------------------------
  // Husky voxel, pelage clair/gris, prêt à tirer le traîneau
  // ------------------------------------------------------------
  function buildHusky(x, z, rotY, color) {
    const { THREE } = S.ctx;
    const group = new THREE.Group();
    const fur = new THREE.MeshLambertMaterial({ color });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2b2b30 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 1.05), fur);
    body.position.y = 0.55;
    group.add(body);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.38, 0.38), fur);
    head.position.set(0, 0.78, -0.68);
    group.add(head);

    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.26), fur);
    snout.position.set(0, 0.72, -0.9);
    group.add(snout);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.05), dark);
    nose.position.set(0, 0.7, -1.02);
    group.add(nose);

    [-1, 1].forEach((side) => {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 4), fur);
      ear.position.set(side * 0.13, 1.0, -0.66);
      group.add(ear);
    });

    const legGeo = new THREE.BoxGeometry(0.13, 0.5, 0.13);
    [[-0.16, 0.4], [0.16, 0.4], [-0.16, -0.35], [0.16, -0.35]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legGeo, dark);
      leg.position.set(lx, 0.25, lz);
      group.add(leg);
    });

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.5), fur);
    tail.position.set(0, 0.75, 0.68);
    tail.rotation.x = 0.6;
    group.add(tail);
    group.userData.tail = tail;

    // Harnais rouge, joli petit contraste dans la neige
    const harness = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.06, 0.12), new THREE.MeshLambertMaterial({ color: 0xc23a3a }));
    harness.position.set(0, 0.68, -0.2);
    group.add(harness);

    group.position.set(x, 0, z);
    group.rotation.y = rotY || 0;
    return group;
  }

  // ------------------------------------------------------------
  // Petit traîneau en bois avec ses patins
  // ------------------------------------------------------------
  function buildSled(x, z, rotY) {
    const { THREE } = S.ctx;
    const group = new THREE.Group();
    const wood = new THREE.MeshLambertMaterial({ color: 0x6b4527 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x3a2a18 });

    const bed = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.12, 1.6), wood);
    bed.position.y = 0.42;
    group.add(bed);

    [-1, 1].forEach((side) => {
      const runner = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 1.9), dark);
      runner.position.set(side * 0.34, 0.2, 0.05);
      group.add(runner);
      const curl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.3), dark);
      curl.position.set(side * 0.34, 0.42, -0.98);
      curl.rotation.x = -0.9;
      group.add(curl);
    });

    for (let i = -1; i <= 1; i += 1) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.12), wood);
      slat.position.set(0, 0.5, i * 0.5);
      group.add(slat);
    }

    // Petite lanterne à l'arrière pour le côté féerique
    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.16), new THREE.MeshLambertMaterial({ color: 0xffcf8a, emissive: 0xff9a3d, emissiveIntensity: 0.9 }));
    lantern.position.set(0, 0.72, 0.75);
    group.add(lantern);

    group.position.set(x, 0, z);
    group.rotation.y = rotY || 0;
    return group;
  }

  // ------------------------------------------------------------
  // Petit renne voxel, bois qui broute dans la clairière
  // ------------------------------------------------------------
  function buildReindeer(x, z, rotY) {
    const { THREE } = S.ctx;
    const group = new THREE.Group();
    const coat = new THREE.MeshLambertMaterial({ color: 0x7a5232 });
    const belly = new THREE.MeshLambertMaterial({ color: 0xdcc7a8 });
    const antlerMat = new THREE.MeshLambertMaterial({ color: 0x4a3626 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 1.15), coat);
    body.position.y = 0.75;
    group.add(body);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.4), belly);
    chest.position.set(0, 0.55, -0.55);
    group.add(chest);

    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.5, 0.28), coat);
    neck.position.set(0, 1.1, -0.62);
    neck.rotation.x = -0.45;
    group.add(neck);
    group.userData.neck = neck;

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.42), coat);
    head.position.set(0, 1.42, -0.9);
    group.add(head);

    // Bois d'andouiller, quelques branches asymétriques façon Minecraft
    [-1, 1].forEach((side) => {
      const main = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), antlerMat);
      main.position.set(side * 0.13, 1.78, -0.9);
      main.rotation.z = side * 0.35;
      group.add(main);
      const branch = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.26, 0.05), antlerMat);
      branch.position.set(side * 0.28, 1.94, -0.82);
      branch.rotation.z = side * 1.1;
      group.add(branch);
    });

    const legGeo = new THREE.BoxGeometry(0.14, 0.62, 0.14);
    [[-0.18, 0.42], [0.18, 0.42], [-0.18, -0.38], [0.18, -0.38]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legGeo, coat);
      leg.position.set(lx, 0.31, lz);
      group.add(leg);
    });

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.12), belly);
    tail.position.set(0, 0.85, 0.6);
    group.add(tail);

    group.position.set(x, 0, z);
    group.rotation.y = rotY || 0;
    return group;
  }

  function buildSnowyPine(x, z, scale) {
    const { THREE } = S.ctx;
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.22, 1.2, 6),
      new THREE.MeshLambertMaterial({ color: 0x3b2a1c })
    );
    trunk.position.y = 0.6;
    group.add(trunk);
    const tiers = 3;
    for (let i = 0; i < tiers; i += 1) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(1.1 - i * 0.28, 1.5, 8),
        new THREE.MeshLambertMaterial({ color: 0x24422c })
      );
      cone.position.y = 1.4 + i * 1.05;
      group.add(cone);
      const snowCap = new THREE.Mesh(
        new THREE.ConeGeometry(1.1 - i * 0.28 + 0.05, 0.35, 8),
        new THREE.MeshLambertMaterial({ color: 0xf4f8ff })
      );
      snowCap.position.y = 1.4 + i * 1.05 + 0.6;
      group.add(snowCap);
    }
    group.position.set(x, 0, z);
    group.scale.setScalar(scale);
    return group;
  }

  function createSkyText(text) {
    const { THREE } = S.ctx;
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 96px Georgia, 'Times New Roman', serif";
    ctx.shadowColor = "rgba(255, 214, 150, 0.9)";
    ctx.shadowBlur = 40;
    ctx.fillStyle = "#fff6e0";
    wrapText(ctx, text, canvas.width / 2, canvas.height / 2, canvas.width - 160, 108);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0 });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(48, 12, 1);
    sprite.position.set(0, 26, -40);
    return sprite;
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(" ");
    const lines = [];
    let line = "";
    words.forEach((word) => {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    const startY = y - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lineHeight));
  }

  // ============================================================
  // 10. CONTRÔLE DU REGARD (façon Roblox : glisser pour regarder)
  // ============================================================
  function setupLookControls() {
    const layer = S.dom.lookLayer;
    const onStart = (x, y, id) => {
      S.look.dragging = true;
      S.look.lastX = x;
      S.look.lastY = y;
      S.look.touchId = id;
    };
    const onMove = (x, y) => {
      if (!S.look.dragging) return;
      const dx = x - S.look.lastX;
      const dy = y - S.look.lastY;
      S.look.lastX = x;
      S.look.lastY = y;
      S.look.yaw -= dx * 0.0035;
      S.look.pitch = Math.max(-0.6, Math.min(0.6, S.look.pitch - dy * 0.0035));
    };
    const onEnd = () => { S.look.dragging = false; S.look.touchId = null; };

    layer.addEventListener("mousedown", (e) => onStart(e.clientX, e.clientY, "mouse"));
    window.addEventListener("mousemove", (e) => { if (S.look.touchId === "mouse") onMove(e.clientX, e.clientY); });
    window.addEventListener("mouseup", () => { if (S.look.touchId === "mouse") onEnd(); });

    layer.addEventListener("touchstart", (e) => {
      const t = e.changedTouches[0];
      onStart(t.clientX, t.clientY, t.identifier);
    }, { passive: true });
    layer.addEventListener("touchmove", (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === S.look.touchId) onMove(t.clientX, t.clientY);
      }
    }, { passive: true });
    layer.addEventListener("touchend", (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === S.look.touchId) onEnd();
      }
    }, { passive: true });
  }

  // ============================================================
  // 11. BOUCLE DE MISE À JOUR
  // ============================================================
  function applyLook() {
    const { camera } = S.ctx;
    camera.rotation.order = "YXZ";
    camera.rotation.y = S.look.yaw;
    camera.rotation.x = S.look.pitch;
  }

  function updateRiverRide(delta, elapsed) {
    const speed = CONFIG.riverLength / CONFIG.riverDuration;
    S.boat.group.position.z -= speed * delta;
    S.boat.group.position.y = Math.sin(elapsed * 1.3 + S.boat.bobPhase) * 0.035;
    S.boat.group.rotation.z = Math.sin(elapsed * 1.1 + S.boat.bobPhase) * 0.02;
    applyLook();

    S.river.willows.forEach((w) => {
      w.rotation.z = Math.sin(elapsed * 0.5 + w.userData.swayPhase) * 0.03;
    });
    S.river.fish.forEach((f) => {
      f.mesh.position.x += Math.sin(elapsed * 0.8 + f.phase) * 0.01;
      f.mesh.position.z += Math.sin(elapsed * 0.6 + f.phase) * 0.006;
      f.mesh.rotation.y = Math.sin(elapsed * 0.8 + f.phase) * 0.4;
    });
    if (S.river.waterfallMesh) {
      S.river.waterfallMesh.material.opacity = 0.7 + Math.sin(elapsed * 3) * 0.05;
    }
    S.river.mist.forEach((m, i) => {
      m.position.y = 0.5 + Math.sin(elapsed * 1.2 + i) * 0.4;
      m.material.opacity = 0.12 + Math.sin(elapsed * 2 + i) * 0.05;
    });
    if (S.river.lanterns) {
      S.river.lanterns.forEach((l) => {
        l.rotation.z = Math.sin(elapsed * 0.9 + l.userData.bobPhase) * 0.08;
        l.position.y += Math.sin(elapsed * 1.4 + l.userData.bobPhase) * 0.0006;
      });
    }
    if (S.river.sparkles) {
      S.river.sparkles.material.opacity = 0.55 + Math.sin(elapsed * 3) * 0.2;
    }

    const reachedEnd = S.boat.group.position.z <= -CONFIG.riverLength + 10;
    const timeUp = now() - S.phaseStartedAt >= CONFIG.riverDuration;
    if (reachedEnd || timeUp) {
      startWaterfallArrival();
    }
  }

  async function startWaterfallArrival() {
    if (S.phase !== PHASE.RIVER_RIDE) return;
    S.phase = PHASE.WATERFALL;
    S.dom.lookLayer.classList.remove("active");
    S.dom.hint.classList.remove("show");
    playWaterSplash();
    await new Promise((r) => setTimeout(r, 1400));
    S.phase = PHASE.WHITEOUT;
    await fade(S.dom.fadeWhite, true, 1400);
    stopAllAudioLoops();

    S.river.group.visible = false;
    buildSnowScene();

    S.phase = PHASE.SNOW_WAKE;
    await eyeBlinkWake();
    await fade(S.dom.fadeWhite, false, 900);

    S.phase = PHASE.SNOW_SCENE;
    S.phaseStartedAt = now();
    S.dom.lookLayer.classList.add("active");
    S.dom.hint.classList.add("show");
    startAmbientLoop("snow", { root: 261.6, scale: [0, 2, 4, 7, 9, 12, 16] });

    const skyText = createSkyText(CONFIG.finalText);
    S.ctx.scene.add(skyText);
    S.snow.textSprite = skyText;
  }

  function updateSnowScene(delta, elapsed) {
    applyLook();
    S.snow.auroraMaterials.forEach((mat, i) => { mat.uniforms.uTime.value = elapsed * (1 + i * 0.15); });
    if (S.snow.snowflakes) {
      const pos = S.snow.snowflakes.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 1) {
        let y = pos.getY(i) - delta * 1.4;
        if (y < 0) y = 30;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }
    if (S.snow.chimneySmoke) {
      S.snow.chimneySmoke.forEach((puff, i) => {
        puff.position.y = puff.userData.origin.y + ((elapsed * 0.7 + puff.userData.riseOffset) % 2.8);
        puff.position.x = puff.userData.origin.x + Math.sin(elapsed * 0.6 + i) * 0.15;
        const riseFrac = ((elapsed * 0.7 + puff.userData.riseOffset) % 2.8) / 2.8;
        puff.scale.setScalar(0.6 + riseFrac * 1.6);
        puff.material.opacity = 0.4 * (1 - riseFrac);
      });
    }
    if (S.snow.huskies) {
      S.snow.huskies.forEach((husky) => {
        const p = husky.userData.phase;
        husky.position.y = Math.sin(elapsed * 2.1 + p) * 0.015;
        if (husky.userData.tail) {
          husky.userData.tail.rotation.y = Math.sin(elapsed * 3.4 + p) * 0.35;
        }
      });
    }
    if (S.snow.reindeer) {
      S.snow.reindeer.forEach((deer) => {
        const p = deer.userData.phase;
        const graze = Math.sin(elapsed * 0.5 + p);
        if (deer.userData.neck) {
          deer.userData.neck.rotation.x = -0.45 + Math.max(0, graze) * 0.5;
        }
      });
    }
    if (S.snow.textSprite && now() - S.phaseStartedAt >= CONFIG.snowSceneMinDuration) {
      S.snow.textSprite.material.opacity = Math.min(1, S.snow.textSprite.material.opacity + delta * 0.3);
      S.phase = PHASE.FINALE;
    }
  }

  // ============================================================
  // 12. API PUBLIQUE
  // ============================================================
  function init(ctx) {
    S.ctx = ctx;
    injectStyles();
    buildDom();
    setupLookControls();

    if (skipToPhaseForTesting()) return;

    if (CONFIG.lockEntireSite) {
      startCountdown();
    }
  }

  function update(delta, elapsed) {
    if (!S.active) return;
    switch (S.phase) {
      case PHASE.RIVER_RIDE:
        updateRiverRide(delta, elapsed);
        break;
      case PHASE.SNOW_SCENE:
      case PHASE.FINALE:
        updateSnowScene(delta, elapsed);
        break;
      default:
        break;
    }
    S.ctx.renderer.render(S.ctx.scene, S.ctx.camera);
  }

  function isActive() {
    return S.active;
  }

  window.BirthdayEvent = { init, update, isActive };
})();
