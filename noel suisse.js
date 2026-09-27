/*
 * noel-suisse.js  —  ÉTAPE 2 : zone suisse (aurores violettes, au sud)
 * ------------------------------------------------------------
 * S'ajoute à noel-world.js sans le modifier : ce fichier surcharge
 * window.NoelWorld.build pour construire la zone suisse juste après
 * que le lac central ait été créé, et utilise NoelWorld.H pour tout
 * le reste (matériaux, textures, interactions, tickers).
 *
 * Charger APRÈS noel-world.js :
 *   <script src="noel-world.js"></script>
 *   <script src="noel-suisse.js"></script>
 *
 * Contenu :
 *   VILLAGE   : chocolatier, fromager, horloger, boulangerie, vin chaud
 *   MONTAGNE  : télésiège + train à crémaillère (trajets scénarisés),
 *               refuge d'altitude, sommet (ange de neige), cor des Alpes
 *   LUGE      : redescente rapide et amusante vers le village
 *   MÉDIÉVAL  : tour à escalader, table de jeux (dés)
 * ------------------------------------------------------------
 */
(function () {
    "use strict";

    // On attend que noel-world.js soit chargé.
    if (!window.NoelWorld || !window.NoelWorld.H) {
        console.warn("[noel-suisse] noel-world.js doit être chargé avant ce fichier.");
        return;
    }
    const H = window.NoelWorld.H;

    // ============================================================
    // 1. CONFIGURATION / POSITIONS
    // ============================================================
    // Sud (+z) = Suisse. Le village est au pied du sommet, tourné vers le lac.
    const P = {
        village: { x: 0, z: 98 },
        chocolatier: { x: -16, z: 88 },
        fromager: { x: -8, z: 92 },
        horloger: { x: 8, z: 92 },
        boulangerie: { x: 16, z: 88 },
        vinChaud: { x: 0, z: 82 },
        teleferiqueBas: { x: 24, z: 98 },
        trainBas: { x: -24, z: 98 },
        montagne: { x: 0, z: 205 },     // plateau d'altitude (visuellement "en haut")
        refuge: { x: -14, z: 205 },
        sommet: { x: 10, z: 218 },
        corAlpes: { x: -4, z: 195 },
        lugeHaut: { x: 20, z: 205 },
        medieval: { x: 60, z: 118 },
        tourMedievale: { x: 60, z: 108 },
        tableJeu: { x: 68, z: 126 }
    };
    const GONDOLA_APEX = 16;   // hauteur "cosmétique" du trajet en l'air (retombe à 0 à l'arrivée)

    // ============================================================
    // 2. ÉTAT LOCAL
    // ============================================================
    const S = {
        built: false, ride: null, chamois: [], animated: []
    };

    // ============================================================
    // 3. PETITS OUTILS LOCAUX (s'appuient sur H)
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
        // toit à deux pans
        const rl = H.box(w + 1.0, 0.25, d * 0.62, roofM, 0, h + 0.55, -d * 0.2, g); rl.rotation.x = -0.5;
        const rr = H.box(w + 1.0, 0.25, d * 0.62, roofM, 0, h + 0.55, d * 0.2, g); rr.rotation.x = 0.5;
        H.box(w * 0.6, 0.1, 0.3, H.lam(0xf3f8ff), 0, h + 0.95, -d * 0.42, g);
        // porte + petit auvent
        H.box(1.1, 1.7, 0.15, woodM, 0, 0.85, d / 2 + 0.02, g);
        H.box(1.5, 0.12, 0.5, woodM, 0, 1.85, d / 2 + 0.2, g);
        // fenêtre chaude
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
        ctx.fillStyle = "#ffe6b0"; ctx.font = "700 30px Georgia, serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(label, 128, 50);
        const THREE = H.W.THREE;
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.85), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
        sign.position.set(x, y, z);
        parent.add(sign);
        return sign;
    }

    // trajet scénarisé de la caméra : points = [{x,z,yb}], duration en secondes.
    // NB : un seul ticker persistant (voir tick()) traite S.ride ; startRide se contente de l'armer.
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
            if (r.arriveMsg) H.say(r.arriveMsg, 2600);
        }
    }

    // ============================================================
    // 4. VILLAGE — chocolatier / fromager / horloger / boulangerie / vin chaud
    // ============================================================
    function buildVillage() {
        const THREE = H.W.THREE;

        // Sol du village : léger pavage clair pour distinguer de la neige alentour
        const plaza = new THREE.Mesh(new THREE.CircleGeometry(26, 40), new THREE.MeshLambertMaterial({ map: H.snowTex() }));
        plaza.rotation.x = -Math.PI / 2;
        plaza.position.set(P.village.x, 0.02, P.village.z);
        H.W.group.add(plaza);

        // --- Chocolatier -------------------------------------------------
        const choc = chalet(P.chocolatier.x, P.chocolatier.z, "#8a4a2a", 0x5a2f1a);
        signBoard(choc, 0, 3.1, 2.05, "Chocolatier");
        const potM = H.lam(0x5a3018, 0x2a1408, 0.3);
        const pot = H.box(0.9, 0.5, 0.9, potM, 0, 1.0, 2.6, choc);
        let chocMelt = 0;
        S.animated.push({ update: () => { chocMelt = Math.max(0, chocMelt - 0.004); pot.material.emissiveIntensity = 0.2 + chocMelt * 0.6; } });
        H.addInteractable({
            pos: new THREE.Vector3(P.chocolatier.x, 1.2, P.chocolatier.z + 2.6), radius: 3.4, cone: 0.4,
            label: () => "Faire fondre une plaque de chocolat",
            action: () => {
                chocMelt = 1;
                H.warmUp(20);
                const formes = ["étoile", "sapin", "ours"];
                H.say("Le chocolat fond au bain-marie… tu le verses dans un moule " + formes[Math.floor(Math.random() * 3)] + ".", 3200);
            }
        });

        // --- Fromager (raclette + fondue) ---------------------------------
        const from = chalet(P.fromager.x, P.fromager.z, "#c9a24a", 0x5a2f1a);
        signBoard(from, 0, 3.1, 2.05, "Fromager");
        const wheel = H.box(0.7, 0.35, 0.7, H.lam(0xe8c96a), -0.6, 0.9, 2.5, from);
        H.addInteractable({
            pos: new THREE.Vector3(P.fromager.x - 0.6, 1.0, P.fromager.z + 2.5), radius: 3.2, cone: 0.4,
            label: () => "Gratter la raclette",
            action: () => { wheel.rotation.y += 0.6; H.say("Le fromage fondu coule sur une pomme de terre chaude.", 2600); }
        });
        const cauldron = H.box(0.6, 0.4, 0.6, H.lam(0x3a2418, 0x2a1408, 0.2), 0.7, 0.95, 2.5, from);
        H.addInteractable({
            pos: new THREE.Vector3(P.fromager.x + 0.7, 1.1, P.fromager.z + 2.5), radius: 3.2, cone: 0.4,
            label: () => "Remuer la fondue",
            action: () => {
                cauldron.rotation.z = Math.sin(H.W.t * 20) * 0.05;
                H.warmUp(15);
                if (Math.random() < 0.35) H.say("Un morceau de pain tombe dedans… tout le monde rit !", 2800);
                else H.say("Tu remues la fondue avec la longue fourchette.", 2200);
            }
        });

        // --- Horloger --------------------------------------------------
        const horl = chalet(P.horloger.x, P.horloger.z, "#5a6a7a", 0x2a3a4a);
        signBoard(horl, 0, 3.1, 2.05, "Horloger");
        const cuckoo = new THREE.Group(); cuckoo.position.set(0, 2.2, 2.05); horl.add(cuckoo);
        H.box(0.6, 0.8, 0.15, H.lam(0x5a3a22), 0, 0, 0, cuckoo);
        const door = H.box(0.24, 0.34, 0.05, H.lam(0x2a1a12), 0, 0.05, 0.09, cuckoo);
        const bird = H.box(0.14, 0.14, 0.14, H.lam(0xe8c96a), 0, 0.05, 0.2, cuckoo); bird.visible = false;
        H.addInteractable({
            pos: cuckoo.getWorldPosition(new THREE.Vector3()), radius: 3.4, cone: 0.4,
            label: () => "Ouvrir le coucou et le remonter",
            action: () => {
                door.rotation.x = -1.1; bird.visible = true;
                H.playNoise(1200, 4, 0.12, 0.12);
                setTimeout(() => { H.playNoise(900, 4, 0.12, 0.12); }, 260);
                setTimeout(() => { door.rotation.x = 0; bird.visible = false; }, 1400);
                H.say("Coucou ! Les engrenages tournent de nouveau.", 2400);
            }
        });

        // --- Boulangerie -------------------------------------------------
        const boul = chalet(P.boulangerie.x, P.boulangerie.z, "#d9c08a", 0x5a2f1a);
        signBoard(boul, 0, 3.1, 2.05, "Boulangerie");
        const oven = H.box(1.0, 0.7, 0.5, H.lam(0x3a2418), 0, 0.5, 2.3, boul);
        const ovenGlow = H.glowSprite(boul, 0, 0.6, 2.6, 1.6, 0xff9a3d, 0.0);
        S.animated.push({ update: (t) => { if (ovenGlow.material.opacity > 0.01) ovenGlow.material.opacity = 0.7 + Math.sin(t * 8) * 0.1; } });
        H.addInteractable({
            pos: new THREE.Vector3(P.boulangerie.x, 0.8, P.boulangerie.z + 2.3), radius: 3.2, cone: 0.4,
            label: () => "Tresser et enfourner le Zopf",
            action: () => {
                ovenGlow.material.opacity = 0.8;
                H.warmUp(18);
                H.say("Tu tresses le pain, le dores à l'œuf… ça sent déjà bon.", 3000);
                setTimeout(() => { ovenGlow.material.opacity = 0; }, 6000);
            }
        });

        // --- Vin chaud / jus de pomme chaud --------------------------------
        const stand = new THREE.Group();
        const woodM = H.lam(0x5a3a22);
        H.box(2.2, 0.12, 1.2, woodM, 0, 1.0, 0, stand);
        [[-1, -0.5], [1, -0.5], [-1, 0.5], [1, 0.5]].forEach(([sx, sz]) => H.box(0.12, 1.0, 0.12, woodM, sx, 0.5, sz, stand));
        H.box(2.4, 0.1, 1.4, H.lam(0xf3f8ff), 0, 1.75, 0, stand);
        const cauldron2 = H.box(0.6, 0.4, 0.6, H.lam(0x5a2418, 0x8a1414, 0.35), 0, 1.2, 0, stand);
        const steam = H.glowSprite(stand, 0, 1.8, 0, 1.4, 0xffe6d0, 0.35);
        stand.position.set(P.vinChaud.x, 0, P.vinChaud.z);
        H.W.group.add(stand);
        H.addHeatSource(P.vinChaud.x, P.vinChaud.z, 6, 0.8);
        H.addCollider(P.vinChaud.x, P.vinChaud.z, 1.3);
        S.animated.push({ update: (t) => { steam.material.opacity = 0.25 + Math.sin(t * 1.6) * 0.1; cauldron2.rotation.y = Math.sin(t * 0.5) * 0.05; } });
        H.addInteractable({
            pos: new THREE.Vector3(P.vinChaud.x, 1.3, P.vinChaud.z), radius: 3.4, cone: 0.5,
            label: () => "Boire un vin chaud (cannelle, orange, girofle)",
            action: () => { H.warmUp(45); H.say("La cannelle et le clou de girofle réchauffent aussitôt.", 2800); }
        });
    }

    // ============================================================
    // 5. MONTAGNE — télésiège, train, refuge, sommet, cor des Alpes
    // ============================================================
    function buildLiftStation(pos, label) {
        const THREE = H.W.THREE;
        const wood = H.lam(0x5a3a22);
        const g = new THREE.Group();
        H.box(1.0, 4.2, 1.0, wood, -1.4, 2.1, 0, g);
        H.box(1.0, 4.2, 1.0, wood, 1.4, 2.1, 0, g);
        H.box(3.2, 0.3, 1.0, wood, 0, 4.2, 0, g);
        signBoard(g, 0, 4.7, 0.55, label);
        g.position.set(pos.x, 0, pos.z);
        H.W.group.add(g);
        H.addCollider(pos.x, pos.z, 1.6);
        return g;
    }

    function buildMountainAccess() {
        const THREE = H.W.THREE;

        // --- Télésiège --------------------------------------------------
        buildLiftStation(P.teleferiqueBas, "Télésiège");
        const chairs = [];
        for (let i = 0; i < 3; i += 1) {
            const g = new THREE.Group();
            H.box(1.0, 0.1, 0.5, H.lam(0xc23a3a), 0, 0, 0, g);
            H.box(0.9, 0.5, 0.08, H.lam(0xc23a3a), 0, 0.28, -0.22, g);
            g.position.set(P.teleferiqueBas.x, 5, P.teleferiqueBas.z - i * 6);
            H.W.group.add(g);
            chairs.push({ g, ph: i * 2 });
        }
        S.animated.push({ update: (t) => { chairs.forEach((c) => { c.g.position.y = 5 + Math.sin(t * 0.6 + c.ph) * 0.15; c.g.rotation.z = Math.sin(t * 0.6 + c.ph) * 0.04; }); } });
        H.addInteractable({
            pos: new THREE.Vector3(P.teleferiqueBas.x, 1.4, P.teleferiqueBas.z), radius: 4, cone: 0.45,
            label: () => "Monter en télésiège",
            action: () => startRide([
                { x: P.teleferiqueBas.x, z: P.teleferiqueBas.z, yb: 0 },
                { x: (P.teleferiqueBas.x + P.montagne.x) / 2, z: (P.teleferiqueBas.z + P.montagne.z) / 2, yb: GONDOLA_APEX },
                { x: P.montagne.x, z: P.montagne.z, yb: 0 }
            ], 9, "Le télésiège arrive en altitude. La forêt et les lumières défilent en dessous.")
        });

        // --- Train à crémaillère -----------------------------------------
        buildLiftStation(P.trainBas, "Train à crémaillère");
        H.addInteractable({
            pos: new THREE.Vector3(P.trainBas.x, 1.4, P.trainBas.z), radius: 4, cone: 0.45,
            label: () => "Prendre le train à crémaillère",
            action: () => startRide([
                { x: P.trainBas.x, z: P.trainBas.z, yb: 0 },
                { x: (P.trainBas.x + P.montagne.x) / 2, z: (P.trainBas.z + P.montagne.z) / 2, yb: GONDOLA_APEX * 0.6 },
                { x: P.montagne.x - 6, z: P.montagne.z, yb: 0 }
            ], 11, "Le train s'arrête. Tu ouvres la fenêtre : l'air est plus vif ici.")
        });

        // --- Plateau d'altitude : petit décor rocheux tout autour ---------
        const rockM = new THREE.MeshLambertMaterial({ map: H.pixTex("suisse_rock", 16, H.grid8(["#3c4666", "#454f70", "#333c58", "#4a5478"], 3, 7)), flatShading: true });
        for (let i = 0; i < 26; i += 1) {
            const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 14;
            const x = P.montagne.x + Math.cos(a) * r, z = P.montagne.z + Math.sin(a) * r;
            const s = 3 + Math.random() * 5;
            H.box(s, s * 1.4, s, rockM, x, s * 0.7, z, H.W.group);
        }
        const plateau = new THREE.Mesh(new THREE.CircleGeometry(30, 40), new THREE.MeshLambertMaterial({ map: H.snowTex() }));
        plateau.rotation.x = -Math.PI / 2;
        plateau.position.set(P.montagne.x, 0.02, P.montagne.z);
        H.W.group.add(plateau);

        // --- Refuge d'altitude --------------------------------------------
        const refuge = chalet(P.refuge.x, P.refuge.z, "#6a5038", 0x3a2214, { w: 6, d: 5.4, h: 3.2 });
        signBoard(refuge, 0, 3.7, 2.75, "Refuge d'altitude");
        H.addHeatSource(P.refuge.x, P.refuge.z, 8, 1);
        const soup = H.box(0.4, 0.2, 0.4, H.lam(0xd97a2a, 0xff9a3d, 0.4), 1.4, 1.0, 2.0, refuge);
        H.addInteractable({
            pos: new THREE.Vector3(P.refuge.x + 1.4, 1.1, P.refuge.z + 2.0), radius: 4, cone: 0.5,
            label: () => "S'asseoir près du poêle et boire une soupe chaude",
            action: () => { H.warmUp(60); soup.rotation.y += 0.4; H.say("Le poêle à bois ronfle. Par la baie vitrée, toute la vallée s'étend.", 3200); }
        });

        // --- Cor des Alpes --------------------------------------------------
        const THREE2 = H.W.THREE;
        const cor = new THREE2.Group();
        H.box(2.4, 0.18, 0.18, H.lam(0x8a5a30), 0, 1.0, 0, cor);
        H.box(0.5, 0.5, 0.18, H.lam(0x8a5a30), 1.15, 1.1, 0, cor);
        cor.position.set(P.corAlpes.x, 0, P.corAlpes.z);
        cor.rotation.y = 0.6;
        H.W.group.add(cor);
        for (let i = 0; i < 4; i += 1) {
            const ch = H.box(0.5, 0.9, 0.25, H.lam(0x8a6a4a), P.corAlpes.x + 8 + i * 3, 0.45, P.corAlpes.z + 10 - i, H.W.group);
            ch.visible = false;
            S.chamois.push({ mesh: ch, until: 0 });
        }
        H.addInteractable({
            pos: new THREE2.Vector3(P.corAlpes.x, 1.1, P.corAlpes.z), radius: 4.4, cone: 0.5,
            label: () => "Souffler dans le cor des Alpes",
            action: () => {
                H.playNoise(220, 1.2, 0.22, 1.6);
                setTimeout(() => H.playNoise(196, 1.0, 0.18, 1.8), 250);
                S.chamois.forEach((c) => { c.mesh.visible = true; c.until = H.W.t + 6; });
                H.say("Le son roule dans la vallée… des chamois apparaissent sur les pentes.", 3200);
            }
        });

        // --- Sommet : ange de neige + vue sur les trois aurores -------------
        H.addInteractable({
            pos: new THREE2.Vector3(P.sommet.x, 1.2, P.sommet.z), radius: 5, cone: 0.5,
            label: () => "S'allonger dans la neige (ange de neige)",
            action: () => { H.say("Tu t'allonges dans la neige et regardes le ciel : les trois aurores se rejoignent au loin.", 3600); }
        });

        // --- Luge : redescente rapide vers le village -----------------------
        H.addInteractable({
            pos: new THREE2.Vector3(P.lugeHaut.x, 1.1, P.lugeHaut.z), radius: 4, cone: 0.5,
            label: () => "Dévaler la piste en luge",
            action: () => startRide([
                { x: P.lugeHaut.x, z: P.lugeHaut.z, yb: 4 },
                { x: (P.lugeHaut.x + P.village.x) / 2, z: (P.lugeHaut.z + P.village.z) / 2, yb: 1 },
                { x: P.village.x, z: P.village.z + 6, yb: 0 }
            ], 4.5, "Tu freines avec les pieds… te voilà de retour au village, les joues rouges !")
        });
    }

    // ============================================================
    // 6. VILLAGE MÉDIÉVAL — tour, table de jeu
    // ============================================================
    function buildMedieval() {
        const THREE = H.W.THREE;
        const stoneM = new THREE.MeshLambertMaterial({ map: H.stoneTex() });

        // Remparts (cercle de blocs) + fontaine centrale
        const n = 20, r = 22;
        for (let i = 0; i < n; i += 1) {
            const a = (i / n) * Math.PI * 2;
            const x = P.medieval.x + Math.cos(a) * r, z = P.medieval.z + Math.sin(a) * r;
            H.box(2.0, 2.4, 1.4, stoneM, x, 1.2, z, H.W.group);
            H.addCollider(x, z, 1.0);
        }
        const fountain = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.6, 16), stoneM);
        fountain.position.set(P.medieval.x, 0.3, P.medieval.z);
        H.W.group.add(fountain);
        H.addCollider(P.medieval.x, P.medieval.z, 1.9);

        // Château + tour
        const chateau = new THREE.Group();
        H.box(7, 5, 6, stoneM, 0, 2.5, 0, chateau);
        const towerH = 11;
        const tower = H.box(2.4, towerH, 2.4, stoneM, 3.6, towerH / 2, -2.6, chateau);
        [0, 1, 2, 3].forEach((i) => {
            const a = (i / 4) * Math.PI * 2;
            H.box(0.3, 0.6, 0.3, stoneM, Math.cos(a) * 1.3, towerH + 0.3, -2.6 + Math.sin(a) * 1.3, chateau);
        });
        const roofCone = new THREE.Mesh(new THREE.ConeGeometry(1.9, 2.2, 8), H.lam(0x5a2f2f));
        roofCone.position.set(3.6, towerH + 1.1, -2.6);
        chateau.add(roofCone);
        chateau.position.set(P.tourMedievale.x, 0, P.tourMedievale.z);
        H.W.group.add(chateau);
        H.addCollider(P.tourMedievale.x, P.tourMedievale.z, 4.2);
        H.addCollider(P.tourMedievale.x + 3.6, P.tourMedievale.z - 2.6, 1.6);

        const topWorld = new THREE.Vector3(P.tourMedievale.x + 3.6, towerH + 1.2, P.tourMedievale.z - 2.6);
        let onTop = false;
        H.addInteractable({
            pos: new THREE.Vector3(P.tourMedievale.x + 3.6, 1.4, P.tourMedievale.z - 2.6), radius: 3.4, cone: 0.5,
            label: () => onTop ? "Redescendre de la tour" : "Monter au sommet de la tour",
            action: () => {
                onTop = !onTop;
                if (onTop) startRide([
                    { x: H.W.camera.position.x, z: H.W.camera.position.z, yb: 0 },
                    { x: topWorld.x, z: topWorld.z, yb: towerH - 0.3 }
                ], 2.6, "Tu domines tout le village médiéval et la vallée enneigée.");
                else startRide([
                    { x: topWorld.x, z: topWorld.z, yb: towerH - 0.3 },
                    { x: P.tourMedievale.x + 3.6, z: P.tourMedievale.z, yb: 0 }
                ], 2.0, null);
            }
        });

        // Grande table + jeu de dés
        const wood = H.lam(0x5a3a22);
        const table = new THREE.Group();
        H.box(3.4, 0.15, 1.6, wood, 0, 1.0, 0, table);
        [[-1.5, -0.65], [1.5, -0.65], [-1.5, 0.65], [1.5, 0.65]].forEach(([tx, tz]) => H.box(0.14, 1.0, 0.14, wood, tx, 0.5, tz, table));
        const dice = [0, 1].map((i) => H.box(0.28, 0.28, 0.28, H.lam(0xf3f2ee), -0.3 + i * 0.6, 1.22, 0, table));
        table.position.set(P.tableJeu.x, 0, P.tableJeu.z);
        H.W.group.add(table);
        H.addCollider(P.tableJeu.x, P.tableJeu.z, 2.2);
        H.addInteractable({
            pos: new THREE.Vector3(P.tableJeu.x, 1.2, P.tableJeu.z), radius: 3.4, cone: 0.5,
            label: () => "Jouer aux dés avec les habitants",
            action: () => {
                const a = 1 + Math.floor(Math.random() * 6), b = 1 + Math.floor(Math.random() * 6);
                dice.forEach((d) => { d.rotation.x = Math.random() * Math.PI; d.rotation.z = Math.random() * Math.PI; });
                H.say("Tu lances les dés : " + a + " et " + b + (a + b === 12 ? " — double six, tout le monde applaudit !" : "."), 3000);
            }
        });
    }

    // ============================================================
    // 7. TICKER GLOBAL DE LA ZONE (chamois, petites animations)
    // ============================================================
    function tick(delta, t) {
        updateRide(delta);
        S.animated.forEach((a) => a.update(t, delta));
        S.chamois.forEach((c) => {
            if (c.mesh.visible && t > c.until) c.mesh.visible = false;
        });
    }

    // ============================================================
    // 8. BUILD — greffé sur NoelWorld.build
    // ============================================================
    function buildSwissZone() {
        if (S.built) return;
        buildVillage();
        buildMountainAccess();
        buildMedieval();
        H.addTicker(tick);
        S.built = true;
    }

    const origBuild = window.NoelWorld.build;
    window.NoelWorld.build = function (ctx, opts) {
        const g = origBuild(ctx, opts);
        buildSwissZone();
        return g;
    };
})();