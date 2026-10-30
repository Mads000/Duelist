// ============================================================
//  Bot – steuert einen Kämpfer über dieselbe Eingabe-Schnittstelle
//  wie ein Mensch (Bewegung + Knöpfe), mit Reaktionszeit & Fehlern
// ============================================================

class BotController {
    // dummy: null | "stand" | "block" (Trainingspuppe)
    constructor(difficultyId = "normal", { dummy = null } = {}) {
        this.diff = DIFFICULTIES[difficultyId] || DIFFICULTIES.normal
        this.dummy = dummy
        this.me = null
        this.op = null
        this.match = null
        this.mode = "engage"
        this.modeUntil = 0
        this.strafe = 1
        this.inRangeSince = null
        this.lastSeen = { x: 0, y: 0 }
        this.seenSwing = null
        this.blockUntil = 0
        this.dashAt = null
        this.dashDir = null
        this.comboDecided = -1
        this.comboGo = false
        this.nextAbilityCheck = 0
        this.wander = { x: 0, y: 0 }
    }

    attach(me, op, match) {
        this.me = me
        this.op = op
        this.match = match
        this.lastSeen = { x: op.x, y: op.y }
    }

    // 2 gegen 2: neues Ziel (nächster Gegner)
    retarget(op) {
        if (!op || op === this.op) return
        this.op = op
        this.lastSeen = { x: op.x, y: op.y }
    }

    rand(a, b) {
        return a + Math.random() * (b - a)
    }

    read() {
        const out = emptyInput()
        const { me, op, match, diff } = this
        if (!me || match.phase !== "fight" || me.state === "dead") return out
        const t = match.time

        // Trainingspuppe: steht still oder blockt alles
        if (this.dummy) {
            if (this.dummy === "block") out.mx = -Math.sign(op.x - me.x) || 1
            return out
        }

        // ---- Wahrnehmung: Unsichtbare Gegner nur grob orten ----
        if (op.stealthT > 0) {
            if (Math.random() < 0.02) this.wander = { x: this.rand(-120, 120), y: this.rand(-60, 60) }
        } else {
            this.lastSeen = { x: op.x, y: op.y }
            this.wander = { x: 0, y: 0 }
        }
        const tx = this.lastSeen.x + this.wander.x
        const ty = this.lastSeen.y + this.wander.y
        const dx = tx - me.x
        const dy = ty - me.y
        const adx = Math.abs(dx)
        const ady = Math.abs(dy)
        const toOp = Math.sign(dx) || 1
        const ranged = !!me.champ.light[0].projectile
        const reach = ranged ? 480 : me.champ.light[0].reach * SPRITE_SCALE + COMBAT.bodyHalf
        const opReach = op.champ.light[0].projectile ? 200 : op.champ.light[0].reach * SPRITE_SCALE + COMBAT.bodyHalf
        const dist = Math.hypot(dx, dy)

        // ---- Geplantes Ausweichen ausführen ----
        if (this.dashAt !== null && t >= this.dashAt) {
            this.dashAt = null
            out.dash = true
            out.mx = this.dashDir.x
            out.my = this.dashDir.y
            // nicht in den Abgrund dashen
            const [sx, sy] = ARENA.clamp(me.x + out.mx * 170, me.y + out.my * 170, 10)
            if (match.ringOuts && Math.hypot(sx - me.x - out.mx * 170, sy - me.y - out.my * 170) > 1) {
                const l = Math.hypot(WORLD.width / 2 - me.x, 560 - me.y) || 1
                out.mx = (WORLD.width / 2 - me.x) / l
                out.my = (560 - me.y) / l
            }
            return out
        }

        // ---- Blocken (rückwärts halten), solange eine Bedrohung besteht ----
        if (t < this.blockUntil && !me.busy) {
            out.mx = -toOp
            out.my = 0
            return out
        }

        // ---- Bomben / Fontänen / Zauber ausweichen ----
        const dangers = [
            ...match.bombs.filter(b => b.owner !== me).map(b => ({ x: b.tx, y: b.ty, r: b.radius, late: b.phase === "fuse" })),
            ...match.geysers.map(g => ({ x: g.x, y: g.y, r: g.radius * 1.2, late: g.t > g.warn * 0.5 })),
            ...match.zones.filter(z => z.owner !== me && !z.done).map(z => ({ x: z.x, y: z.y, r: z.radius, late: true }))
        ]
        const danger = dangers.find(d => Math.hypot((me.x - d.x) / d.r, (me.y - d.y) / (d.r * 0.5)) < 1.25)
        if (danger) {
            const ex = me.x - danger.x || this.rand(-1, 1)
            const ey = (me.y - danger.y) * 2 || this.rand(-1, 1)
            const l = Math.hypot(ex, ey)
            out.mx = ex / l
            out.my = ey / l
            if (danger.late && me.dashCd <= 0 && Math.random() < diff.dodge * 0.25) out.dash = true
            if (Math.random() > diff.smart * 0.9 + 0.1) {
                out.mx *= 0.3
                out.my *= 0.3
            }
            return out
        }

        // ---- Feuerbälle: blocken oder ausweichen ----
        const incoming = match.projectiles.find(p => p.owner !== me && p.state === "fly" &&
            Math.sign(me.x - p.x) === Math.sign(p.vx) && Math.abs(me.x - p.x) < 260 && Math.abs(me.y - p.y) < COMBAT.depthReach)
        if (incoming && !me.busy && this.seenSwing !== incoming) {
            this.seenSwing = incoming
            const r = Math.random()
            if (r < diff.block) this.blockUntil = t + 0.4
            else if (r < diff.block + diff.dodge * 0.6 && me.dashCd <= 0) {
                this.dashDir = { x: 0, y: me.y > (ARENA.y0 + ARENA.y1) / 2 ? -1 : 1 }
                this.dashAt = t + diff.reaction * 0.4
            }
        }

        // ---- Gegnerischen Angriff erkennen: blocken, ausweichen oder Schild ----
        if (op.state === "attack" && op.stateT < 0.15) {
            const key = op.moveKind + op.comboStep + ":" + Math.floor((t - op.stateT) * 100)
            if (this.seenSwing !== key) {
                this.seenSwing = key
                const heavy = op.moveKind === "heavy"
                const threatened = Math.abs(op.x - me.x) < opReach + 60 && Math.abs(op.y - me.y) < COMBAT.depthReach + 25
                if (threatened && !me.busy) {
                    const r = Math.random()
                    if (me.champ.ability.type === "shield" && me.abilityReady && r < diff.smart * 0.5) {
                        out.ability = true
                    } else if (!heavy && r < diff.block) {
                        // schnelle Bots blocken auch mal perfekt
                        this.blockUntil = t + diff.reaction * this.rand(0.3, 0.7) + 0.35
                    } else if (r < diff.block + diff.dodge && me.dashCd <= 0) {
                        const away = Math.sign(me.x - op.x) || 1
                        const vert = Math.random() < 0.5 ? 1 : -1
                        this.dashDir = Math.random() < 0.5 ? { x: away, y: 0 } : { x: away * 0.4, y: vert }
                        this.dashAt = t + diff.reaction * this.rand(0.3, 0.8)
                    }
                }
            }
        }

        // ---- Fähigkeiten taktisch einsetzen ----
        if (me.abilityReady && t >= this.nextAbilityCheck && !me.busy) {
            this.nextAbilityCheck = t + diff.reaction * 2
            if (this.wantsAbility(dist, reach)) out.ability = true
        }

        // ---- Verhaltensmodus wählen ----
        if (t >= this.modeUntil) this.chooseMode(dist)

        // ---- Bewegung ----
        let gx = 0, gy = 0
        const side = Math.sign(me.x - tx) || (me.side === 0 ? -1 : 1)
        const ideal = ranged ? 360 : reach * 0.72

        if (this.mode === "engage" || me.stealthT > 0) {
            gx = tx + side * ideal
            gy = ty
        } else if (this.mode === "space") {
            gx = tx + side * (ranged ? 400 : opReach + 110)
            gy = ty + Math.sin(t * 1.7) * 90 * this.strafe
        } else if (this.mode === "retreat") {
            gx = tx + side * 420
            gy = ty + this.strafe * 160
        } else if (this.mode === "flank") {
            gx = tx - side * ideal
            gy = ty + this.strafe * 30
        }

        // Nicht in die Wand laufen: Ziel in die Arena ziehen
        // Power-ups in der Nähe einsammeln
        const item = (match.items || []).find(it => it.fall <= 0 && Math.hypot(it.x - me.x, it.y - me.y) < 380)
        if (item && Math.random() < 0.3 + diff.smart * 0.6 && !(op.state === "attack" && Math.abs(op.x - me.x) < 200)) {
            gx = item.x
            gy = item.y
        }
        ;[gx, gy] = ARENA.clamp(gx, gy, 70)
        let mx = gx - me.x
        let my = gy - me.y
        if (Math.abs(mx) < 10) mx = 0
        if (Math.abs(my) < 8) my = 0
        const ml = Math.hypot(mx, my)
        if (ml > 0) {
            out.mx = mx / ml
            out.my = my / ml
        }

        // Ungenauigkeit bei leichten Bots
        if (Math.random() > diff.accuracy) {
            out.mx += this.rand(-0.6, 0.6)
            out.my += this.rand(-0.6, 0.6)
        }

        // nicht selbst von der Insel laufen: Richtung Rand → zur Mitte lenken (schlaue Bots früher)
        if (match.ringOuts) {
            const look = 60 + diff.smart * 60
            const [sx, sy] = ARENA.clamp(me.x + out.mx * look, me.y + out.my * look, 10)
            if (Math.hypot(sx - (me.x + out.mx * look), sy - (me.y + out.my * look)) > 1) {
                const cx = WORLD.width / 2 - me.x
                const cy = 560 - me.y
                const l = Math.hypot(cx, cy) || 1
                out.mx = cx / l
                out.my = cy / l
            }
        }

        // ---- Angreifen ----
        const inRange = adx < reach * 0.98 && ady < COMBAT.depthReach * 0.7 && op.stealthT <= 0 && adx > (ranged ? 140 : 0)
        if (inRange) {
            if (this.inRangeSince === null) this.inRangeSince = t + diff.reaction * this.rand(0.5, 1.3)
        } else {
            this.inRangeSince = null
        }

        if (!me.busy && inRange && t >= this.inRangeSince) {
            const punish = op.state === "recover" || op.state === "hurt" || op.state === "throw" || op.state === "dizzy"
            const opBlocks = op.guarding || op.state === "block"
            // Gegen Blocker nah dran: werfen
            if (opBlocks && adx < 110 && Math.random() < diff.smart * 0.06) {
                out.light = true
                out.heavy = true
            } else if (punish || Math.random() < diff.aggression * 0.35) {
                // Gegen Blocker: schwerer Angriff drückt die Deckung leer
                // Spezialangriff (zum Gegner + Schwer), wenn bereit
                const special = me.specialReady && Math.random() < diff.heavy * 0.45
                if (special || (opBlocks && Math.random() < diff.smart) || Math.random() < diff.heavy * 0.4) out.heavy = true
                else out.light = true
                out.mx = toOp * (special ? 1 : 0.3)
                out.my = 0
            }
        }

        // Kombo fortsetzen – leicht, leicht, schwer
        if (me.state === "attack") {
            const key = me.moveKind + me.comboStep
            if (this.comboDecided !== key) {
                this.comboDecided = key
                this.comboGo = Math.random() < diff.combo
            }
            if (this.comboGo && me.moveKind === "light" && (me.landedThisSwing || Math.random() < 0.3)) {
                if (me.comboStep >= me.champ.light.length - 1 || Math.random() < diff.heavy * 0.5) out.heavy = true
                else out.lightHeld = true
            }
            out.mx = 0
            out.my = 0
        } else {
            this.comboDecided = -1
        }

        // Unsichtbar & nah dran: zuschlagen
        if (me.stealthT > 0 && inRange && !me.busy) out.light = true

        return out
    }

    chooseMode(dist) {
        const { me, op, diff } = this
        const t = this.match.time
        const hpDiff = me.hp / me.maxHp - op.hp / op.maxHp
        const r = Math.random()
        this.strafe = Math.random() < 0.5 ? 1 : -1

        if (me.hp < me.maxHp * 0.3 && hpDiff < -0.15 && r < diff.smart * 0.6) {
            this.mode = "retreat"
            this.modeUntil = t + this.rand(0.8, 1.6)
        } else if (r < diff.aggression) {
            this.mode = Math.random() < 0.18 * diff.smart ? "flank" : "engage"
            this.modeUntil = t + this.rand(1.2, 2.6)
        } else {
            this.mode = "space"
            this.modeUntil = t + this.rand(0.6, 1.5)
        }
    }

    wantsAbility(dist, reach) {
        const { me, op, diff } = this
        const smart = Math.random() < diff.smart
        const hpK = me.hp / me.maxHp
        switch (me.champ.ability.type) {
            case "heal":
                if (hpK >= 0.9) return false
                if (hpK <= 0.4) return true
                return smart ? hpK <= 0.72 && (dist > 220 || op.state === "hurt") : Math.random() < 0.3
            case "shield":
                if (!smart) return Math.random() < 0.25
                return dist < reach * 1.6 && (op.state === "attack" || hpK < 0.4)
            case "stealth":
                if (!smart) return Math.random() < 0.25
                return (hpK < 0.45 && dist < 240) || (dist > 260 && dist < 520 && Math.random() < 0.5)
            case "frenzy":
                return smart ? dist < 320 : Math.random() < 0.3
            case "blink":
                if (op.stealthT > 0) return false
                return smart ? (dist < 160 && hpK < 0.6) || (op.state === "attack" && dist < 220) : Math.random() < 0.2
            case "quake":
                return dist < 220 || (!smart && Math.random() < 0.2)
            case "charge":
                return smart ? dist > 140 && dist < 460 : Math.random() < 0.3
            case "toxic":
                return op.stealthT <= 0 && (smart ? dist < 480 && op.state !== "dash" : Math.random() < 0.35)
            case "bomb": {
                const max = me.energy >= me.maxEnergy
                const lethal = (me.energy >= 5 && op.hp <= 36) || (me.energy >= 4 && op.hp <= 24) || op.hp <= 12
                const committed = op.state === "attack" || op.state === "recover" || op.state === "hurt" || op.state === "dizzy"
                if (op.stealthT > 0) return false
                if (!smart) return true
                if (diff.smart >= 0.85) return (max || lethal) && (committed || Math.random() < 0.4)
                return me.energy >= 4 || lethal || max
            }
        }
        return false
    }
}
