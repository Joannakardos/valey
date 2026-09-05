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
    // L'événement démarre 1 minutes après l'ouverture de la page.
    // (Ancienne version basée sur le 20 septembre conservée en commentaire ci-dessous.)
    getTargetDate() {
      return new Date(Date.now() + 60 * 1000);
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
    context.resume().catch(() => { });
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
    context.resume().catch(() => { });
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
    const loveText = S.ctx.scene.getObjectByName("moonLoveText");
    if (loveText) loveText.visible = true;
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
    // Placé à droite du "I LOVE YOU" près de la lune.
    sprite.scale.set(24, 9, 1);
    sprite.position.set(40, 56, -30);
    sprite.renderOrder = 999;
    group.add(sprite);

    // Petit halo d'étoiles scintillantes autour du chiffre, purement décoratif.
    const starGeo = new THREE.BufferGeometry();
    const starCount = 90;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 26 + Math.random() * 20;
      starPos[i * 3] = 40 + Math.cos(angle) * radius * 0.45;
      starPos[i * 3 + 1] = 56 + Math.sin(angle) * 4 + (Math.random() - 0.5) * 3;
      starPos[i * 3 + 2] = -30 + (Math.random() - 0.5) * 7;
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
    S.sky.sprite.scale.set(24 * pulse, 9 * pulse, 1);
    S.sky.sprite.position.y = 56 + Math.sin(elapsed * 0.6) * 0.35;
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
  // 8. SCÈNE RIVIÈRE — barque, cerisiers pleureurs voxels, poissons
  // ============================================================

  // ------------------------------------------------------------
  // 8a. Textures pixel-art (même technique que main.js : canvas +
  // NearestFilter) pour obtenir le rendu "bloc Minecraft" de la
  // photo de référence, au lieu de sphères/cylindres lisses.
  // ------------------------------------------------------------
  const TEX_CACHE = {};

  function pixelTexture(key, size, drawFn) {
    if (TEX_CACHE[key]) return TEX_CACHE[key];
    const { THREE } = S.ctx;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    drawFn(ctx, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    TEX_CACHE[key] = tex;
    return tex;
  }

  // Damier rose façon feuillage de cerisier Minecraft, avec quelques
  // pixels blancs qui scintillent comme des fleurs ouvertes.
  function blossomTexture(variant) {
    const palettes = [
      ["#e8779f", "#f6a8c4"],
      ["#f291b8", "#ffc3da"],
      ["#d95f8c", "#ef8fb2"]
    ];
    const [dark, light] = palettes[variant % palettes.length];
    return pixelTexture(`blossom${variant}`, 16, (ctx, size) => {
      const cell = size / 8;
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          ctx.fillStyle = (x + y) % 2 === 0 ? dark : light;
          ctx.fillRect(x * cell, y * cell, cell, cell);
        }
      }
      // pluie de petites fleurs blanches / bourgeons
      const sparkles = [[1, 1], [5, 2], [3, 4], [6, 6], [1, 6], [4, 0]];
      ctx.fillStyle = "#fff3f8";
      sparkles.forEach(([x, y]) => ctx.fillRect(x * cell, y * cell, cell, cell));
    });
  }

  function barkTexture() {
    return pixelTexture("bark", 16, (ctx, size) => {
      const cell = size / 8;
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          const n = (x * 3 + y * 7) % 5;
          ctx.fillStyle = n < 2 ? "#4a3320" : n < 4 ? "#5a3f27" : "#3a2718";
          ctx.fillRect(x * cell, y * cell, cell, cell);
        }
      }
    });
  }

  // Eau sombre et légèrement pixelisée (au lieu d'un dégradé lisse),
  // qui accroche les reflets chauds des lanternes comme sur la photo.
  function waterTexture() {
    const { THREE } = S.ctx;
    const tex = pixelTexture("water", 16, (ctx, size) => {
      const cell = size / 8;
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          const n = (x * 5 + y * 3) % 4;
          const shades = ["#03101f", "#04182a", "#051f33", "#02141f"];
          ctx.fillStyle = shades[n];
          ctx.fillRect(x * cell, y * cell, cell, cell);
        }
      }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, Math.max(6, Math.round(CONFIG.riverLength / 5)));
    return tex;
  }

  function grassBankTexture() {
    return pixelTexture("bank", 16, (ctx, size) => {
      const cell = size / 8;
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          const n = (x * 7 + y * 5) % 6;
          ctx.fillStyle = n < 3 ? "#1e5a24" : n < 5 ? "#256b2b" : "#173f1c";
          ctx.fillRect(x * cell, y * cell, cell, cell);
        }
      }
    });
  }

  // Même motif d'herbe que les berges, mais dans une texture séparée et
  // répétée en tuiles, pour couvrir tout le sol de la forêt sans changer
  // l'apparence des berges elles-mêmes.
  function grassFloorTexture() {
    const { THREE } = S.ctx;
    const tex = pixelTexture("forestFloor", 16, (ctx, size) => {
      const cell = size / 8;
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          const n = (x * 7 + y * 5) % 6;
          ctx.fillStyle = n < 3 ? "#1e5a24" : n < 5 ? "#256b2b" : "#173f1c";
          ctx.fillRect(x * cell, y * cell, cell, cell);
        }
      }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(18, Math.max(10, Math.round(CONFIG.riverLength / 6)));
    return tex;
  }

  // Nénuphar flottant : pad rond texturé + une petite fleur rose sur environ
  // 6 pads sur 10, dispersés sur les deux côtés de la rivière.
  function lilyPadTexture() {
    return pixelTexture("lilyPad", 16, (ctx, size) => {
      ctx.fillStyle = "#123a1f";
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1f6b3a";
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#2c8a4a";
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#154a28";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(size / 2, size / 2);
      ctx.lineTo(size / 2, 1.5);
      ctx.stroke();
    });
  }

  function buildLilyPad() {
    const { THREE } = S.ctx;
    const group = new THREE.Group();
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(0.2 + Math.random() * 0.12, 8),
      new THREE.MeshLambertMaterial({ map: lilyPadTexture(), side: THREE.DoubleSide })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.rotation.z = Math.random() * Math.PI;
    group.add(pad);
    if (Math.random() > 0.4) {
      const flower = new THREE.Mesh(
        new THREE.ConeGeometry(0.09, 0.11, 6),
        new THREE.MeshLambertMaterial({ color: 0xf6a8c4, emissive: 0x5a1f34, emissiveIntensity: 0.2 })
      );
      flower.position.y = 0.05;
      group.add(flower);
    }
    return group;
  }

  // Nuée de lucioles : un petit nuage de points lumineux jaune-vert qui
  // traverse la rivière de gauche à droite en s'éloignant vers l'horizon,
  // puis disparaît le temps que les deux autres nuées fassent leur trajet.
  function buildFireflySwarm(seed) {
    const { THREE } = S.ctx;
    const count = 14;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      pos[i * 3] = (Math.random() - 0.5) * 1.5;
      pos[i * 3 + 1] = Math.random() * 1.2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xd8ff8a, size: 0.1, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const points = new THREE.Points(geo, mat);
    points.userData.basePositions = pos.slice();
    points.userData.seed = seed * 3.7;
    points.visible = false;
    return points;
  }

  function lanternPaperTexture() {
    return pixelTexture("lanternPaper", 16, (ctx, size) => {
      ctx.fillStyle = "#fff2c8";
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = "#ffdd8f";
      ctx.fillRect(2, 2, size - 4, size - 4);
      ctx.fillStyle = "#fff8e2";
      ctx.fillRect(5, 5, size - 10, size - 10);
      ctx.fillStyle = "#c4a05a";
      ctx.fillRect(0, 0, size, 1);
      ctx.fillRect(0, size - 1, size, 1);
      ctx.fillRect(0, 0, 1, size);
      ctx.fillRect(size - 1, 0, 1, size);
    });
  }

  function koiTexture(red) {
    return pixelTexture(red ? "koiRed" : "koiBlack", 16, (ctx, size) => {
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = red ? "#e8241f" : "#141210";
      ctx.fillRect(2, 5, 11, 6);
      ctx.fillRect(5, 3, 7, 10);
      ctx.fillStyle = red ? "#ff6a52" : "#3a3530";
      ctx.fillRect(6, 5, 4, 3);
      ctx.fillStyle = "#f2f2ea";
      ctx.fillRect(9, 6, 2, 2);
    });
  }

  // ------------------------------------------------------------
  // Sabre voxel (katana) posé sur un petit présentoir en bois —
  // décor façon jardin japonais, planté le long des berges à
  // quelques endroits choisis.
  // ------------------------------------------------------------
  function bladeTexture() {
    return pixelTexture("katanaBlade", 16, (ctx, size) => {
      ctx.fillStyle = "#dfe6ec";
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = "#c3ccd4";
      ctx.fillRect(0, 6, size, 2);
      ctx.fillStyle = "#f4f8fb";
      ctx.fillRect(0, 0, size, 1);
    });
  }

  function buildKatana(scaleMul) {
    const { THREE } = S.ctx;
    const group = new THREE.Group();
    const bladeMat = new THREE.MeshLambertMaterial({ map: bladeTexture(), emissive: 0x1a2028, emissiveIntensity: 0.15 });
    const hiltMat = new THREE.MeshLambertMaterial({ color: 0x241811 });
    const guardMat = new THREE.MeshLambertMaterial({ color: 0xb8863a });

    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.045, 1.15), bladeMat);
    blade.position.z = -0.6;
    group.add(blade);

    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.06), guardMat);
    guard.position.z = 0.02;
    group.add(guard);

    const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.32), hiltMat);
    hilt.position.z = 0.2;
    group.add(hilt);

    group.rotation.x = Math.PI / 2;
    group.scale.setScalar(scaleMul || 1);
    return group;
  }

  function buildKatanaStand(x, z, rotY) {
    const { THREE } = S.ctx;
    const group = new THREE.Group();
    const wood = new THREE.MeshLambertMaterial({ map: barkTexture() });

    const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.28), wood);
    base.position.y = 0.55;
    group.add(base);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.08), wood);
    post.position.y = 0.28;
    group.add(post);

    // Deux sabres croisés, légèrement inclinés, posés sur le présentoir
    const katanaA = buildKatana(1);
    katanaA.position.set(0, 0.68, 0);
    katanaA.rotation.z = 0.35;
    group.add(katanaA);
    const katanaB = buildKatana(0.9);
    katanaB.position.set(0, 0.6, 0);
    katanaB.rotation.z = -0.35;
    group.add(katanaB);

    group.position.set(x, 0, z);
    group.rotation.y = rotY || 0;
    return group;
  }

  function buildRiverScene() {
    const { THREE, scene } = S.ctx;
    const group = new THREE.Group();
    group.name = "bdayRiver";
    scene.add(group);
    S.river.group = group;

    // Eau : long ruban rectiligne, texture pixel sombre + reflets chauds animés
    // Opacité légèrement réduite pour bien laisser voir les poissons sous la surface.
    const waterGeo = new THREE.PlaneGeometry(CONFIG.riverWidth, CONFIG.riverLength, 1, 40);
    const waterMat = new THREE.MeshStandardMaterial({
      map: waterTexture(), color: 0x3d6f8f, roughness: 0.18, metalness: 0.25,
      transparent: true, opacity: 0.82, emissive: 0x0a1a2a, emissiveIntensity: 0.4
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.02, -CONFIG.riverLength / 2 + 4);
    group.add(water);
    S.river.waterMesh = water;

    // Berges basses, texture d'herbe pixel façon bloc Minecraft
    const bankGeo = new THREE.BoxGeometry(1, 0.25, CONFIG.riverLength);
    const bankMat = new THREE.MeshLambertMaterial({ map: grassBankTexture() });
    [-1, 1].forEach((side) => {
      const bank = new THREE.Mesh(bankGeo, bankMat);
      bank.position.set(side * (CONFIG.riverWidth / 2 + 0.5), 0.05, -CONFIG.riverLength / 2 + 4);
      group.add(bank);
    });

    // Fond d'herbe qui s'étend sous toute la forêt (même texture que les
    // berges), pour que les rangées d'arbres les plus loin aient un vrai
    // sol au lieu de sembler posées sur du vide.
    const forestFloorMat = new THREE.MeshLambertMaterial({ map: grassFloorTexture() });
    [-1, 1].forEach((side) => {
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(24, CONFIG.riverLength + 24),
        forestFloorMat
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(side * (CONFIG.riverWidth / 2 + 12.5), -0.02, -CONFIG.riverLength / 2 + 4);
      group.add(floor);
    });

    // Lumière de lune douce + points de lumière chauds des lanternes de saule
    const moonLight = new THREE.DirectionalLight(0x99b4ff, 0.35);
    moonLight.position.set(-10, 30, 10);
    group.add(moonLight);
    group.add(new THREE.AmbientLight(0x24304f, 0.55));

    // Ciel bien étoilé pour la traversée nocturne
    const riverStarGeo = new THREE.BufferGeometry();
    const riverStarCount = 500;
    const riverStarPos = new Float32Array(riverStarCount * 3);
    for (let i = 0; i < riverStarCount; i += 1) {
      const r = 90 + Math.random() * 60;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.5;
      riverStarPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      riverStarPos[i * 3 + 1] = 15 + r * Math.cos(phi) * 0.7;
      riverStarPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta) - CONFIG.riverLength / 2;
    }
    riverStarGeo.setAttribute("position", new THREE.BufferAttribute(riverStarPos, 3));
    const riverStars = new THREE.Points(riverStarGeo, new THREE.PointsMaterial({
      color: 0xffffff, size: 0.5, transparent: true, opacity: 0.9
    }));
    group.add(riverStars);

    // ------------------------------------------------------------
    // FORÊT : rangée détaillée de saules pleureurs au bord de l'eau,
    // puis plusieurs rangées d'arbres plus simples et plus denses en
    // profondeur, pour donner l'impression d'être dans une vraie forêt
    // et pas juste d'avoir des arbres "posés à côté" de la rivière.
    // ------------------------------------------------------------
    const willowCount = Math.floor(CONFIG.riverLength / 6);
    for (let i = 0; i < willowCount; i += 1) {
      const z = 6 - i * 6 + (Math.random() - 0.5) * 1.5;
      [-1, 1].forEach((side) => {
        const x = side * (CONFIG.riverWidth / 2 + 1.4 + Math.random() * 0.8);
        group.add(buildWillow(x, z));
      });
    }

    // Rangées supplémentaires en arrière-plan : 4 profondeurs, de plus en
    // plus denses et de plus en plus loin des berges, avec des arbres plus
    // simples (moins coûteux) pour remplir l'arrière-plan sans ralentir.
    // Les 3 premières rangées portent chacune une petite lanterne (comme
    // demandé) ; la rangée la plus lointaine n'a qu'une lueur chaude sans
    // lanterne visible, pour rester légère et suggérer la profondeur.
    const forestRows = [
      { depth: 3.2, count: willowCount, scale: 0.85, lightStyle: "lantern" },
      { depth: 5.5, count: Math.round(willowCount * 1.3), scale: 0.75, lightStyle: "lantern" },
      { depth: 8.5, count: Math.round(willowCount * 1.6), scale: 0.65, lightStyle: "lantern" },
      { depth: 12.5, count: Math.round(willowCount * 2), scale: 0.55, lightStyle: "glow" }
    ];
    forestRows.forEach((row) => {
      for (let i = 0; i < row.count; i += 1) {
        const z = 8 - i * (CONFIG.riverLength / row.count) + (Math.random() - 0.5) * 2.2;
        [-1, 1].forEach((side) => {
          const x = side * (CONFIG.riverWidth / 2 + row.depth + Math.random() * 2.4);
          group.add(buildBackgroundTree(x, z, row.scale + Math.random() * 0.2, row.lightStyle));
        });
      }
    });

    // Poissons rouges et noirs, bien visibles sous une eau moins opaque
    S.river.fish = [];
    for (let i = 0; i < 18; i += 1) {
      const fish = buildFish();
      fish.position.set(
        (Math.random() - 0.5) * (CONFIG.riverWidth - 1.5),
        -0.18 + Math.random() * 0.12,
        6 - Math.random() * CONFIG.riverLength
      );
      group.add(fish);
      S.river.fish.push({ mesh: fish, phase: Math.random() * Math.PI * 2, speedZ: 0.4 + Math.random() * 0.3 });
    }

    // Nénuphars flottant à la surface, dispersés sur les deux côtés de la rivière
    S.river.lilyPads = [];
    const lilyCount = Math.floor(CONFIG.riverLength / 5);
    for (let i = 0; i < lilyCount; i += 1) {
      const pad = buildLilyPad();
      pad.position.set(
        (Math.random() > 0.5 ? 1 : -1) * (0.8 + Math.random() * (CONFIG.riverWidth / 2 - 1)),
        0.06,
        5 - Math.random() * CONFIG.riverLength
      );
      pad.userData.bobPhase = Math.random() * Math.PI * 2;
      group.add(pad);
      S.river.lilyPads.push(pad);
    }

    // Trois nuées de lucioles qui s'envolent l'une après l'autre (pas en même
    // temps) de la rive gauche vers la rive droite, en s'éloignant vers l'horizon.
    S.river.fireflySwarms = [0, 1, 2].map((i) => {
      const mesh = buildFireflySwarm(i);
      group.add(mesh);
      return { mesh, delay: i * 9, duration: 13, cycle: 27 };
    });

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

    // Quelques présentoirs à sabres plantés le long des berges, entre les
    // lanternes, façon petit jardin japonais.
    S.river.katanaStands = [];
    const katanaCount = Math.max(3, Math.floor(CONFIG.riverLength / 22));
    for (let i = 0; i < katanaCount; i += 1) {
      const z = -6 - i * 22 + (Math.random() - 0.5) * 4;
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * (CONFIG.riverWidth / 2 + 0.55);
      const stand = buildKatanaStand(x, z, side > 0 ? Math.PI : 0);
      group.add(stand);
      S.river.katanaStands.push(stand);
    }

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
      new THREE.MeshLambertMaterial({
        map: lanternPaperTexture(), emissive: 0xff9a3d, emissiveIntensity: 0.7
      })
    );
    group.add(body);
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.08, 0.4),
      new THREE.MeshLambertMaterial({ map: barkTexture() })
    );
    cap.position.y = 0.24;
    group.add(cap);
    const base = cap.clone();
    base.position.y = -0.22;
    group.add(base);
    return group;
  }

  // ------------------------------------------------------------
  // Cerisier pleureur voxel : tronc en blocs + canopée faite d'un
  // amas de cubes texturés (feuillage rose façon Minecraft), avec
  // des chaînes de petits cubes qui pendent vers l'eau pour l'effet
  // "pleureur". Utilisé pour la rangée d'arbres la plus proche de l'eau.
  // ------------------------------------------------------------
  function buildWillow(x, z) {
    const { THREE } = S.ctx;
    const group = new THREE.Group();
    const bark = new THREE.MeshLambertMaterial({ map: barkTexture() });

    // Tronc : 3 blocs empilés, légèrement décalés pour casser la rigidité
    const trunkHeights = [0.9, 0.9, 0.8];
    let trunkY = 0;
    trunkHeights.forEach((h, i) => {
      const seg = new THREE.Mesh(
        new THREE.BoxGeometry(0.42 - i * 0.06, h, 0.42 - i * 0.06),
        bark
      );
      seg.position.set((Math.random() - 0.5) * 0.06, trunkY + h / 2, (Math.random() - 0.5) * 0.06);
      group.add(seg);
      trunkY += h;
    });

    // Canopée : amas de cubes de feuillage rose autour du sommet du tronc
    const canopyCenterY = trunkY + 0.9;
    const blossomVariant = Math.floor(Math.random() * 3);
    const blossomMat = new THREE.MeshLambertMaterial({
      map: blossomTexture(blossomVariant), emissive: 0x3a1428, emissiveIntensity: 0.22
    });
    const blossomMat2 = new THREE.MeshLambertMaterial({
      map: blossomTexture((blossomVariant + 1) % 3), emissive: 0x3a1428, emissiveIntensity: 0.22
    });
    const clusterOffsets = [
      [0, 0.35, 0, 1.5], [0.85, 0, 0.3, 1.05], [-0.85, 0, -0.2, 1.05],
      [0.3, 0.15, 0.9, 1.1], [-0.3, 0.15, -0.9, 1.1], [0.9, 0.05, -0.7, 0.95],
      [-0.9, 0.1, 0.7, 0.95], [0, 0.6, 0.5, 0.9], [0, 0.55, -0.5, 0.9], [0, 0.9, 0, 0.85]
    ];
    clusterOffsets.forEach((c, i) => {
      const size = c[3] * (0.9 + Math.random() * 0.25);
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(size, size * 0.75, size),
        i % 2 === 0 ? blossomMat : blossomMat2
      );
      block.position.set(c[0], canopyCenterY + c[1], c[2]);
      block.rotation.y = Math.random() * Math.PI;
      group.add(block);
    });

    // Branches pleureuses : chaînes de petits cubes fleuris qui
    // descendent vers l'eau depuis le bord de la canopée
    const strandCount = 9;
    for (let i = 0; i < strandCount; i += 1) {
      const angle = (i / strandCount) * Math.PI * 2 + Math.random() * 0.4;
      const radius = 1.0 + Math.random() * 0.4;
      const strandX = Math.cos(angle) * radius;
      const strandZ = Math.sin(angle) * radius;
      const strandLen = 3 + Math.floor(Math.random() * 3);
      const strandGroup = new THREE.Group();
      let y = canopyCenterY - 0.2;
      for (let s = 0; s < strandLen; s += 1) {
        const cubeSize = Math.max(0.14, 0.34 - s * 0.045);
        const cube = new THREE.Mesh(
          new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize),
          s % 2 === 0 ? blossomMat : blossomMat2
        );
        cube.position.set(strandX + (Math.random() - 0.5) * 0.15, y, strandZ + (Math.random() - 0.5) * 0.15);
        strandGroup.add(cube);
        y -= cubeSize * 1.6;
      }
      strandGroup.userData.swayPhase = Math.random() * Math.PI * 2;
      group.add(strandGroup);
    }

    group.position.set(x, 0, z);
    group.userData.isWillow = true;
    group.userData.swayPhase = Math.random() * Math.PI * 2;
    S.river.willows.push(group);
    return group;
  }

  // ------------------------------------------------------------
  // Arbre d'arrière-plan simplifié (tronc + canopée compacte, sans
  // branches pleureuses) : bien moins coûteux que buildWillow, pensé
  // pour remplir plusieurs rangées profondes et donner une vraie
  // impression de forêt derrière la rivière plutôt qu'une simple haie.
  // ------------------------------------------------------------
  function buildBackgroundTree(x, z, scale, lightStyle) {
    const { THREE } = S.ctx;
    const group = new THREE.Group();
    const bark = new THREE.MeshLambertMaterial({ map: barkTexture() });
    const variant = Math.floor(Math.random() * 3);
    const blossomMat = new THREE.MeshLambertMaterial({
      map: blossomTexture(variant), emissive: 0x2a0f1e, emissiveIntensity: 0.16
    });

    const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.5, 0.34), bark);
    trunk.position.y = 0.75;
    group.add(trunk);

    const canopyBlocks = [
      [0, 1.9, 0, 1.3], [0.55, 1.7, 0.25, 0.85], [-0.55, 1.7, -0.25, 0.85],
      [0.25, 2.25, -0.4, 0.75], [-0.3, 2.2, 0.35, 0.75]
    ];
    canopyBlocks.forEach((c) => {
      const block = new THREE.Mesh(new THREE.BoxGeometry(c[3], c[3] * 0.8, c[3]), blossomMat);
      block.position.set(c[0], c[1], c[2]);
      block.rotation.y = Math.random() * Math.PI;
      group.add(block);
    });

    // Petite lanterne accrochée à une branche (rangées proches) ou simple
    // lueur chaude sans géométrie (rangée la plus lointaine, pour rester léger)
    if (lightStyle === "lantern") {
      const lantern = buildHangingLantern();
      lantern.scale.setScalar(0.8);
      lantern.position.set(0.65, 1.6, 0.35);
      group.add(lantern);
      if (Math.random() > 0.45) {
        const light = new THREE.PointLight(0xffb35c, 0.4, 5);
        light.position.set(0.65, 1.6, 0.35);
        group.add(light);
      }
    } else if (lightStyle === "glow") {
      const glow = new THREE.PointLight(0xffb35c, 0.26, 4.5);
      glow.position.set(0.4, 1.7, 0.2);
      group.add(glow);
    }

    group.position.set(x, 0, z);
    group.scale.setScalar(scale);
    group.userData.swayPhase = Math.random() * Math.PI * 2;
    return group;
  }

  // Poissons plats rouges/noirs texturés (comme les koïs de la vallée
  // principale), désormais bien visibles à travers l'eau moins opaque.
  function buildFish() {
    const { THREE } = S.ctx;
    const red = Math.random() > 0.35;
    const mat = new THREE.MeshBasicMaterial({
      map: koiTexture(red), transparent: true, side: THREE.DoubleSide,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), mat);
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
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

    // Sapins enneigés (en évitant le canal gelé)
    for (let i = 0; i < 70; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 10 + Math.random() * 85;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      if (x > -7 && x < 1 && z < 3 && z > -44) continue;
      group.add(buildSnowyPine(x, z, 1 + Math.random() * 1.4));
    }

    // Chaîne de montagnes enneigées tout autour de l'horizon
    buildMountainRange(group);

    // Canal gelé bordé de lanternes et traversé par un petit pont en bois,
    // pour retrouver l'ambiance chaude et réfléchissante du jardin de référence.
    buildLanternCanal(group);

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
    group.add(new THREE.AmbientLight(0x4a4a72, 0.72));
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
  // Canal gelé bordé de lanternes en bois avec un petit pont —
  // l'ambiance chaude et réfléchissante du jardin de référence,
  // transposée dans la clairière enneigée.
  // ------------------------------------------------------------
  function buildLanternCanal(group) {
    const { THREE } = S.ctx;
    const canalX = -3;
    const canalLength = 42;
    const canalZStart = 1;

    // Glace sombre et brillante, légèrement réfléchissante
    const iceMat = new THREE.MeshStandardMaterial({
      color: 0x16233f, roughness: 0.12, metalness: 0.55, transparent: true, opacity: 0.92
    });
    const ice = new THREE.Mesh(new THREE.PlaneGeometry(6.4, canalLength), iceMat);
    ice.rotation.x = -Math.PI / 2;
    ice.position.set(canalX, 0.04, canalZStart - canalLength / 2);
    group.add(ice);

    // Reflets scintillants façon lumières de lanternes sur la glace
    const glintGeo = new THREE.BufferGeometry();
    const glintCount = 160;
    const glintPos = new Float32Array(glintCount * 3);
    for (let i = 0; i < glintCount; i += 1) {
      glintPos[i * 3] = canalX + (Math.random() - 0.5) * 5.6;
      glintPos[i * 3 + 1] = 0.08;
      glintPos[i * 3 + 2] = canalZStart - Math.random() * canalLength;
    }
    glintGeo.setAttribute("position", new THREE.BufferAttribute(glintPos, 3));
    const glints = new THREE.Points(glintGeo, new THREE.PointsMaterial({
      color: 0xffcf8a, size: 0.1, transparent: true, opacity: 0.75, depthWrite: false
    }));
    group.add(glints);
    S.snow.canalGlints = glints;

    // Petit pont en bois qui traverse le canal
    group.add(buildWoodenBridge(canalX, -13, Math.PI / 2));

    // Lanternes sur pied, alternées le long des deux rives, comme sur la photo
    S.snow.lanternPosts = [];
    const postCount = 9;
    for (let i = 0; i < postCount; i += 1) {
      const z = canalZStart - 2 - i * (canalLength / postCount);
      const side = i % 2 === 0 ? -1 : 1;
      const post = buildLanternPost(canalX + side * 3.6, z, i % 3 === 0);
      group.add(post);
      S.snow.lanternPosts.push(post);
    }
  }

  function buildLanternPost(x, z, withLight) {
    const { THREE } = S.ctx;
    const group = new THREE.Group();
    const wood = new THREE.MeshLambertMaterial({ color: 0x5a3a22 });

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 1.7, 6), wood);
    post.position.y = 0.85;
    group.add(post);

    const armGeo = new THREE.BoxGeometry(0.6, 0.08, 0.08);
    const arm = new THREE.Mesh(armGeo, wood);
    arm.position.set(0.28, 1.65, 0);
    group.add(arm);

    const lantern = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.42, 0.34),
      new THREE.MeshLambertMaterial({ color: 0xffcf8a, emissive: 0xff9a3d, emissiveIntensity: 0.95 })
    );
    lantern.position.set(0.5, 1.42, 0);
    group.add(lantern);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.42), wood);
    cap.position.set(0.5, 1.64, 0);
    group.add(cap);

    // Petite congère de neige au pied du poteau
    const snowMat = new THREE.MeshLambertMaterial({ color: 0xf3f8ff });
    const drift = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 5), snowMat);
    drift.scale.set(1, 0.25, 1);
    group.add(drift);

    if (withLight) {
      const light = new THREE.PointLight(0xffb35c, 0.7, 8);
      light.position.set(0.5, 1.42, 0);
      group.add(light);
    }

    group.position.set(x, 0, z);
    return group;
  }

  function buildWoodenBridge(x, z, rotY) {
    const { THREE } = S.ctx;
    const group = new THREE.Group();
    const wood = new THREE.MeshLambertMaterial({ color: 0x6b4527 });
    const darkWood = new THREE.MeshLambertMaterial({ color: 0x4a2f1a });

    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.14, 7.2), wood);
    deck.position.y = 0.48;
    group.add(deck);

    [-1, 1].forEach((side) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 7.2), darkWood);
      rail.position.set(side * 0.95, 0.78, 0);
      group.add(rail);
      for (let i = -3; i <= 3; i += 1) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.12), darkWood);
        post.position.set(side * 0.95, 0.78, i * 1.0);
        group.add(post);
      }
    });

    // Piliers dans la glace
    [-2.6, 2.6].forEach((pz) => {
      [-0.8, 0.8].forEach((px) => {
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.9, 6), darkWood);
        pillar.position.set(px, 0.05, pz);
        group.add(pillar);
      });
    });

    group.position.set(x, 0, z);
    group.rotation.y = rotY || 0;
    return group;
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
      S.look.pitch = Math.max(-1.15, Math.min(1.15, S.look.pitch - dy * 0.0035));
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
    if (S.river.lilyPads) {
      S.river.lilyPads.forEach((p) => {
        p.position.y = 0.05 + Math.sin(elapsed * 1.1 + p.userData.bobPhase) * 0.015;
      });
    }
    if (S.river.fireflySwarms) {
      updateFireflies(elapsed);
    }

    const reachedEnd = S.boat.group.position.z <= -CONFIG.riverLength + 10;
    const timeUp = now() - S.phaseStartedAt >= CONFIG.riverDuration;
    if (reachedEnd || timeUp) {
      startWaterfallArrival();
    }
  }

  function updateFireflies(elapsed) {
    S.river.fireflySwarms.forEach((swarm) => {
      const t = ((elapsed - swarm.delay) % swarm.cycle + swarm.cycle) % swarm.cycle;
      if (t > swarm.duration) {
        swarm.mesh.visible = false;
        return;
      }
      const progress = t / swarm.duration;
      swarm.mesh.visible = true;
      const startX = -(CONFIG.riverWidth / 2 + 2);
      const endX = CONFIG.riverWidth / 2 + 16;
      const startZ = 4;
      const endZ = -CONFIG.riverLength * 0.85;
      swarm.mesh.position.x = startX + (endX - startX) * progress;
      swarm.mesh.position.z = startZ + (endZ - startZ) * progress;
      swarm.mesh.position.y = 1.6 + Math.sin(elapsed * 1.6 + swarm.mesh.userData.seed) * 0.3;
      const fadeIn = Math.min(1, progress / 0.12);
      const fadeOut = Math.min(1, (1 - progress) / 0.15);
      swarm.mesh.material.opacity = 0.85 * fadeIn * fadeOut;
      const posAttr = swarm.mesh.geometry.attributes.position;
      const base = swarm.mesh.userData.basePositions;
      for (let i = 0; i < posAttr.count; i += 1) {
        posAttr.setX(i, base[i * 3] + Math.sin(elapsed * 2 + i) * 0.12);
        posAttr.setY(i, base[i * 3 + 1] + Math.cos(elapsed * 2.4 + i) * 0.1);
        posAttr.setZ(i, base[i * 3 + 2] + Math.sin(elapsed * 1.7 + i) * 0.12);
      }
      posAttr.needsUpdate = true;
    });
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
    if (S.snow.canalGlints) {
      S.snow.canalGlints.material.opacity = 0.55 + Math.sin(elapsed * 2.6) * 0.2;
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