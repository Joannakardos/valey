/*
 * noel-suite.js  —  ÉTAPE 3 (fichier unique) : tout le reste du monde
 * ------------------------------------------------------------
 * S'ajoute à noel-world.js (+ noel-suisse.js, indépendant) sans les
 * modifier : ce fichier surcharge à son tour window.NoelWorld.build
 * et utilise NoelWorld.H pour tout (matériaux, textures, interactions,
 * tickers, accès direct à H.W pour l'aurore / le temps / le givre).
 *
 * Charger APRÈS noel-world.js (et noel-suisse.js si tu le gardes) :
 *   <script src="noel-world.js"></script>
 *   <script src="noel-suisse.js"></script>   (optionnel)
 *   <script src="noel-suite.js"></script>
 *
 * Contenu :
 *   ALLEMAGNE : marché de Noël, Forêt-Noire (contes, Krampus),
 *               château bavarois (bal, salle du sapin, bibliothèque, cuisine)
 *   NORDIQUE  : village de pêcheurs (barque, pêche, sauna, séchoirs),
 *               campement sami (lavvu, rennes, chiens), église en bois,
 *               observatoire des aurores + hôtel de glace
 *   CHALET    : lit/poêle, sapin à décorer, cheminée (chaussette),
 *               calendrier de l'Avent, tourne-disque, cuisine
 *   HABITANTS : villageois, grande table, Nisse/Wichtel, Christkind
 *   FÊTES     : couronne de l'Avent, minuit
 * ------------------------------------------------------------
 */
(function () {
    "use strict";

    if (!window.NoelWorld || !window.NoelWorld.H) {
        console.warn("[noel-suite] noel-world.js doit être chargé avant ce fichier.");
        return;
    }
    const H = window.NoelWorld.H;

    // ============================================================
    // 1. POSITIONS (dans les zones déjà réservées par noel-world.js)
    //    allemagne: {x:125, z:0, r:48} · nordique: {x:0, z:-125, r:48}
    //    chalet:    {x:-80, z:0, r:26}
    // ============================================================
    const P = {
        // --- Allemagne : marché -----------------------------------
        marche: { x: 125, z: 0 },
        standDeco: { x: 106, z: -16 },
        standNoisette: { x: 144, z: -16 },
        standEncens: { x: 106, z: 14 },
        standPyramide: { x: 144, z: 14 },
        standNourriture: { x: 125, z: -26 },
        standGluhwein: { x: 125, z: 26 },
        standBougies: { x: 113, z: 0 },
        standMarionnettes: { x: 137, z: 0 },
        // --- Forêt-Noire ------------------------------------------
        cabaneBucheron: { x: 168, z: -34 },
        conteChaperon: { x: 150, z: -30 },
        conteBreme: { x: 160, z: -12 },
        conteTailleur: { x: 172, z: -18 },
        coucouGeant: { x: 140, z: -28 },
        krampusZone: { x: 158, z: -26, r: 26 },
        // --- Château bavarois ---------------------------------------
        chateau: { x: 125, z: 44 },
        salleBal: { x: 118, z: 44 },
        salleSapin: { x: 132, z: 44 },
        bibliotheque: { x: 118, z: 36 },
        cuisineChateau: { x: 132, z: 36 },

        // --- Nordique : village de pêcheurs --------------------------
        pilotis: { x: 0, z: -98 },
        barque: { x: 12, z: -96 },
        pecheGlace: { x: -10, z: -100 },
        sauna: { x: 8, z: -108 },
        sechoirs: { x: -12, z: -110 },
        standNordique: { x: 0, z: -90 },
        // --- Campement sami ------------------------------------------
        lavvu: { x: -22, z: -142 },
        chiens: { x: -32, z: -136 },
        // --- Église en bois debout -------------------------------------
        eglise: { x: 22, z: -148 },
        // --- Observatoire des aurores ------------------------------------
        observatoire: { x: 0, z: -168 },
        hotelGlace: { x: -34, z: -160 },

        // --- Chalet perso ------------------------------------------------
        chalet: { x: -80, z: 0 },
        couronneAvent: { x: -80, z: 6 },

        // --- Habitants -----------------------------------------------
        grandeTable: { x: 145, z: -2 },
        lutinZones: [{ x: 155, z: -22 }, { x: -18, z: -112 }]
    };

    // ============================================================
    // 2. ÉTAT LOCAL
    // ============================================================
    const S = {
        built: false, ride: null, animated: [], tickers2: [],
        krampus: null, krampusTimer: 40,
        christkind: null, christkindTimer: 90,
        sapinStage: 0, bougiesSapin: 0, chausseeTirée: false,
        couronne: 0, prevTime: H.W.time, midnightDone: false,
        lutins: [],
        dogs: { active: false, list: [], home: { x: 0, z: 0 } }
    };

    // ============================================================
    // 3. PETITS OUTILS LOCAUX (mêmes recettes que noel-suisse.js)
    // ============================================================
    function chalet(x, z, wallHex, roofHex, opts) {
        const THREE = H.W.THREE;
        const o = opts || {};
        const w = o.w || 4.4, d = o.d || 4.0, h = o.h || 2.6;
        const g = new THREE.Group();
        const wallM = new THREE.MeshLambertMaterial({ map: H.plasterTex(wallHex) });
        const roofM = H.lam(roofHex);
        const woodM = H.lam(0x5a3a22);
        H.box(w, h, d, wallM, 0, h / 2, 0, g);
        const rl = H.box(w + 1.0, 0.25, d * 0.62, roofM, 0, h + 0.55, -d * 0.2, g); rl.rotation.x = -0.5;
        const rr = H.box(w + 1.0, 0.25, d * 0.62, roofM, 0, h + 0.55, d * 0.2, g); rr.rotation.x = 0.5;
        H.box(w * 0.6, 0.1, 0.3, H.lam(0xf3f8ff), 0, h + 0.95, -d * 0.42, g);
        H.box(1.1, 1.7, 0.15, woodM, 0, 0.85, d / 2 + 0.02, g);
        H.box(1.5, 0.12, 0.5, woodM, 0, 1.85, d / 2 + 0.2, g);
        const winGlow = H.glowSprite(g, -w / 3, h * 0.6, d / 2 + 0.1, 2.4, 0xffc772, 0.7);
        S.animated.push({ update: (t) => { winGlow.material.opacity = 0.55 + Math.sin(t * 2 + x) * 0.12; } });
        g.position.set(x, 0, z);
        H.W.group.add(g);
        H.addCollider(x, z, Math.max(w, d) / 2 + 0.2);
        return g;
    }
    function signBoard(parent, x, y, z, label) {
        const c = document.createElement("canvas");
        c.width = 256; c.height = 96;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#3a2a18"; ctx.fillRect(0, 0, 256, 96);
        ctx.strokeStyle = "#d9a94a"; ctx.lineWidth = 5; ctx.strokeRect(4, 4, 248, 88);
        ctx.fillStyle = "#ffe6b0"; ctx.font = "700 28px Georgia, serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(label, 128, 50);
        const THREE = H.W.THREE;
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.85), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
        sign.position.set(x, y, z);
        parent.add(sign);
        return sign;
    }
    function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

    function startRide(points, duration, arriveMsg) {
        if (S.ride) return;
        S.ride = { points, duration, t: 0, startY: H.W.camera.position.y, arriveMsg };
        H.say("En route…", Math.min(2200, duration * 900));
    }
    function updateRide(delta) {
        const r = S.ride;
        if (!r) return;
        r.t += delta;
        const u = Math.min(1, r.t / r.duration);
        const n = r.points.length - 1;
        const seg = Math.min(n - 1, Math.floor(u * n));
        const lu = (u * n) - seg;
        const A = r.points[seg], B = r.points[seg + 1] || A;
        const x = A.x + (B.x - A.x) * lu, z = A.z + (B.z - A.z) * lu;
        const yb = A.yb + (B.yb - A.yb) * lu;
        H.W.camera.position.set(x, r.startY + yb, z);
        if (u >= 1) {
            S.ride = null;
            if (r.arriveMsg) H.say(r.arriveMsg, 2800);
        }
    }

    // Chien à 4 pattes (corps horizontal + tête + pattes + queue) — pas un personnage debout
    function dogModel(x, z) {
        const THREE = H.W.THREE;
        const g = new THREE.Group();
        const fur = H.lam(0xe8dcc0);
        const dark = H.lam(0x3a2a1a);
        H.box(0.5, 0.28, 0.24, fur, 0, 0.32, 0, g);
        const head = new THREE.Group(); head.position.set(0, 0.4, -0.3); g.add(head);
        H.box(0.22, 0.2, 0.2, fur, 0, 0, 0, head);
        H.box(0.1, 0.09, 0.14, dark, 0, -0.03, -0.15, head);
        [-1, 1].forEach((s) => H.box(0.08, 0.14, 0.04, dark, s * 0.09, 0.13, -0.02, head));
        const legs = [[-0.16, -0.14], [0.16, -0.14], [-0.16, 0.14], [0.16, 0.14]].map(([lx, lz]) => H.box(0.09, 0.3, 0.09, dark, lx, 0.15, lz, g));
        const tail = new THREE.Group(); tail.position.set(0, 0.42, 0.24); g.add(tail);
        H.box(0.09, 0.09, 0.28, fur, 0, 0, 0.12, tail);
        g.position.set(x, 0, z);
        H.W.group.add(g);
        return { group: g, legs, tail, phase: Math.random() * 6 };
    }

    // Petit personnage cubique générique (lutin, Krampus, Christkind)
    function figure(x, z, hex, opts) {
        const THREE = H.W.THREE;
        const o = opts || {};
        const s = o.scale || 1;
        const g = new THREE.Group();
        const bodyM = H.lam(hex, o.glow ? hex : 0, o.glow ? 0.5 : 0);
        H.box(0.5 * s, 0.7 * s, 0.32 * s, bodyM, 0, 0.55 * s, 0, g);
        H.box(0.3 * s, 0.3 * s, 0.3 * s, H.lam(o.skin || 0xf0d0b0), 0, 1.0 * s, 0, g);
        H.box(0.34 * s, 0.14 * s, 0.34 * s, H.lam(o.hat || hex), 0, 1.2 * s, 0, g);
        const legs = [-0.14, 0.14].map((lx) => H.box(0.14 * s, 0.5 * s, 0.16 * s, H.lam(0x2a2a2a), lx * s, 0.15 * s, 0, g));
        g.position.set(x, 0, z);
        H.W.group.add(g);
        if (o.collide !== false) H.addCollider(x, z, 0.4 * s);
        S.animated.push({ update: (t) => { g.rotation.y = (o.baseYaw || 0) + Math.sin(t * 0.5 + x) * 0.08; legs.forEach(() => { }); } });
        return g;
    }

    // ============================================================
    // 4. ALLEMAGNE — Marché de Noël
    // ============================================================
    function buildMarche() {
        const THREE = H.W.THREE;
        const plaza = new THREE.Mesh(new THREE.CircleGeometry(30, 40), new THREE.MeshLambertMaterial({ map: H.snowTex() }));
        plaza.rotation.x = -Math.PI / 2;
        plaza.position.set(P.marche.x, 0.02, P.marche.z);
        H.W.group.add(plaza);

        function stall(x, z, label, roofHex) {
            const g = new THREE.Group();
            const wood = H.lam(0x5a3a22);
            H.box(2.6, 0.12, 1.6, wood, 0, 1.0, 0, g);
            [[-1.15, -0.65], [1.15, -0.65], [-1.15, 0.65], [1.15, 0.65]].forEach(([sx, sz]) => H.box(0.12, 1.0, 0.12, wood, sx, 0.5, sz, g));
            const roof = H.box(3.0, 0.2, 2.0, H.lam(roofHex), 0, 1.85, 0, g); roof.rotation.x = -0.12;
            signBoard(g, 0, 2.3, 0.9, label);
            g.position.set(x, 0, z);
            H.W.group.add(g);
            H.addCollider(x, z, 1.6);
            return g;
        }

        // --- Objets décoratifs ---------------------------------------
        const deco = stall(P.standDeco.x, P.standDeco.z, "Objets décoratifs", 0xc23a3a);
        const ornColors = [0xc23a3a, 0xd9a94a, 0x3a6fbf, 0xf3f2ee];
        const orn = ornColors.map((c, i) => H.box(0.2, 0.2, 0.2, H.lam(c, c, 0.25), -0.6 + i * 0.4, 1.15, 0, deco));
        H.addInteractable({
            pos: new THREE.Vector3(P.standDeco.x, 1.2, P.standDeco.z + 0.9), radius: 3.2, cone: 0.5,
            label: () => "Prendre un objet décoratif et le regarder à la lumière",
            action: () => { const o = pick(orn); o.rotation.y += 1.2; H.say("Tu tournes lentement l'objet à la lumière des guirlandes.", 2600); }
        });

        // --- Casse-noisettes -----------------------------------------
        const noisette = stall(P.standNoisette.x, P.standNoisette.z, "Casse-noisettes", 0x1e4a2a);
        const jaws = [-0.6, 0, 0.6].map((ox) => {
            const j = H.box(0.3, 0.5, 0.28, H.lam(0xc23a3a), ox, 1.4, 0, noisette);
            return j;
        });
        H.addInteractable({
            pos: new THREE.Vector3(P.standNoisette.x, 1.4, P.standNoisette.z + 0.9), radius: 3.2, cone: 0.5,
            label: () => "Actionner les casse-noisettes",
            action: () => {
                jaws.forEach((j, i) => { setTimeout(() => { j.rotation.x = -0.5; H.playNoise(1600, 2, 0.1, 0.08); setTimeout(() => { j.rotation.x = 0; }, 180); }, i * 140); });
                H.say("Les mâchoires claquent… tu casses quelques noix et les manges.", 2800);
            }
        });

        // --- Bonshommes à encens ---------------------------------------
        const encens = stall(P.standEncens.x, P.standEncens.z, "Bonshommes à encens", 0x8a4a2a);
        const smoker = H.box(0.4, 0.7, 0.34, H.lam(0xd9a94a), 0, 1.35, 0, encens);
        const smoke = H.glowSprite(encens, 0, 1.9, 0, 1.6, 0xd8d8e0, 0);
        let smokeOn = false;
        S.animated.push({ update: (t) => { if (smokeOn) smoke.material.opacity = 0.3 + Math.sin(t * 3) * 0.08; } });
        H.addInteractable({
            pos: new THREE.Vector3(P.standEncens.x, 1.35, P.standEncens.z + 0.9), radius: 3.2, cone: 0.5,
            label: () => smokeOn ? "Éteindre le bonhomme à encens" : "Allumer le bonhomme à encens",
            action: () => { smokeOn = !smokeOn; smoker.material.emissiveIntensity = smokeOn ? 0.4 : 0; if (!smokeOn) smoke.material.opacity = 0; H.say(smokeOn ? "La fumée sort doucement par la pipe." : "Tu éteins le petit bonhomme.", 2400); }
        });

        // --- Pyramide de Noël (réagit à la proximité) --------------------
        const pyramide = stall(P.standPyramide.x, P.standPyramide.z, "Pyramide de Noël", 0xd9a94a);
        const pyrGroup = new THREE.Group(); pyrGroup.position.set(0, 1.3, 0); pyramide.add(pyrGroup);
        const etages = [0, 1, 2].map((i) => {
            const e = new THREE.Group(); e.position.y = i * 0.4; pyrGroup.add(e);
            for (let k = 0; k < 4; k += 1) H.box(0.1, 0.24, 0.1, H.lam(0xf0d0b0), Math.cos(k * 1.57) * 0.3, 0, Math.sin(k * 1.57) * 0.3, e);
            return e;
        });
        const bougiesPyr = [0, 1, 2, 3].map((k) => H.glowSprite(pyrGroup, Math.cos(k * 1.57) * 0.3, -0.3, Math.sin(k * 1.57) * 0.3, 0.6, 0xffb35c, 0));
        let pyrLit = false;
        S.animated.push({
            update: (t) => {
                const d = Math.hypot(H.W.camera.position.x - P.standPyramide.x, H.W.camera.position.z - P.standPyramide.z);
                if (d < 4 && !pyrLit) { pyrLit = true; bougiesPyr.forEach((b) => { b.material.opacity = 0.7; }); }
                if (pyrLit) { etages.forEach((e, i) => { e.rotation.y += (0.3 + i * 0.15) * 0.016; }); bougiesPyr.forEach((b) => { b.material.opacity = 0.6 + Math.sin(t * 6) * 0.1; }); }
            }
        });

        // --- Nourriture (Stollen, bretzels, Bratwurst, marrons, crêpes) --
        const nourriture = stall(P.standNourriture.x, P.standNourriture.z, "Stollen · Bretzels · Bratwurst", 0x5a2f1a);
        const plats = ["un Stollen tiède et sucré", "un bretzel bien chaud", "une Bratwurst grillée", "des marrons grillés", "une crêpe de pommes de terre"];
        H.addInteractable({
            pos: new THREE.Vector3(P.standNourriture.x, 1.2, P.standNourriture.z + 0.9), radius: 3.4, cone: 0.5,
            label: () => "Goûter une spécialité du marché",
            action: () => { H.warmUp(20); H.say("Tu manges " + pick(plats) + ".", 2800); }
        });

        // --- Glühwein --------------------------------------------------
        const gluhwein = stall(P.standGluhwein.x, P.standGluhwein.z, "Glühwein", 0x8a1414);
        const cauldron = H.box(0.5, 0.35, 0.5, H.lam(0x5a2418, 0x8a1414, 0.3), 0, 1.2, 0, gluhwein);
        H.addHeatSource(P.standGluhwein.x, P.standGluhwein.z, 6, 0.8);
        H.addInteractable({
            pos: new THREE.Vector3(P.standGluhwein.x, 1.3, P.standGluhwein.z + 0.9), radius: 3.4, cone: 0.5,
            label: () => "Boire un Glühwein",
            action: () => { cauldron.rotation.y += 0.4; H.warmUp(45); H.say("Le cuisinier ajoute cannelle, orange et clou de girofle avant de te servir.", 3000); }
        });

        // --- Bougies à tremper ------------------------------------------
        const bougies = stall(P.standBougies.x, P.standBougies.z, "Bougies", 0xf0e6d2);
        H.addInteractable({
            pos: new THREE.Vector3(P.standBougies.x, 1.2, P.standBougies.z + 0.9), radius: 3.2, cone: 0.5,
            label: () => "Tremper et enrouler une bougie",
            action: () => { H.say("Tu trempes la mèche dans la cire plusieurs fois, puis tu l'emportes.", 2800); }
        });

        // --- Marionnettes / théâtre d'ombres ------------------------------
        const marionnettes = stall(P.standMarionnettes.x, P.standMarionnettes.z, "Théâtre d'ombres", 0x1e2a4a);
        const spectacles = ["une danse d'ombres chinoises", "un petit conte joué aux marionnettes", "une scène silencieuse à la bougie"];
        H.addInteractable({
            pos: new THREE.Vector3(P.standMarionnettes.x, 1.2, P.standMarionnettes.z + 0.9), radius: 3.4, cone: 0.5,
            label: () => "S'asseoir et regarder le spectacle",
            action: () => H.say("Tu t'assois et regardes " + pick(spectacles) + ".", 3200)
        });
    }

    // ============================================================
    // 5. FORÊT-NOIRE — contes, cabane, coucou géant, Krampus
    // ============================================================
    function buildForetNoire() {
        const THREE = H.W.THREE;

        // Coucou géant dans un arbre
        const cou = new THREE.Group();
        H.box(1.0, 1.4, 0.3, H.lam(0x5a3a22), 0, 2.4, 0, cou);
        const door = H.box(0.4, 0.6, 0.08, H.lam(0x2a1a12), 0, 2.2, 0.18, cou);
        cou.position.set(P.coucouGeant.x, 0, P.coucouGeant.z);
        H.W.group.add(cou);
        H.addInteractable({
            pos: new THREE.Vector3(P.coucouGeant.x, 2.4, P.coucouGeant.z + 0.3), radius: 3.6, cone: 0.5,
            label: () => "Écouter le coucou géant sonner",
            action: () => {
                door.rotation.x = -1.0; H.playNoise(1000, 3, 0.14, 0.5);
                setTimeout(() => { door.rotation.x = 0; }, 900);
                H.say("Il indique du bec un chemin secret entre les sapins…", 3000);
            }
        });

        // Scènes de contes
        function conteScene(pos, label, hex, texte) {
            const g = new THREE.Group();
            H.box(1.6, 1.4, 1.3, H.lam(hex), 0, 0.7, 0, g);
            H.box(1.8, 0.3, 1.5, H.lam(0xf3f8ff), 0, 1.5, 0, g);
            signBoard(g, 0, 2.0, 0.7, label);
            g.position.set(pos.x, 0, pos.z);
            H.W.group.add(g);
            H.addCollider(pos.x, pos.z, 1.4);
            H.addInteractable({
                pos: new THREE.Vector3(pos.x, 1.2, pos.z + 1.0), radius: 3.6, cone: 0.5,
                label: () => "Entrer dans la scène : " + label,
                action: () => H.say(texte, 3600)
            });
        }
        conteScene(P.conteChaperon, "Le Petit Chaperon rouge", 0xc23a3a,
            "Une maison en pain d'épice au fond des bois. Une petite silhouette encapuchonnée te salue de la fenêtre.");
        conteScene(P.conteBreme, "Les Musiciens de Brême", 0x5a4a3a,
            "Un âne, un chien, un chat et un coq empilés se tiennent en équilibre et te chantent une note chacun.");
        conteScene(P.conteTailleur, "Le Vaillant Petit Tailleur", 0x3a6fbf,
            "Une petite échoppe de couture, une ceinture brodée « sept d'un coup » posée sur l'établi.");

        // Cabane de bûcheron
        const cab = chalet(P.cabaneBucheron.x, P.cabaneBucheron.z, "#4a3a2a", 0x2a1a12, { w: 4, d: 3.6, h: 2.4 });
        signBoard(cab, 0, 2.9, 1.85, "Cabane du bûcheron");
        H.addHeatSource(P.cabaneBucheron.x, P.cabaneBucheron.z, 7, 0.9);
        const histoires = [
            "Le vieil homme te raconte comment le Grand Sapin a été planté, une nuit d'hiver, par des mains qu'on n'a jamais vues.",
            "Il te parle d'un renard de feu qui, dit-on, garde la vallée depuis toujours.",
            "Il te sert une soupe et te raconte le premier Noël passé ici, seul, avant que le village n'existe."
        ];
        H.addInteractable({
            pos: new THREE.Vector3(P.cabaneBucheron.x, 1.2, P.cabaneBucheron.z + 1.9), radius: 3.6, cone: 0.5,
            label: () => "S'asseoir et écouter une histoire",
            action: () => { H.warmUp(50); H.say(pick(histoires), 4200); }
        });

        // Krampus — fausse peur rare, la nuit, dans la zone forêt
        S.krampus = { mesh: null, active: false, given: false };
    }
    function spawnKrampus() {
        const THREE = H.W.THREE;
        const cam = H.W.camera.position;
        const a = Math.random() * Math.PI * 2;
        const x = cam.x + Math.cos(a) * 8, z = cam.z + Math.sin(a) * 8;
        const g = figure(x, z, 0x2a1a12, { scale: 1.4, skin: 0x1a1210, hat: 0x8a1414, collide: false, glow: true });
        S.krampus.mesh = g;
        S.krampus.active = true;
        S.krampus.given = false;
        H.say("Quelque chose grogne entre les arbres…", 3200);
        const it = H.addInteractable({
            pos: new THREE.Vector3(x, 1.0, z), radius: 4.2, cone: 0.6,
            label: () => S.krampus.given ? "" : "Approcher le Krampus",
            enabled: () => S.krampus.active && !S.krampus.given,
            action: () => {
                S.krampus.given = true;
                H.say("Il grogne, tourne autour de toi… puis t'offre un morceau de charbon en riant.", 3400);
                setTimeout(() => { hideKrampus(); }, 2600);
            }
        });
        S.krampus.it = it;
        setTimeout(() => { if (S.krampus.active) hideKrampus(); }, 14000);
    }
    function hideKrampus() {
        if (!S.krampus || !S.krampus.mesh) return;
        H.W.group.remove(S.krampus.mesh);
        S.krampus.it.enabled = () => false;
        S.krampus.active = false;
        S.krampus.mesh = null;
    }

    // ============================================================
    // 6. CHÂTEAU BAVAROIS
    // ============================================================
    function buildChateauBavarois() {
        const THREE = H.W.THREE;
        const stoneM = new THREE.MeshLambertMaterial({ map: H.stoneTex() });
        const g = new THREE.Group();
        H.box(22, 9, 18, stoneM, 0, 4.5, 0, g);
        const roof = H.box(24, 0.4, 20, H.lam(0x2a3a4a), 0, 9.3, 0, g);
        [[-9, -7], [9, -7], [-9, 7], [9, 7]].forEach(([tx, tz]) => {
            const t = H.box(2.4, 12, 2.4, stoneM, tx, 6, tz, g);
            const cone = new THREE.Mesh(new THREE.ConeGeometry(1.9, 2.4, 8), H.lam(0x2a3a4a));
            cone.position.set(tx, 13.2, tz); g.add(cone);
        });
        signBoard(g, 0, 5, 9.1, "Château bavarois");
        g.position.set(P.chateau.x, 0, P.chateau.z);
        H.W.group.add(g);
        H.addCollider(P.chateau.x, P.chateau.z, 12);

        // --- Salle de bal : automates dansants ---------------------------
        const bal = new THREE.Group(); bal.position.set(P.salleBal.x - P.chateau.x, 0, P.salleBal.z - P.chateau.z); g.add(bal);
        const dancers = [-1.2, 1.2].map((dx) => {
            const d = new THREE.Group(); d.position.set(dx, 1.0, 0);
            H.box(0.32, 0.6, 0.24, H.lam(dx < 0 ? 0xc23a3a : 0x3a6fbf), 0, 0, 0, d);
            H.box(0.26, 0.26, 0.26, H.lam(0xf0d0b0), 0, 0.45, 0, d);
            bal.add(d); return d;
        });
        const musicBox = H.box(0.7, 0.5, 0.7, H.lam(0xd9a94a), 0, 0.4, 1.4, bal);
        let dancing = false;
        S.animated.push({ update: (t) => { if (dancing) { dancers.forEach((d, i) => { d.rotation.y = t * (2 + i * 0.4); d.position.y = 1.0 + Math.sin(t * 4 + i) * 0.05; }); } } });
        H.addInteractable({
            pos: new THREE.Vector3(P.salleBal.x, 1.2, P.salleBal.z), radius: 6, cone: 0.6,
            label: () => dancing ? "Arrêter la boîte à musique" : "Ouvrir la grande boîte à musique",
            action: () => { dancing = !dancing; musicBox.rotation.y += 0.5; H.say(dancing ? "Les automates se mettent à danser sur la boîte à musique géante." : "La musique s'arrête doucement.", 3000); }
        });

        // --- Salle du sapin : bougies à allumer une par une ------------------
        const salleSapin = new THREE.Group(); salleSapin.position.set(P.salleSapin.x - P.chateau.x, 0, P.salleSapin.z - P.chateau.z); g.add(salleSapin);
        const petitSapin = H.box(1.4, 3, 1.4, H.lam(0x1c3a22), 0, 1.5, 0, salleSapin);
        const bougiesSalle = [];
        for (let i = 0; i < 12; i += 1) {
            const a = Math.random() * Math.PI * 2, y = rnd0(0.6, 2.8), r = 0.55 + Math.random() * 0.3;
            const b = H.glowSprite(salleSapin, Math.cos(a) * r, y, Math.sin(a) * r, 0.7, 0xffb35c, 0);
            bougiesSalle.push(b);
        }
        function rnd0(a, b) { return a + Math.random() * (b - a); }
        H.addInteractable({
            pos: new THREE.Vector3(P.salleSapin.x, 1.4, P.salleSapin.z + 1.2), radius: 5, cone: 0.6,
            label: () => S.bougiesSapin >= bougiesSalle.length ? "Toutes les bougies brillent déjà" : "Allumer une bougie du sapin",
            enabled: () => S.bougiesSapin < bougiesSalle.length,
            action: () => {
                bougiesSalle[S.bougiesSapin].material.opacity = 0.8;
                S.bougiesSapin += 1;
                if (S.bougiesSapin >= bougiesSalle.length) H.say("Le sapin de la salle brille maintenant de toutes ses bougies.", 3400);
                else H.say("Une bougie de plus s'allume sur le sapin.", 2200);
            }
        });

        // --- Bibliothèque -------------------------------------------------
        const biblio = new THREE.Group(); biblio.position.set(P.bibliotheque.x - P.chateau.x, 0, P.bibliotheque.z - P.chateau.z); g.add(biblio);
        H.addHeatSource(P.bibliotheque.x, P.bibliotheque.z, 6, 0.8);
        H.box(0.7, 1.3, 0.7, H.lam(0x8a4a2a, 0xff9a3d, 0.3), 0, 0.65, 0, biblio);
        H.addInteractable({
            pos: new THREE.Vector3(P.bibliotheque.x, 1.2, P.bibliotheque.z + 1.0), radius: 4.4, cone: 0.6,
            label: () => "S'asseoir près du poêle en faïence avec un livre de contes",
            action: () => { H.warmUp(50); H.say("Tu t'installes dans un fauteuil profond, un livre de contes ouvert sur les genoux.", 3200); }
        });

        // --- Cuisine du grand repas -----------------------------------------
        const cuisine = new THREE.Group(); cuisine.position.set(P.cuisineChateau.x - P.chateau.x, 0, P.cuisineChateau.z - P.chateau.z); g.add(cuisine);
        H.addInteractable({
            pos: new THREE.Vector3(P.cuisineChateau.x, 1.2, P.cuisineChateau.z), radius: 4.4, cone: 0.6,
            label: () => "Aider à préparer le grand repas de fête",
            action: () => { H.warmUp(30); H.say("Vous préparez ensemble le grand repas de fête, dans la bonne humeur.", 3200); }
        });
    }

    // ============================================================
    // 7. NORDIQUE — village de pêcheurs
    // ============================================================
    function buildPecheurs() {
        const THREE = H.W.THREE;
        const water = new THREE.Mesh(new THREE.CircleGeometry(16, 32), new THREE.MeshStandardMaterial({ map: H.iceTex(), color: 0xaad0ea, roughness: 0.2, metalness: 0.25 }));
        water.rotation.x = -Math.PI / 2;
        water.position.set(P.pilotis.x, 0.03, P.pilotis.z - 6);
        H.W.group.add(water);

        const wood = H.lam(0x5a3a22);
        for (let i = 0; i < 5; i += 1) {
            const g = new THREE.Group();
            H.box(2.6, 0.2, 2.4, wood, 0, 1.0, 0, g);
            [[-1.1, -1.0], [1.1, -1.0], [-1.1, 1.0], [1.1, 1.0]].forEach(([px, pz]) => H.box(0.2, 2.0, 0.2, wood, px, 0, pz, g));
            g.position.set(P.pilotis.x + (i - 2) * 4, 0, P.pilotis.z - 6 + (i % 2) * 2);
            H.W.group.add(g);
            H.addCollider(g.position.x, g.position.z, 1.6);
        }

        // Barque
        const barque = new THREE.Group();
        H.box(2.0, 0.4, 0.9, H.lam(0x5a3a22), 0, 0.2, 0, barque);
        barque.position.set(P.barque.x, 0.05, P.barque.z);
        H.W.group.add(barque);
        H.addInteractable({
            pos: new THREE.Vector3(P.barque.x, 0.6, P.barque.z), radius: 3.6, cone: 0.5,
            label: () => "Ramer sur l'eau calme",
            action: () => startRide([
                { x: P.barque.x, z: P.barque.z, yb: -1.6 },
                { x: P.barque.x - 10, z: P.barque.z - 6, yb: -1.6 },
                { x: P.barque.x, z: P.barque.z - 12, yb: -1.6 },
                { x: P.barque.x, z: P.barque.z, yb: -1.6 }
            ], 12, "Tu croises quelques lanternes flottantes en glissant sur l'eau calme.")
        });

        // Pêche sur glace
        const trou = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), H.lam(0x0a2438));
        trou.rotation.x = -Math.PI / 2;
        trou.position.set(P.pecheGlace.x, 0.04, P.pecheGlace.z);
        H.W.group.add(trou);
        let fishing = false;
        H.addInteractable({
            pos: new THREE.Vector3(P.pecheGlace.x, 0.6, P.pecheGlace.z), radius: 3.4, cone: 0.5,
            label: () => "Percer un trou et pêcher",
            enabled: () => !fishing,
            action: () => {
                fishing = true;
                H.say("Tu laisses tomber la ligne et attends…", 2600);
                setTimeout(() => { H.say("Un poisson mord ! Tu le sors de l'eau.", 2600); fishing = false; }, 3000);
            }
        });

        // Sauna
        const sauna = chalet(P.sauna.x, P.sauna.z, "#6a5038", 0x3a2214, { w: 3.2, d: 3.0, h: 2.2 });
        signBoard(sauna, 0, 2.7, 1.55, "Sauna");
        H.addHeatSource(P.sauna.x, P.sauna.z, 8, 1);
        let inSauna = false;
        H.addInteractable({
            pos: new THREE.Vector3(P.sauna.x, 1.2, P.sauna.z + 1.6), radius: 3.6, cone: 0.5,
            label: () => inSauna ? "Plonger dans l'eau glacée" : "Entrer dans le sauna",
            action: () => {
                inSauna = !inSauna;
                if (inSauna) { H.warmUp(70); H.say("La vapeur monte quand l'eau touche les pierres chaudes.", 3000); }
                else H.say("Tu plonges dans l'eau glacée puis ressors, complètement réchauffé, dans un grand silence.", 3400);
            }
        });

        // Séchoirs à morue — messages cachés
        const sechoir = new THREE.Group();
        const rackWood = H.lam(0x5a3a22);
        [[-1, 0], [0, 0], [1, 0]].forEach(([rx]) => H.box(0.12, 2.2, 0.12, rackWood, rx, 1.1, 0, sechoir));
        H.box(2.4, 0.08, 0.08, rackWood, 0, 2.1, 0, sechoir);
        [-0.8, -0.3, 0.2, 0.7].forEach((fx) => H.box(0.2, 0.7, 0.1, H.lam(0xd8c8a0), fx, 1.6, 0, sechoir));
        sechoir.position.set(P.sechoirs.x, 0, P.sechoirs.z);
        H.W.group.add(sechoir);
        H.addCollider(P.sechoirs.x, P.sechoirs.z, 1.4);
        const messages = [
            "« Si tu lis ceci, c'est que toi aussi tu as trouvé le chemin jusqu'ici. Joyeux Noël. »",
            "« Le froid rend les endroits chauds meilleurs. Toujours. »",
            "« On s'est promis de revenir ici un jour, ensemble. »",
            "« Quelqu'un a laissé un dessin de renard, ici, sur le bois séché. »"
        ];
        H.addInteractable({
            pos: new THREE.Vector3(P.sechoirs.x, 1.4, P.sechoirs.z + 1.0), radius: 3.4, cone: 0.5,
            label: () => "Chercher un message caché dans les séchoirs",
            action: () => H.say(pick(messages), 3600)
        });

        // Cuisine nordique
        const plats = ["du saumon fumé", "une soupe de poisson bien chaude", "une lefse (crêpe roulée au beurre et au sucre)", "un gâteau à la cannelle avec un café"];
        H.addInteractable({
            pos: new THREE.Vector3(P.standNordique.x, 1.0, P.standNordique.z), radius: 4, cone: 0.6,
            label: () => "Goûter la cuisine nordique",
            action: () => { H.warmUp(25); H.say("Tu manges " + pick(plats) + ".", 2800); }
        });
    }

    // ============================================================
    // 8. CAMPEMENT SAMI
    // ============================================================
    function buildCampementSami() {
        const THREE = H.W.THREE;

        // Lavvu
        const lavvu = new THREE.Group();
        const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.4, 10, 1, true), new THREE.MeshLambertMaterial({ map: H.plasterTex("#8a6a4a"), side: THREE.DoubleSide }));
        cone.position.y = 1.7; lavvu.add(cone);
        lavvu.position.set(P.lavvu.x, 0, P.lavvu.z);
        H.W.group.add(lavvu);
        H.addCollider(P.lavvu.x, P.lavvu.z, 2.6);
        H.addHeatSource(P.lavvu.x, P.lavvu.z, 7, 0.9);
        const legendes = [
            "Le conteur parle des lumières du ciel, gardiennes des âmes qui dansent au-dessus de la toundra.",
            "Il raconte comment le renne blanc guide, une nuit par hiver, les voyageurs perdus jusqu'au feu.",
            "Il te parle d'un feu qui ne s'éteint jamais, porté par un petit renard roux."
        ];
        H.addInteractable({
            pos: new THREE.Vector3(P.lavvu.x, 1.2, P.lavvu.z + 1.5), radius: 4.2, cone: 0.6,
            label: () => "Entrer et écouter une légende",
            action: () => { H.warmUp(50); H.say(pick(legendes), 4000); }
        });

        // Chiens de traîneau — de vrais compagnons à 4 pattes, comme le renard :
        // ils t'attendent ici, et si tu les emmènes, ils te suivent partout où tu vas.
        S.dogs.home = { x: P.chiens.x, z: P.chiens.z };
        S.dogs.list = [0, 1, 2].map((i) => dogModel(P.chiens.x + (i - 1) * 0.7, P.chiens.z + (i % 2) * 0.4));
        H.addInteractable({
            pos: new THREE.Vector3(P.chiens.x, 0.5, P.chiens.z), radius: 4, cone: 0.6,
            label: () => S.dogs.active ? "Dire aux chiens de rester ici" : "Emmener les chiens avec toi",
            action: () => {
                S.dogs.active = !S.dogs.active;
                H.say(S.dogs.active
                    ? "Les chiens bondissent joyeusement et te suivent dans la neige."
                    : "Les chiens restent sagement ici, en t'attendant.", 2800);
            }
        });
    }
    function updateDogs(delta) {
        const d = S.dogs;
        if (!d.list.length) return;
        const cam = H.W.camera.position;
        d.list.forEach((dog, i) => {
            const ang = i * 2.1;
            const tx = d.active ? cam.x + Math.cos(ang) * 1.6 : d.home.x + Math.cos(ang) * 0.7;
            const tz = d.active ? cam.z + Math.sin(ang) * 1.6 : d.home.z + Math.sin(ang) * 0.7;
            const dx = tx - dog.group.position.x, dz = tz - dog.group.position.z;
            const dist = Math.hypot(dx, dz);
            const speed = Math.min(6.5, 1.5 + dist * 2.2);
            if (dist > 0.06) {
                const step = Math.min(dist, speed * delta);
                dog.group.position.x += (dx / dist) * step;
                dog.group.position.z += (dz / dist) * step;
                const want = Math.atan2(-dx, -dz);
                let da = want - dog.group.rotation.y;
                da = Math.atan2(Math.sin(da), Math.cos(da));
                dog.group.rotation.y += da * Math.min(1, delta * 7);
            }
            dog.phase += (dist > 0.15 ? speed : 1.2) * delta * 3.2;
            dog.legs.forEach((l, li) => { l.rotation.x = dist > 0.15 ? Math.sin(dog.phase + (li % 2 ? Math.PI : 0)) * 0.6 : 0; });
            dog.tail.rotation.x = -0.3 + Math.sin(H.W.t * 4 + i) * 0.25;
        });
    }

    // ============================================================
    // 9. ÉGLISE EN BOIS DEBOUT
    // ============================================================
    function buildEglise() {
        const THREE = H.W.THREE;
        const wood = new THREE.MeshLambertMaterial({ map: H.barkTex() });
        const g = new THREE.Group();
        H.box(5, 5, 6, wood, 0, 2.5, 0, g);
        const clocherH = 8;
        const clocher = H.box(2.2, clocherH, 2.2, wood, 0, clocherH / 2 + 5, 0, g);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(1.7, 2.4, 4), wood);
        cone.rotation.y = Math.PI / 4;
        cone.position.set(0, clocherH + 5 + 1.2, 0);
        g.add(cone);
        signBoard(g, 0, 2.6, 3.05, "Église en bois debout");
        g.position.set(P.eglise.x, 0, P.eglise.z);
        H.W.group.add(g);
        H.addCollider(P.eglise.x, P.eglise.z, 3.2);

        let onClocher = false;
        const topY = clocherH + 5;
        H.addInteractable({
            pos: new THREE.Vector3(P.eglise.x, 1.4, P.eglise.z), radius: 3.6, cone: 0.5,
            label: () => onClocher ? "Redescendre du clocher" : "Monter au clocher et sonner les cloches",
            action: () => {
                onClocher = !onClocher;
                if (onClocher) {
                    startRide([
                        { x: H.W.camera.position.x, z: H.W.camera.position.z, yb: 0 },
                        { x: P.eglise.x, z: P.eglise.z, yb: topY - 1 }
                    ], 2.6, "Tu sonnes les cloches et regardes toute la vallée s'étendre sous toi.");
                    H.playNoise(700, 2, 0.16, 1.2);
                    setTimeout(() => H.playNoise(700, 2, 0.16, 1.2), 700);
                } else {
                    startRide([
                        { x: P.eglise.x, z: P.eglise.z, yb: topY - 1 },
                        { x: P.eglise.x, z: P.eglise.z + 2, yb: 0 }
                    ], 2.0, null);
                }
            }
        });
        H.addInteractable({
            pos: new THREE.Vector3(P.eglise.x, 1.2, P.eglise.z + 2.5), radius: 3.6, cone: 0.5,
            label: () => "S'asseoir et écouter le concert de Noël",
            action: () => H.say("Tu t'assois sur un banc, la chorale résonne dans le bois. Tu allumes une bougie.", 3400)
        });
    }

    // ============================================================
    // 10. OBSERVATOIRE DES AURORES + HÔTEL DE GLACE
    // ============================================================
    function buildObservatoire() {
        const THREE = H.W.THREE;
        const platform = new THREE.Mesh(new THREE.CircleGeometry(9, 24), new THREE.MeshLambertMaterial({ map: H.snowTex() }));
        platform.rotation.x = -Math.PI / 2;
        platform.position.set(P.observatoire.x, 0.02, P.observatoire.z);
        H.W.group.add(platform);
        H.addHeatSource(P.observatoire.x, P.observatoire.z, 7, 0.8);
        const wood = H.lam(0x5a3a22);
        [-1, 1].forEach((s) => {
            H.box(1.4, 0.5, 0.6, wood, s * 2, 0.5, 0, H.W.group).position.set(P.observatoire.x + s * 2, 0.5, P.observatoire.z + 3);
        });
        H.addCollider(P.observatoire.x, P.observatoire.z, 2);
        H.addInteractable({
            pos: new THREE.Vector3(P.observatoire.x, 1.0, P.observatoire.z + 2), radius: 5, cone: 0.6,
            label: () => "S'allonger et lever sa lanterne vers l'aurore",
            action: () => {
                H.W.auroraPulse = 1;
                H.warmUp(40);
                H.say("Tu lèves ta lanterne : l'aurore danse plus vite et change de forme au-dessus de toi.", 3600);
            }
        });

        // Hôtel de glace
        const iceM = new THREE.MeshStandardMaterial({ map: H.iceTex(), color: 0xdfeeff, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.92 });
        const hotel = new THREE.Group();
        H.box(8, 3.4, 6, iceM, 0, 1.7, 0, hotel);
        H.box(1.6, 2, 0.6, iceM, 0, 1, 3.1, hotel);
        hotel.position.set(P.hotelGlace.x, 0, P.hotelGlace.z);
        H.W.group.add(hotel);
        H.addCollider(P.hotelGlace.x, P.hotelGlace.z, 5);
        H.addInteractable({
            pos: new THREE.Vector3(P.hotelGlace.x, 1.2, P.hotelGlace.z + 3.2), radius: 4.4, cone: 0.6,
            label: () => "Toucher les sculptures de glace",
            action: () => H.say("Le froid pique un peu tes doigts à travers les gants, mais les formes sont magnifiques.", 3000)
        });
        H.addInteractable({
            pos: new THREE.Vector3(P.hotelGlace.x, 1.2, P.hotelGlace.z), radius: 4.4, cone: 0.6,
            label: () => "S'asseoir au bar de glace",
            action: () => H.say("Tu t'assois sur un tabouret de glace sculptée, un verre chaud entre les mains.", 3000)
        });
        H.addInteractable({
            pos: new THREE.Vector3(P.hotelGlace.x - 2, 1.2, P.hotelGlace.z - 1), radius: 4.4, cone: 0.6,
            label: () => "Dormir dans un lit de peaux",
            action: () => {
                H.say("Tu t'endors sous les peaux épaisses… et te réveilles à la tombée du jour suivant.", 3600);
                if (window.NoelWorld && window.NoelWorld.setTime) window.NoelWorld.setTime(0.745);
            }
        });
    }

    // ============================================================
    // 11. CHALET PERSO
    // ============================================================
    function buildChaletPerso() {
        const THREE = H.W.THREE;
        const g = chalet(P.chalet.x, P.chalet.z, "#7a5a3a", 0x3a2214, { w: 8, d: 7, h: 3.4 });
        signBoard(g, 0, 3.9, 3.55, "Le chalet");
        H.addHeatSource(P.chalet.x, P.chalet.z, 10, 1);

        // Lit + banquette + poêle
        H.box(1.8, 0.5, 2.6, H.lam(0xf3f2ee), -2.6, 0.3, 1.6, g);
        H.box(1.8, 0.9, 0.2, H.lam(0xc23a3a), -2.6, 0.75, 2.85, g);
        H.box(2.4, 0.5, 0.7, H.lam(0x5a3a22), 2.6, 0.3, 2.6, g);
        const poele = H.box(0.7, 0.9, 0.7, H.lam(0x2a2a2a, 0xff9a3d, 0.4), 0, 0.5, -2.6, g);
        H.addInteractable({
            pos: new THREE.Vector3(P.chalet.x, 1.0, P.chalet.z - 2.2), radius: 4.6, cone: 0.6,
            label: () => "S'installer près du poêle qui ronfle",
            action: () => { H.warmUp(60); poele.rotation.y += 0.3; H.say("Le poêle ronfle doucement. Tu te sens complètement au chaud.", 3000); }
        });

        // Sapin nu à décorer (plusieurs étapes)
        const sapin = new THREE.Group(); sapin.position.set(3.0, 0, -1.6); g.add(sapin);
        H.box(1.2, 2.6, 1.2, H.lam(0x1c3a22), 0, 1.3, 0, sapin);
        const decoStages = [
            { c: 0xffe37a, n: 6 }, // boules soufflées
            { c: 0xc23a3a, n: 6 }, // figurines
            { c: 0xffffff, n: 6 }  // bougies / paille
        ];
        const decoMeshes = [];
        decoStages.forEach((stage) => {
            for (let i = 0; i < stage.n; i += 1) {
                const a = Math.random() * Math.PI * 2, y = 0.4 + Math.random() * 2.2, r = 0.55 + Math.random() * 0.15;
                const m = H.box(0.16, 0.16, 0.16, H.lam(stage.c, stage.c, 0.2), Math.cos(a) * r, y, Math.sin(a) * r, sapin);
                m.visible = false;
                decoMeshes.push(m);
            }
        });
        H.addInteractable({
            pos: new THREE.Vector3(P.chalet.x + 3.0, 1.3, P.chalet.z - 1.6), radius: 3.6, cone: 0.6,
            label: () => S.sapinStage >= decoStages.length ? "Ton sapin est décoré comme tu l'aimes" : "Décorer le sapin",
            enabled: () => S.sapinStage < decoStages.length,
            action: () => {
                const start = decoStages.slice(0, S.sapinStage).reduce((a, s) => a + s.n, 0);
                const end = start + decoStages[S.sapinStage].n;
                for (let i = start; i < end; i += 1) decoMeshes[i].visible = true;
                S.sapinStage += 1;
                H.say(S.sapinStage >= decoStages.length ? "Ton sapin est complet : boules, figurines et bougies." : "Tu ajoutes une nouvelle couche de décorations.", 2800);
            }
        });

        // Cheminée avec chaussette « Thibaut »
        const chem = new THREE.Group(); chem.position.set(-3.2, 0, -2.6); g.add(chem);
        H.box(1.6, 2.4, 0.6, new THREE.MeshLambertMaterial({ map: H.stoneTex() }), 0, 1.2, 0, chem);
        H.box(0.3, 0.5, 0.1, H.lam(0xc23a3a), 0, 0.8, 0.35, chem);
        const surprises = [
            "une petite figurine de renard sculptée dans le bois",
            "un mot griffonné à la craie : « Joyeux Noël, à bientôt sous d'autres latitudes »",
            "un petit sachet de chocolats chauds",
            "une étoile en papier découpée à la main"
        ];
        H.addInteractable({
            pos: new THREE.Vector3(P.chalet.x - 3.2, 1.0, P.chalet.z - 2.3), radius: 3.4, cone: 0.6,
            label: () => "Regarder dans la chaussette de Thibaut",
            action: () => H.say("Tu trouves " + pick(surprises) + ".", 3000)
        });

        // Calendrier de l'Avent mural (petit format, 24 cases)
        const calGroup = new THREE.Group(); calGroup.position.set(0, 2.2, -3.45); g.add(calGroup);
        H.box(3.6, 2.2, 0.06, H.lam(0xc9a24a), 0, 0, 0, calGroup);
        const cases = [];
        for (let i = 0; i < 24; i += 1) {
            const cx = -1.65 + (i % 6) * 0.66, cy = 0.9 - Math.floor(i / 6) * 0.6;
            const c = H.box(0.55, 0.5, 0.03, H.lam(0xf3f2ee), cx, cy, 0.05, calGroup);
            c.userData.open = false;
            cases.push(c);
        }
        const cadeauxCal = [
            "une friandise enveloppée de papier doré", "une petite étoile en bois", "une image découpée d'un renne",
            "un billet doux caché dans le calendrier", "une clochette minuscule", "un carré de chocolat"
        ];
        H.addInteractable({
            pos: new THREE.Vector3(P.chalet.x, 1.3, P.chalet.z - 3.3), radius: 4, cone: 0.6,
            label: () => "Ouvrir une fenêtre du calendrier de l'Avent",
            action: () => {
                const closed = cases.filter((c) => !c.userData.open);
                if (!closed.length) { H.say("Toutes les fenêtres du calendrier sont déjà ouvertes.", 2600); return; }
                const c = pick(closed);
                c.userData.open = true;
                c.rotation.x = -1.2;
                H.say("Derrière la fenêtre : " + pick(cadeauxCal) + ".", 2800);
            }
        });

        // Tourne-disque
        const disque = H.box(0.6, 0.2, 0.6, H.lam(0x2a1a12), 3.2, 0.6, 2.4, g);
        const chants = [
            "Un chant de Noël en français résonne doucement.",
            "Une mélodie en anglais, plus douce, prend le relais.",
            "Un chant traditionnel scandinave se met à jouer.",
            "Une berceuse de Noël, dans une langue que tu ne reconnais pas tout à fait, mais qui te touche."
        ];
        H.addInteractable({
            pos: new THREE.Vector3(P.chalet.x + 3.2, 1.0, P.chalet.z + 2.4), radius: 3.2, cone: 0.6,
            label: () => "Changer le disque",
            action: () => { disque.rotation.y += 0.6; H.say(pick(chants), 3000); }
        });

        // Cuisine
        H.addInteractable({
            pos: new THREE.Vector3(P.chalet.x - 1.0, 1.0, P.chalet.z + 2.6), radius: 3.4, cone: 0.6,
            label: () => "Refaire une de tes recettes de Noël",
            action: () => { H.warmUp(25); H.say("Tu retrouves les gestes des recettes de ton pays, dans cette cuisine à toi.", 3200); }
        });
    }

    // ============================================================
    // 12. HABITANTS — villageois, grande table, Nisse/Wichtel, Christkind
    // ============================================================
    function buildHabitants() {
        const THREE = H.W.THREE;

        // Grande table — repas de famille (l'ambiance suffit, sans figurants)
        const table = new THREE.Group();
        const wood = H.lam(0x5a3a22);
        H.box(4.0, 0.15, 1.6, wood, 0, 1.0, 0, table);
        [[-1.8, -0.65], [1.8, -0.65], [-1.8, 0.65], [1.8, 0.65]].forEach(([tx, tz]) => H.box(0.14, 1.0, 0.14, wood, tx, 0.5, tz, table));
        table.position.set(P.grandeTable.x, 0, P.grandeTable.z);
        H.W.group.add(table);
        H.addCollider(P.grandeTable.x, P.grandeTable.z, 2.4);
        H.addInteractable({
            pos: new THREE.Vector3(P.grandeTable.x, 1.2, P.grandeTable.z), radius: 4, cone: 0.6,
            label: () => "S'asseoir au repas de famille",
            action: () => { H.warmUp(35); H.say("On te sert un plat, on trinque, on chante ensemble une chanson de Noël.", 3400); }
        });

        // Nisse / Wichtel — petits lutins
        P.lutinZones.forEach((pos) => {
            const lutin = figure(pos.x, pos.z, 0xc23a3a, { scale: 0.6, hat: 0xc23a3a, skin: 0xf0d0b0, collide: false });
            const bowl = H.box(0.25, 0.1, 0.25, H.lam(0xf3f2ee), 0.4, 0.15, 0, lutin.parent === H.W.group ? H.W.group : H.W.group);
            let done = false;
            H.addInteractable({
                pos: new THREE.Vector3(pos.x + 0.4, 0.4, pos.z), radius: 3, cone: 0.6,
                label: () => done ? "Le lutin repart avec son bol vide" : "Laisser un bol de porridge avec du beurre",
                enabled: () => !done,
                action: () => {
                    done = true;
                    H.say("Le petit lutin engloutit le porridge… et te laisse un petit cadeau en échange.", 3200);
                }
            });
        });

        // Christkind — rare, la nuit, près du lac
        S.christkind = { active: false, mesh: null };
    }
    function spawnChristkind() {
        const THREE = H.W.THREE;
        const cam = H.W.camera.position;
        const a = Math.random() * Math.PI * 2, r = 20;
        const x = cam.x + Math.cos(a) * r, z = cam.z + Math.sin(a) * r;
        const g = figure(x, z, 0xfff3c0, { scale: 1.2, skin: 0xfff3c0, hat: 0xffe6b0, collide: false, glow: true });
        H.glowSprite(g, 0, 1.2, 0, 3, 0xffe9b0, 0.5);
        S.christkind.mesh = g;
        S.christkind.active = true;
        H.say("Une silhouette lumineuse apparaît au loin, à la lisière de la nuit…", 3200);
        const it = H.addInteractable({
            pos: new THREE.Vector3(x, 1.2, z), radius: 5, cone: 0.6,
            label: () => "S'approcher",
            enabled: () => S.christkind.active,
            action: () => {
                H.say("Le Christkind te fait un signe silencieux, puis s'efface dans la lumière.", 3600);
                hideChristkind();
            }
        });
        S.christkind.it = it;
        setTimeout(() => { if (S.christkind.active) hideChristkind(); }, 9000);
    }
    function hideChristkind() {
        if (!S.christkind || !S.christkind.mesh) return;
        H.W.group.remove(S.christkind.mesh);
        S.christkind.it.enabled = () => false;
        S.christkind.active = false;
        S.christkind.mesh = null;
    }

    // ============================================================
    // 13. FÊTES — couronne de l'Avent, minuit
    // ============================================================
    function buildFetes() {
        const THREE = H.W.THREE;
        const couronne = new THREE.Group();
        H.box(1.4, 0.2, 1.4, H.lam(0x1c3a22), 0, 0.9, 0, couronne);
        const bougiesCouronne = [0, 1, 2, 3].map((i) => H.glowSprite(couronne, Math.cos(i * 1.57) * 0.5, 1.15, Math.sin(i * 1.57) * 0.5, 0.7, 0xffb35c, 0));
        couronne.position.set(P.couronneAvent.x, 0, P.couronneAvent.z);
        H.W.group.add(couronne);
        H.addCollider(P.couronneAvent.x, P.couronneAvent.z, 0.9);
        H.addInteractable({
            pos: new THREE.Vector3(P.couronneAvent.x, 1.1, P.couronneAvent.z), radius: 3.2, cone: 0.6,
            label: () => S.couronne >= 4 ? "Les quatre bougies de l'Avent brillent déjà" : "Allumer une bougie sur la couronne de l'Avent",
            enabled: () => S.couronne < 4,
            action: () => {
                bougiesCouronne[S.couronne].material.opacity = 0.85;
                S.couronne += 1;
                H.say(S.couronne >= 4 ? "Les quatre bougies de la couronne brillent maintenant ensemble." : "Une bougie de plus s'allume sur la couronne de l'Avent.", 2800);
            }
        });
    }

    // ============================================================
    // 14. TICKER GLOBAL
    // ============================================================
    function tick(delta, t) {
        updateRide(delta);
        updateDogs(delta);
        S.animated.forEach((a) => a.update(t, delta));

        // Krampus : la nuit, dans la zone Forêt-Noire, rarement
        S.krampusTimer -= delta;
        if (S.krampusTimer <= 0) {
            S.krampusTimer = H.rnd(45, 90);
            const cam = H.W.camera.position;
            const d = Math.hypot(cam.x - P.krampusZone.x, cam.z - P.krampusZone.z);
            if (!S.krampus.active && H.W.night > 0.6 && d < P.krampusZone.r) spawnKrampus();
        }

        // Christkind : la nuit, près du lac, très rare
        S.christkindTimer -= delta;
        if (S.christkindTimer <= 0) {
            S.christkindTimer = H.rnd(120, 220);
            const cam = H.W.camera.position;
            const d = Math.hypot(cam.x, cam.z);
            if (!S.christkind.active && H.W.night > 0.75 && d < 50) spawnChristkind();
        }

        // Minuit : détecte le passage 1 -> 0 du temps du monde
        const time = H.W.time;
        if (S.prevTime > 0.92 && time < 0.08 && !S.midnightDone) {
            S.midnightDone = true;
            H.W.auroraPulse = 1.6;
            H.say("Minuit. Toutes les lumières de la vallée s'allument, et l'aurore danse au-dessus du lac.", 4200);
        }
        if (time > 0.15) S.midnightDone = false;
        S.prevTime = time;
    }

    // ============================================================
    // 15. BUILD — greffé sur NoelWorld.build
    // ============================================================
    function buildRest() {
        if (S.built) return;
        buildMarche();
        buildForetNoire();
        buildChateauBavarois();
        buildPecheurs();
        buildCampementSami();
        buildEglise();
        buildObservatoire();
        buildChaletPerso();
        buildHabitants();
        buildFetes();
        H.addTicker(tick);
        S.built = true;
    }

    const origBuild = window.NoelWorld.build;
    window.NoelWorld.build = function (ctx, opts) {
        const g = origBuild(ctx, opts);
        buildRest();
        return g;
    };
})();