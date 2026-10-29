// ============================================================
//  Kämpfer – Bewegung, Kombos, Ausweichen, Fähigkeiten, Zeichnen
// ============================================================

const SIDE_COLORS = ["#4f8dff", "#ff4f5e"]
const NO_INPUT = { mx: 0, my: 0, attack: false, ability: false, dash: false, attackHeld: false, pause: false }

class Fighter {
    constructor(champId, side, match) {
        this.champ = CHAMPIONS[champId]
        this.champId = champId
        this.side = side
        this.match = match
        this.controller = null
        this.isHuman = false
        this.label = side === 0 ? "P1" : "P2"
        this.maxEnergy = this.champ.ability.maxEnergy || COMBAT.energyMax

        // Zeichen-Geometrie (Welt-Einheiten)
        this.geom = {
            w: FRAME * SPRITE_SCALE,
            h: FRAME * SPRITE_SCALE,
            ax: this.champ.anchor.x * SPRITE_SCALE,
            ay: this.champ.anchor.y * SPRITE_SCALE
        }

        this.stats = { damage: 0, taken: 0, hits: 0, maxCombo: 0, abilities: 0, dodges: 0, blocked: 0 }
        this.reset(ARENA.spawn[side])
    }

    reset(spawn) {
        this.x = spawn.x
        this.y = spawn.y
        this.vx = 0
        this.vy = 0
        this.facing = this.side === 0 ? 1 : -1
        this.hp = COMBAT.hp
        this.hpLag = COMBAT.hp
        this.energy = 0
        this.state = "idle"
        this.stateT = 0
        this.stun = 0
        this.setAnim("idle")
        this.comboStep = -1
        this.attackDef = null
        this.windowsDone = []
        this.landedThisSwing = false
        this.swingSound = false
        this.buffer = 0
        this.dashCd = 0
        this.iframes = 0
        this.dashDir = { x: 1, y: 0 }
        this.ghostT = 0
        this.dustT = 0
        this.flashT = 0
        this.shieldT = 0
        this.stealthT = 0
        this.ambush = false
        this.healLeft = 0
        this.comboCount = 0
        this.comboTimer = 0
        this.moving = false
        this.input = NO_INPUT
        this.readyPulse = 0
    }

    // ---------- Animation ----------
    setAnim(name, def = null) {
        this.animName = name
        this.anim = def || this.champ.anims[name] || this.champ.anims.idle
        this.animT = 0
    }

    get frame() {
        const f = Math.floor(this.animT * this.anim.fps)
        if (this.animName === "death" || this.state === "attack" || this.state === "throw" || this.state === "hurt") {
            return Math.min(f, this.anim.frames - 1)
        }
        return f % this.anim.frames
    }

    get invulnerable() {
        return this.iframes > 0 || this.stealthT > 0 || this.state === "dead"
    }

    get abilityReady() {
        return this.energy >= this.champ.ability.cost
    }

    get busy() {
        return this.state !== "idle" && this.state !== "run"
    }

    // ---------- Update ----------
    update(dt, opp, input) {
        this.input = input || NO_INPUT
        const inp = this.input

        this.animT += dt
        this.stateT += dt
        this.dashCd -= dt
        this.iframes -= dt
        this.flashT -= dt
        this.buffer -= dt
        this.readyPulse += dt
        this.hpLag += (this.hp - this.hpLag) * (1 - Math.exp(-3 * dt))
        if (Math.abs(this.hpLag - this.hp) < 0.05) this.hpLag = this.hp

        this.comboTimer -= dt
        if (this.comboTimer <= 0) this.comboCount = 0

        this.updateAbilities(dt)

        if (inp.attack || (inp.attackHeld && this.state === "attack")) this.buffer = COMBAT.comboWindow

        switch (this.state) {
            case "dead":
                break
            case "hurt":
                if (this.stateT >= this.stun) this.toIdle()
                break
            case "attack":
                this.updateAttack(dt, opp, inp)
                break
            case "throw":
                if (this.frame >= this.anim.frames - 1 && this.stateT > 0.32) this.toIdle()
                break
            case "recover":
                if (inp.dash && this.dashCd <= 0) this.startDash(inp, opp)
                else if (this.stateT >= this.stun) this.toIdle()
                break
            case "block":
                if (this.stateT >= 0.22) this.toIdle()
                break
            case "dash":
                this.updateDash(dt)
                break
            default:
                this.updateFree(dt, opp, inp)
        }

        // Rückstoß / Ausfallschritt
        this.x += this.vx * dt
        this.y += this.vy * dt
        const f = Math.exp(-COMBAT.friction * dt)
        this.vx *= f
        this.vy *= f
        this.clampToArena()
    }

    updateFree(dt, opp, inp) {
        if (inp.dash && this.dashCd <= 0) return this.startDash(inp, opp)
        if (this.buffer > 0) return this.startAttack(0, opp)
        if (inp.ability) {
            if (this.tryAbility(opp)) return
        }

        const speed = this.champ.speed * (this.shieldT > 0 ? 0.85 : 1)
        this.moving = Math.abs(inp.mx) > 0.05 || Math.abs(inp.my) > 0.05
        if (this.moving) {
            this.x += inp.mx * speed * dt
            this.y += inp.my * speed * 0.78 * dt // Tiefe etwas langsamer = wirkt räumlicher
            if (Math.abs(inp.mx) > 0.15) this.facing = Math.sign(inp.mx)
            if (this.state !== "run") {
                this.state = "run"
                this.setAnim("run")
            }
            this.dustT -= dt
            if (this.dustT <= 0 && this.stealthT <= 0) {
                this.dustT = 0.16
                this.match.fx.dust(this.x - this.facing * 16, this.y, { count: 1, size: 10, vx: -this.facing * 40 })
            }
        } else if (this.state !== "idle") {
            this.state = "idle"
            this.setAnim("idle")
        }
    }

    toIdle() {
        this.state = "idle"
        this.stateT = 0
        this.comboStep = -1
        this.attackDef = null
        this.setAnim("idle")
    }

    // ---------- Angriff ----------
    faceOpponent(opp, inp) {
        if (inp && Math.abs(inp.mx) > 0.2) this.facing = Math.sign(inp.mx)
        else if (opp && Math.abs(opp.x - this.x) > 4) this.facing = Math.sign(opp.x - this.x)
    }

    startAttack(step, opp) {
        const def = this.champ.combo[step]
        this.state = "attack"
        this.stateT = 0
        this.comboStep = step
        this.attackDef = def
        this.windowsDone = def.hits.map(() => false)
        this.landedThisSwing = false
        this.dodgedBy = false
        this.swingSound = false
        this.buffer = 0
        this.setAnim("attack" + step, def.anim)
        this.faceOpponent(opp, this.input)
        this.vx += this.facing * def.lunge

        // Angriff aus dem Schatten
        if (this.stealthT > 0) {
            this.stealthT = 0
            this.ambush = true
            this.match.fx.smoke(this.x, this.y, 12)
            this.match.sound("reveal")
        }
    }

    updateAttack(dt, opp, inp) {
        const def = this.attackDef
        const frame = this.frame
        const lastHitEnd = def.hits[def.hits.length - 1][1]

        // Schwung-Sound kurz vor dem ersten Treffer-Frame
        if (!this.swingSound && frame >= def.hits[0][0] - 1) {
            this.swingSound = true
            this.match.sound("swing", { pitch: 0.8 + this.comboStep * 0.18 })
        }

        def.hits.forEach(([s, e], i) => {
            if (this.windowsDone[i]) return
            if (frame >= s && frame <= e) {
                if (this.match.tryHit(this, opp, i)) this.windowsDone[i] = true
            } else if (frame > e) {
                this.windowsDone[i] = true
            }
        })

        const lastStep = this.comboStep >= this.champ.combo.length - 1
        // Nach dem letzten Treffer-Frame direkt in die nächste Kombo-Stufe
        if (frame > lastHitEnd) {
            if (this.buffer > 0 && !lastStep) return this.startAttack(this.comboStep + 1, opp)
            if (inp.dash && this.dashCd <= 0 && this.landedThisSwing) return this.startDash(inp, opp)
        }

        if (this.animT * def.anim.fps >= def.anim.frames) {
            if (this.ambush && !this.landedThisSwing) this.ambush = false
            this.state = "recover"
            this.stateT = 0
            this.stun = def.finisher ? 0.5 : COMBAT.recovery
            this.comboStep = -1
            this.setAnim("idle")
        }
    }

    // ---------- Ausweichen ----------
    startDash(inp, opp) {
        let dx = inp.mx
        let dy = inp.my
        if (Math.hypot(dx, dy) < 0.2) {
            // ohne Richtung: vom Gegner weg
            dx = opp ? -Math.sign(opp.x - this.x) || -this.facing : -this.facing
            dy = 0
        }
        const l = Math.hypot(dx, dy)
        this.dashDir = { x: dx / l, y: dy / l }
        if (Math.abs(this.dashDir.x) > 0.3) this.facing = Math.sign(this.dashDir.x)
        this.state = "dash"
        this.stateT = 0
        this.iframes = COMBAT.dashIframes
        this.dashCd = COMBAT.dashCooldown
        this.ghostT = 0
        this.buffer = 0
        this.comboStep = -1
        this.setAnim("run")
        this.animT = 0.2
        this.match.sound("dash")
        this.match.fx.dust(this.x, this.y, { count: 6, size: 18, vx: -this.dashDir.x * 160 })
    }

    updateDash(dt) {
        const k = 1 - this.stateT / COMBAT.dashTime
        const sp = COMBAT.dashSpeed * (0.45 + 0.55 * Math.max(0, k))
        this.x += this.dashDir.x * sp * dt
        this.y += this.dashDir.y * sp * 0.78 * dt
        this.ghostT -= dt
        if (this.ghostT <= 0 && this.stealthT <= 0) {
            this.ghostT = 0.035
            const img = champImage(this.champId, this.anim.file)
            this.match.fx.ghost(img, this.frame, this.x, this.y, this.geom, this.facing < 0, SIDE_COLORS[this.side])
        }
        if (this.stateT >= COMBAT.dashTime) {
            this.state = "recover"
            this.stateT = 0
            this.stun = 0.06
            this.setAnim("idle")
        }
    }

    // ---------- Schaden ----------
    takeHit(attacker, dmg, kb, heavy) {
        this.hp = Math.max(0, this.hp - dmg)
        this.flashT = 0.12
        this.comboCount = 0
        this.buffer = 0
        this.attackDef = null
        this.comboStep = -1
        this.ambush = false
        this.vx = attacker.facing * kb
        this.vy = Math.max(-140, Math.min(140, (this.y - attacker.y) * 3))
        if (this.hp <= 0) {
            this.state = "dead"
            this.stateT = 0
            this.setAnim("death")
            this.vx *= 1.6
            return
        }
        this.state = "hurt"
        this.stateT = 0
        this.stun = heavy ? COMBAT.finisherStun : COMBAT.hitstun
        this.setAnim("hurt")
        // Gesicht zum Angreifer drehen
        this.facing = Math.sign(attacker.x - this.x) || this.facing
    }

    gainEnergy() {
        if (this.energy >= this.maxEnergy) return
        const wasReady = this.abilityReady
        this.energy++
        if (!wasReady && this.abilityReady) {
            this.readyPulse = 0
            this.match.sound("energy")
            this.match.emit("energyReady", this)
        }
    }

    // ---------- Fähigkeiten ----------
    tryAbility(opp) {
        const ab = this.champ.ability
        if (!this.abilityReady) {
            this.match.emit("abilityDenied", this)
            return false
        }
        const spent = this.energy
        this.energy = 0
        this.stats.abilities++
        const fx = this.match.fx

        switch (ab.type) {
            case "shield":
                this.shieldT = ab.duration
                fx.ring(this.x, this.y - 40, { radius: 140, color: "rgba(140,200,255,0.9)", life: 0.45, width: 10, ground: false })
                this.match.sound("shield")
                this.match.callout(this, "BOLLWERK!", "#9fd0ff")
                break

            case "bomb": {
                const stacks = Math.min(spent, 5)
                const dmg = stacks >= 5 ? 36 : stacks >= 4 ? 24 : 12
                this.faceOpponent(opp, null)
                this.state = "throw"
                this.stateT = 0
                this.setAnim("throw", this.champ.combo[0].anim)
                this.match.throwBomb(this, opp, dmg, stacks)
                this.match.sound("throw")
                this.match.callout(this, stacks >= 5 ? "MEGA-BOMBE!" : "BOMBE!", "#ffb35c")
                break
            }

            case "stealth":
                this.stealthT = ab.duration
                fx.smoke(this.x, this.y, 22)
                this.match.sound("stealth")
                break

            case "heal":
                this.healLeft = ab.amount
                fx.ring(this.x, this.y, { radius: 110, color: "rgba(120,255,150,0.9)", life: 0.5, width: 8 })
                this.match.sound("heal")
                this.match.callout(this, "+" + ab.amount, "#7dff9b")
                break
        }
        return true
    }

    updateAbilities(dt) {
        if (this.shieldT > 0) this.shieldT -= dt
        if (this.stealthT > 0) {
            this.stealthT -= dt
            if (this.stealthT <= 0) {
                this.match.fx.smoke(this.x, this.y, 10)
                this.match.sound("reveal")
            }
        }
        if (this.healLeft > 0 && this.state !== "dead") {
            const amount = Math.min(this.healLeft, 25 * dt)
            this.healLeft -= amount
            this.hp = Math.min(COMBAT.hp, this.hp + amount)
            if (Math.random() < dt * 22) this.match.fx.heal(this.x, this.y)
        }
    }

    // ---------- Arena-Grenzen (abgerundetes Rechteck) ----------
    clampToArena() {
        const r = ARENA.radius
        const ix0 = ARENA.x0 + r, ix1 = ARENA.x1 - r
        const iy0 = ARENA.y0 + r, iy1 = ARENA.y1 - r
        const cx = Math.max(ix0, Math.min(ix1, this.x))
        const cy = Math.max(iy0, Math.min(iy1, this.y))
        const dx = this.x - cx
        const dy = this.y - cy
        const d = Math.hypot(dx, dy)
        if (d > r) {
            this.x = cx + dx / d * r
            this.y = cy + dy / d * r
            // an der Wand abprallen statt "kleben"
            this.vx *= 0.3
            this.vy *= 0.3
        }
    }

    // ---------- Zeichnen ----------
    stealthAlpha() {
        if (this.stealthT <= 0) return 1
        const seeSelf = this.isHuman && this.match.mode === "solo"
        const flicker = Math.sin(this.match.time * 30) > 0.6 ? 0.06 : 0
        return (seeSelf ? 0.32 : 0.05) + flicker
    }

    drawShadow(ctx) {
        const alpha = this.stealthT > 0 ? 0.15 : 1
        ctx.save()
        ctx.globalAlpha = alpha
        ctx.fillStyle = "rgba(40,20,5,0.35)"
        ctx.beginPath()
        ctx.ellipse(this.x, this.y + 2, 34, 11, 0, 0, Math.PI * 2)
        ctx.fill()

        // Farbiger Spieler-Ring
        if (this.state !== "dead" && !this.match.demo) {
            ctx.strokeStyle = SIDE_COLORS[this.side]
            ctx.globalAlpha = alpha * 0.75
            ctx.lineWidth = 3.5
            ctx.beginPath()
            ctx.ellipse(this.x, this.y + 2, 38, 13, 0, 0, Math.PI * 2)
            ctx.stroke()

            // Fähigkeit bereit: pulsierender Ring
            if (this.abilityReady) {
                const p = (this.readyPulse % 1)
                ctx.globalAlpha = alpha * (1 - p) * 0.9
                ctx.strokeStyle = this.champ.color
                ctx.lineWidth = 3
                ctx.beginPath()
                ctx.ellipse(this.x, this.y + 2, 38 + p * 30, 13 + p * 10, 0, 0, Math.PI * 2)
                ctx.stroke()
            }
        }
        ctx.restore()
    }

    draw(ctx) {
        const img = champImage(this.champId, this.anim.file)
        if (!img || !img.complete) return
        const g = this.geom
        const frame = this.frame
        const alpha = this.stealthAlpha()

        ctx.save()
        ctx.translate(Math.round(this.x), Math.round(this.y))
        if (this.facing < 0) ctx.scale(-1, 1)

        // leichtes Zusammenstauchen beim Treffer
        if (this.state === "hurt" && this.stateT < 0.1) ctx.scale(1.08, 0.94)

        ctx.globalAlpha = alpha
        ctx.drawImage(img, frame * FRAME, 0, FRAME, FRAME, -g.ax, -g.ay, g.w, g.h)

        if (this.flashT > 0) {
            drawTintedFrame(ctx, img, frame, -g.ax, -g.ay, g.w, g.h, "#ffffff", Math.min(1, this.flashT / 0.06) * alpha)
        } else if (this.healLeft > 0) {
            drawTintedFrame(ctx, img, frame, -g.ax, -g.ay, g.w, g.h, "#6dff8e", 0.35 + Math.sin(this.match.time * 20) * 0.15)
        } else if (this.ambush && this.state === "attack") {
            drawTintedFrame(ctx, img, frame, -g.ax, -g.ay, g.w, g.h, "#b48cff", 0.45)
        }
        ctx.restore()

        if (this.shieldT > 0) this.drawShield(ctx)
    }

    drawShield(ctx) {
        const t = this.match.time
        const fading = this.shieldT < 0.8 && Math.sin(t * 40) > 0
        if (fading) return
        const cx = this.x
        const cy = this.y - 42
        ctx.save()
        const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 78)
        g.addColorStop(0, "rgba(150,210,255,0.02)")
        g.addColorStop(0.75, "rgba(120,190,255,0.22)")
        g.addColorStop(1, "rgba(200,235,255,0.65)")
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.ellipse(cx, cy, 64, 74, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = "rgba(210,240,255,0.85)"
        ctx.lineWidth = 3
        ctx.setLineDash([14, 10])
        ctx.lineDashOffset = -t * 60
        ctx.stroke()
        ctx.restore()
    }
}
