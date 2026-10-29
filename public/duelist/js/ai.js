// ============================================================
//  Bot – steuert einen Kämpfer über dieselbe Eingabe-Schnittstelle
//  wie ein Mensch (Bewegung + Knöpfe), mit Reaktionszeit & Fehlern
// ============================================================

class BotController {
    constructor(difficultyId = "normal") {
        this.diff = DIFFICULTIES[difficultyId] || DIFFICULTIES.normal
        this.me = null
        this.op = null
        this.match = null
        this.mode = "engage"
        this.modeUntil = 0
        this.strafe = 1
        this.inRangeSince = null
        this.lastSeen = { x: 0, y: 0 }
        this.seenSwing = null
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

    rand(a, b) {
        return a + Math.random() * (b - a)
    }

    read() {
        const out = { mx: 0, my: 0, attack: false, ability: false, dash: false, attackHeld: false, pause: false }
        const { me, op, match, diff } = this
        if (!me || match.phase !== "fight" || me.state === "dead") return out
        const t = match.time

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
        const reach = me.champ.combo[0].reach * SPRITE_SCALE + COMBAT.bodyHalf
        const opReach = op.champ.combo[0].reach * SPRITE_SCALE + COMBAT.bodyHalf
        const dist = Math.hypot(dx, dy)

        // ---- Geplantes Ausweichen ausführen ----
        if (this.dashAt !== null && t >= this.dashAt) {
            this.dashAt = null
            out.dash = true
            out.mx = this.dashDir.x
            out.my = this.dashDir.y
            return out
        }

        // ---- Bomben ausweichen ----
        const danger = match.bombs.find(b => b.owner !== me &&
            Math.hypot((me.x - b.tx) / b.radius, (me.y - b.ty) / (b.radius * 0.5)) < 1.25)
        if (danger) {
            const ex = me.x - danger.tx || this.rand(-1, 1)
            const ey = (me.y - danger.ty) * 2 || this.rand(-1, 1)
            const l = Math.hypot(ex, ey)
            out.mx = ex / l
            out.my = ey / l
            if (danger.phase === "fuse" && danger.t > 0.15 && me.dashCd <= 0 && Math.random() < diff.dodge * 0.25) out.dash = true
            if (Math.random() > diff.smart * 0.9 + 0.1) {
                out.mx *= 0.3
                out.my *= 0.3
            }
            return out
        }

        // ---- Gegnerischen Angriff erkennen und evtl. ausweichen ----
        if (op.state === "attack" && op.stateT < 0.15) {
            const key = op.comboStep + ":" + Math.floor((t - op.stateT) * 100)
            if (this.seenSwing !== key) {
                this.seenSwing = key
                const threatened = Math.abs(op.x - me.x) < opReach + 50 && Math.abs(op.y - me.y) < COMBAT.depthReach + 25 &&
                    Math.sign(me.x - op.x) === op.facing
                if (threatened && me.dashCd <= 0 && Math.random() < diff.dodge && !me.busy) {
                    const away = Math.sign(me.x - op.x) || 1
                    const vert = Math.random() < 0.5 ? 1 : -1
                    this.dashDir = Math.random() < 0.5 ? { x: away, y: 0 } : { x: away * 0.4, y: vert }
                    this.dashAt = t + diff.reaction * this.rand(0.3, 0.8)
                }
                // Schild als Konter
                if (threatened && me.champ.ability.type === "shield" && me.abilityReady && Math.random() < diff.smart * 0.6) {
                    out.ability = true
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
        const ideal = reach * 0.72

        if (this.mode === "engage" || me.stealthT > 0) {
            gx = tx + side * ideal
            gy = ty
        } else if (this.mode === "space") {
            gx = tx + side * (opReach + 110)
            gy = ty + Math.sin(t * 1.7) * 90 * this.strafe
        } else if (this.mode === "retreat") {
            gx = tx + side * 420
            gy = ty + this.strafe * 160
        } else if (this.mode === "flank") {
            gx = tx - side * ideal
            gy = ty + this.strafe * 30
        }

        // Nicht in die Wand laufen: Ziel in die Arena ziehen
        gx = Math.max(ARENA.x0 + 40, Math.min(ARENA.x1 - 40, gx))
        gy = Math.max(ARENA.y0 + 20, Math.min(ARENA.y1 - 20, gy))
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

        // ---- Angreifen ----
        const inRange = adx < reach * 0.98 && ady < COMBAT.depthReach * 0.7 && op.stealthT <= 0
        if (inRange) {
            if (this.inRangeSince === null) this.inRangeSince = t + diff.reaction * this.rand(0.5, 1.3)
        } else {
            this.inRangeSince = null
        }

        if (!me.busy && inRange && t >= this.inRangeSince) {
            const punish = op.state === "recover" || op.state === "hurt" || op.state === "throw"
            if (punish || Math.random() < diff.aggression * 0.35) {
                out.attack = true
                // Beim Angriff zum Gegner drehen
                out.mx = Math.sign(dx) * 0.3
                out.my = 0
            }
        }

        // Kombo fortsetzen?
        if (me.state === "attack") {
            if (this.comboDecided !== me.comboStep) {
                this.comboDecided = me.comboStep
                this.comboGo = Math.random() < diff.combo
            }
            if (this.comboGo && (me.landedThisSwing || Math.random() < 0.3)) out.attackHeld = true
            out.mx = 0
            out.my = 0
        } else {
            this.comboDecided = -1
        }

        // Unsichtbar & nah dran: zuschlagen
        if (me.stealthT > 0 && inRange && !me.busy) out.attack = true

        return out
    }

    chooseMode(dist) {
        const { me, op, diff } = this
        const t = this.match.time
        const hpDiff = me.hp - op.hp
        const r = Math.random()
        this.strafe = Math.random() < 0.5 ? 1 : -1

        if (me.hp < 30 && hpDiff < -15 && r < diff.smart * 0.6) {
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
        switch (me.champ.ability.type) {
            case "heal":
                if (me.hp >= 90) return false
                if (me.hp <= 40) return true
                return smart ? me.hp <= 72 && (dist > 220 || op.state === "hurt") : Math.random() < 0.3
            case "shield":
                if (!smart) return Math.random() < 0.25
                return dist < reach * 1.6 && (op.state === "attack" || me.hp < 40)
            case "stealth":
                if (!smart) return Math.random() < 0.25
                return (me.hp < 45 && dist < 240) || (dist > 260 && dist < 520 && Math.random() < 0.5)
            case "bomb": {
                const max = me.energy >= me.maxEnergy
                const lethal = (me.energy >= 5 && op.hp <= 36) || (me.energy >= 4 && op.hp <= 24) || op.hp <= 12
                const committed = op.state === "attack" || op.state === "recover" || op.state === "hurt"
                if (op.stealthT > 0) return false
                if (!smart) return true
                if (diff.smart >= 0.85) return (max || lethal) && (committed || Math.random() < 0.4)
                return me.energy >= 4 || lethal || max
            }
        }
        return false
    }
}
