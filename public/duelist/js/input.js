// ============================================================
//  Eingabe – Tastatur, Gamepad, Touch und Handy-Controller werden
//  zu einem einheitlichen "Controller" zusammengefasst.
//  Der Bot nutzt dieselbe Schnittstelle.
// ============================================================

const ACTIONS = ["light", "heavy", "dash", "ability"]

function emptyInput() {
    return { mx: 0, my: 0, light: false, heavy: false, dash: false, ability: false, lightHeld: false, pause: false }
}

const Keyboard = {
    down: new Set(),
    listeners: new Set(),

    init() {
        window.addEventListener("keydown", e => {
            if (Keyboard.blocksDefault(e)) e.preventDefault()
            if (e.repeat) return
            this.down.add(e.code)
            for (const l of this.listeners) l(e.code, e)
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
        this.latch = {}
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
        if (Keyboard.isDown(m.light)) out.lightHeld = true
    }

    destroy() {
        Keyboard.listeners.delete(this.onKey)
    }
}

// Standard-Belegung: A = leicht, X/RT = schwer, B/LB/LT = Ausweichen, Y/RB = Fähigkeit
function readPadButtons(pad) {
    const b = i => !!(pad.buttons[i] && pad.buttons[i].pressed)
    let x = pad.axes[0] || 0
    let y = pad.axes[1] || 0
    if (b(14)) x = -1
    if (b(15)) x = 1
    if (b(12)) y = -1
    if (b(13)) y = 1
    return {
        x, y,
        light: b(0),
        heavy: b(2) || b(7),
        dash: b(1) || b(4) || b(6),
        ability: b(3) || b(5),
        pause: b(9)
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
            const st = readPadButtons(pad)
            if (Math.hypot(st.x, st.y) > 0.25) {
                out.mx = st.x
                out.my = st.y
            }
            const prev = this.prev[pad.index] || {}
            for (const a of ACTIONS) if (st[a] && !prev[a]) out[a] = true
            if (st.pause && !prev.pause) out.pause = true
            if (st.light) out.lightHeld = true
            this.prev[pad.index] = st
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
        this.latch = {}
        this.held = { light: false }
        this.radius = 56

        this.zone.addEventListener("pointerdown", e => {
            if (this.stickId !== null) return
            this.stickId = e.pointerId
            this.zone.setPointerCapture(e.pointerId)
            const r = this.zone.getBoundingClientRect()
            this.center = { x: e.clientX - r.left, y: e.clientY - r.top }
            this.base.style.left = this.center.x + "px"
            this.base.style.top = this.center.y + "px"
            this.base.classList.add("active")
            this.zone.classList.add("touched")
            this.move(e)
            e.preventDefault()
        })
        this.zone.addEventListener("pointermove", e => {
            if (e.pointerId === this.stickId) this.move(e)
        })
        const up = e => {
            if (e.pointerId !== this.stickId) return
            this.release()
        }
        this.zone.addEventListener("pointerup", up)
        this.zone.addEventListener("pointercancel", up)

        for (const btn of root.querySelectorAll("[data-act]")) {
            const act = btn.dataset.act
            btn.addEventListener("pointerdown", e => {
                e.preventDefault()
                this.latch[act] = true
                if (act === "light") this.held.light = true
                btn.classList.add("pressed")
                if (act !== "pause" && GameSettings.get().vibration && navigator.vibrate) navigator.vibrate(8)
            })
            const release = () => {
                if (act === "light") this.held.light = false
                btn.classList.remove("pressed")
            }
            btn.addEventListener("pointerup", release)
            btn.addEventListener("pointercancel", release)
            btn.addEventListener("pointerleave", release)
        }
    }

    release() {
        this.stickId = null
        this.vec = { x: 0, y: 0 }
        this.knob.style.transform = "translate(-50%, -50%)"
        this.base.classList.remove("active")
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
        for (const a of ACTIONS) if (this.latch[a]) out[a] = true
        if (this.latch.pause) out.pause = true
        this.latch = {}
        if (this.held.light) out.lightHeld = true
    }

    reset() {
        this.release()
        this.latch = {}
        this.held.light = false
    }

    destroy() {}
}

// Fasst mehrere Quellen zusammen
class Controller {
    constructor(sources = []) {
        this.sources = sources
    }

    read() {
        const out = emptyInput()
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

// ============================================================
//  Menü-Navigation mit Gamepad, Pfeiltasten oder Handy-Controller
// ============================================================
const Nav = {
    prevPad: {},

    focusables() {
        const screen = document.querySelector(".screen.active")
        if (!screen) return []
        return Array.from(screen.querySelectorAll("button:not([disabled]), a[href], input, [tabindex='0']"))
            .filter(el => el.offsetParent !== null && !el.closest("[hidden]"))
    },

    move(dir) {
        const items = this.focusables()
        if (!items.length) return
        const cur = document.activeElement
        if (!items.includes(cur)) {
            items[0].focus()
            return
        }
        const a = cur.getBoundingClientRect()
        const ax = a.left + a.width / 2
        const ay = a.top + a.height / 2
        let best = null
        let bestScore = Infinity
        for (const el of items) {
            if (el === cur) continue
            const b = el.getBoundingClientRect()
            const dx = b.left + b.width / 2 - ax
            const dy = b.top + b.height / 2 - ay
            const main = dir === "left" ? -dx : dir === "right" ? dx : dir === "up" ? -dy : dy
            const side = dir === "left" || dir === "right" ? Math.abs(dy) : Math.abs(dx)
            if (main <= 4) continue
            const score = main + side * 2.2
            if (score < bestScore) {
                bestScore = score
                best = el
            }
        }
        if (best) {
            best.focus()
            best.scrollIntoView({ block: "nearest" })
            Sound.play("uiHover")
        }
    },

    confirm() {
        const el = document.activeElement
        if (el && el !== document.body && this.focusables().includes(el)) {
            if (el.type === "checkbox") el.click()
            else el.click()
        } else {
            const first = this.focusables()[0]
            if (first) first.focus()
        }
    },

    // Gamepads im Menü abfragen (im Kampf übernimmt der Controller)
    pollGamepads(onBack) {
        const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : []
        for (const pad of pads) {
            const st = readPadButtons(pad)
            const prev = this.prevPad[pad.index] || {}
            const dir = Math.abs(st.x) > 0.6 ? (st.x > 0 ? "right" : "left") : Math.abs(st.y) > 0.6 ? (st.y > 0 ? "down" : "up") : null
            if (dir && dir !== prev.dir) this.move(dir)
            if (st.light && !prev.light) this.confirm()
            if (st.dash && !prev.dash && onBack) onBack()
            this.prevPad[pad.index] = { ...st, dir }
        }
    }
}
