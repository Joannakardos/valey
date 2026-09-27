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
 *   VILLAGE   : une grande maison de Noël qu'on visite (chocolatier,
 *               fromager, horloger, boulangerie, vin chaud à l'intérieur)
 *   MONTAGNE  : télésiège + train à crémaillère — on voit vraiment la
 *               cabine/le siège qui monte (la caméra y est attachée),
 *               refuge d'altitude, sommet (ange de neige), cor des Alpes
 *   LUGE      : redescente rapide et amusante vers le village
 *   MÉDIÉVAL  : tour à escalader, table de jeux (dés)
 * ------------------------------------------------------------
 */
(function () {
    "use strict";

    if (!window.NoelWorld || !window.NoelWorld.H) {
        console.warn("[noel-suisse] noel-world.js doit être chargé avant ce fichier.");
        return;
    }
    const H = window.NoelWorld.H;

    // ============================================================
    // 1. CONFIGURATION / POSITIONS
    // ============================================================
    const P = {
        village: { x: 0, z: 98 },
        maison: { x: 0, z: 90 },       // la grande maison de Noël (entrée côté lac)
        teleferiqueBas: { x: 24, z: 98 },
        trainBas: { x: -24, z: 98 },
        montagne: { x: 0, z: 205 },
        refuge: { x: -14, z: 205 },
        sommet: { x: 10, z: 218 },
        corAlpes: { x: -4, z: 195 },
        lugeHaut: { x: 20, z: 205 },
        medieval: { x: 60, z: 118 },
        tourMedievale: { x: 60, z: 108 },
        tableJeu: { x: 68, z: 126 }
    };
    const GONDOLA_APEX = 16;

    // ============================================================
    // 2. ÉTAT LOCAL
    // ============================================================
    const S = {
        built: false, ride: null, chamois: [], animated: []
    };

    // ============================================================
    // 3. PETITS OUTILS LOCAUX
    // ============================================================
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

    // Trajet scénarisé : soit direct (caméra bouge seule, ex. luge/tour),
    // soit "à bord d'un véhicule visible" (vehicle: un Object3D qui devient
    // le parent temporaire de la caméra pendant le trajet — télésiège, train).
    function startRide(points, duration, arriveMsg, vehicle) {
        if (S.ride) return;
        const THREE = H.W.THREE;
        if (vehicle) {
            vehicle.visible = true;
            H.W.scene.attach(H.W.camera);           // garde la position monde actuelle
            H.W.camera.position.set(0, 0, 0);
            vehicle.add(H.W.camera);
            H.W.camera.position.set(0, 0.35, 0);
            H.W.camera.rotation.set(0, 0, 0, "YXZ");
        }
        S.ride = { points, duration, t: 0, startY: vehicle ? 0 : H.W.camera.position.y, arriveMsg, vehicle };
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
        const target = r.vehicle || H.W.camera;
        target.position.set(x, r.startY + yb, z);
        if (r.vehicle) {
            const dx = B.x - A.x, dz = B.z - A.z;
            if (Math.hypot(dx, dz) > 0.001) r.vehicle.rotation.y = Math.atan2(dx, dz);
        }
        if (u >= 1) {
            if (r.vehicle) {
                const wp = H.W.camera.getWorldPosition(new H.W.THREE.Vector3());
                H.W.scene.attach(H.W.camera);
                H.W.camera.position.copy(wp);
                H.W.camera.position.y = H.CFG.eyeHeight;
                r.vehicle.visible = false;
            }
            S.ride = null;
            if (r.arriveMsg) H.say(r.arriveMsg, 2600);
        }
    }

    // ============================================================
    // 4. LA GRANDE MAISON DE NOËL (chocolatier / fromager / horloger /
    //    boulangerie / vin chaud, tous réunis à l'intérieur)
    // ============================================================
    function buildMaison() {
        const THREE = H.W.THREE;
        const cx = P.maison.x, cz = P.maison.z;
        const W = 18, D = 14, HH = 4.6;
        const wallM = new THREE.MeshLambertMaterial({ map: H.plasterTex("#caa06a") });
        const roofM = H.lam(0x5a2f1a);
        const woodM = H.lam(0x5a3a22);
        const floorM = new THREE.MeshLambertMaterial({ map: H.stoneTex() });

        const g = new THREE.Group();
        g.position.set(cx, 0, cz);
        H.W.group.add(g);

        // Sol intérieur
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.4, D - 0.4), floorM);
        floor.rotation.x = -Math.PI / 2; floor.position.y = 0.02;
        g.add(floor);

        // Murs avec une ouverture (porte) sur le mur côté lac (-z)
        const doorHalf = 1.8;
        // Le mur -z (côté lac) est construit en 2 blocs, de part et d'autre de la porte :
        H.box(W / 2 - doorHalf, HH, 0.3, wallM, -(doorHalf + (W / 2 - doorHalf) / 2), HH / 2, -D / 2, g);
        H.box(W / 2 - doorHalf, HH, 0.3, wallM, (doorHalf + (W / 2 - doorHalf) / 2), HH / 2, -D / 2, g);
        H.box(W, HH, 0.3, wallM, 0, HH / 2, D / 2, g);           // mur +z
        H.box(0.3, HH, D, wallM, -W / 2, HH / 2, 0, g);          // mur -x
        H.box(0.3, HH, D, wallM, W / 2, HH / 2, 0, g);           // mur +x
        // Toit à deux pans
        const rl = H.box(W + 1.4, 0.3, D * 0.58, roofM, 0, HH + 1.1, -D * 0.22, g); rl.rotation.x = -0.42;
        const rr = H.box(W + 1.4, 0.3, D * 0.58, roofM, 0, HH + 1.1, D * 0.22, g); rr.rotation.x = 0.42;
        H.box(W * 0.5, 0.14, 0.4, H.lam(0xf3f8ff), 0, HH + 1.85, -D * 0.42, g);
        signBoard(g, 0, HH + 0.4, -D / 2 - 0.1, "Maison de Noël");
        // Auvent au-dessus de la porte
        H.box(doorHalf * 2 + 0.6, 0.16, 0.9, woodM, 0, HH * 0.62, -D / 2 - 0.5, g);

        // Colliders du bâtiment (4 segments, en laissant l'ouverture -z libre)
        H.addCollider(cx - (doorHalf + (W / 2 - doorHalf) / 2), cz - D / 2, 0.3);
        H.addCollider(cx + (doorHalf + (W / 2 - doorHalf) / 2), cz - D / 2, 0.3);
        for (let i = -3; i <= 3; i += 1) {
            H.addCollider(cx + i * (W / 7), cz + D / 2, 0.4);
            H.addCollider(cx - W / 2, cz + i * (D / 7), 0.4);
            H.addCollider(cx + W / 2, cz + i * (D / 7), 0.4);
        }

        // Décor intérieur : petit sapin, guirlandes au plafond, bougies
        const petitSapin = new THREE.Group(); petitSapin.position.set(0, 0, D / 2 - 1.6); g.add(petitSapin);
        H.box(1.2, 2.6, 1.2, H.lam(0x1c3a22), 0, 1.3, 0, petitSapin);
        H.box(1.3, 0.16, 1.3, H.lam(0xf3f8ff), 0, 2.5, 0, petitSapin);
        for (let i = 0; i < 10; i += 1) {
            const a = Math.random() * Math.PI * 2, y = 0.4 + Math.random() * 2.0, r = 0.5 + Math.random() * 0.2;
            H.box(0.14, 0.14, 0.14, H.lam([0xc23a3a, 0xd9a94a, 0x3a6fbf][i % 3]), Math.cos(a) * r, y, Math.sin(a) * r, petitSapin);
        }
        for (let i = 0; i < 6; i += 1) {
            H.glowSprite(g, -W / 2 + 1 + i * (W - 2) / 5, HH - 0.5, -D / 2 + 0.6, 1.6, 0xffb35c, 0.6);
        }

        // --- Stations intérieures, réparties le long des murs ------------
        function stationWall(localX, localZ, faceZ) {
            const sg = new THREE.Group();
            sg.position.set(localX, 0, localZ);
            g.add(sg);
            return sg;
        }

        // Chocolatier (mur -x)
        const choc = stationWall(-W / 2 + 1.4, -D / 2 + 3.2, 1);
        H.box(1.6, 1.0, 0.9, woodM, 0, 0.5, 0, choc);
        const pot = H.box(0.7, 0.5, 0.7, H.lam(0x5a3018, 0x2a1408, 0.3), 0, 1.05, 0, choc);
        signBoard(choc, 0, 1.7, 0.5, "Chocolatier");
        let chocMelt = 0;
        S.animated.push({ update: () => { chocMelt = Math.max(0, chocMelt - 0.004); pot.material.emissiveIntensity = 0.2 + chocMelt * 0.6; } });
        const formes = ["étoile", "sapin", "ours"];
        H.addInteractable({
            pos: new THREE.Vector3(cx + choc.position.x, 1.2, cz + choc.position.z + 1.0), radius: 3.2, cone: 0.5,
            label: () => "Faire fondre une plaque de chocolat",
            action: () => { chocMelt = 1; H.warmUp(20); H.say("Le chocolat fond au bain-marie… tu le verses dans un moule " + formes[Math.floor(Math.random() * 3)] + ".", 3200); }
        });

        // Fromager (mur -x, un peu plus loin)
        const from = stationWall(-W / 2 + 1.4, 0, 1);
        H.box(1.6, 1.0, 0.9, woodM, 0, 0.5, 0, from);
        const wheel = H.box(0.6, 0.3, 0.6, H.lam(0xe8c96a), -0.4, 1.05, 0, from);
        const cauldron = H.box(0.55, 0.4, 0.55, H.lam(0x3a2418, 0x2a1408, 0.2), 0.4, 1.1, 0, from);
        signBoard(from, 0, 1.7, 0.5, "Fromager");
        H.addInteractable({
            pos: new THREE.Vector3(cx + from.position.x - 0.4, 1.2, cz + from.position.z + 1.0), radius: 3.2, cone: 0.5,
            label: () => "Gratter la raclette",
            action: () => { wheel.rotation.y += 0.6; H.say("Le fromage fondu coule sur une pomme de terre chaude.", 2600); }
        });
        H.addInteractable({
            pos: new THREE.Vector3(cx + from.position.x + 0.4, 1.2, cz + from.position.z + 1.0), radius: 3.2, cone: 0.5,
            label: () => "Remuer la fondue",
            action: () => {
                cauldron.rotation.z = Math.sin(H.W.t * 20) * 0.05;
                H.warmUp(15);
                if (Math.random() < 0.35) H.say("Un morceau de pain tombe dedans… tout le monde rit !", 2800);
                else H.say("Tu remues la fondue avec la longue fourchette.", 2200);
            }
        });

        // Horloger (mur -x, fond de la maison)
        const horl = stationWall(-W / 2 + 1.4, D / 2 - 2.6, 1);
        H.box(1.6, 1.0, 0.9, woodM, 0, 0.5, 0, horl);
        const cuckoo = new THREE.Group(); cuckoo.position.set(0, 1.9, 0); horl.add(cuckoo);
        H.box(0.6, 0.8, 0.15, H.lam(0x5a3a22), 0, 0, 0, cuckoo);
        const door = H.box(0.24, 0.34, 0.05, H.lam(0x2a1a12), 0, 0.05, 0.09, cuckoo);
        const bird = H.box(0.14, 0.14, 0.14, H.lam(0xe8c96a), 0, 0.05, 0.2, cuckoo); bird.visible = false;
        signBoard(horl, 0, 2.5, 0.5, "Horloger");
        H.addInteractable({
            pos: new THREE.Vector3(cx + horl.position.x, 1.9, cz + horl.position.z + 0.6), radius: 3.4, cone: 0.5,
            label: () => "Ouvrir le coucou et le remonter",
            action: () => {
                door.rotation.x = -1.1; bird.visible = true;
                H.playNoise(1200, 4, 0.12, 0.12);
                setTimeout(() => { H.playNoise(900, 4, 0.12, 0.12); }, 260);
                setTimeout(() => { door.rotation.x = 0; bird.visible = false; }, 1400);
                H.say("Coucou ! Les engrenages tournent de nouveau.", 2400);
            }
        });

        // Boulangerie (mur +x)
        const boul = stationWall(W / 2 - 1.4, -D / 2 + 3.2, -1);
        H.box(1.6, 1.0, 0.9, woodM, 0, 0.5, 0, boul);
        const oven = H.box(1.0, 0.7, 0.5, H.lam(0x3a2418), 0, 0.85, 0, boul);
        const ovenGlow = H.glowSprite(boul, 0, 0.9, 0.4, 1.6, 0xff9a3d, 0.0);
        signBoard(boul, 0, 1.7, -0.5, "Boulangerie");
        S.animated.push({ update: (t) => { if (ovenGlow.material.opacity > 0.01) ovenGlow.material.opacity = 0.7 + Math.sin(t * 8) * 0.1; } });
        H.addInteractable({
            pos: new THREE.Vector3(cx + boul.position.x, 1.2, cz + boul.position.z - 1.0), radius: 3.2, cone: 0.5,
            label: () => "Tresser et enfourner le Zopf",
            action: () => {
                ovenGlow.material.opacity = 0.8;
                H.warmUp(18);
                H.say("Tu tresses le pain, le dores à l'œuf… ça sent déjà bon.", 3000);
                setTimeout(() => { ovenGlow.material.opacity = 0; }, 6000);
            }
        });

        // Vin chaud (au centre, face à l'entrée)
        const stand = stationWall(0, 1.0, 1);
        H.box(2.2, 0.12, 1.2, woodM, 0, 1.0, 0, stand);
        [[-1, -0.5], [1, -0.5], [-1, 0.5], [1, 0.5]].forEach(([sx, sz]) => H.box(0.12, 1.0, 0.12, woodM, sx, 0.5, sz, stand));
        const cauldron2 = H.box(0.6, 0.4, 0.6, H.lam(0x5a2418, 0x8a1414, 0.35), 0, 1.2, 0, stand);
        const steam = H.glowSprite(stand, 0, 1.8, 0, 1.4, 0xffe6d0, 0.35);
        signBoard(stand, 0, 1.9, 0.9, "Vin chaud");
        H.addHeatSource(cx + stand.position.x, cz + stand.position.z, 6, 0.8);
        S.animated.push({ update: (t) => { steam.material.opacity = 0.25 + Math.sin(t * 1.6) * 0.1; cauldron2.rotation.y = Math.sin(t * 0.5) * 0.05; } });
        H.addInteractable({
            pos: new THREE.Vector3(cx + stand.position.x, 1.3, cz + stand.position.z + 1.0), radius: 3.4, cone: 0.5,
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

    // Siège de télésiège visible : la caméra s'y assoit vraiment pendant la montée.
    function buildRideChair(hex) {
        const THREE = H.W.THREE;
        const g = new THREE.Group();
        g.visible = false;
        H.box(1.0, 0.12, 0.55, H.lam(hex), 0, 0, 0, g);
        H.box(0.9, 0.55, 0.08, H.lam(hex), 0, 0.3, -0.24, g);
        H.box(0.9, 0.1, 0.08, H.lam(0x2a2a2a), 0, 0.05, 0.3, g);  // barre de sécurité
        [-0.42, 0.42].forEach((sx) => H.box(0.06, 1.6, 0.06, H.lam(0x3a3a3a), sx, 0.9, 0, g));
        H.W.scene.add(g);
        return g;
    }
    function buildRideWagon() {
        const THREE = H.W.THREE;
        const g = new THREE.Group();
        g.visible = false;
        H.box(1.6, 0.9, 1.2, H.lam(0xc23a3a), 0, 0.55, 0, g);
        H.box(1.7, 0.1, 1.3, H.lam(0x2a2a2a), 0, 1.02, 0, g);
        H.box(1.5, 0.5, 0.1, H.lam(0xbfe0ff, 0xbfe0ff, 0.1), 0, 0.7, 0.61, g);
        H.W.scene.add(g);
        return g;
    }

    function buildMountainAccess() {
        const THREE = H.W.THREE;

        // --- Télésiège --------------------------------------------------
        buildLiftStation(P.teleferiqueBas, "Télésiège");
        const rideChair = buildRideChair(0xc23a3a);
        // sièges décoratifs qui continuent de se balancer sur le câble (ambiance)
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
            action: () => {
                rideChair.position.set(P.teleferiqueBas.x, 1.4, P.teleferiqueBas.z);
                startRide([
                    { x: P.teleferiqueBas.x, z: P.teleferiqueBas.z, yb: 0 },
                    { x: (P.teleferiqueBas.x + P.montagne.x) / 2, z: (P.teleferiqueBas.z + P.montagne.z) / 2, yb: GONDOLA_APEX },
                    { x: P.montagne.x, z: P.montagne.z, yb: 0 }
                ], 9, "Le télésiège arrive en altitude. La forêt et les lumières défilent en dessous.", rideChair);
            }
        });

        // --- Train à crémaillère -----------------------------------------
        buildLiftStation(P.trainBas, "Train à crémaillère");
        const rideWagon = buildRideWagon();
        H.addInteractable({
            pos: new THREE.Vector3(P.trainBas.x, 1.4, P.trainBas.z), radius: 4, cone: 0.45,
            label: () => "Prendre le train à crémaillère",
            action: () => {
                rideWagon.position.set(P.trainBas.x, 0.9, P.trainBas.z);
                startRide([
                    { x: P.trainBas.x, z: P.trainBas.z, yb: 0 },
                    { x: (P.trainBas.x + P.montagne.x) / 2, z: (P.trainBas.z + P.montagne.z) / 2, yb: GONDOLA_APEX * 0.6 },
                    { x: P.montagne.x - 6, z: P.montagne.z, yb: 0 }
                ], 11, "Le train s'arrête. Tu ouvres la fenêtre : l'air est plus vif ici.", rideWagon);
            }
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
        function chaletSimple(x, z, wallHex, roofHex, w, d, h) {
            const wallM = new THREE.MeshLambertMaterial({ map: H.plasterTex(wallHex) });
            const roofM = H.lam(roofHex);
            const gg = new THREE.Group();
            H.box(w, h, d, wallM, 0, h / 2, 0, gg);
            const rl = H.box(w + 1.0, 0.25, d * 0.62, roofM, 0, h + 0.55, -d * 0.2, gg); rl.rotation.x = -0.5;
            const rr = H.box(w + 1.0, 0.25, d * 0.62, roofM, 0, h + 0.55, d * 0.2, gg); rr.rotation.x = 0.5;
            H.box(1.1, 1.7, 0.15, H.lam(0x5a3a22), 0, 0.85, d / 2 + 0.02, gg);
            gg.position.set(x, 0, z);
            H.W.group.add(gg);
            H.addCollider(x, z, Math.max(w, d) / 2 + 0.2);
            return gg;
        }
        const refuge = chaletSimple(P.refuge.x, P.refuge.z, "#6a5038", 0x3a2214, 6, 5.4, 3.2);
        signBoard(refuge, 0, 3.7, 2.75, "Refuge d'altitude");
        H.addHeatSource(P.refuge.x, P.refuge.z, 8, 1);
        const soup = H.box(0.4, 0.2, 0.4, H.lam(0xd97a2a, 0xff9a3d, 0.4), 1.4, 1.0, 2.0, refuge);
        H.addInteractable({
            pos: new THREE.Vector3(P.refuge.x + 1.4, 1.1, P.refuge.z + 2.0), radius: 4, cone: 0.5,
            label: () => "S'asseoir près du poêle et boire une soupe chaude",
            action: () => { H.warmUp(60); soup.rotation.y += 0.4; H.say("Le poêle à bois ronfle. Par la baie vitrée, toute la vallée s'étend.", 3200); }
        });

        // --- Cor des Alpes --------------------------------------------------
        const cor = new THREE.Group();
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
            pos: new THREE.Vector3(P.corAlpes.x, 1.1, P.corAlpes.z), radius: 4.4, cone: 0.5,
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
            pos: new THREE.Vector3(P.sommet.x, 1.2, P.sommet.z), radius: 5, cone: 0.5,
            label: () => "S'allonger dans la neige (ange de neige)",
            action: () => { H.say("Tu t'allonges dans la neige et regardes le ciel : les trois aurores se rejoignent au loin.", 3600); }
        });

        // --- Luge : redescente rapide vers le village -----------------------
        H.addInteractable({
            pos: new THREE.Vector3(P.lugeHaut.x, 1.1, P.lugeHaut.z), radius: 4, cone: 0.5,
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

        const chateau = new THREE.Group();
        H.box(7, 5, 6, stoneM, 0, 2.5, 0, chateau);
        const towerH = 11;
        H.box(2.4, towerH, 2.4, stoneM, 3.6, towerH / 2, -2.6, chateau);
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
        buildMaison();
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