// ============================================================
//  DUELIST – Spieldaten (Champions, Arena, Bot-Stufen, Steuerung)
// ============================================================

const ASSET_ROOT = "../assets/"

// Sprites sind 100x100 Pixel pro Frame, die Figur selbst ist ca. 25px groß
const FRAME = 100
const SPRITE_SCALE = 3.2 // Weltpixel pro Sprite-Pixel

// Welt = Pixel des Arena-Bildes (1536x1024)
const WORLD = { width: 1536, height: 1024 }

// Begehbare Fläche (abgerundetes Rechteck, Füße der Figuren)
const ARENA = {
    x0: 280, x1: 1256,
    y0: 400, y1: 715,
    radius: 85,
    spawn: [{ x: 520, y: 575 }, { x: 1016, y: 575 }]
}

// Animation: frames = Bildanzahl, hits = Frames in denen der Schlag trifft
function anim(file, frames, fps, extra = {}) {
    return { file, frames, fps, ...extra }
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
        stats: { tempo: 3, kraft: 3, reichweite: 3 },
        anims: {
            idle: anim("Idle", 6, 8),
            run: anim("Walk02", 8, 13),
            hurt: anim("Hurt", 4, 16),
            death: anim("Death", 4, 7),
            block: anim("Block", 4, 16)
        },
        combo: [
            { anim: anim("Attack01", 7, 20), hits: [[4, 5]], dmg: 6, kb: 260, reach: 30, lunge: 140 },
            { anim: anim("Attack02", 8, 20), hits: [[5, 6]], dmg: 7, kb: 280, reach: 27, lunge: 160 },
            { anim: anim("Attack03", 11, 20), hits: [[3, 4], [7, 8]], dmg: 6, kb: 520, reach: 29, lunge: 200, finisher: true }
        ],
        ability: {
            type: "shield",
            name: "Bollwerk",
            icon: "Faehigkeiten/schield.png",
            cost: 3,
            duration: 3,
            text: "Ein Schutzschild aus Licht blockt 3 Sekunden lang jeden Schaden und stößt Angreifer zurück."
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
        stats: { tempo: 2, kraft: 5, reichweite: 4 },
        anims: {
            idle: anim("Idle", 6, 8),
            run: anim("Walk", 8, 12),
            hurt: anim("Hurt", 4, 16),
            death: anim("Death", 4, 7)
        },
        combo: [
            { anim: anim("Attack01", 7, 17), hits: [[3, 4]], dmg: 8, kb: 280, reach: 31, lunge: 120 },
            { anim: anim("Attack02", 11, 20), hits: [[1, 2], [5, 6], [9, 9]], dmg: 3, kb: 160, reach: 31, lunge: 90 },
            { anim: anim("Attack03", 9, 16), hits: [[4, 6]], dmg: 11, kb: 600, reach: 34, lunge: 120, finisher: true }
        ],
        ability: {
            type: "bomb",
            name: "Kriegsbombe",
            icon: "Faehigkeiten/bombe2.png",
            cost: 3,
            maxEnergy: 5,
            text: "Wirft eine Bombe auf den Gegner. Lädt bis zu 5 Treffer auf: 12 / 24 / 36 Schaden. Man kann ausweichen!"
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
        stats: { tempo: 4, kraft: 3, reichweite: 3 },
        anims: {
            idle: anim("Idle", 6, 8),
            run: anim("Walk", 8, 13),
            hurt: anim("Hurt", 4, 16),
            death: anim("Death", 4, 7)
        },
        combo: [
            { anim: anim("Attack01", 8, 22), hits: [[4, 5]], dmg: 7, kb: 260, reach: 32, lunge: 170 },
            { anim: anim("Attack02", 9, 20), hits: [[2, 4]], dmg: 9, kb: 520, reach: 23, lunge: 240, finisher: true }
        ],
        ability: {
            type: "stealth",
            name: "Schattengang",
            icon: "Faehigkeiten/unsichtbar.png",
            cost: 3,
            duration: 3,
            text: "3 Sekunden unsichtbar und unverwundbar. Der erste Angriff aus dem Schatten verursacht doppelten Schaden."
        },
        lore: "Der gefallene Held, der den Tod selbst überwand. Dunkle Kräfte brachten ihn zurück – verändert und geheimnisvoll. Boneguard wandelt durch die Schatten der Arena, unsichtbar und tödlich, doch sein Herz erinnert sich an die Kameradschaft, die ihn einst verband. Pflicht und Erinnerung kämpfen in ihm, während er zwischen Licht und Dunkelheit wandelt."
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
        speed: 338,
        stats: { tempo: 5, kraft: 3, reichweite: 2 },
        anims: {
            idle: anim("Idle", 6, 8),
            run: anim("Walk", 8, 14),
            hurt: anim("Hurt", 4, 16),
            death: anim("Death", 4, 7)
        },
        combo: [
            { anim: anim("Attack01", 9, 24), hits: [[5, 6]], dmg: 6, kb: 240, reach: 30, lunge: 150 },
            { anim: anim("Attack02", 13, 24), hits: [[4, 5], [9, 10]], dmg: 4, kb: 220, reach: 28, lunge: 150 },
            { anim: anim("Attack03", 9, 18), hits: [[5, 7]], dmg: 9, kb: 560, reach: 35, lunge: 200, finisher: true }
        ],
        ability: {
            type: "heal",
            name: "Wildes Herz",
            icon: "Faehigkeiten/leben2.png",
            cost: 3,
            amount: 25,
            text: "Heilt über eine Sekunde 25 Lebenspunkte. Perfekt, um ein verlorenes Duell zu drehen."
        },
        lore: "Der schnellste, wildeste Kämpfer, gefangen zwischen Mensch und Bestie. Verrat hat seine Seele zerrissen und seine Instinkte entfesselt. Doch tief in ihm glimmt ein Funke der alten Freundschaft, den er mit heilender Kraft schützt. In der Arena stürmt er wie ein wütender Sturm, jeder Schlag ein Kampf zwischen Monster und Erinnerung."
    }
}

const CHAMPION_ORDER = ["vanguard", "warbrute", "boneguard", "rageclaw"]

// Alte URL-Namen aus der ersten Version (?player1=Soldier ...)
function resolveChampion(name) {
    if (!name) return null
    if (CHAMPIONS[name]) return name
    for (const id of CHAMPION_ORDER) {
        if (CHAMPIONS[id].legacy.toLowerCase() === String(name).toLowerCase()) return id
    }
    return null
}

const DIFFICULTIES = {
    easy:      { id: "easy",      name: "Rekrut",   reaction: 0.42, dodge: 0.06, aggression: 0.45, combo: 0.35, accuracy: 0.55, smart: 0.3 },
    normal:    { id: "normal",    name: "Krieger",  reaction: 0.26, dodge: 0.25, aggression: 0.62, combo: 0.65, accuracy: 0.75, smart: 0.6 },
    hard:      { id: "hard",      name: "Champion", reaction: 0.16, dodge: 0.45, aggression: 0.75, combo: 0.9,  accuracy: 0.9,  smart: 0.85 },
    nightmare: { id: "nightmare", name: "Legende",  reaction: 0.09, dodge: 0.7,  aggression: 0.85, combo: 1,    accuracy: 1,    smart: 1 }
}
const DIFFICULTY_ORDER = ["easy", "normal", "hard", "nightmare"]

// Allgemeine Kampfwerte
const COMBAT = {
    hp: 100,
    depthReach: 42,      // wie weit ein Schlag nach oben/unten trifft (Welt)
    bodyHalf: 24,        // halbe Körperbreite (Welt)
    hitstun: 0.24,
    finisherStun: 0.36,
    comboWindow: 0.32,   // Eingabepuffer für die nächste Kombo-Stufe
    recovery: 0.16,
    dashSpeed: 900,
    dashTime: 0.17,
    dashCooldown: 0.75,
    dashIframes: 0.16,
    friction: 9,
    energyMax: 3
}

// Tastatur (e.code => layoutunabhängig, funktioniert auch mit QWERTZ)
const KEYMAPS = {
    solo: {
        up: ["KeyW", "ArrowUp"], down: ["KeyS", "ArrowDown"], left: ["KeyA", "ArrowLeft"], right: ["KeyD", "ArrowRight"],
        attack: ["KeyJ", "KeyE", "Numpad1"], ability: ["KeyK", "KeyR", "Numpad2"], dash: ["KeyL", "Space", "ShiftLeft", "Numpad3"]
    },
    p1: {
        up: ["KeyW"], down: ["KeyS"], left: ["KeyA"], right: ["KeyD"],
        attack: ["KeyE"], ability: ["KeyR"], dash: ["KeyQ", "ShiftLeft"]
    },
    p2: {
        up: ["KeyI", "ArrowUp"], down: ["KeyK", "ArrowDown"], left: ["KeyJ", "ArrowLeft"], right: ["KeyL", "ArrowRight"],
        attack: ["KeyO", "Numpad1"], ability: ["KeyP", "Numpad2"], dash: ["KeyU", "Numpad3"]
    }
}

const DEFAULT_SETTINGS = {
    master: 0.8,
    music: 0.45,
    sfx: 0.9,
    shake: true,
    vibration: true,
    rounds: 3,          // Best of 3
    roundTime: 60,
    gameSpeed: 1,
    showFps: false,
    fullscreen: true
}
