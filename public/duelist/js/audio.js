// ============================================================
//  Sound – alle Effekte und die Musik werden live mit der
//  WebAudio-API erzeugt (keine Audiodateien nötig)
// ============================================================

const Sound = {
    ctx: null,
    master: null,
    sfxBus: null,
    musicBus: null,
    noiseBuffer: null,
    volumes: { master: 0.8, sfx: 0.9, music: 0.45 },
    muted: false,

    // Browser erlauben Audio erst nach einer Nutzeraktion
    unlock() {
        if (this.ctx) {
            if (this.ctx.state === "suspended") this.ctx.resume()
            return
        }
        const AC = window.AudioContext || window.webkitAudioContext
        if (!AC) return
        this.ctx = new AC()
        this.master = this.ctx.createGain()
        this.sfxBus = this.ctx.createGain()
        this.musicBus = this.ctx.createGain()

        // Leichter Kompressor, damit viele Treffer nicht übersteuern
        const comp = this.ctx.createDynamicsCompressor()
        comp.threshold.value = -14
        comp.ratio.value = 4
        this.sfxBus.connect(this.master)
        this.musicBus.connect(this.master)
        this.master.connect(comp)
        comp.connect(this.ctx.destination)

        const len = this.ctx.sampleRate * 1.5
        this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
        const data = this.noiseBuffer.getChannelData(0)
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1

        this.applyVolumes()
        if (Music.pending) Music.play(Music.pending)
    },

    setVolumes({ master, sfx, music }) {
        this.volumes = { master, sfx, music }
        this.applyVolumes()
    },

    applyVolumes() {
        if (!this.ctx) return
        const t = this.ctx.currentTime
        this.master.gain.setTargetAtTime(this.muted ? 0 : this.volumes.master, t, 0.03)
        this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.03)
        this.musicBus.gain.setTargetAtTime(this.volumes.music * 0.55, t, 0.03)
    },

    // ---------- Bausteine ----------
    tone(freq, dur, { type = "sine", vol = 0.3, slide = null, delay = 0, attack = 0.005, bus = null } = {}) {
        if (!this.ctx) return
        const t = this.ctx.currentTime + delay
        const osc = this.ctx.createOscillator()
        const g = this.ctx.createGain()
        osc.type = type
        osc.frequency.setValueAtTime(freq, t)
        if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(slide, 1), t + dur)
        g.gain.setValueAtTime(0.0001, t)
        g.gain.exponentialRampToValueAtTime(vol, t + attack)
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
        osc.connect(g)
        g.connect(bus || this.sfxBus)
        osc.start(t)
        osc.stop(t + dur + 0.05)
    },

    noise(dur, { vol = 0.3, freq = 1200, slide = null, type = "bandpass", q = 1, delay = 0, attack = 0.004, bus = null } = {}) {
        if (!this.ctx) return
        const t = this.ctx.currentTime + delay
        const src = this.ctx.createBufferSource()
        src.buffer = this.noiseBuffer
        const filter = this.ctx.createBiquadFilter()
        filter.type = type
        filter.Q.value = q
        filter.frequency.setValueAtTime(freq, t)
        if (slide) filter.frequency.exponentialRampToValueAtTime(slide, t + dur)
        const g = this.ctx.createGain()
        g.gain.setValueAtTime(0.0001, t)
        g.gain.exponentialRampToValueAtTime(vol, t + attack)
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
        src.connect(filter)
        filter.connect(g)
        g.connect(bus || this.sfxBus)
        src.start(t, Math.random())
        src.stop(t + dur + 0.05)
    },

    // ---------- Effekte ----------
    play(name, opt = {}) {
        if (!this.ctx || this.muted) return
        const fx = SFX[name]
        if (fx) fx(this, opt)
    }
}

const SFX = {
    swing: (s, { pitch = 1 }) => {
        s.noise(0.16, { vol: 0.22, freq: 700 * pitch, slide: 2600 * pitch, q: 2.5 })
    },
    hit: (s, { heavy = false }) => {
        s.tone(heavy ? 120 : 170, heavy ? 0.22 : 0.13, { vol: 0.6, slide: 45 })
        s.noise(heavy ? 0.18 : 0.09, { vol: heavy ? 0.55 : 0.4, freq: 2200, slide: 400, type: "lowpass" })
        s.tone(heavy ? 1600 : 2200, 0.05, { type: "square", vol: 0.06 })
        if (heavy) s.noise(0.35, { vol: 0.25, freq: 500, slide: 80, type: "lowpass", delay: 0.02 })
    },
    block: s => {
        s.tone(1180, 0.25, { type: "square", vol: 0.09 })
        s.tone(1760, 0.3, { type: "triangle", vol: 0.12 })
        s.noise(0.08, { vol: 0.3, freq: 5000, type: "highpass" })
    },
    dash: s => {
        s.noise(0.2, { vol: 0.2, freq: 3000, slide: 600, q: 1.2 })
    },
    whiff: s => {
        s.noise(0.1, { vol: 0.08, freq: 1500, slide: 3000, q: 3 })
    },
    throw: s => {
        s.tone(260, 0.3, { type: "triangle", vol: 0.18, slide: 620 })
        s.noise(0.25, { vol: 0.12, freq: 900, slide: 2000, q: 2 })
    },
    fuse: s => {
        s.noise(0.35, { vol: 0.08, freq: 6000, type: "highpass" })
    },
    explosion: s => {
        s.noise(1.0, { vol: 0.9, freq: 1400, slide: 60, type: "lowpass", q: 0.7 })
        s.tone(90, 0.7, { vol: 0.8, slide: 28 })
        s.noise(0.12, { vol: 0.4, freq: 4000, type: "highpass" })
    },
    heal: s => {
        [72, 76, 79, 84].forEach((m, i) => s.tone(midi(m), 0.35, { type: "sine", vol: 0.16, delay: i * 0.07 }))
        s.noise(0.6, { vol: 0.05, freq: 6000, type: "highpass", delay: 0.05 })
    },
    shield: s => {
        s.tone(330, 0.5, { type: "triangle", vol: 0.2, slide: 990 })
        s.tone(495, 0.6, { type: "sine", vol: 0.12, slide: 1480, delay: 0.04 })
        s.noise(0.5, { vol: 0.06, freq: 4000, type: "highpass" })
    },
    stealth: s => {
        s.noise(0.5, { vol: 0.25, freq: 2500, slide: 200, q: 3 })
        s.tone(600, 0.45, { type: "sine", vol: 0.1, slide: 120 })
    },
    reveal: s => {
        s.noise(0.25, { vol: 0.2, freq: 300, slide: 3000, q: 3 })
    },
    energy: s => {
        s.tone(880, 0.12, { type: "triangle", vol: 0.08 })
        s.tone(1320, 0.18, { type: "triangle", vol: 0.08, delay: 0.06 })
    },
    count: s => {
        s.tone(440, 0.18, { type: "square", vol: 0.12 })
        s.tone(220, 0.25, { type: "triangle", vol: 0.2 })
    },
    fight: s => {
        s.tone(880, 0.4, { type: "square", vol: 0.12 })
        s.tone(660, 0.45, { type: "sawtooth", vol: 0.08 })
        s.noise(0.5, { vol: 0.35, freq: 1500, slide: 200, type: "lowpass" })
        s.tone(110, 0.5, { vol: 0.5, slide: 50 })
    },
    ko: s => {
        s.tone(140, 1.2, { vol: 0.7, slide: 30 })
        s.noise(1.2, { vol: 0.6, freq: 900, slide: 50, type: "lowpass" })
        s.tone(523, 0.8, { type: "square", vol: 0.07, slide: 130, delay: 0.1 })
    },
    victory: s => {
        const notes = [67, 72, 76, 79, 84]
        notes.forEach((m, i) => s.tone(midi(m), i === notes.length - 1 ? 0.9 : 0.18, { type: "square", vol: 0.08, delay: i * 0.12 }))
        notes.forEach((m, i) => s.tone(midi(m - 12), 0.3, { type: "triangle", vol: 0.15, delay: i * 0.12 }))
    },
    defeat: s => {
        [64, 63, 62, 59].forEach((m, i) => s.tone(midi(m), 0.45, { type: "triangle", vol: 0.17, delay: i * 0.22 }))
    },
    heavyCharge: s => {
        s.tone(180, 0.22, { type: "sawtooth", vol: 0.08, slide: 420 })
        s.noise(0.2, { vol: 0.12, freq: 400, slide: 1800, q: 4 })
    },
    guard: s => {
        s.tone(620, 0.12, { type: "square", vol: 0.07, slide: 380 })
        s.noise(0.06, { vol: 0.2, freq: 3500, type: "highpass" })
    },
    perfect: s => {
        s.tone(1568, 0.25, { type: "triangle", vol: 0.16 })
        s.tone(2093, 0.35, { type: "sine", vol: 0.12, delay: 0.05 })
        s.noise(0.1, { vol: 0.25, freq: 6000, type: "highpass" })
    },
    guardBreak: s => {
        s.noise(0.5, { vol: 0.6, freq: 3000, slide: 200, type: "lowpass" })
        s.tone(300, 0.4, { type: "square", vol: 0.12, slide: 60 })
        s.tone(1200, 0.12, { type: "square", vol: 0.08, delay: 0.02 })
    },
    counter: s => {
        s.tone(880, 0.1, { type: "square", vol: 0.1 })
        s.tone(1320, 0.18, { type: "square", vol: 0.08, delay: 0.06 })
    },
    fireball: s => {
        s.noise(0.3, { vol: 0.28, freq: 600, slide: 2400, q: 1.5 })
        s.tone(220, 0.25, { type: "sawtooth", vol: 0.06, slide: 520 })
    },
    ice: s => {
        [2637, 3136, 3520].forEach((f, i) => s.tone(f, 0.25, { type: "sine", vol: 0.06, delay: i * 0.04 }))
        s.noise(0.4, { vol: 0.25, freq: 7000, slide: 2500, type: "highpass" })
    },
    blink: s => {
        s.tone(400, 0.25, { type: "sine", vol: 0.18, slide: 1800 })
        s.noise(0.2, { vol: 0.15, freq: 5000, type: "highpass" })
    },
    frenzy: s => {
        s.tone(110, 0.6, { type: "sawtooth", vol: 0.15, slide: 220 })
        s.noise(0.5, { vol: 0.3, freq: 800, slide: 300, q: 2 })
        s.tone(55, 0.6, { vol: 0.4 })
    },
    quake: s => {
        s.noise(1.1, { vol: 0.9, freq: 500, slide: 40, type: "lowpass" })
        s.tone(70, 0.9, { vol: 0.8, slide: 25 })
    },
    geyserWarn: s => {
        s.noise(0.7, { vol: 0.12, freq: 200, slide: 900, type: "lowpass" })
    },
    geyser: s => {
        s.noise(0.7, { vol: 0.55, freq: 1800, slide: 300, type: "bandpass", q: 0.6 })
        s.tone(120, 0.4, { vol: 0.35, slide: 50 })
    },
    coin: s => {
        s.tone(988, 0.08, { type: "square", vol: 0.08 })
        s.tone(1319, 0.35, { type: "square", vol: 0.08, delay: 0.08 })
    },
    score: s => s.tone(1760, 0.05, { type: "square", vol: 0.03 }),
    uiHover: s => s.tone(1400, 0.04, { type: "sine", vol: 0.04 }),
    uiClick: s => {
        s.tone(660, 0.08, { type: "square", vol: 0.06, slide: 990 })
    },
    uiBack: s => s.tone(500, 0.1, { type: "square", vol: 0.05, slide: 300 }),
    select: s => {
        s.tone(523, 0.12, { type: "square", vol: 0.07 })
        s.tone(784, 0.2, { type: "square", vol: 0.07, delay: 0.07 })
        s.noise(0.2, { vol: 0.1, freq: 3000, slide: 800 })
    }
}

function midi(m) {
    return 440 * Math.pow(2, (m - 69) / 12)
}

// ============================================================
//  Musik – kleiner Sequencer (Menü: ruhig, Kampf: treibend)
// ============================================================
const Music = {
    current: null,
    pending: null,
    timer: null,
    step: 0,
    nextTime: 0,
    gain: null,

    songs: {
        menu: {
            bpm: 84,
            chords: [[45, "m"], [41, "M"], [48, "M"], [43, "M"]],
            drums: false
        },
        battle: {
            bpm: 132,
            chords: [[45, "m"], [45, "m"], [41, "M"], [43, "M"], [45, "m"], [45, "m"], [40, "M"], [40, "M"]],
            drums: true
        }
    },

    play(name) {
        this.pending = name
        if (!Sound.ctx || this.current === name) return
        this.stop()
        this.current = name
        this.step = 0
        this.gain = Sound.ctx.createGain()
        this.gain.gain.setValueAtTime(0.0001, Sound.ctx.currentTime)
        this.gain.gain.exponentialRampToValueAtTime(1, Sound.ctx.currentTime + 1.2)
        this.gain.connect(Sound.musicBus)
        this.nextTime = Sound.ctx.currentTime + 0.1
        this.timer = setInterval(() => this.schedule(), 30)
    },

    stop() {
        if (this.timer) clearInterval(this.timer)
        this.timer = null
        if (this.gain && Sound.ctx) {
            const g = this.gain
            g.gain.setTargetAtTime(0.0001, Sound.ctx.currentTime, 0.15)
            setTimeout(() => g.disconnect(), 900)
        }
        this.gain = null
        this.current = null
    },

    schedule() {
        const song = this.songs[this.current]
        if (!song || !Sound.ctx) return
        const stepDur = 60 / song.bpm / 4
        while (this.nextTime < Sound.ctx.currentTime + 0.15) {
            this.playStep(song, this.step, this.nextTime, stepDur)
            this.nextTime += stepDur
            this.step++
        }
    },

    playStep(song, step, t, stepDur) {
        const s = step % 16
        const bar = Math.floor(step / 16) % song.chords.length
        const [root, kind] = song.chords[bar]
        const third = kind === "m" ? 3 : 4
        const tones = [0, third, 7, 12]
        const delay = t - Sound.ctx.currentTime
        const bus = this.gain

        if (song.drums) {
            if (s === 0 || s === 7 || s === 10) Sound.tone(150, 0.18, { vol: 0.55, slide: 40, delay, bus })
            if (s === 4 || s === 12) Sound.noise(0.14, { vol: 0.22, freq: 1800, type: "bandpass", q: 0.8, delay, bus })
            if (s % 2 === 0) Sound.noise(0.04, { vol: s % 4 === 2 ? 0.06 : 0.03, freq: 8000, type: "highpass", delay, bus })
            // Bass
            const bassPattern = [0, null, 0, 12, null, 0, 7, null, 0, null, 0, 12, 7, null, 3, null]
            const b = bassPattern[s]
            if (b !== null) {
                const interval = b === 3 ? third : b
                Sound.tone(midi(root - 12 + interval), stepDur * 1.6, { type: "sawtooth", vol: 0.07, delay, bus })
                Sound.tone(midi(root - 12 + interval), stepDur * 1.6, { type: "sine", vol: 0.16, delay, bus })
            }
            // Arpeggio
            if (Math.floor(step / 64) % 2 === 1) {
                const n = tones[(s * 3) % 4]
                Sound.tone(midi(root + 24 + n), stepDur * 0.9, { type: "square", vol: 0.025, delay, bus })
            }
        } else {
            if (s % 2 === 0) {
                const n = tones[(s / 2) % 4]
                Sound.tone(midi(root + 24 + n), stepDur * 3, { type: "triangle", vol: 0.07, delay, bus, attack: 0.02 })
            }
            if (s === 0) {
                Sound.tone(midi(root), stepDur * 16, { type: "sine", vol: 0.14, delay, bus, attack: 0.3 })
                Sound.tone(midi(root + 12 + third), stepDur * 16, { type: "triangle", vol: 0.03, delay, bus, attack: 0.5 })
            }
        }
    }
}
