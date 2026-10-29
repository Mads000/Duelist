// ============================================================
//  Eingabe – Tastatur, Gamepad und Touch werden zu einem
//  einheitlichen "Controller" zusammengefasst. Der Bot nutzt
//  dieselbe Schnittstelle.
// ============================================================

const ACTIONS = ["attack", "ability", "dash"]

const Keyboard = {
    down: new Set(),
    listeners: new Set(),

    init() {
        window.addEventListener("keydown", e => {
            if (e.repeat) {
                if (Keyboard.blocksDefault(e)) e.preventDefault()
                return
            }
            this.down.add(e.code)
            for (const l of this.listeners) l(e.code)
            if (Keyboard.blocksDefault(e)) e.preventDefault()
        })
        window.addEventListener("keyup", e => this.down.delete(e.code))
        window.addEventListener("blur", () => this.down.clear())
    },

    // Im Kampf sollen Pfeiltasten/Leertaste nicht scrollen oder Buttons auslösen
    blocksDefault(e) {
        return document.body.classList.contains("in-game") &&
            ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(e.code)
    },

    isDown(codes) {
        return codes.some(c => this.down.has(c))
    }
}

class KeyboardSource {
    constructor(map) {
        this.map = map
        this.latch = { attack: false, ability: false, dash: false }
        this.onKey = code => {
            for (const a of ACTIONS) if (this.map[a].includes(code)) this.latch[a] = true
        }
        Keyboard.listeners.add(this.onKey)
    }

    read(out) {
        const m = this.map
        const x = (Keyboard.isDown(m.right) ? 1 : 0) - (Keyboard.isDown(m.left) ? 1 : 0)
        const y = (Keyboard.isDown(m.down) ? 1 : 0) - (Keyboard.isDown(m.up) ? 1 : 0)
        if (x || y) {
            out.mx = x
            out.my = y
        }
        for (const a of ACTIONS) {
            if (this.latch[a]) out[a] = true
            this.latch[a] = false
        }
        if (Keyboard.isDown(m.attack)) out.attackHeld = true
    }

    destroy() {
        Keyboard.listeners.delete(this.onKey)
    }
}

class GamepadSource {
    // index = Nummer des Gamepads, "any" = jedes angeschlossene
    constructor(index) {
        this.index = index
        this.prev = {}
    }

    pads() {
        const list = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : []
        if (this.index === "any") return list
        return list.filter(p => p.index === this.index)
    }

    read(out) {
        for (const pad of this.pads()) {
            const b = i => pad.buttons[i] && pad.buttons[i].pressed
            let x = pad.axes[0] || 0
            let y = pad.axes[1] || 0
            if (b(14)) x = -1
            if (b(15)) x = 1
            if (b(12)) y = -1
            if (b(13)) y = 1
            if (Math.hypot(x, y) > 0.25) {
                out.mx = x
                out.my = y
            }
            const state = {
                attack: b(0) || b(2) || b(7),
                dash: b(1) || b(4) || b(6),
                ability: b(3) || b(5),
                pause: b(9)
            }
            const key = pad.index
            const prev = this.prev[key] || {}
            for (const a of ACTIONS) if (state[a] && !prev[a]) out[a] = true
            if (state.pause && !prev.pause) out.pause = true
            if (state.attack) out.attackHeld = true
            this.prev[key] = state
        }
    }

    destroy() {}
}

// ---------------- Touch: schwebender Joystick + Buttons ----------------
class TouchSource {
    constructor(root) {
        this.root = root
        this.zone = root.querySelector(".stick-zone")
        this.base = root.querySelector(".stick-base")
        this.knob = root.querySelector(".stick-knob")
        this.vec = { x: 0, y: 0 }
        this.stickId = null
        this.center = { x: 0, y: 0 }
        this.latch = { attack: false, ability: false, dash: false }
        this.held = { attack: false }
        this.radius = 56

        this.onDown = e => {
            if (this.stickId !== null) return
            this.stickId = e.pointerId
            this.zone.setPointerCapture(e.pointerId)
            const r = this.zone.getBoundingClientRect()
            this.center = { x: e.clientX - r.left, y: e.clientY - r.top }
            this.base.style.left = this.center.x + "px"
            this.base.style.top = this.center.y + "px"
            this.base.classList.add("active")
            this.move(e)
            e.preventDefault()
        }
        this.onMove = e => {
            if (e.pointerId !== this.stickId) return
            this.move(e)
        }
        this.onUp = e => {
            if (e.pointerId !== this.stickId) return
            this.stickId = null
            this.vec = { x: 0, y: 0 }
            this.knob.style.transform = "translate(-50%, -50%)"
            this.base.classList.remove("active")
        }
        this.zone.addEventListener("pointerdown", this.onDown)
        this.zone.addEventListener("pointermove", this.onMove)
        this.zone.addEventListener("pointerup", this.onUp)
        this.zone.addEventListener("pointercancel", this.onUp)

        this.buttons = []
        for (const btn of root.querySelectorAll("[data-act]")) {
            const act = btn.dataset.act
            const down = e => {
                e.preventDefault()
                this.latch[act] = true
                if (act === "attack") this.held.attack = true
                btn.classList.add("pressed")
                if (act !== "pause" && GameSettings.get().vibration && navigator.vibrate) navigator.vibrate(8)
            }
            const up = () => {
                if (act === "attack") this.held.attack = false
                btn.classList.remove("pressed")
            }
            btn.addEventListener("pointerdown", down)
            btn.addEventListener("pointerup", up)
            btn.addEventListener("pointercancel", up)
            btn.addEventListener("pointerleave", up)
            this.buttons.push({ btn, down, up })
        }
    }

    move(e) {
        const r = this.zone.getBoundingClientRect()
        let dx = e.clientX - r.left - this.center.x
        let dy = e.clientY - r.top - this.center.y
        const len = Math.hypot(dx, dy)
        // Basis wandert mit, wenn man weit über den Rand zieht
        if (len > this.radius * 1.6) {
            const k = (len - this.radius * 1.6) / len
            this.center.x += dx * k
            this.center.y += dy * k
            this.base.style.left = this.center.x + "px"
            this.base.style.top = this.center.y + "px"
            dx -= dx * k
            dy -= dy * k
        }
        const l = Math.hypot(dx, dy)
        const clamped = Math.min(l, this.radius)
        const nx = l ? dx / l : 0
        const ny = l ? dy / l : 0
        this.knob.style.transform = `translate(calc(-50% + ${nx * clamped}px), calc(-50% + ${ny * clamped}px))`
        const strength = clamped / this.radius
        this.vec = strength < 0.18 ? { x: 0, y: 0 } : { x: nx * Math.min(1, strength * 1.25), y: ny * Math.min(1, strength * 1.25) }
    }

    read(out) {
        if (this.vec.x || this.vec.y) {
            out.mx = this.vec.x
            out.my = this.vec.y
        }
        for (const a of ACTIONS) {
            if (this.latch[a]) out[a] = true
            this.latch[a] = false
        }
        if (this.latch.pause) out.pause = true
        this.latch.pause = false
        if (this.held.attack) out.attackHeld = true
    }

    reset() {
        this.onUp({ pointerId: this.stickId })
        for (const k in this.latch) this.latch[k] = false
        this.held.attack = false
    }

    destroy() {}
}

// Fasst mehrere Quellen zusammen
class Controller {
    constructor(sources = []) {
        this.sources = sources
    }

    read() {
        const out = { mx: 0, my: 0, attack: false, ability: false, dash: false, attackHeld: false, pause: false }
        for (const s of this.sources) s.read(out)
        const len = Math.hypot(out.mx, out.my)
        if (len > 1) {
            out.mx /= len
            out.my /= len
        }
        return out
    }

    destroy() {
        for (const s of this.sources) if (s.destroy) s.destroy()
    }
}

const isTouchDevice = () =>
    window.matchMedia("(pointer: coarse)").matches || ("ontouchstart" in window && navigator.maxTouchPoints > 0)
