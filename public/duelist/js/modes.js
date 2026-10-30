// ============================================================
//  Spielmodi – Arcade (Leiter + Endboss), Survival, Training,
//  freies Duell gegen Bot und lokales Duell
// ============================================================

const ARCADE_DIFFS = ["easy", "normal", "normal", "hard", "hard", "nightmare"]
const ARCADE_MAPS = ["sky", "classic", "frost", "volcano", "sky", "frost"]

function shuffle(list) {
    const a = [...list]
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]]
    }
    return a
}

const Modes = {
    run: null,   // laufender Arcade-/Survival-Durchgang

    begin(mode) {
        App.config.mode = mode
        if (mode === "arcade") return this.startArcade()
        if (mode === "survival") return this.startSurvival()
        if (mode === "story") return this.startStory()
        this.run = null
        const c = App.config
        const map = c.map && c.map !== "random" ? c.map : MAP_ORDER[Math.floor(Math.random() * MAP_ORDER.length)]
        if (mode === "training") {
            App.startMatch({
                rules: { mode: "training", map, rounds: 1, roundTime: Infinity, infiniteEnergy: true, vs: false },
                champs: [c.champs[0], c.champs[1] || "warbrute"],
                opponent: ["easy", "normal"].includes(c.dummy) ? { difficulty: c.dummy } : { dummy: c.dummy || "stand" }
            })
            return
        }
        const s = GameSettings.get()
        App.startMatch({
            rules: { mode, map, rounds: s.rounds, roundTime: s.roundTime, chaos: !!c.chaos, vs: true },
            champs: [...c.champs],
            opponent: mode === "solo" ? { difficulty: c.difficulty } : null
        })
    },

    // Nochmal: im laufenden Durchgang die aktuelle Stufe wiederholen, sonst neu beginnen
    restart() {
        if (this.run && !this.run.over) {
            this.run.score = this.run.stageStartScore
            return this.startStage()
        }
        if (App.config.mode === "solo" && App.config.randomOpp) App.config.champs[1] = pickRandomChamp([App.config.champs[0]])
        this.begin(App.config.mode)
    },

    showsScore() {
        return !!this.run && this.run.mode !== "story"
    },

    score() {
        return this.run ? this.run.score : 0
    },

    addScore(n) {
        if (!this.run || n <= 0) return
        this.run.score += Math.round(n)
        UI.setScore(this.run.score)
    },

    // Punkte aus dem Match-Geschehen (nur Arcade & Survival)
    onEvent(type, data, match) {
        if (!this.run) return
        const human = f => f && f.side === 0
        if (type === "hit" && human(data.att)) this.addScore(data.dmg * 10)
        if (type === "counter" && human(data.att)) this.addScore(200)
        if (type === "perfectBlock" && human(data.def)) this.addScore(300)
        if (type === "guardBreak" && human(data.att)) this.addScore(250)
        if (type === "finisher" && human(data.winner) && data.name !== "K.O.") this.addScore(1500)
        if (type === "roundWin" && data.side === 0) {
            const hpPct = Math.round(data.hp / data.maxHp * 100)
            this.addScore(1000 + hpPct * 20 + Math.max(0, Math.ceil(data.timeLeft)) * 25 + (data.perfect ? 5000 : 0))
        }
    },

    // ---------------- Arcade ----------------
    startArcade() {
        const champ = App.config.champs[0]
        const pool = shuffle(playableChampions().filter(id => id !== champ && !CHAMPIONS[id].boss))
        const opponents = pool.slice(0, 6)
        const ladder = opponents.map((id, i) => ({ champ: id, diff: ARCADE_DIFFS[i] || "hard", map: ARCADE_MAPS[i] || "sky" }))
        ladder.push({ champ: "gravelord", diff: "nightmare", map: "volcano", boss: true })
        this.run = { mode: "arcade", champ, ladder, stage: 0, score: 0, stageStartScore: 0, continues: 0, over: false }
        this.showArcadeLadder()
    },

    showArcadeLadder() {
        const r = this.run
        const s = r.ladder[r.stage]
        const boss = s.boss
        UI.showLadder({
            title: boss ? "ENDBOSS" : `STAGE ${r.stage + 1}`,
            steps: r.ladder,
            current: r.stage,
            info: boss
                ? `<b>${CHAMPIONS.gravelord.name} – ${CHAMPIONS.gravelord.title}</b><br>Er hat jeden Verrat gesät. Besiege ihn, um die Arena zu befreien.`
                : `<b>${CHAMPIONS[s.champ].name}</b> · ${DIFFICULTIES[s.diff].name} · ${MAPS[s.map].name}<br>Punkte: ${r.score.toLocaleString("de-DE")}${r.continues ? ` · Continues: ${r.continues}` : ""}`
        })
        App.setState("ladder")
    },

    // ---------------- Story ----------------
    startStory() {
        const champ = App.config.champs[0]
        const story = STORY[champ] || STORY.vanguard
        const chapters = story.chapters.map(c => ({ champ: c.opp, diff: c.diff, map: c.map, title: c.title, text: c.text }))
        if (story.boss) chapters.push({ champ: "gravelord", diff: "nightmare", map: "volcano", title: "Der Knochenkönig", text: story.boss, boss: true })
        this.run = { mode: "story", champ, ladder: chapters, stage: 0, score: 0, stageStartScore: 0, over: false, story }
        this.showStoryChapter()
    },

    showStoryChapter() {
        const r = this.run
        const s = r.ladder[r.stage]
        UI.showLadder({
            title: s.boss ? "FINALE" : `KAPITEL ${r.stage + 1}`,
            steps: r.ladder,
            current: r.stage,
            info: `<b>${s.title}</b> · gegen ${CHAMPIONS[s.champ].name}<br><span class="story-text">${s.text}</span>`
        })
        App.setState("ladder")
    },

    // ---------------- Survival ----------------
    startSurvival() {
        this.run = { mode: "survival", champ: App.config.champs[0], wins: 0, score: 0, stageStartScore: 0, hp: null, over: false }
        this.nextSurvivalOpponent()
    },

    nextSurvivalOpponent() {
        const r = this.run
        const n = r.wins + 1
        const boss = n % 5 === 0
        const diff = r.wins < 2 ? "easy" : r.wins < 4 ? "normal" : r.wins < 7 ? "hard" : "nightmare"
        r.current = {
            champ: boss ? "gravelord" : pickRandomChamp([]),
            diff,
            map: MAP_ORDER[Math.floor(Math.random() * MAP_ORDER.length)],
            boss
        }
        const maxHp = CHAMPIONS[r.champ].hp
        const hp = r.hp === null ? maxHp : r.hp
        UI.showLadder({
            title: `GEGNER #${n}`,
            steps: [r.current],
            current: 0,
            info: `<b>${CHAMPIONS[r.current.champ].name}</b> · ${DIFFICULTIES[diff].name}${boss ? " · BOSS" : ""}<br>Dein Leben: ${Math.ceil(hp)} / ${maxHp} · Siege: ${r.wins} · Punkte: ${r.score.toLocaleString("de-DE")}`
        })
        App.setState("ladder")
    },

    // ---------------- Gemeinsam ----------------
    ladderGo() {
        if (!this.run) return
        this.run.stageStartScore = this.run.score
        this.startStage()
    },

    startStage() {
        const r = this.run
        if (r.mode === "story") {
            const s = r.ladder[r.stage]
            App.startMatch({
                rules: { mode: "story", map: s.map, rounds: 3, roundTime: 60, vs: true, stage: s.boss ? "FINALE" : `KAPITEL ${r.stage + 1}` },
                champs: [r.champ, s.champ],
                opponent: { difficulty: s.diff }
            })
            return
        }
        if (r.mode === "arcade") {
            const s = r.ladder[r.stage]
            App.startMatch({
                rules: {
                    mode: "arcade", map: s.map, rounds: 3, roundTime: 60, vs: true,
                    stage: s.boss ? "ENDBOSS" : `STAGE ${r.stage + 1}/${r.ladder.length - 1}`
                },
                champs: [r.champ, s.champ],
                opponent: { difficulty: s.diff }
            })
        } else {
            const s = r.current
            App.startMatch({
                rules: { mode: "survival", map: s.map, rounds: 1, roundTime: 60, vs: true, stage: `GEGNER #${r.wins + 1}`, hp: [r.hp, null] },
                champs: [r.champ, s.champ],
                opponent: { difficulty: s.diff }
            })
        }
    },

    // true = Modus kümmert sich selbst um den nächsten Bildschirm
    onMatchEnd(match, winner) {
        const r = this.run
        if (!r) return false
        const won = winner === 0

        if (r.mode === "story") {
            if (won) {
                r.stage++
                if (r.stage >= r.ladder.length) {
                    r.over = true
                    PlayerRecord.data.storyClears = [...new Set([...(PlayerRecord.data.storyClears || []), r.champ])]
                    PlayerRecord.save()
                    App.setState("results")
                    UI.showResults(match, winner, { title: "ENDE", sub: r.story.ending, note: `Story von ${CHAMPIONS[r.champ].name} abgeschlossen`, rematch: "Nochmal" })
                } else {
                    this.showStoryChapter()
                }
            } else {
                UI.showContinue(() => this.showStoryChapter(), () => {
                    r.over = true
                    App.setState("results")
                    UI.showResults(match, winner, { title: "NIEDERLAGE", sub: `Kapitel ${r.stage + 1}: ${r.ladder[r.stage].title}`, rematch: "Kapitel wiederholen" })
                })
                App.setState("continue")
            }
            return true
        }

        if (r.mode === "arcade") {
            if (won) {
                this.addScore(2000 * (r.stage + 1))
                r.stage++
                if (r.stage >= r.ladder.length) {
                    r.over = true
                    const fresh = PlayerRecord.unlock("gravelord")
                    PlayerRecord.data.arcadeClears++
                    PlayerRecord.save()
                    this.finishRun(match, winner, {
                        title: "ARCADE GESCHAFFT!",
                        sub: `${CHAMPIONS[r.champ].name} hat die Arena befreit!`,
                        note: fresh ? "👑 Neuer Champion freigeschaltet: Gravelord!" : `Arcade ${PlayerRecord.data.arcadeClears}× geschafft`
                    })
                } else {
                    this.showArcadeLadder()
                }
            } else {
                UI.showContinue(() => {
                    r.continues++
                    r.score = 0
                    this.showArcadeLadder()
                }, () => {
                    r.over = true
                    this.finishRun(match, winner, { title: "GAME OVER", sub: `Stage ${r.stage + 1} · ${CHAMPIONS[r.ladder[r.stage].champ].name}` })
                })
                App.setState("continue")
            }
            return true
        }

        // Survival
        const me = match.fighters[0]
        if (won) {
            r.wins++
            this.addScore(1500 * r.wins)
            r.hp = Math.min(me.maxHp, me.hp + me.maxHp * 0.3)
            this.nextSurvivalOpponent()
        } else {
            r.over = true
            this.finishRun(match, winner, { title: "GAME OVER", sub: `${r.wins} Gegner besiegt` })
        }
        return true
    },

    // Highscore eintragen (falls gut genug), dann Ergebnis zeigen
    finishRun(match, winner, info) {
        const r = this.run
        const mode = r.mode
        const rank = PlayerRecord.rankFor(mode, r.score)
        const showResults = () => {
            App.setState("results")
            UI.showResults(match, winner, {
                ...info,
                note: [info.note, `Punkte: ${r.score.toLocaleString("de-DE")}`].filter(Boolean).join(" · "),
                rematch: "Nochmal"
            })
        }
        if (rank >= 0) {
            App.setState("entry")
            UI.showEntry(r.score, rank === 0 ? "NEUER REKORD!" : `PLATZ ${rank + 1}!`, name => {
                const entry = { name, score: r.score, champ: r.champ, detail: mode === "survival" ? `${r.wins} Siege` : r.stage >= r.ladder.length ? "geschafft" : `Stage ${r.stage + 1}` }
                PlayerRecord.addHighscore(mode, entry)
                showResults()
            })
        } else {
            showResults()
        }
    }
}
