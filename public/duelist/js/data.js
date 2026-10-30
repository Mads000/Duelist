// ============================================================
//  DUELIST – Spieldaten (Champions, Maps, Modi, Bot-Stufen, Steuerung)
// ============================================================

const ASSET_ROOT = "../assets/"
const ONLINE_URL = "https://mads000.github.io/Duelist/duelist/"

// Sprites sind 100x100 Pixel pro Frame, die Figur selbst ist ca. 25px groß
const FRAME = 100
const SPRITE_SCALE = 3.2 // Weltpixel pro Sprite-Pixel

// Welt = Pixel des Arena-Bildes (1536x1024)
const WORLD = { width: 1536, height: 1024 }

// Begehbare Fläche (Füße der Figuren) – aus dem Map-Bild vermessen (js/arena_shape.js),
// damit die Grenze immer genau an den Mauern liegt. Alle Maps teilen dieselbe Form.
const ARENA = {
    shape: ARENA_SHAPE,
    y0: ARENA_SHAPE.y0,
    y1: ARENA_SHAPE.y1,
    x0: Math.min(...ARENA_SHAPE.rows.map(r => r[0])),
    x1: Math.max(...ARENA_SHAPE.rows.map(r => r[1])),
    spawn: [{ x: 500, y: 560 }, { x: 1036, y: 560 }],

    // linke/rechte Grenze auf Höhe y (zwischen den Tabellenzeilen interpoliert)
    span(y) {
        const s = this.shape
        const f = Math.max(0, Math.min(s.rows.length - 1, (y - s.first) / s.step))
        const i = Math.floor(f)
        const a = s.rows[i]
        const b = s.rows[Math.min(s.rows.length - 1, i + 1)]
        const t = f - i
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    },

    // Punkt in die Fläche ziehen (margin = Abstand zur Mauer)
    clamp(x, y, margin = 0) {
        y = Math.max(this.y0 + margin, Math.min(this.y1 - margin, y))
        const [l, r] = this.span(y)
        return [Math.max(l + margin, Math.min(r - margin, x)), y]
    },

    contains(x, y, slack = 0) {
        const [cx, cy] = this.clamp(x, y)
        return Math.hypot(x - cx, y - cy) <= slack
    }
}

// Animation: frames = Bildanzahl
function anim(file, frames, fps, extra = {}) {
    return { file, frames, fps, ...extra }
}

// Angriff: hits = Frames in denen der Schlag trifft, reach = Reichweite in Sprite-Pixeln
function move(a, hits, dmg, kb, reach, extra = {}) {
    return { anim: a, hits, dmg, kb, reach, lunge: 140, ...extra }
}

const CHAMPIONS = {
    vanguard: {
        id: "vanguard",
        legacy: "Soldier",
        name: "Vanguard",
        title: "Der Unerschütterliche",
        role: "Allrounder",
        folder: "Knight Templar",
        color: "#6aa2ff",
        anchor: { x: 49, y: 57 },
        speed: 300,
        hp: 100,
        stats: { tempo: 3, kraft: 3, reichweite: 3 },
        anims: {
            idle: anim("Idle", 6, 8),
            run: anim("Walk02", 8, 13),
            hurt: anim("Hurt", 4, 16),
            death: anim("Death", 4, 7),
            block: anim("Block", 4, 18)
        },
        light: [
            move(anim("Attack01", 7, 22), [[4, 5]], 6, 200, 30, { lunge: 150 }),
            move(anim("Attack02", 8, 22), [[5, 6]], 7, 240, 27, { lunge: 170 })
        ],
        heavy: move(anim("Attack03", 11, 19), [[3, 4], [7, 8]], 7, 560, 29, { lunge: 230 }),
        // Spezialangriff: zum Gegner drücken + Schwer
        special: {
            name: "Schildsturm",
            text: "Stürmt mit dem Schild nach vorn und bricht jede Deckung.",
            move: move(anim("Attack03", 11, 22), [[4, 6]], 12, 820, 30, { lunge: 0, rush: [2, 6, 620], guardBreak: true, recovery: 0.5 })
        },
        ability: {
            type: "shield",
            name: "Shield",
            icon: "Faehigkeiten/schield.png",
            cost: 3,
            duration: 3,
            text: "Nach 3 Treffern verfügbar. 3 Sekunden lang blockt ein Lichtschild jeden Schaden und stößt Angreifer zurück."
        },
        lore: "Der unerschütterliche Anführer der einstigen Gruppe. Vanguard lebte für Ehre, Zusammenhalt und die Hoffnung auf Frieden. Als das Band zerbrach, erhob er sein Schild, um nicht nur sich, sondern auch seine zerbrochenen Kameraden zu schützen. In der Arena kämpft er mit unerschütterlicher Entschlossenheit – um seine Freunde zu retten … oder endgültig zu besiegen."
    },

    warbrute: {
        id: "warbrute",
        legacy: "Orc",
        name: "Warbrute",
        title: "Die entfesselte Zerstörung",
        role: "Schwergewicht",
        folder: "Elite Orc",
        color: "#7fd16a",
        anchor: { x: 50, y: 57 },
        speed: 268,
        hp: 110,
        stats: { tempo: 2, kraft: 5, reichweite: 4 },
        anims: {
            idle: anim("Idle", 6, 8),
            run: anim("Walk", 8, 12),
            hurt: anim("Hurt", 4, 16),
            death: anim("Death", 4, 7)
        },
        light: [
            move(anim("Attack01", 7, 19), [[3, 4]], 8, 240, 31, { lunge: 120 }),
            move(anim("Attack02", 11, 22), [[1, 2], [5, 6], [9, 9]], 3, 150, 31, { lunge: 90 })
        ],
        heavy: move(anim("Attack03", 9, 15), [[4, 6]], 13, 640, 34, { lunge: 150 }),
        // Spezialangriff: zum Gegner drücken + Schwer
        special: {
            name: "Erdspalter",
            text: "Spaltet den Boden – eine Schockwelle trifft alles vor ihm.",
            move: move(anim("Attack03", 9, 13), [], 14, 720, 0, { lunge: 60, zone: { frame: 5, ahead: 190, radius: 125, hitFrame: 0, fps: 13 }, guardBreak: true, recovery: 0.55 })
        },
        ability: {
            type: "bomb",
            name: "Damage Stack",
            icon: "Faehigkeiten/bombe2.png",
            cost: 3,
            maxEnergy: 5,
            text: "Ab 3 Treffern bereit, lädt bis 5 Treffer weiter: 12 / 24 / 36 Schaden. Die Bombe fliegt zum Gegner – man kann ausweichen!"
        },
        lore: "Der einst mächtigste Krieger – jetzt die Verkörperung ungezähmter Zerstörung. Von Gier und Macht korrumpiert, wandte sich Warbrute gegen alles, was er einst liebte. In der Arena entfesselt er Bomben voller Chaos, während sein wilder Zorn die Luft zerreißt. Für ihn zählt nur Stärke – und die Welt wird seinen Triumph bezeugen."
    },

    boneguard: {
        id: "boneguard",
        legacy: "Werewolf",
        name: "Boneguard",
        title: "Der Wiederkehrer",
        role: "Assassine",
        folder: "Armored Skeleton",
        color: "#c9b6ff",
        anchor: { x: 53, y: 57 },
        speed: 318,
        hp: 95,
        stats: { tempo: 4, kraft: 3, reichweite: 3 },
        anims: {
            idle: anim("Idle", 6, 8),
            run: anim("Walk", 8, 13),
            hurt: anim("Hurt", 4, 16),
            death: anim("Death", 4, 7)
        },
        light: [
            move(anim("Attack01", 8, 24), [[4, 5]], 6, 200, 32, { lunge: 170 }),
            move(anim("Attack01", 8, 28), [[4, 5]], 6, 260, 32, { lunge: 200 })
        ],
        heavy: move(anim("Attack02", 9, 17), [[2, 4]], 12, 560, 24, { lunge: 330 }),
        // Spezialangriff: zum Gegner drücken + Schwer
        special: {
            name: "Speerstoß",
            text: "Ein blitzschneller Stoß mit doppelter Reichweite.",
            move: move(anim("Attack02", 9, 18), [[3, 5]], 11, 600, 50, { lunge: 200, guardBreak: true, recovery: 0.45 })
        },
        ability: {
            type: "stealth",
            name: "Invisibility",
            icon: "Faehigkeiten/unsichtbar.png",
            cost: 3,
            duration: 3,
            text: "Nach 3 Treffern verfügbar. 3 Sekunden unsichtbar und unverwundbar – der erste Schlag aus dem Schatten macht doppelten Schaden."
        },
        lore: "Der gefallene Held, der den Tod selbst überwand. Dunkle Kräfte brachten ihn zurück – verändert und geheimnisvoll. Boneguard wandelt durch die Schatten der Arena, unsichtbar und tödlich, doch sein Herz erinnert sich an die Kameradschaft, die ihn einst verband."
    },

    rageclaw: {
        id: "rageclaw",
        legacy: "Skeleton",
        name: "Rageclaw",
        title: "Die Bestie",
        role: "Berserker",
        folder: "Werebear",
        color: "#ffb35c",
        anchor: { x: 51, y: 57 },
        speed: 330,
        hp: 105,
        stats: { tempo: 4, kraft: 4, reichweite: 2 },
        anims: {
            idle: anim("Idle", 6, 8),
            run: anim("Walk", 8, 14),
            hurt: anim("Hurt", 4, 16),
            death: anim("Death", 4, 7)
        },
        light: [
            move(anim("Attack01", 9, 26), [[5, 6]], 6, 200, 30, { lunge: 150 }),
            move(anim("Attack02", 13, 26), [[4, 5], [9, 10]], 4, 200, 28, { lunge: 150 })
        ],
        heavy: move(anim("Attack03", 9, 16), [[5, 7]], 13, 600, 35, { lunge: 240 }),
        // Spezialangriff: zum Gegner drücken + Schwer
        special: {
            name: "Wirbelklauen",
            text: "Dreht sich mit ausgefahrenen Klauen – trifft dreimal rundherum.",
            move: move(anim("Attack02", 13, 24), [[3, 4], [6, 7], [9, 10]], 5, 300, 32, { lunge: 60, around: true, guardBreak: true, recovery: 0.5 })
        },
        ability: {
            type: "heal",
            name: "Heal",
            icon: "Faehigkeiten/leben2.png",
            cost: 3,
            amount: 25,
            text: "Nach 3 Treffern verfügbar. Nach Aktivierung bekommt man +25 Leben – perfekt, um ein Duell zu drehen."
        },
        lore: "Der schnellste, wildeste Kämpfer, gefangen zwischen Mensch und Bestie. Verrat hat seine Seele zerrissen und seine Instinkte entfesselt. Doch tief in ihm glimmt ein Funke der alten Freundschaft, den er mit heilender Kraft schützt."
    },

    nightfang: {
        id: "nightfang",
        legacy: "Nightfang",
        name: "Nightfang",
        title: "Der Mondjäger",
        role: "Raubtier",
        folder: "Werewolf",
        color: "#ff6f91",
        anchor: { x: 52, y: 57 },
        speed: 345,
        hp: 95,
        stats: { tempo: 5, kraft: 3, reichweite: 2 },
        anims: {
            idle: anim("Idle", 6, 8),
            run: anim("Walk", 8, 15),
            hurt: anim("Hurt", 4, 16),
            death: anim("Death", 4, 7)
        },
        light: [
            move(anim("Attack01", 9, 28), [[5, 6]], 5, 180, 26, { lunge: 170 }),
            move(anim("Attack02", 13, 26), [[4, 5], [8, 9], [11, 11]], 3, 200, 34, { lunge: 160 })
        ],
        heavy: move(anim("Attack01", 9, 14), [[5, 6]], 12, 600, 27, { lunge: 520 }),
        // Spezialangriff: zum Gegner drücken + Schwer
        special: {
            name: "Mondsprung",
            text: "Springt mit einem Satz auf den Gegner zu.",
            move: move(anim("Attack02", 13, 26), [[6, 8]], 12, 640, 30, { lunge: 0, rush: [1, 6, 760], guardBreak: true, recovery: 0.45 })
        },
        ability: {
            type: "frenzy",
            name: "Frenzy",
            icon: "Faehigkeiten/leben.png",
            cost: 3,
            duration: 4,
            text: "4 Sekunden Blutrausch: schneller laufen, schneller zuschlagen und jeder Treffer heilt die Hälfte des Schadens."
        },
        lore: "Ein Wächter des alten Bundes, den der Fluch des Vollmonds verschlungen hat. Nightfang jagt nicht mehr für die Gemeinschaft, sondern für den Rausch der Jagd. Wer ihn in der Arena sieht, sieht ihn nur kurz – dann ist es meist schon vorbei."
    },

    arcanis: {
        id: "arcanis",
        legacy: "Arcanis",
        name: "Arcanis",
        title: "Der Sternenseher",
        role: "Magier",
        folder: "Wizard",
        color: "#7fd8ff",
        anchor: { x: 50, y: 57 },
        speed: 280,
        hp: 85,
        stats: { tempo: 3, kraft: 2, reichweite: 5 },
        anims: {
            idle: anim("Idle", 6, 8),
            run: anim("Walk", 8, 12),
            hurt: anim("Hurt", 4, 16),
            death: anim("DEATH", 4, 7)
        },
        // Feuerball als Projektil
        light: [
            move(anim("Attack02", 6, 14), [], 4, 220, 0, {
                lunge: 0, recovery: 0.4, projectile: { frame: 4, speed: 640, range: 520, effect: "Attack02_Effect", flyFrames: 4, hitFrames: [4, 6] }
            })
        ],
        // Eis-Explosion am Gegner
        heavy: move(anim("Attack01", 6, 11), [], 9, 420, 0, {
            lunge: 0, recovery: 0.55, zone: { frame: 3, effect: "Attack01_Effect", frames: 10, fps: 18, hitFrame: 8, radius: 80, maxDist: 400 }
        }),
        // Spezialangriff: zum Gegner drücken + Schwer
        special: {
            name: "Feuersalve",
            text: "Drei Feuerbälle im Fächer – schwer auszuweichen.",
            move: move(anim("Attack02", 6, 12), [], 4, 220, 0, { lunge: 0, recovery: 0.6, projectile: { frame: 4, speed: 600, range: 560, effect: "Attack02_Effect", flyFrames: 4, hitFrames: [4, 6], count: 3, spread: 230 } })
        },
        ability: {
            type: "blink",
            name: "Blink",
            icon: "Faehigkeiten/unsichtbar.png",
            cost: 3,
            text: "Nach 3 Treffern verfügbar. Teleportiert sich hinter den Gegner und ist kurz unverwundbar. Leicht = Feuerball, Schwer = Eis-Explosion (langsam, aber auf Distanz)."
        },
        lore: "Er war der Kopf der Gruppe, der die Sterne las und den Verrat kommen sah – und schwieg. Seitdem sucht Arcanis in der Arena nach Vergebung, mit Feuer in der einen und Eis in der anderen Hand."
    },

    gravelord: {
        id: "gravelord",
        legacy: "Gravelord",
        name: "Gravelord",
        title: "Der Knochenkönig",
        role: "Endboss",
        folder: "Greatsword Skeleton",
        color: "#e8e0c8",
        anchor: { x: 52, y: 57 },
        speed: 255,
        hp: 140,
        boss: true,
        stats: { tempo: 2, kraft: 5, reichweite: 5 },
        anims: {
            idle: anim("Idle", 6, 7),
            run: anim("Walk", 9, 11),
            hurt: anim("Hurt", 4, 16),
            death: anim("Death", 4, 6)
        },
        light: [
            move(anim("Attack01", 9, 18), [[4, 6]], 8, 260, 38, { lunge: 120 }),
            move(anim("Attack03", 8, 18), [[4, 5]], 8, 300, 35, { lunge: 120 })
        ],
        heavy: move(anim("Attack02", 12, 15), [[6, 9]], 15, 700, 44, { lunge: 160 }),
        // Spezialangriff: zum Gegner drücken + Schwer
        special: {
            name: "Seelenklinge",
            text: "Ein weiter Hieb mit der Seelenklinge, der jede Deckung bricht.",
            move: move(anim("Attack03", 8, 15), [[4, 6]], 14, 760, 58, { lunge: 180, guardBreak: true, recovery: 0.55 })
        },
        ability: {
            type: "quake",
            name: "Soul Quake",
            icon: "Faehigkeiten/bombe.png",
            cost: 3,
            text: "Rammt das Großschwert in den Boden: Eine Seelenwelle trifft alles um ihn herum und durchbricht jede Deckung."
        },
        lore: "Niemand weiß, wer die Arena über den Wolken erbaut hat. Doch wer alle Duelle übersteht, trifft am Ende auf ihren Herrn: den Knochenkönig, der jeden Verrat der vier Gefährten gesät hat."
    }
}

const CHAMPION_ORDER = ["vanguard", "warbrute", "boneguard", "rageclaw", "nightfang", "arcanis", "gravelord"]

function isUnlocked(id) {
    return !CHAMPIONS[id].boss || PlayerRecord.data.unlocked.includes(id)
}

function playableChampions() {
    return CHAMPION_ORDER.filter(isUnlocked)
}

// Alte URL-Namen aus der ersten Version (?player1=Soldier ...)
function resolveChampion(name) {
    if (!name) return null
    if (CHAMPIONS[name]) return name
    for (const id of CHAMPION_ORDER) {
        if (CHAMPIONS[id].legacy.toLowerCase() === String(name).toLowerCase()) return id
    }
    return null
}

// ---------------- Maps ----------------
const MAPS = {
    sky: {
        id: "sky", name: "Himmelsarena", img: "ui/Arena2.png",
        text: "Die Original-Arena über den Wolken – Windstöße schieben euch über den Platz.",
        ambient: "clouds", grip: 1, hazard: "wind", bg: ["#3f7bd9", "#9ccaf5"]
    },
    classic: {
        id: "classic", name: "Wolkenhof", img: "ui/Map-Wolkenhof.png",
        text: "Ein Marmorhof im Abendrot – wer zuerst auf eine Heilblüte tritt, bekommt Leben zurück.",
        ambient: "petals", grip: 1, hazard: "bloom", dust: "rgba(236,230,242,0.6)", bg: ["#7080d6", "#ffb496"], tint: ["#ff9a8a", 0.35]
    },
    volcano: {
        id: "volcano", name: "Vulkanschmiede", img: "ui/Map-Vulkan.png",
        text: "Glut steigt auf – und manchmal bricht der Boden auf. Achte auf Feuerfontänen!",
        ambient: "embers", grip: 1, hazard: "geyser", bg: ["#1c0a0e", "#7a1a0a"], tint: ["#3a0806", 0.72]
    },
    frost: {
        id: "frost", name: "Frostgipfel", img: "ui/Map-Frost.png",
        text: "Spiegelglattes Eis: Wer getroffen wird, rutscht weit.",
        ambient: "snow", grip: 0.32, bg: ["#16204a", "#4a6496"], tint: ["#16204a", 0.6]
    }
}
const MAP_ORDER = ["sky", "classic", "volcano", "frost"]

// ---------------- Modi ----------------
const MODES = {
    arcade:   { id: "arcade",   name: "Arcade",        sub: "7 Gegner · Endboss · Highscore" },
    solo:     { id: "solo",     name: "Gegen Bot",     sub: "Freies Duell gegen die KI" },
    local:    { id: "local",    name: "Lokales Duell", sub: "2 Spieler · Tastatur, Gamepad oder Handy" },
    training: { id: "training", name: "Training",      sub: "Kombos üben ohne Druck" },
    story:    { id: "story",    name: "Story",         sub: "Die Geschichte deines Champions" }
}

const DIFFICULTIES = {
    easy:      { id: "easy",      name: "Rekrut",   reaction: 0.42, dodge: 0.06, block: 0.1,  aggression: 0.45, combo: 0.35, heavy: 0.15, accuracy: 0.55, smart: 0.3 },
    normal:    { id: "normal",    name: "Krieger",  reaction: 0.26, dodge: 0.22, block: 0.3,  aggression: 0.62, combo: 0.65, heavy: 0.3,  accuracy: 0.75, smart: 0.6 },
    hard:      { id: "hard",      name: "Champion", reaction: 0.17, dodge: 0.4,  block: 0.5,  aggression: 0.74, combo: 0.9,  heavy: 0.45, accuracy: 0.9,  smart: 0.85 },
    nightmare: { id: "nightmare", name: "Legende",  reaction: 0.1,  dodge: 0.62, block: 0.68, aggression: 0.82, combo: 1,    heavy: 0.55, accuracy: 1,    smart: 1 }
}
const DIFFICULTY_ORDER = ["easy", "normal", "hard", "nightmare"]

// Allgemeine Kampfwerte
const COMBAT = {
    depthReach: 42,      // wie weit ein Schlag nach oben/unten trifft (Welt)
    bodyHalf: 24,        // halbe Körperbreite (Welt)
    hitstun: 0.26,
    heavyStun: 0.5,
    blockstun: 0.2,
    chip: 0.15,          // Schaden, der durch die Deckung geht
    guardMax: 100,
    guardRegen: 22,
    perfectBlock: 0.14,  // Zeitfenster für perfektes Blocken
    comboWindow: 0.34,   // Eingabepuffer für die nächste Kombo-Stufe
    recovery: 0.14,
    heavyRecovery: 0.42,
    dashSpeed: 900,
    dashTime: 0.17,
    dashCooldown: 0.7,
    dashIframes: 0.16,
    accel: 22,           // wie schnell man auf Tempo kommt
    friction: 9,
    energyMax: 3,
    specialCooldown: 4   // Spezialangriff (zum Gegner + Schwer)
}

// Tastatur (e.code => layoutunabhängig, funktioniert auch mit QWERTZ)
const KEYMAPS = {
    solo: {
        up: ["KeyW", "ArrowUp"], down: ["KeyS", "ArrowDown"], left: ["KeyA", "ArrowLeft"], right: ["KeyD", "ArrowRight"],
        light: ["KeyJ", "KeyE", "Numpad1"], heavy: ["KeyK", "KeyF", "Numpad2"],
        dash: ["KeyL", "Space", "ShiftLeft", "Numpad3"], ability: ["KeyI", "KeyR", "Numpad0"]
    },
    p1: {
        up: ["KeyW"], down: ["KeyS"], left: ["KeyA"], right: ["KeyD"],
        light: ["KeyE"], heavy: ["KeyF"], dash: ["KeyQ"], ability: ["KeyR"]
    },
    p2: {
        up: ["KeyI", "ArrowUp"], down: ["KeyK", "ArrowDown"], left: ["KeyJ", "ArrowLeft"], right: ["KeyL", "ArrowRight"],
        light: ["KeyO", "Numpad1"], heavy: ["KeyP", "Numpad2"], dash: ["KeyU", "Numpad3"], ability: ["KeyH", "Numpad0"]
    }
}

// Eigene Tastenbelegung (Optionen → Tastenbelegung): ersetzt die erste Taste einer Aktion
const KEY_ACTIONS = [["up", "Hoch"], ["down", "Runter"], ["left", "Links"], ["right", "Rechts"], ["light", "Leicht"], ["heavy", "Schwer"], ["dash", "Dash"], ["ability", "Fähigkeit"]]

function keymap(name) {
    const custom = readStorage("duelist.keys", {})[name] || {}
    const taken = new Set(Object.values(custom))
    const map = {}
    for (const [a] of KEY_ACTIONS) {
        const base = KEYMAPS[name][a]
        const list = custom[a] ? [custom[a], ...base.slice(1)] : [...base]
        // eine Taste, die einer anderen Aktion zugewiesen wurde, hier nicht mehr benutzen
        map[a] = list.filter(c => c === custom[a] || !taken.has(c))
    }
    return map
}

function keyLabel(code) {
    if (!code) return "–"
    const names = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Space: "Leertaste", ShiftLeft: "Shift", ShiftRight: "Shift R", ControlLeft: "Strg", ControlRight: "Strg R", AltLeft: "Alt", Enter: "Enter", Backspace: "⌫", Tab: "Tab" }
    if (names[code]) return names[code]
    if (code.startsWith("Key")) return code.slice(3)
    if (code.startsWith("Digit")) return code.slice(5)
    if (code.startsWith("Numpad")) return "Num" + code.slice(6)
    return code
}

const DEFAULT_SETTINGS = {
    master: 0.8,
    music: 0.45,
    sfx: 0.9,
    shake: true,
    vibration: true,
    crt: false,
    rounds: 3,          // Best of 3
    roundTime: 60,
    gameSpeed: 1,
    showFps: false,
    fullscreen: true,
    replay: true
}
