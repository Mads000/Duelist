// ============================================================
//  Kämpfer – Bewegung, Kombos, Blocken, Ausweichen, Fähigkeiten
// ============================================================

const SIDE_COLORS = ["#2f6bff", "#e33a3a"]
const NO_INPUT = emptyInput()

class Fighter {
    constructor(champId, side, match, { hp = null } = {}) {
        this.champ = CHAMPIONS[champId]
        this.champId = champId
        this.side = side
        this.match = match
        this.controller = null
        this.isHuman = false
        this.maxHp = this.champ.hp
        this.startHp = hp
        this.maxEnergy = this.champ.ability.maxEnergy || COMBAT.energyMax

        // Zeichen-Geometrie (Welt-Einheiten)
        this.geom = {
            w: FRAME * SPRITE_SCALE,
            h: FRAME * SPRITE_SCALE,
            ax: this.champ.anchor.x * SPRITE_SCALE,
            ay: this.champ.anchor.y * SPRITE_SCALE
        }

        this.stats = { damage: 0, taken: 0, hits: 0, maxCombo: 0, abilities: 0, dodges: 0, blocked: 0, perfect: 0, counters: 0 }
        this.reset(ARENA.spawn[side])
    }

    reset(spawn, keepHp = false) {
        this.x = spawn.x
        this.y = spawn.y
        this.mvx = 0           // eigene Laufgeschwindigkeit
        this.mvy = 0
        this.vx = 0            // Rückstoß
        this.vy = 0
        this.aimY = 0 // Angriffsrichtung: 0 = seitlich, -1 = nach oben, 1 = nach unten
        this.facing = this.side === 0 ? 1 : -1
        if (!keepHp) this.hp = this.startHp !== null ? this.startHp : this.maxHp
        this.startHp = null
        this.hpLag = this.hp
        this.energy = 0
        this.guard = COMBAT.guardMax
        this.guarding = false
        this.guardSince = 0
        this.state = "idle"
        this.stateT = 0
        this.stun = 0
        this.setAnim("idle")
        this.move = null
        this.moveKind = null
        this.comboStep = -1
        this.windowsDone = []
        this.spawned = false
        this.landedThisSwing = false
        this.swingSound = false
        this.bufLight = 0
        this.bufHeavy = 0
        this.dashCd = 0
        this.iframes = 0
        this.dashDir = { x: 1, y: 0 }
        this.ghostT = 0
        this.dustT = 0
        this.flashT = 0
        this.shieldT = 0
        this.stealthT = 0
        this.frenzyT = 0
        this.ambush = false
        this.healLeft = 0
        this.comboCount = 0
        this.comboTimer = 0
        this.comboDamage = 0
        this.moving = false
        this.input = NO_INPUT
        this.readyPulse = 0
        this.dodgedBy = false
    }

    // ---------- Animation ----------
    setAnim(name, def = null) {
        this.animName = name
        this.anim = def || this.champ.anims[name] || this.champ.anims.idle
        this.animT = 0
    }

    get frame() {
        const f = Math.floor(this.animT * this.anim.fps)
        if (["death", "light", "heavy", "throw", "hurt", "block"].includes(this.animClass)) {
            return Math.min(f, this.anim.frames - 1)
        }
        return f % this.anim.frames
    }

    get animClass() {
        if (this.animName === "death") return "death"
        if (this.state === "attack") return this.moveKind
        if (this.state === "throw") return "throw"
        if (this.state === "hurt" || this.state === "dizzy") return "hurt"
        if (this.state === "block") return "block"
        return "loop"
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

    // Noch vor dem ersten Treffer-Frame = anfällig für Konter
    get inStartup() {
        if (this.state !== "attack" || !this.move) return false
        const first = this.move.hits.length ? this.move.hits[0][0] : (this.move.projectile ? this.move.projectile.frame : this.move.zone.frame)
        return this.frame < first
    }

    get speedMul() {
        return this.frenzyT > 0 ? 1.3 : 1
    }

    // ---------- Update ----------
    update(dt, opp, input) {
        this.input = input || NO_INPUT
        const inp = this.input
        const animRate = this.frenzyT > 0 && this.state === "attack" ? 1.35 : 1

        this.animT += dt * animRate
        this.stateT += dt
        this.dashCd -= dt
        this.iframes -= dt
        this.flashT -= dt
        this.bufLight -= dt
        this.bufHeavy -= dt
        this.readyPulse += dt
        this.hpLag += (this.hp - this.hpLag) * (1 - Math.exp(-3 * dt))
        if (Math.abs(this.hpLag - this.hp) < 0.05) this.hpLag = this.hp

        this.comboTimer -= dt
        if (this.comboTimer <= 0) {
            this.comboCount = 0
            this.comboDamage = 0
        }
        if (!this.guarding && this.state !== "block") this.guard = Math.min(COMBAT.guardMax, this.guard + COMBAT.guardRegen * dt)

        this.updateAbilities(dt, opp)

        if (inp.light || (inp.lightHeld && this.state === "attack" && this.moveKind === "light")) this.bufLight = COMBAT.comboWindow
        if (inp.heavy) this.bufHeavy = COMBAT.comboWindow

        this.guarding = false
        switch (this.state) {
            case "dead":
                break
            case "hurt":
            case "dizzy":
                if (this.state === "dizzy" && Math.random() < dt * 8) this.match.fx.sparks(this.x, this.y - 95, Math.random() < 0.5 ? 1 : -1, { count: 1, color: "#fff6a8", color2: "#ffd84a", speed: 120, size: 6 })
                if (this.stateT >= this.stun) this.toIdle()
                break
            case "block":
                this.guarding = true
                if (this.stateT >= this.stun) this.toIdle()
                break
            case "attack":
                this.updateAttack(dt, opp, inp)
                break
            case "throw":
                this.updateThrow(opp)
                break
            case "recover":
                if (inp.dash && this.dashCd <= 0) this.startDash(inp, opp)
                else if (this.stateT >= this.stun) this.toIdle()
                break
            case "dash":
                this.updateDash(dt)
                break
            default:
                this.updateFree(dt, opp, inp)
        }

        // Laufbewegung (mit Beschleunigung) und Rückstoß (mit Reibung)
        const grip = this.match.map.grip
        if (this.state !== "idle" && this.state !== "run") {
            const f = Math.exp(-COMBAT.accel * 0.6 * dt)
            this.mvx *= f
            this.mvy *= f
        }
        this.x += (this.mvx + this.vx) * dt
        this.y += (this.mvy + this.vy) * dt
        const fr = Math.exp(-COMBAT.friction * grip * dt)
        this.vx *= fr
        this.vy *= fr
        this.clampToArena()
    }

    updateFree(dt, opp, inp) {
        if (inp.dash && this.dashCd <= 0) return this.startDash(inp, opp)
        if (this.bufHeavy > 0) return this.startAttack("heavy", 0, opp)
        if (this.bufLight > 0) return this.startAttack("light", 0, opp)
        if (inp.ability && this.tryAbility(opp)) return

        const dist = Math.abs(opp.x - this.x)
        const toOpp = Math.sign(opp.x - this.x) || this.facing
        const oppVisible = opp.stealthT <= 0 && opp.state !== "dead"

        // Rückwärts drücken = Blocken (wie in klassischen Arcade-Fightern)
        const holdingBack = inp.mx * toOpp < -0.3
        const near = dist < 420 && oppVisible
        if (holdingBack && near) {
            if (!this.wasGuarding) this.guardSince = this.match.time
            this.guarding = true
        }
        this.wasGuarding = this.guarding

        let speed = this.champ.speed * this.speedMul * (this.shieldT > 0 ? 0.85 : 1)
        if (this.guarding) speed *= 0.55
        const grip = this.match.map.grip
        const tx = inp.mx * speed
        const ty = inp.my * speed * 0.78 // Tiefe etwas langsamer = wirkt räumlicher
        const k = 1 - Math.exp(-COMBAT.accel * Math.max(0.3, grip) * dt)
        this.mvx += (tx - this.mvx) * k
        this.mvy += (ty - this.mvy) * k

        // Blickrichtung: zum Gegner, wenn er nah ist – sonst in Laufrichtung
        if (near) this.facing = toOpp
        else if (Math.abs(inp.mx) > 0.15) this.facing = Math.sign(inp.mx)

        this.moving = Math.hypot(this.mvx, this.mvy) > 40
        if (this.moving) {
            if (this.state !== "run") {
                this.state = "run"
                this.setAnim("run")
            }
            // Laufanimation passt sich dem Tempo an
            const rate = Math.hypot(this.mvx, this.mvy) / this.champ.speed
            this.animT += dt * (rate - 1) * 0.8
            this.dustT -= dt
            if (this.dustT <= 0 && this.stealthT <= 0) {
                this.dustT = 0.16
                this.match.fx.dust(this.x - this.facing * 16, this.y, { count: 1, size: 10, vx: -Math.sign(this.mvx || 1) * 40, color: this.match.map.dust })
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
        this.move = null
        this.moveKind = null
        this.setAnim("idle")
    }

    // ---------- Angriff ----------
    faceOpponent(opp, inp) {
        if (opp && opp.stealthT <= 0 && Math.abs(opp.x - this.x) > 4 && Math.abs(opp.x - this.x) < 600) this.facing = Math.sign(opp.x - this.x)
        else if (inp && Math.abs(inp.mx) > 0.2) this.facing = Math.sign(inp.mx)
    }

    // Nach oben/unten schlagen: Stick klar nach oben/unten – oder der Gegner steht deutlich darüber/darunter
    pickAim(opp, inp) {
        if (inp && Math.abs(inp.my) > 0.5 && Math.abs(inp.my) > Math.abs(inp.mx) * 1.2) return Math.sign(inp.my)
        if (!opp || opp.stealthT > 0 || opp.state === "dead") return 0
        const dx = Math.abs(opp.x - this.x)
        const dy = opp.y - this.y
        if (Math.abs(dy) > COMBAT.depthReach && Math.abs(dy) > dx * 0.8 && Math.abs(dy) < 280) return Math.sign(dy)
        return 0
    }

    lungeBy(amount) {
        if (this.aimY) this.vy += this.aimY * amount * 0.6
        else this.vx += this.facing * amount
    }

    startAttack(kind, step, opp) {
        const def = kind === "heavy" ? this.champ.heavy : this.champ.light[step]
        this.state = "attack"
        this.stateT = 0
        this.moveKind = kind
        this.comboStep = step
        this.move = def
        this.windowsDone = def.hits.map(() => false)
        this.spawned = false
        this.lunged = false
        this.landedThisSwing = false
        this.dodgedBy = false
        this.swingSound = false
        this.bufLight = 0
        this.bufHeavy = 0
        this.setAnim(kind === "heavy" ? "heavy" : "light" + step, def.anim)
        this.faceOpponent(opp, this.input)
        this.aimY = this.pickAim(opp, this.input)
        this.lungeBy(def.lunge * (kind === "heavy" ? 0.55 : 1))

        if (kind === "heavy") {
            this.flashT = 0.08
            this.match.sound("heavyCharge")
            this.match.fx.ring(this.x, this.y - 50, { radius: 70, color: "rgba(255,240,180,0.9)", life: 0.25, width: 5, ground: false })
        }

        // Angriff aus dem Schatten
        if (this.stealthT > 0) {
            this.stealthT = 0
            this.ambush = true
            this.match.fx.smoke(this.x, this.y, 12)
            this.match.sound("reveal")
        }
    }

    updateAttack(dt, opp, inp) {
        const def = this.move
        const frame = this.frame
        const isHeavy = this.moveKind === "heavy"

        // Ausfallschritt des schweren Angriffs kurz vor dem Treffer
        if (isHeavy && def.hits.length && frame === def.hits[0][0] - 1 && !this.lunged) {
            this.lunged = true
            this.lungeBy(def.lunge * 0.7)
        }

        // Schwung-Sound kurz vor dem ersten Treffer-Frame
        const firstActive = def.hits.length ? def.hits[0][0] : (def.projectile ? def.projectile.frame : def.zone.frame)
        if (!this.swingSound && frame >= firstActive - 1) {
            this.swingSound = true
            this.match.sound(def.projectile ? "fireball" : def.zone ? "ice" : "swing", { pitch: isHeavy ? 0.7 : 0.9 + this.comboStep * 0.2 })
        }

        // Projektil / Zauber auslösen
        if (!this.spawned && def.projectile && frame >= def.projectile.frame) {
            this.spawned = true
            this.match.spawnProjectile(this, def)
        }
        if (!this.spawned && def.zone && frame >= def.zone.frame) {
            this.spawned = true
            this.match.spawnZone(this, opp, def)
        }

        def.hits.forEach(([s, e], i) => {
            if (this.windowsDone[i]) return
            if (frame >= s && frame <= e) {
                if (this.match.tryHit(this, opp, def, i)) this.windowsDone[i] = true
            } else if (frame > e) {
                this.windowsDone[i] = true
            }
        })

        const lastActive = def.hits.length ? def.hits[def.hits.length - 1][1] : firstActive
        // Kombo-Abzweigungen nach dem letzten aktiven Frame
        if (frame > lastActive) {
            if (!isHeavy) {
                const nextLight = this.comboStep + 1 < this.champ.light.length
                if (this.bufHeavy > 0) return this.startAttack("heavy", 0, opp)
                if (this.bufLight > 0 && nextLight) return this.startAttack("light", this.comboStep + 1, opp)
            }
            if (inp.dash && this.dashCd <= 0 && this.landedThisSwing) return this.startDash(inp, opp)
        }

        if (this.animT * def.anim.fps >= def.anim.frames) {
            if (this.ambush && !this.landedThisSwing) this.ambush = false
            const lastLight = !isHeavy && this.comboStep >= this.champ.light.length - 1
            this.state = "recover"
            this.stateT = 0
            this.stun = def.recovery || (isHeavy ? COMBAT.heavyRecovery : lastLight ? 0.24 : COMBAT.recovery)
            if (this.landedThisSwing) this.stun *= 0.6
            this.comboStep = -1
            this.lunged = false
            this.setAnim("idle")
        }
    }

    updateThrow(opp) {
        if (this.castAt !== undefined && this.frame >= this.castAt && !this.castDone) {
            this.castDone = true
            if (this.castFn) this.castFn()
        }
        if (this.animT * this.anim.fps >= this.anim.frames) this.toIdle()
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
        this.state = "dash"
        this.stateT = 0
        this.iframes = COMBAT.dashIframes
        this.dashCd = COMBAT.dashCooldown
        this.ghostT = 0
        this.bufLight = 0
        this.bufHeavy = 0
        this.comboStep = -1
        this.mvx = 0
        this.mvy = 0
        this.setAnim("run")
        this.animT = 0.2
        this.match.sound("dash")
        this.match.fx.dust(this.x, this.y, { count: 6, size: 18, vx: -this.dashDir.x * 160, color: this.match.map.dust })
    }

    updateDash(dt) {
        const k = 1 - this.stateT / COMBAT.dashTime
        const sp = COMBAT.dashSpeed * this.speedMul * (0.45 + 0.55 * Math.max(0, k))
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
            // Schwung mitnehmen
            this.vx += this.dashDir.x * 160
        }
    }

    // ---------- Schaden ----------
    takeHit(source, dmg, kb, heavy, { stun = null } = {}) {
        this.hp = Math.max(0, this.hp - dmg)
        this.flashT = 0.12
        this.comboCount = 0
        this.comboDamage = 0
        this.bufLight = 0
        this.bufHeavy = 0
        this.move = null
        this.comboStep = -1
        this.ambush = false
        this.mvx *= 0.2
        this.mvy *= 0.2
        const dir = Math.sign(this.x - source.x) || -this.facing
        if (source.aimY) {
            // Treffer von oben/unten stößt in Tiefenrichtung weg
            this.vx = dir * kb * 0.25
            this.vy = source.aimY * kb * 0.6
        } else {
            this.vx = dir * kb
            this.vy = Math.max(-140, Math.min(140, (this.y - source.y) * 3))
        }
        if (this.hp <= 0) {
            this.state = "dead"
            this.stateT = 0
            this.setAnim("death")
            this.vx *= 1.6
            return
        }
        this.state = "hurt"
        this.stateT = 0
        this.stun = stun !== null ? stun : heavy ? COMBAT.heavyStun : COMBAT.hitstun
        this.setAnim("hurt")
        this.facing = -dir
    }

    // Treffer in die Deckung
    blockHit(source, dmg, kb) {
        const chip = Math.max(1, Math.round(dmg * COMBAT.chip))
        this.hp = Math.max(1, this.hp - chip)
        this.guard -= dmg * 6
        this.vx = (Math.sign(this.x - source.x) || -this.facing) * kb * 0.5
        this.state = "block"
        this.stateT = 0
        this.stun = COMBAT.blockstun
        this.mvx = 0
        this.mvy = 0
        if (this.champ.anims.block) this.setAnim("block")
        return chip
    }

    guardBreak() {
        this.guard = COMBAT.guardMax * 0.5
        this.state = "dizzy"
        this.stateT = 0
        this.stun = 0.9
        this.setAnim("hurt")
        this.animT = 0
    }

    gainEnergy(n = 1) {
        if (this.energy >= this.maxEnergy) return
        const wasReady = this.abilityReady
        this.energy = Math.min(this.maxEnergy, this.energy + n)
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
        this.energy = this.match.rules.infiniteEnergy && this.isHuman ? this.maxEnergy : 0
        this.stats.abilities++
        const fx = this.match.fx
        this.match.emit("ability", this)

        switch (ab.type) {
            case "shield":
                this.shieldT = ab.duration
                fx.ring(this.x, this.y - 40, { radius: 140, color: "rgba(140,200,255,0.9)", life: 0.45, width: 10, ground: false })
                this.match.sound("shield")
                this.match.callout(this, "SHIELD!", "#9fd0ff")
                break

            case "bomb": {
                const stacks = Math.min(spent, 5)
                const dmg = stacks >= 5 ? 36 : stacks >= 4 ? 24 : 12
                this.faceOpponent(opp, null)
                this.cast("light0", this.champ.light[0].anim, 2, () => {
                    this.match.throwBomb(this, opp, dmg, stacks)
                    this.match.sound("throw")
                })
                this.match.callout(this, stacks >= 5 ? "MEGA STACK!" : "DAMAGE STACK!", "#ffb35c")
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
                this.match.callout(this, "HEAL +" + ab.amount, "#7dff9b")
                break

            case "frenzy":
                this.frenzyT = ab.duration
                fx.ring(this.x, this.y, { radius: 130, color: "rgba(255,80,120,0.9)", life: 0.5, width: 10 })
                this.match.sound("frenzy")
                this.match.callout(this, "FRENZY!", "#ff6f91")
                break

            case "blink": {
                fx.smoke(this.x, this.y, 14, "rgba(150,220,255,0.6)")
                const side = Math.sign(opp.x - this.x) || this.facing
                this.x = opp.x + side * 110
                this.y = opp.y
                this.clampToArena()
                this.facing = -side
                this.iframes = 0.35
                this.mvx = this.mvy = this.vx = this.vy = 0
                fx.smoke(this.x, this.y, 14, "rgba(150,220,255,0.6)")
                fx.ring(this.x, this.y, { radius: 90, color: "rgba(150,220,255,0.9)", life: 0.35, width: 6 })
                this.match.sound("blink")
                break
            }

            case "quake":
                this.cast("heavy", this.champ.heavy.anim, 6, () => this.match.quake(this))
                this.match.callout(this, "SOUL QUAKE!", "#e8e0c8")
                break
        }
        return true
    }

    // Zauber-Animation, die bei einem bestimmten Frame etwas auslöst
    cast(name, animDef, atFrame, fn) {
        this.state = "throw"
        this.stateT = 0
        this.setAnim(name, animDef)
        this.castAt = atFrame
        this.castDone = false
        this.castFn = fn
        this.mvx = this.mvy = 0
    }

    updateAbilities(dt) {
        if (this.shieldT > 0) this.shieldT -= dt
        if (this.frenzyT > 0) {
            this.frenzyT -= dt
            if (Math.random() < dt * 14) this.match.fx.sparks(this.x, this.y - 50, Math.random() < 0.5 ? 1 : -1, { count: 1, color: "#ff6f91", color2: "#ff2a55", speed: 90, size: 5 })
        }
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
            this.hp = Math.min(this.maxHp, this.hp + amount)
            if (Math.random() < dt * 22) this.match.fx.heal(this.x, this.y)
        }
    }

    // ---------- Arena-Grenzen (vermessene Bodenform, siehe ARENA) ----------
    clampToArena() {
        const [x, y] = ARENA.clamp(this.x, this.y)
        // an der Mauer abprallen statt "kleben" – je Achse, damit man an der Wand entlanglaufen kann
        if (x !== this.x) {
            this.x = x
            this.vx *= -0.25
        }
        if (y !== this.y) {
            this.y = y
            this.vy *= -0.25
        }
    }

    // ---------- Zeichnen ----------
    stealthAlpha() {
        if (this.stealthT <= 0) return 1
        const seeSelf = this.isHuman && this.match.humanCount === 1
        const flicker = Math.sin(this.match.time * 30) > 0.6 ? 0.06 : 0
        return (seeSelf ? 0.32 : 0.05) + flicker
    }

    drawShadow(ctx) {
        const alpha = this.stealthT > 0 ? 0.15 : 1
        ctx.save()
        ctx.globalAlpha = alpha
        ctx.fillStyle = "rgba(20,10,5,0.35)"
        ctx.beginPath()
        ctx.ellipse(this.x, this.y + 2, 34, 11, 0, 0, Math.PI * 2)
        ctx.fill()

        if (this.state !== "dead" && !this.match.demo) {
            ctx.strokeStyle = SIDE_COLORS[this.side]
            ctx.globalAlpha = alpha * 0.85
            ctx.lineWidth = 3.5
            ctx.beginPath()
            ctx.ellipse(this.x, this.y + 2, 38, 13, 0, 0, Math.PI * 2)
            ctx.stroke()

            if (this.abilityReady) {
                const p = this.readyPulse % 1
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

        // Squash & Stretch
        if (this.state === "hurt" && this.stateT < 0.1) ctx.scale(1.1, 0.92)
        else if (this.state === "attack" && this.moveKind === "heavy" && this.frame < 2) ctx.scale(0.95, 1.05)
        else if (this.state === "dash") ctx.scale(1.08, 0.95)

        ctx.globalAlpha = alpha
        ctx.drawImage(img, frame * FRAME, 0, FRAME, FRAME, -g.ax, -g.ay, g.w, g.h)

        if (this.flashT > 0) {
            drawTintedFrame(ctx, img, frame, -g.ax, -g.ay, g.w, g.h, "#ffffff", Math.min(1, this.flashT / 0.06) * alpha)
        } else if (this.healLeft > 0) {
            drawTintedFrame(ctx, img, frame, -g.ax, -g.ay, g.w, g.h, "#6dff8e", 0.35 + Math.sin(this.match.time * 20) * 0.15)
        } else if (this.frenzyT > 0) {
            drawTintedFrame(ctx, img, frame, -g.ax, -g.ay, g.w, g.h, "#ff2a55", 0.22 + Math.sin(this.match.time * 16) * 0.1)
        } else if (this.ambush && this.state === "attack") {
            drawTintedFrame(ctx, img, frame, -g.ax, -g.ay, g.w, g.h, "#b48cff", 0.45)
        } else if (this.state === "dizzy") {
            drawTintedFrame(ctx, img, frame, -g.ax, -g.ay, g.w, g.h, "#fff1a0", 0.25 + Math.sin(this.match.time * 25) * 0.15)
        }

        // Deckung: halbtransparenter Schild vor der Figur
        if (this.guarding && this.state !== "block" && !this.champ.anims.block) {
            ctx.globalAlpha = 0.35 * alpha
            ctx.strokeStyle = "#bfe0ff"
            ctx.lineWidth = 4
            ctx.beginPath()
            ctx.ellipse(18, -40, 22, 40, 0, -1.2, 1.2)
            ctx.stroke()
        }
        ctx.restore()

        if (this.shieldT > 0) this.drawShield(ctx)
    }

    drawShield(ctx) {
        const t = this.match.time
        if (this.shieldT < 0.8 && Math.sin(t * 40) > 0) return
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
