// ============================================================
//  Glas-Run – endloser Einzelspieler-Modus im Hochformat, mit einer Hand.
//  Kampf → Karte wählen → nächster Gegner, jeder fünfte ist ein Glas-Boss.
//  Nutzt Match, Fighter und BotController; die anderen Modi bleiben unverändert.
// ============================================================

// Ältere Browser (Safari < 16) kennen roundRect noch nicht
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
        r = Math.min(r, w / 2, h / 2)
        this.moveTo(x + r, y)
        this.arcTo(x + w, y, x + w, y + h, r)
        this.arcTo(x + w, y + h, x, y + h, r)
        this.arcTo(x, y + h, x, y, r)
        this.arcTo(x, y, x + w, y, r)
        this.closePath()
    }
}

// Kleines Kampffeld in der Mitte der Map (Weltpixel, Füße der Figuren)
const GLAS_FIELD = (() => {
    const cx = 768, cy = 560, w = 460, h = 360
    return {
        x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2, cx, cy,
        spawn: [{ x: cx - 150, y: cy }, { x: cx + 150, y: cy }],
        span() { return [this.x0, this.x1] }
    }
})()

// Während ein Glas-Kampf rechnet, gilt das Kampffeld als Arena – so halten sich
// Figuren, Bots, Teleport und Zauber automatisch an den Glasrand.
const GLAS_FIELD_KEYS = ["x0", "x1", "y0", "y1", "spawn", "span"]
function withGlasField(fn) {
    const saved = GLAS_FIELD_KEYS.map(k => ARENA[k])
    GLAS_FIELD_KEYS.forEach(k => { ARENA[k] = GLAS_FIELD[k] })
    try { return fn() } finally { GLAS_FIELD_KEYS.forEach((k, i) => { ARENA[k] = saved[i] }) }
}

const GLAS_PLATE_HP = 25       // jede Rüstungsplatte hält 25 Schaden aus
const GLAS_ARMOR_PASS = 0.25   // solange Platten da sind, kommen 25 % am Leben an
const GLAS_HEAL = 20           // Heilung nach jedem Sieg
const GLAS_DASH_CAP = 30       // Glas-Dash heilt höchstens so viel pro Kampf und Karte
const GLAS_RARE_CHANCE = 0.18  // Chance je Platz auf eine seltene Karte

const GLAS_ICON = {
    kante: `<path d="M5 19L17 7l2.5-3-.6 3.6L7 19.5z"/><path d="M4 16l4 4"/>`,
    panzer: `<path d="M12 3l7 3v5c0 4.6-3 8-7 10-4-2-7-5.4-7-10V6z"/><path d="M9 11.5l2 2 4-4"/>`,
    funke: `<path d="M12 20.5S4.5 16 4.5 10A4.2 4.2 0 0 1 12 7.4 4.2 4.2 0 0 1 19.5 10c0 6-7.5 10.5-7.5 10.5z"/><path d="M12 10.5v5M9.5 13h5"/>`,
    puls: `<path d="M2.5 12h4l2-5 4 10 2.5-6 1.5 1h5"/>`,
    dash: `<path d="M3 12h13M12 6.5l5.5 5.5-5.5 5.5M3 7h5M3 17h5"/>`,
    energie: `<path d="M13.5 2.5L5 13.5h6l-1.5 8 9-11.5h-6z"/>`,
    raub: `<path d="M12 3s5.5 6.4 5.5 10.2a5.5 5.5 0 0 1-11 0C6.5 9.4 12 3 12 3z"/><path d="M9.5 13.5a2.5 2.5 0 0 0 2.5 2.5"/>`,
    dreier: `<path d="M5 19L10 5M10.5 19L15.5 5M16 19L21 5"/>`,
    chance: `<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4v4.5H15"/><path d="M12 9v4l2.5 1.5"/>`
}

// once = nicht stapelbar (Energiekern wirkt gestapelt nicht stärker)
const GLAS_CARDS = {
    kante:   { name: "Scharfe Kante", text: "+20 % Schaden" },
    panzer:  { name: "Panzerglas", text: "20 % weniger Schaden" },
    funke:   { name: "Lebensfunke", text: "+15 Leben extra nach jedem Sieg" },
    puls:    { name: "Schneller Puls", text: "+12 % Lauftempo" },
    dash:    { name: "Glas-Dash", text: "Jeder Dash heilt 3 Leben" },
    energie: { name: "Energiekern", text: "Start mit voller Energie in jedem Kampf", once: true },
    raub:    { name: "Lebensraub", text: "15 % deines Schadens heilen dich", rare: true },
    dreier:  { name: "Dreierschlag", text: "Jeder dritte Treffer in Folge macht doppelten Schaden", rare: true },
    chance:  { name: "Zweite Chance", text: "Einmal pro Run überlebst du einen K.O. mit 30 Leben", rare: true, once: true }
}

const glasIcon = id => `<svg viewBox="0 0 24 24" aria-hidden="true">${GLAS_ICON[id]}</svg>`

// ============================================================
//  Einhand-Steuerung: ein Daumen läuft, blockt, schlägt und dasht
// ============================================================
const THUMB = { dead: 14, radius: 58, slop: 14, holdMs: 280, swipeMs: 240, swipeMin: 42 }

class OneThumbSource {
    constructor(layer, getFighter) {
        this.layer = layer
        this.anchorEl = layer.querySelector(".gr-anchor")
        this.knobEl = layer.querySelector(".gr-knob")
        this.getFighter = getFighter
        this.id = null
        this.vec = { x: 0, y: 0 }
        this.latch = {}
        this.specialUntil = 0
        this.timer = null
        layer.addEventListener("pointerdown", e => this.down(e))
        layer.addEventListener("pointermove", e => this.move(e))
        layer.addEventListener("pointerup", e => this.up(e, false))
        layer.addEventListener("pointercancel", e => this.up(e, true))
    }

    down(e) {
        if (this.id !== null) return
        e.preventDefault()
        this.id = e.pointerId
        try { this.layer.setPointerCapture(e.pointerId) } catch (err) { }
        const now = performance.now()
        this.start = { x: e.clientX, y: e.clientY, t: now }
        this.anchor = { x: e.clientX, y: e.clientY }
        this.cur = { x: e.clientX, y: e.clientY }
        this.maxDist = 0
        this.held = false
        clearTimeout(this.timer)
        this.timer = setTimeout(() => this.hold(), THUMB.holdMs)
        this.place(this.anchorEl, this.anchor)
        this.place(this.knobEl, this.cur)
        this.layer.classList.add("touched")
        this.layer.classList.remove("heavy")
    }

    move(e) {
        if (e.pointerId !== this.id) return
        this.cur = { x: e.clientX, y: e.clientY }
        this.maxDist = Math.max(this.maxDist, Math.hypot(this.cur.x - this.start.x, this.cur.y - this.start.y))
        if (this.maxDist > THUMB.slop) clearTimeout(this.timer)
        let dx = this.cur.x - this.anchor.x
        let dy = this.cur.y - this.anchor.y
        const len = Math.hypot(dx, dy)
        // Der Ankerpunkt wandert mit, wenn der Daumen weit wegzieht
        const far = THUMB.radius * 1.5
        if (len > far) {
            const k = (len - far) / len
            this.anchor.x += dx * k
            this.anchor.y += dy * k
            dx -= dx * k
            dy -= dy * k
            this.place(this.anchorEl, this.anchor)
        }
        const l = Math.hypot(dx, dy)
        const k = Math.min(1, l / THUMB.radius)
        this.vec = l < THUMB.dead ? { x: 0, y: 0 } : { x: dx / l * k, y: dy / l * k }
        const c = Math.min(l, THUMB.radius)
        this.place(this.knobEl, { x: this.anchor.x + (l ? dx / l * c : 0), y: this.anchor.y + (l ? dy / l * c : 0) })
    }

    // Gedrückt halten ohne zu ziehen = schwerer Angriff, mit Spezial-Bereitschaft automatisch der Spezialangriff
    hold() {
        this.timer = null
        if (this.id === null || this.maxDist > THUMB.slop) return
        this.held = true
        this.latch.heavy = true
        const f = this.getFighter()
        if (f && f.specialReady && f.target) {
            this.specialDir = Math.sign(f.target.x - f.x) || f.facing
            this.specialUntil = performance.now() + 320
        }
        this.layer.classList.add("heavy")
        if (GameSettings.get().vibration && navigator.vibrate) navigator.vibrate(14)
    }

    up(e, cancel) {
        if (e.pointerId !== this.id) return
        clearTimeout(this.timer)
        const dt = performance.now() - this.start.t
        const dx = this.cur.x - this.start.x
        const dy = this.cur.y - this.start.y
        const dist = Math.hypot(dx, dy)
        if (!cancel && !this.held) {
            if (dist >= THUMB.swipeMin && dt <= THUMB.swipeMs) {
                // Schnell wischen = Dash in Wischrichtung
                this.latch.dash = true
                this.dashDir = { x: dx / dist, y: dy / dist }
            } else if (this.maxDist <= THUMB.slop && dt < THUMB.holdMs) {
                // Kurz tippen = leichter Angriff (mehrmals = Kombo)
                this.latch.light = true
                if (GameSettings.get().vibration && navigator.vibrate) navigator.vibrate(6)
            }
        }
        this.release()
    }

    place(el, p) {
        if (el) el.style.transform = `translate(${p.x}px, ${p.y}px)`
    }

    release() {
        this.id = null
        this.vec = { x: 0, y: 0 }
        this.layer.classList.remove("touched", "heavy")
    }

    read(out) {
        if (this.vec.x || this.vec.y) {
            out.mx = this.vec.x
            out.my = this.vec.y
        }
        // Spezialangriff braucht "zum Gegner" – das übernimmt hier das Halten
        if (performance.now() < this.specialUntil && !this.vec.x && !this.vec.y) {
            out.mx = this.specialDir
            out.my = 0
        }
        if (this.latch.light) out.light = true
        if (this.latch.heavy) out.heavy = true
        if (this.latch.ability) out.ability = true
        if (this.latch.dash) {
            out.dash = true
            out.mx = this.dashDir.x
            out.my = this.dashDir.y
        }
        this.latch = {}
    }

    reset() {
        clearTimeout(this.timer)
        if (this.id !== null) {
            try { this.layer.releasePointerCapture(this.id) } catch (err) { }
        }
        this.release()
        this.latch = {}
        this.specialUntil = 0
    }

    destroy() {}
}

// ============================================================
//  Kampf im Kampffeld: feste Kamera, Karten-Effekte, Boss-Rüstung
// ============================================================
const speedMulBase = Object.getOwnPropertyDescriptor(Fighter.prototype, "speedMul").get

class GlasMatch extends Match {
    constructor(opts, setup) {
        super(opts)
        this.glasrun = true
        this.setup = setup
        this.dashHealed = 0
        this.armor = setup.boss ? { plates: [GLAS_PLATE_HP, GLAS_PLATE_HP, GLAS_PLATE_HP], flash: [0, 0, 0], spin: 0 } : null
        const [me, foe] = this.fighters
        foe.maxHp = Math.round(foe.champ.hp * setup.hpMul)
        foe.hp = foe.hpLag = foe.maxHp
        me.hpLag = me.hp
        // Der Wurf entfällt in diesem Modus: Leicht + Schwer wird einfach ein schwerer Angriff
        for (const f of this.fighters) {
            f.startThrow = function (opp) {
                this.bufLight = 0
                this.startAttack("heavy", 0, opp)
            }
        }
        this.installCards(me)
    }

    get cards() {
        return this.setup.cards
    }

    installCards(me) {
        const c = this.cards
        if (c.energie) me.energy = me.maxEnergy
        if (c.puls) {
            const mul = 1 + 0.12 * c.puls
            Object.defineProperty(me, "speedMul", { configurable: true, get() { return speedMulBase.call(this) * mul } })
        }
        if (c.dash) {
            const match = this
            const startDash = me.startDash
            me.startDash = function (inp, opp) {
                startDash.call(this, inp, opp)
                const room = GLAS_DASH_CAP * c.dash - match.dashHealed
                const heal = Math.min(3 * c.dash, this.maxHp - this.hp, room)
                if (heal > 0 && match.phase === "fight") {
                    this.hp += heal
                    match.dashHealed += heal
                    match.fx.text(this.x, this.y - 110, "+" + Math.round(heal), { color: "#9ff0ff", size: 24, life: 0.6 })
                }
            }
        }
    }

    // ---------------- Ablauf ----------------
    update(dt) {
        withGlasField(() => super.update(dt))
        if (this.armor && !this.paused && !this.over) {
            this.armor.spin += dt * 1.6
            this.armor.flash = this.armor.flash.map(v => Math.max(0, v - dt))
        }
    }

    spawnFor(f) {
        return GLAS_FIELD.spawn[f.side]
    }

    makeProps() {
        return []
    }

    updatePhase() {
        const t = this.phaseT
        if (this.phase === "intro") {
            const steps = [[0, "round"], [1.05, "fight"]]
            for (let i = this.introStep + 1; i < steps.length; i++) {
                if (t >= steps[i][0]) {
                    this.introStep = i
                    this.introBeat(steps[i][1])
                }
            }
            return
        }
        if (this.phase === "ko" || this.phase === "timeup") {
            // Kein Rundenwechsel: kurz stehen lassen, dann übernimmt der Run
            if (!this.glasDone && t >= (this.phase === "ko" ? 1.3 : 1.5)) {
                this.glasDone = true
                // Gleichstand nach Zeitablauf zählt nicht als Sieg
                const winner = this.roundWinner === 0 ? 0 : 1
                if (winner === 0) {
                    const me = this.fighters[0]
                    this.emit("roundWin", { side: 0, perfect: me.stats.taken === 0, hp: me.hp, maxHp: me.maxHp, timeLeft: this.timer })
                }
                this.over = true
                this.emit("matchEnd", { winner })
            }
            return
        }
        super.updatePhase()
    }

    introBeat(step) {
        if (step !== "round") return super.introBeat(step)
        this.emit("banner", { text: this.setup.boss ? "GLAS-BOSS" : `GEGNER ${this.setup.n}`, sub: this.setup.sub, kind: "round", time: 1.0 })
        this.sound("count")
    }

    // ---------------- Schaden: Karten und Rüstung ----------------
    damageMul(att, def) {
        const c = this.cards
        const me = this.fighters[0]
        let k = 1
        if (att === me && c.kante) k *= 1 + 0.2 * c.kante
        if (def === me && c.panzer) k *= Math.pow(0.8, c.panzer)
        if (this.armored(def)) k *= GLAS_ARMOR_PASS
        return k
    }

    tryHit(att, def, move, windowIdx, src = att) {
        const me = this.fighters[0]
        const triple = att === me && this.cards.dreier && (att.comboCount + 1) % 3 === 0
        let k = this.damageMul(att, def)
        if (triple) k *= 1.5 + 0.5 * this.cards.dreier
        const armored = this.armored(def)
        const hp0 = def.hp
        const base = move.dmg
        move.dmg = base * k
        let res
        try { res = super.tryHit(att, def, move, windowIdx, src) } finally { move.dmg = base }
        const lost = hp0 - def.hp
        if (lost > 0) {
            if (triple && att.comboCount % 3 === 0) this.callout(att, "DREIERSCHLAG!", "#ffd84a")
            this.afterDamage(att, def, lost, armored)
        }
        return res
    }

    explode(b) {
        if (!b.owner) return super.explode(b)
        const def = this.fighters.find(f => f.side !== b.owner.side)
        const armored = this.armored(def)
        const hp0 = def.hp
        b.dmg = Math.max(1, Math.round(b.dmg * this.damageMul(b.owner, def)))
        super.explode(b)
        const lost = hp0 - def.hp
        if (lost > 0) this.afterDamage(b.owner, def, lost, armored)
    }

    // Schleim-Pfützen ziehen direkt Leben ab – beim Boss geht das meiste in die Platten
    updateArena(dt, fighting) {
        const boss = this.armored(this.fighters[1]) ? this.fighters[1] : null
        const hp0 = boss ? boss.hp : 0
        super.updateArena(dt, fighting)
        if (boss && boss.hp < hp0 && boss.hp > 0) {
            const lost = hp0 - boss.hp
            boss.hp += lost * (1 - GLAS_ARMOR_PASS)
            this.hitPlate(boss, lost, this.fighters[0])
        }
    }

    afterDamage(att, def, lost, armored) {
        const full = armored ? lost / GLAS_ARMOR_PASS : lost
        if (armored) this.hitPlate(def, full, att)
        const me = this.fighters[0]
        if (att === me && this.cards.raub && me.state !== "dead") {
            const heal = Math.min(full * 0.15 * this.cards.raub, me.maxHp - me.hp)
            if (heal > 0) {
                me.hp += heal
                if (heal >= 1) this.fx.text(me.x, me.y - 105, "+" + Math.round(heal), { color: "#7dff9b", size: 24, life: 0.6 })
            }
        }
    }

    armored(f) {
        return !!this.armor && f === this.fighters[1] && this.armor.plates.some(p => p > 0)
    }

    platePos(i, boss = this.fighters[1]) {
        const ang = this.armor.spin + i * Math.PI * 2 / 3
        const depth = Math.sin(ang)
        return { x: boss.x + Math.cos(ang) * 74, y: boss.y - 48 + depth * 20, depth, ang }
    }

    // Die Platte auf der Seite des Angreifers fängt den Treffer ab
    hitPlate(boss, dmg, att) {
        const a = this.armor
        const dir = att ? Math.sign(att.x - boss.x) || 1 : 1
        let best = -1
        let bestScore = -Infinity
        a.plates.forEach((hp, i) => {
            if (hp <= 0) return
            const score = Math.cos(this.platePos(i, boss).ang) * dir
            if (score > bestScore) {
                bestScore = score
                best = i
            }
        })
        if (best < 0) return
        a.plates[best] -= dmg
        a.flash[best] = 0.18
        const p = this.platePos(best, boss)
        this.fx.sparks(p.x, p.y, -dir, { count: 8, speed: 360, color: "#ffffff", color2: `rgba(${(GLASS[this.map.id] || GLASS.sky).rgb},1)`, size: 6 })
        if (a.plates[best] <= 0) {
            a.plates[best] = 0
            this.breakPlate(boss, p)
        }
    }

    breakPlate(boss, p) {
        const g = GLASS[this.map.id] || GLASS.sky
        for (let i = 0; i < 22; i++) {
            const ang = Math.random() * Math.PI * 2
            const v = 260 + Math.random() * 520
            this.fx.particles.push({
                type: "shard", x: p.x, y: p.y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 200, g: 980, drag: 1.6,
                life: 0.45 + Math.random() * 0.45, t: 0, size: 6 + Math.random() * 11,
                spin: (Math.random() - 0.5) * 18, rot: Math.random() * 6, fill: i % 3 ? g.light : "rgba(255,255,255,0.9)", edge: "rgba(255,255,255,0.9)"
            })
        }
        const left = this.armor.plates.filter(v => v > 0).length
        this.fx.text(boss.x, boss.y - 150, left ? "PLATTE ZERBROCHEN!" : "RÜSTUNG GEBROCHEN!", { color: left ? "#bfe3ff" : "#ffd84a", size: left ? 34 : 44, life: 1.1 })
        // Der Boss taumelt kurz – dein Moment zum Angreifen
        if (boss.state !== "dead") {
            boss.state = "dizzy"
            boss.stateT = 0
            boss.stun = left ? 0.9 : 1.4
            boss.mvx = boss.mvy = 0
            boss.move = null
            boss.setAnim("hurt")
        }
        this.sound("guardBreak")
        this.addShake(left ? 10 : 18)
        this.hitstop = Math.max(this.hitstop, 0.09)
        this.vibrate(left ? 50 : 90)
        this.emit("plateBreak", { left })
    }

    // Zweite Chance: einmal pro Run einen K.O. überleben
    knockout(winner, loser) {
        if (this.phase !== "fight") return
        const me = this.fighters[0]
        if (loser === me && this.setup.useChance && this.setup.useChance()) {
            me.hp = me.hpLag = Math.min(me.maxHp, 30)
            me.toIdle()
            me.vx *= 0.3
            me.vy *= 0.3
            me.iframes = 1.5
            me.flashT = 0.3
            this.lastHit = null
            this.fx.ring(me.x, me.y, { radius: 140, color: "rgba(160,255,200,0.95)", life: 0.6, width: 10 })
            this.fx.heal(me.x, me.y)
            this.fx.text(me.x, me.y - 140, "ZWEITE CHANCE!", { color: "#7dff9b", size: 40, life: 1.3 })
            this.sound("heal")
            this.flash = Math.max(this.flash, 0.2)
            this.flashColor = "160,255,200"
            this.emit("secondChance", {})
            return
        }
        super.knockout(winner, loser)
    }

    // ---------------- Kamera: zeigt immer das ganze Feld, kein Zoom ----------------
    updateCamera() {
        const { w, h } = this.view
        const F = GLAS_FIELD
        const box = { x0: F.x0 - 50, x1: F.x1 + 50, y0: F.y0 - 130, y1: F.y1 + 40 }
        const portrait = h > w
        const top = Math.min(h * 0.17, 122)
        const bottom = h - (portrait && isTouchDevice() ? h * 0.3 : 14)
        const bw = box.x1 - box.x0
        const bh = box.y1 - box.y0
        const zoom = Math.min(w / bw, Math.max(80, bottom - top) / bh)
        const cam = this.camera
        cam.zoom = zoom
        cam.x = (box.x0 + box.x1) / 2
        cam.y = (box.y0 + box.y1) / 2 - ((top + bottom) / 2 - h / 2) / zoom
        cam.ready = true
        this.punch = 0
    }

    // ---------------- Zeichnen ----------------
    drawGlassGround(ctx) {
        this.drawField(ctx)
        this.drawPlates(ctx, false)
        super.drawGlassGround(ctx)
    }

    drawGlassTop(ctx) {
        super.drawGlassTop(ctx)
        this.drawPlates(ctx, true)
    }

    render(ctx, w, h) {
        super.render(ctx, w, h)
        GlasRun.updateHud(this)
    }

    // Leuchtender Glasrand um das Kampffeld, außen leicht abgedunkelt
    drawField(ctx) {
        const F = GLAS_FIELD
        const g = GLASS[this.map.id] || GLASS.sky
        const x = F.x0 - 34, y = F.y0 - 18, w = F.x1 - F.x0 + 68, h = F.y1 - F.y0 + 36, r = 34
        const path = (inset = 0) => {
            ctx.beginPath()
            ctx.roundRect(x + inset, y + inset, w - inset * 2, h - inset * 2, Math.max(4, r - inset))
        }
        ctx.save()
        ctx.beginPath()
        ctx.rect(-4000, -4000, WORLD.width + 8000, WORLD.height + 8000)
        ctx.roundRect(x, y, w, h, r)
        ctx.fillStyle = "rgba(8,16,48,0.3)"
        ctx.fill("evenodd")
        // zarter Glasboden
        path()
        const floor = ctx.createLinearGradient(0, y, 0, y + h)
        floor.addColorStop(0, `rgba(${g.rgb},0.10)`)
        floor.addColorStop(1, "rgba(255,255,255,0.04)")
        ctx.fillStyle = floor
        ctx.fill()
        // Lichtkante
        ctx.shadowColor = `rgba(${g.rgb},0.95)`
        ctx.shadowBlur = 22
        ctx.strokeStyle = `rgba(${g.rgb},0.85)`
        ctx.lineWidth = 7
        ctx.stroke()
        ctx.shadowBlur = 0
        ctx.strokeStyle = "rgba(255,255,255,0.95)"
        ctx.lineWidth = 2
        ctx.stroke()
        // wandernder Lichtpunkt auf der Kante
        ctx.setLineDash([70, 1200])
        ctx.lineDashOffset = -this.time * 160
        ctx.strokeStyle = "rgba(255,255,255,0.9)"
        ctx.lineWidth = 4
        ctx.lineCap = "round"
        ctx.stroke()
        ctx.setLineDash([])
        path(9)
        ctx.strokeStyle = "rgba(255,255,255,0.22)"
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.restore()
    }

    // Drei Glasplatten kreisen um den Boss: hintere unter, vordere über der Figur
    drawPlates(ctx, front) {
        const a = this.armor
        if (!a || !a.plates.some(p => p > 0)) return
        const boss = this.fighters[1]
        if (boss.state === "dead") return
        const g = GLASS[this.map.id] || GLASS.sky
        ctx.save()
        if (!front) {
            ctx.strokeStyle = "rgba(255,255,255,0.22)"
            ctx.lineWidth = 1.5
            ctx.beginPath()
            ctx.ellipse(boss.x, boss.y - 48, 74, 20, 0, 0, Math.PI * 2)
            ctx.stroke()
        }
        for (let i = 0; i < 3; i++) {
            if (a.plates[i] <= 0) continue
            const p = this.platePos(i, boss)
            if ((p.depth >= 0) !== front) continue
            const s = 0.86 + p.depth * 0.14
            ctx.save()
            ctx.translate(p.x, p.y)
            ctx.scale(s, s)
            ctx.globalAlpha = 0.78 + p.depth * 0.2
            const pts = [[0, -21], [14, -10], [14, 11], [0, 22], [-14, 11], [-14, -10]]
            ctx.beginPath()
            pts.forEach(([px, py], k) => k ? ctx.lineTo(px, py) : ctx.moveTo(px, py))
            ctx.closePath()
            const fill = ctx.createLinearGradient(-14, -21, 14, 22)
            fill.addColorStop(0, g.light)
            fill.addColorStop(0.55, g.mid)
            fill.addColorStop(1, g.deep)
            ctx.fillStyle = fill
            ctx.fill()
            ctx.strokeStyle = g.edge
            ctx.lineWidth = 3
            ctx.stroke()
            ctx.strokeStyle = "rgba(255,255,255,0.95)"
            ctx.lineWidth = 1.4
            ctx.stroke()
            // Glanz
            ctx.fillStyle = "rgba(255,255,255,0.7)"
            ctx.fillRect(-8, -12, 3, 18)
            // Sprünge zeigen, wie viel die Platte noch aushält
            const dmg = 1 - a.plates[i] / GLAS_PLATE_HP
            if (dmg > 0.05) {
                ctx.strokeStyle = "rgba(255,255,255,0.95)"
                ctx.lineWidth = 1.3
                ctx.beginPath()
                ctx.moveTo(-10, -4); ctx.lineTo(0, 2); ctx.lineTo(-3, 14)
                if (dmg > 0.35) { ctx.moveTo(0, 2); ctx.lineTo(11, -3); ctx.lineTo(9, -14) }
                if (dmg > 0.65) { ctx.moveTo(0, 2); ctx.lineTo(8, 12); ctx.moveTo(-10, -4); ctx.lineTo(-6, -16) }
                ctx.stroke()
            }
            if (a.flash[i] > 0) {
                ctx.globalAlpha = a.flash[i] / 0.18
                ctx.fillStyle = "#ffffff"
                ctx.beginPath()
                pts.forEach(([px, py], k) => k ? ctx.lineTo(px, py) : ctx.moveTo(px, py))
                ctx.fill()
            }
            ctx.restore()
        }
        ctx.restore()
    }
}

// ============================================================
//  Der Run: Gegnerfolge, mitgenommenes Leben, Karten, Ende
// ============================================================
const GlasRun = {
    run: null,
    touch: null,
    hud: null,

    init() {
        const layer = document.getElementById("gr-touch")
        this.touch = new OneThumbSource(layer, () => App.match && App.match.glasrun ? App.match.fighters[0] : null)
        const ability = document.getElementById("gr-ability")
        ability.addEventListener("pointerdown", e => {
            e.preventDefault()
            this.touch.latch.ability = true
            ability.classList.add("pressed")
            if (GameSettings.get().vibration && navigator.vibrate) navigator.vibrate(8)
        })
        for (const t of ["pointerup", "pointercancel", "pointerleave"]) ability.addEventListener(t, () => ability.classList.remove("pressed"))
        document.getElementById("gr-pause").addEventListener("click", () => App.pause())
        document.getElementById("greAgain").addEventListener("click", () => this.restart())
        document.getElementById("greMenu").addEventListener("click", () => App.quitToMenu())
        document.getElementById("rotateGlasrun").addEventListener("click", () => {
            App.quitToMenu()
            this.start()
        })
        // Am PC: Karten mit 1 – 3 wählen
        Keyboard.listeners.add(code => {
            if (UI.current !== "glascards") return
            const i = ["Digit1", "Digit2", "Digit3", "Numpad1", "Numpad2", "Numpad3"].indexOf(code) % 3
            const btn = document.querySelectorAll("#grCards .gr-card")[i]
            if (i >= 0 && btn) btn.click()
        })
        this.hud = {
            me: document.querySelector("#gr-hud .gr-cap.me"),
            foe: document.querySelector("#gr-hud .gr-cap.foe"),
            time: document.querySelector("#gr-hud .gr-time"),
            stage: document.querySelector("#gr-hud .gr-stage"),
            score: document.querySelector("#gr-hud .gr-score"),
            ability: ability,
            cache: {}
        }
        // Rekord im Hauptmenü anzeigen
        const renderRecord = UI.renderRecord
        UI.renderRecord = function (...args) {
            const out = renderRecord.apply(this, args)
            GlasRun.renderMenu()
            return out
        }
        this.renderMenu()
    },

    active() {
        return !!(this.run && App.match && App.match.glasrun)
    },

    record() {
        const d = PlayerRecord.data
        if (!d.glasrun) d.glasrun = { best: 0, score: 0, runs: 0, champ: null }
        return d.glasrun
    },

    renderMenu() {
        const el = document.getElementById("grMenuSub")
        if (!el) return
        const r = this.record()
        el.textContent = r.best ? `Rekord: ${r.best} Gegner · Hochformat, eine Hand` : "Endlos, im Hochformat, mit einer Hand"
    },

    // Bot-Stufe, Leben und Zeit je Gegnernummer
    tier(n) {
        const boss = n % 5 === 0
        if (n <= 4) return { diff: "easy", mul: 1, boss: false }
        if (n === 5) return { diff: "normal", mul: 1, boss: true }
        if (n <= 9) return { diff: "normal", mul: 1.1, boss: false }
        if (n === 10) return { diff: "hard", mul: 1, boss: true }
        if (n <= 14) return { diff: "hard", mul: 1.2, boss: false }
        if (n === 15) return { diff: "nightmare", mul: 1, boss: true }
        return { diff: "nightmare", mul: 1.2 + 0.05 * (n - 15), boss }
    },

    // ---------------- Start ----------------
    start() {
        Sound.unlock()
        Tutorial.stop()
        Modes.run = null
        if (this.run && !this.run.paid) this.leave()
        const pool = playableChampions().filter(id => !CHAMPIONS[id].boss)
        const champ = pool[Math.floor(Math.random() * pool.length)]
        this.run = {
            champ, n: 0, hp: CHAMPIONS[champ].hp, cards: {}, score: 0, defeated: 0, bosses: 0, flawless: 0,
            gold: 0, xp: 0, mapIdx: Math.floor(Math.random() * MAP_ORDER.length), lastOpp: null,
            chanceUsed: false, finisher: false, paid: false, over: false
        }
        document.body.classList.add("glasrun")
        this.requestPortrait()
        Music.play("battle")
        this.nextFight()
    },

    restart() {
        this.leave()
        App.match = null
        this.start()
    },

    nextFight() {
        const r = this.run
        r.n++
        const t = this.tier(r.n)
        let foe = "gravelord"
        if (!t.boss) {
            const pool = CHAMPION_ORDER.filter(id => !CHAMPIONS[id].boss && id !== r.champ && id !== r.lastOpp)
            foe = pool[Math.floor(Math.random() * pool.length)]
            r.lastOpp = foe
        }
        const diff = DIFFICULTIES[t.diff]
        const sub = r.n === 1
            ? `Dein Champion: ${CHAMPIONS[r.champ].name}`
            : t.boss ? `Gravelord · ${diff.name} · 3 Glasplatten` : `${CHAMPIONS[foe].name} · ${diff.name}`
        const map = MAP_ORDER[r.mapIdx % MAP_ORDER.length]
        for (const c of App.controllers) if (c.destroy) c.destroy()
        const touch = isTouchDevice() ? [this.touch] : []
        App.controllers = [
            new Controller([new KeyboardSource(keymap("solo")), new GamepadSource("any"), new PhoneSource(0), new PhoneSource(1), ...touch]),
            new BotController(t.diff)
        ]
        const match = new GlasMatch({
            rules: { mode: "glasrun", map, rounds: 1, roundTime: t.boss ? 60 : 30, vs: false, noHazards: true, hp: [r.hp, null] },
            champs: [r.champ, foe],
            controllers: App.controllers,
            humans: [true, false],
            settings: { ...GameSettings.get(), replay: false },
            onEvent: (type, data, m) => App.onMatchEvent(type, data, m)
        }, {
            n: r.n, boss: t.boss, hpMul: t.mul, cards: r.cards, sub,
            useChance: () => {
                if (!r.cards.chance || r.chanceUsed) return false
                r.chanceUsed = true
                return true
            }
        })
        Shop.applySkins(match)
        Cheats.apply(match)
        match.setView(App.w, App.h)
        App.match = match
        this.touch.reset()
        this.buildHud(match)
        UI.hideBanner()
        App.setState("game")
        UI.show("none")
        this.showHint(r.n === 1 && this.record().runs < 3)
    },

    // ---------------- Ereignisse aus dem Kampf ----------------
    onEvent(type, data, match) {
        Progress.onEvent(type, data, match)
        switch (type) {
            case "banner":
                UI.banner(data)
                break
            case "pauseRequest":
                App.pause()
                break
            case "abilityDenied":
                if (data.side === 0) this.bump(this.hud.ability, "deny")
                break
            case "secondChance":
                this.bump(this.hud.me, "saved")
                break
            case "finisher":
                if (this.run && data.winner.side === 0 && data.name !== "K.O.") this.run.finisher = true
                break
            case "matchEnd":
                setTimeout(() => this.onFightEnd(match, data.winner), 300)
                break
        }
    },

    bump(el, cls) {
        el.classList.remove(cls)
        void el.offsetWidth
        el.classList.add(cls)
    },

    onFightEnd(match, winner) {
        const r = this.run
        if (!r || match !== App.match || r.over) return
        const me = match.fighters[0]
        if (winner !== 0) {
            r.hp = 0
            return this.endRun(match)
        }
        const boss = match.setup.boss
        const flawless = me.stats.taken === 0
        let pts = (boss ? 500 : 100) * r.n
        if (flawless) pts = Math.round(pts * 1.5)
        r.score += pts
        r.defeated++
        r.gold += boss ? 50 : 10
        r.xp += boss ? 60 : 20
        if (flawless) r.flawless++
        if (boss) {
            r.bosses++
            r.mapIdx++   // nach jedem Boss eine andere Kulisse
        }
        const heal = GLAS_HEAL + 15 * (r.cards.funke || 0)
        const before = me.hp
        r.hp = Math.min(me.maxHp, me.hp + heal)
        this.showCards({ boss, pts, flawless, healed: Math.round(r.hp - before), maxHp: me.maxHp })
    },

    // ---------------- Kartenwahl ----------------
    drawCards(boss) {
        const owned = this.run.cards
        const ids = Object.keys(GLAS_CARDS).filter(id => !(GLAS_CARDS[id].once && owned[id]))
        const normals = ids.filter(id => !GLAS_CARDS[id].rare)
        const rares = ids.filter(id => GLAS_CARDS[id].rare)
        const pick = []
        const free = list => list.filter(id => !pick.includes(id))
        while (pick.length < 3) {
            const rareOk = free(rares).length > 0
            const useRare = rareOk && (Math.random() < GLAS_RARE_CHANCE || !free(normals).length)
            const from = free(useRare ? rares : normals)
            if (!from.length) break
            pick.push(from[Math.floor(Math.random() * from.length)])
        }
        // Nach einem Boss ist immer mindestens eine seltene Karte dabei
        if (boss && !pick.some(id => GLAS_CARDS[id].rare) && free(rares).length) {
            const from = free(rares)
            pick[Math.floor(Math.random() * pick.length)] = from[Math.floor(Math.random() * from.length)]
        }
        return pick
    },

    showCards({ boss, pts, flawless, healed, maxHp }) {
        const r = this.run
        UI.hideBanner()
        document.getElementById("grcSub").textContent = boss ? `Glas-Boss besiegt · Gegner ${r.n}` : `Gegner ${r.n} besiegt`
        document.getElementById("grcInfo").innerHTML = `
            <div class="gr-lifebar"><i style="transform:scaleX(${(r.hp / maxHp).toFixed(3)})"></i><span>${Math.ceil(r.hp)} / ${maxHp}</span></div>
            <div class="gr-gains"><span>+${healed} Leben</span><span>+${pts.toLocaleString("de-DE")} Punkte${flawless ? " · ohne Schaden!" : ""}</span></div>`
        const wrap = document.getElementById("grCards")
        wrap.innerHTML = this.drawCards(boss).map((id, i) => {
            const c = GLAS_CARDS[id]
            const n = r.cards[id] || 0
            return `<button class="gr-card${c.rare ? " rare" : ""}" data-card="${id}" style="--i:${i}">
                <span class="grc-icon">${glasIcon(id)}</span>
                <span class="grc-text"><b>${c.name}</b><small>${c.text}</small></span>
                <span class="grc-tag">${c.rare ? "selten" : "normal"}${n ? ` · hast du ×${n}` : ""}</span>
            </button>`
        }).join("")
        for (const btn of wrap.querySelectorAll(".gr-card")) {
            btn.addEventListener("click", () => this.pick(btn.dataset.card), { once: true })
        }
        this.renderOwned(document.getElementById("grcOwned"))
        App.setState("glascards")
        UI.show("glascards")
        Sound.play("victory")
        if (!isTouchDevice()) setTimeout(() => { const b = wrap.querySelector(".gr-card"); if (b) b.focus({ preventScroll: true }) }, 60)
    },

    renderOwned(el) {
        const owned = Object.entries(this.run.cards)
        el.innerHTML = owned.length
            ? owned.map(([id, n]) => `<span class="gr-chip${GLAS_CARDS[id].rare ? " rare" : ""}">${glasIcon(id)}${GLAS_CARDS[id].name}${n > 1 ? ` ×${n}` : ""}</span>`).join("")
            : ""
        el.hidden = !owned.length
    },

    pick(id) {
        const r = this.run
        if (!r || UI.current !== "glascards") return
        r.cards[id] = (r.cards[id] || 0) + 1
        Sound.play("select")
        this.nextFight()
    },

    // ---------------- Run-Ende ----------------
    endRun(match) {
        const r = this.run
        r.over = true
        const rec = this.record()
        const prevBest = rec.best
        const p = this.payout()
        document.getElementById("greTitle").textContent = p.fresh && r.defeated > 0 ? "NEUER REKORD!" : "RUN VORBEI"
        document.getElementById("greCount").textContent = r.defeated
        document.getElementById("greRecord").textContent = p.fresh && r.defeated > 0
            ? (prevBest ? `Vorher: ${prevBest} Gegner` : "Dein erster Rekord")
            : `Rekord: ${rec.best} Gegner · ${rec.score.toLocaleString("de-DE")} Punkte`
        const opp = match.fighters[1]
        document.getElementById("greSub").textContent = `${CHAMPIONS[r.champ].name} fiel gegen ${match.setup.boss ? "den Glas-Boss" : opp.champ.name} · Gegner ${r.n}`
        document.getElementById("greStats").innerHTML = [
            ["Punkte", r.score.toLocaleString("de-DE")],
            ["Glas-Bosse", r.bosses],
            ["Ohne Schaden", r.flawless]
        ].map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join("")
        const box = document.getElementById("greRewards")
        box.innerHTML = `
            <span class="rw"><b class="rw-num" data-to="${p.xp}">+0</b> XP</span>
            <span class="rw"><span class="gold-coin"></span><b class="rw-num gold" data-to="${p.gold}">+0</b></span>
            ${p.levelUp ? `<span class="rw-up">Level ${p.levelUp}!</span>` : ""}`
        box.title = p.lines.join("\n")
        this.renderOwned(document.getElementById("greCards"))
        UI.hideBanner()
        App.setState("glasend")
        UI.show("glasend")
        Music.play("menu")
        Sound.play(p.fresh && r.defeated > 0 ? "victory" : "defeat")
        setTimeout(() => {
            if (UI.current !== "glasend") return
            for (const el of box.querySelectorAll(".rw-num")) UI.countUp(el, +el.dataset.to)
        }, 450)
        if (!isTouchDevice()) setTimeout(() => document.getElementById("greAgain").focus({ preventScroll: true }), 60)
    },

    // Gold und XP gibt es erst am Ende – auch bei Abbruch über das Pausemenü
    payout() {
        const r = this.run
        if (!r || r.paid) return null
        r.paid = true
        const d = Progress.data
        const wallet = Shop.data
        const daily = Progress.daily()
        let xp = r.xp
        let gold = r.gold
        const lines = [`${r.defeated} Gegner besiegt +${r.xp} XP · +${r.gold} Gold`]
        // Ein Run zählt für die Tagesaufgaben wie ein normaler Kampf
        if (r.defeated > 0) {
            Progress.bump("win")
            if (r.finisher) Progress.bump("finisher")
            if (!daily.firstWin) {
                daily.firstWin = true
                xp += XP_FIRST_WIN
                gold += GOLD.firstWin
                lines.push(`Erster Sieg des Tages +${XP_FIRST_WIN} XP · +${GOLD.firstWin} Gold`)
            }
        }
        for (const m of Progress.pending) {
            xp += XP_MISSION
            gold += GOLD.mission
            lines.push(`${m.text} +${XP_MISSION} XP · +${GOLD.mission} Gold`)
        }
        Progress.pending = []
        Progress.finisher = false
        wallet.gold += gold
        const startLevel = d.level
        d.xp += xp
        while (d.xp >= Progress.need(d.level)) {
            d.xp -= Progress.need(d.level)
            d.level++
        }
        // Rekord: besiegte Gegner, bei Gleichstand entscheiden die Punkte
        const rec = this.record()
        rec.runs++
        const fresh = r.defeated > rec.best || (r.defeated === rec.best && r.score > rec.score)
        if (fresh) {
            rec.best = r.defeated
            rec.score = r.score
            rec.champ = r.champ
        }
        PlayerRecord.save()
        return { xp, gold, lines, fresh, levelUp: d.level > startLevel ? d.level : 0 }
    },

    // Glas-Run verlassen (Hauptmenü, anderer Modus); ein laufender Run wird ausgezahlt
    leave(quiet = false) {
        if (this.run && !this.run.paid) {
            const p = this.payout()
            if (p && !quiet && (p.xp || p.gold)) UI.toast(`Glas-Run: +${p.xp} XP · +${p.gold} Gold`)
        }
        this.run = null
        if (this.touch) this.touch.reset()
        this.showHint(false)
        document.body.classList.remove("glasrun", "gr-play")
        try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock() } catch (e) { }
    },

    onState(s) {
        document.body.classList.toggle("gr-play", s === "game" && this.active())
        if (s !== "game" && this.touch) this.touch.reset()
    },

    requestPortrait() {
        if (!isTouchDevice() || !GameSettings.get().fullscreen) return
        const lock = () => {
            try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock("portrait").catch(() => {}) } catch (e) { }
        }
        const el = document.documentElement
        if (document.fullscreenElement) return lock()
        if (el.requestFullscreen) el.requestFullscreen({ navigationUI: "hide" }).then(lock).catch(() => {})
    },

    // Kurzer Gesten-Hinweis in den ersten Runs
    showHint(on) {
        const el = document.getElementById("gr-hint")
        clearTimeout(this.hintTimer)
        el.classList.toggle("show", on && isTouchDevice())
        if (on) this.hintTimer = setTimeout(() => el.classList.remove("show"), 6500)
    },

    // ---------------- HUD ----------------
    buildHud(match) {
        const [me, foe] = match.fighters
        const h = this.hud
        h.cache = {}
        h.me.querySelector(".gr-name").textContent = me.champ.name
        h.foe.querySelector(".gr-name").textContent = foe.champ.name
        h.stage.classList.toggle("boss", !!match.armor)
        h.stage.querySelector(".gr-stage-text").textContent = match.setup.boss ? `Glas-Boss · ${match.setup.n}` : `Gegner ${match.setup.n}`
        h.score.textContent = this.run.score ? this.run.score.toLocaleString("de-DE") + " P" : ""
        h.ability.querySelector(".t-icon").innerHTML = abilityIcon(me.champ)
    },

    updateHud(match) {
        const h = this.hud
        if (!h || match !== App.match) return
        const c = h.cache
        const set = (key, val, fn) => {
            if (c[key] === val) return
            c[key] = val
            fn(val)
        }
        match.fighters.forEach((f, i) => {
            const el = i === 0 ? h.me : h.foe
            const hp = Math.ceil(Math.max(0, f.hp))
            set("hp" + i, hp, v => {
                el.querySelector(".gr-fill").style.transform = `scaleX(${Math.max(0, f.hp) / f.maxHp})`
                el.querySelector(".gr-hp").textContent = v
                el.classList.toggle("low", f.hp <= f.maxHp * 0.25)
            })
            set("lag" + i, Math.round(f.hpLag), () => {
                el.querySelector(".gr-lag").style.transform = `scaleX(${Math.max(f.hp, f.hpLag) / f.maxHp})`
            })
        })
        const plates = match.armor ? match.armor.plates.map(p => p > 0 ? (p < GLAS_PLATE_HP ? "c" : "1") : "0").join("") : ""
        set("plates", plates, v => {
            h.stage.querySelector(".gr-plates").innerHTML =[...v].map(s => `<i class="${s === "0" ? "" : s === "c" ? "on cracked" : "on"}"></i>`).join("")
        })
        const sec = Math.ceil(match.timer)
        set("time", sec, v => {
            h.time.textContent = v
            h.time.classList.toggle("urgent", v <= 5)
        })
        const me = match.fighters[0]
        const k = Math.min(1, me.energy / me.champ.ability.cost)
        set("ab", k.toFixed(3), () => {
            h.ability.querySelector(".t-ring circle").style.strokeDashoffset = String(289 * (1 - k))
            h.ability.classList.toggle("ready", me.abilityReady)
        })
    }
}
