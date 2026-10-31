// ============================================================
//  Profile – "Wer spielt?", PIN, Verwalten und Übertragen.
//  Übertragen geht direkt von Gerät zu Gerät (PeerJS + QR-Code)
//  oder per Spielstand-Code zum Kopieren – ganz ohne Server.
// ============================================================

const PROFILE_PREFIX = "duelist2-p-"
const SAVE_PREFIX = "DUELIST1:"

// Spielstand als Text verpacken (UTF-8-sicher)
function packProfile(p, record) {
    const json = JSON.stringify({ n: p.name, p: p.pin, r: record })
    return SAVE_PREFIX + btoa(unescape(encodeURIComponent(json)))
}

function unpackProfile(text) {
    const raw = String(text || "").trim()
    if (!raw.startsWith(SAVE_PREFIX)) return null
    try {
        const d = JSON.parse(decodeURIComponent(escape(atob(raw.slice(SAVE_PREFIX.length)))))
        return d && d.r && typeof d.r === "object" ? d : null
    } catch (e) {
        return null
    }
}

// Empfangenes Profil anlegen und gleich aktivieren
function importProfile(d) {
    const p = Profiles.create(d.n, { pin: d.p || "", pinIsHash: true, record: { ...emptyRecord(), ...d.r } })
    Profiles.switchTo(p.id)
    Sound.play("coin")
    UI.toast(`Profil „${p.name}“ übernommen!`)
    return p
}

const ProfileSync = {
    peer: null,
    conn: null,

    close() {
        if (this.conn) this.conn.close()
        if (this.peer) this.peer.destroy()
        this.peer = null
        this.conn = null
    },

    async libs(qr = false) {
        await loadScript(PEER_LIB)
        if (qr) await loadScript(QR_LIB)
    },

    url(code) {
        const local = !location.protocol.startsWith("http") || ["localhost", "127.0.0.1"].includes(location.hostname)
        const base = local ? ONLINE_URL : new URL("./", location.href).href
        return base + "?profile=" + code
    },

    // Dieses Gerät gibt das aktive Profil ab
    async send(onState) {
        this.close()
        onState({ status: "loading" })
        try {
            await this.libs(true)
        } catch (e) {
            return onState({ status: "error", text: "Keine Internetverbindung – zum Übertragen wird kurz Internet benötigt. Nimm sonst den Spielstand-Code." })
        }
        const code = makeCode()
        const peer = new Peer(PROFILE_PREFIX + code.toLowerCase())
        this.peer = peer
        peer.on("open", () => {
            const qr = qrcode(0, "M")
            qr.addData(this.url(code))
            qr.make()
            onState({ status: "ready", code, qr: qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true }) })
        })
        peer.on("connection", conn => {
            conn.on("open", () => {
                conn.send({ t: "profile", data: packProfile(Profiles.current(), PlayerRecord.data) })
                onState({ status: "done" })
                setTimeout(() => this.close(), 1500)
            })
        })
        peer.on("error", err => {
            if (err.type === "unavailable-id") return this.send(onState)
            onState({ status: "error", text: "Verbindungsdienst nicht erreichbar (" + err.type + ")." })
        })
    },

    // Dieses Gerät holt ein Profil von einem anderen
    async receive(code, onState) {
        code = String(code || "").trim().toUpperCase()
        if (code.length !== 4) return onState({ status: "error", text: "Der Code hat 4 Zeichen." })
        this.close()
        onState({ status: "loading" })
        try {
            await this.libs()
        } catch (e) {
            return onState({ status: "error", text: "Keine Internetverbindung – zum Übertragen wird kurz Internet benötigt." })
        }
        const peer = new Peer()
        this.peer = peer
        peer.on("open", () => {
            const conn = peer.connect(PROFILE_PREFIX + code.toLowerCase(), { reliable: true })
            this.conn = conn
            conn.on("data", msg => {
                const d = msg && msg.t === "profile" && unpackProfile(msg.data)
                if (!d) return
                importProfile(d)
                onState({ status: "done" })
                this.close()
            })
        })
        peer.on("error", err => {
            onState({ status: "error", text: err.type === "peer-unavailable" ? "Kein Gerät mit diesem Code gefunden." : "Verbindung fehlgeschlagen (" + err.type + ")." })
        })
    }
}

// ---------------- Bildschirm "Wer spielt?" ----------------
const ProfileUI = {
    panel: null, // null | { mode, id }

    open(panel = null) {
        this.panel = panel
        UI.show("profiles")
    },

    render() {
        const grid = $("#profileGrid")
        const cur = Profiles.data.current
        grid.innerHTML = Profiles.data.list.map(p => {
            const s = Profiles.summary(p.id)
            const r = Shop.rank(s.rp)
            return `<button class="profile-card glass${p.id === cur ? " on" : ""}" data-id="${p.id}">
                <span class="pf-avatar">${p.name.slice(0, 1).toUpperCase()}</span>
                <b>${p.name}${p.pin ? ' <i class="pf-lock">🔒</i>' : ""}</b>
                <span class="pf-meta">Level ${s.level} · <span class="gold-coin"></span>${s.gold}</span>
                <span class="rank-badge" style="--rank:${r.color}">${r.name}</span>
                ${p.id === cur ? '<span class="pf-active">Aktiv</span>' : ""}
            </button>`
        }).join("")
        for (const card of $$(".profile-card", grid)) card.addEventListener("click", () => this.pick(card.dataset.id))
        this.renderPanel()
    },

    pick(id) {
        if (id === Profiles.data.current) return this.enter()
        const p = Profiles.get(id)
        if (p.pin) {
            this.panel = { mode: "pin", id }
            return this.renderPanel()
        }
        this.login(id)
    },

    login(id) {
        Profiles.switchTo(id)
        ProfileSync.close()
        Sound.play("select")
        UI.toast(`Willkommen, ${playerName()}!`)
        this.enter()
    },

    enter() {
        this.panel = null
        App.setState("menu")
        UI.show("menu")
    },

    renderPanel() {
        const box = $("#profilePanel")
        const pn = this.panel
        box.hidden = !pn
        if (!pn) {
            box.innerHTML = ""
            return
        }
        const me = Profiles.current()
        const pinInput = (id = "pfPin") => `<input class="pf-input" id="${id}" type="password" inputmode="numeric" maxlength="4" placeholder="••••" autocomplete="off">`
        const html = {
            pin: () => `<h3>PIN für ${Profiles.get(pn.id).name}</h3>
                <div class="pf-row">${pinInput()}<button class="btn start" data-act="unlock">Einloggen</button></div>
                <p class="pf-msg" id="pfMsg"></p>`,
            new: () => `<h3>Neues Profil</h3>
                <div class="pf-row"><input class="pf-input" id="pfName" maxlength="14" placeholder="Name" autocomplete="off"></div>
                <div class="pf-row"><span>PIN (optional, 4 Ziffern)</span>${pinInput()}</div>
                <div class="pf-row"><button class="btn start" data-act="create">Profil erstellen</button></div>
                <p class="pf-msg" id="pfMsg"></p>`,
            manage: () => `<h3>Profil „${me.name}“ verwalten</h3>
                <div class="pf-row"><input class="pf-input" id="pfName" maxlength="14" value="${me.name}"><button class="btn" data-act="rename">Umbenennen</button></div>
                <div class="pf-row">${pinInput()}<button class="btn" data-act="setpin">${me.pin ? "PIN ändern" : "PIN setzen"}</button>${me.pin ? '<button class="btn" data-act="clearpin">PIN entfernen</button>' : ""}</div>
                <div class="pf-row"><button class="btn start" data-act="send">📱 Auf anderes Gerät übertragen</button><button class="btn" data-act="export">Spielstand-Code</button></div>
                <div class="pf-row"><button class="btn danger" data-act="delete">Profil löschen</button></div>
                <p class="pf-msg" id="pfMsg"></p>`,
            send: () => `<h3>Profil „${me.name}“ übertragen</h3>
                <div class="pf-send"><div class="qr" id="pfQr"><span class="dark">…</span></div>
                <div><p>Auf dem anderen Gerät: QR-Code scannen – oder dort unter <b>Profile → Profil empfangen</b> diesen Code eingeben:</p>
                <div class="pf-code" id="pfCode">····</div><p class="pf-msg" id="pfMsg">Verbinde …</p></div></div>`,
            export: () => `<h3>Spielstand-Code von „${me.name}“</h3>
                <p>Kopier den Code und füg ihn auf dem anderen Gerät unter <b>Profil empfangen</b> ein. Funktioniert auch ohne Internet.</p>
                <textarea class="pf-text" id="pfText" readonly>${packProfile(me, PlayerRecord.data)}</textarea>
                <div class="pf-row"><button class="btn start" data-act="copy">Kopieren</button></div>
                <p class="pf-msg" id="pfMsg"></p>`,
            receive: () => `<h3>Profil empfangen</h3>
                <div class="pf-row"><input class="pf-input" id="pfCodeIn" maxlength="4" placeholder="CODE" autocomplete="off" value="${pn.code || ""}"><button class="btn start" data-act="join">Verbinden</button></div>
                <p>…oder Spielstand-Code einfügen:</p>
                <textarea class="pf-text" id="pfText" placeholder="DUELIST1:…"></textarea>
                <div class="pf-row"><button class="btn" data-act="import">Importieren</button></div>
                <p class="pf-msg" id="pfMsg"></p>`
        }[pn.mode]
        box.innerHTML = html() + `<button class="pf-close" data-act="close" aria-label="Schließen">✕</button>`
        for (const b of $$("[data-act]", box)) b.addEventListener("click", () => this.action(b.dataset.act))
        for (const input of $$("input", box)) input.addEventListener("keydown", e => {
            if (e.key !== "Enter") return
            const main = $(".btn.start", box)
            if (main) main.click()
        })
        const first = $("input:not([readonly]), textarea:not([readonly])", box)
        if (first && !isTouchDevice()) setTimeout(() => first.focus(), 30)
        if (pn.mode === "send") ProfileSync.send(st => this.sendState(st))
        if (pn.mode === "receive" && pn.code && pn.auto) {
            pn.auto = false
            this.action("join")
        }
    },

    msg(text, ok = false) {
        const el = $("#pfMsg")
        if (!el) return
        el.textContent = text
        el.classList.toggle("ok", ok)
    },

    sendState(st) {
        if (!this.panel || this.panel.mode !== "send") return
        if (st.status === "ready") {
            $("#pfQr").innerHTML = st.qr
            $("#pfCode").textContent = st.code
            this.msg("Warte auf das andere Gerät …")
        } else if (st.status === "done") {
            this.msg("✔ Übertragen! Das Profil ist jetzt auch auf dem anderen Gerät.", true)
            Sound.play("coin")
        } else if (st.status === "error") this.msg(st.text)
    },

    action(act) {
        const pn = this.panel
        const val = id => ($("#" + id) || {}).value || ""
        const pin = val("pfPin").trim()
        const pinOk = () => {
            if (/^\d{4}$/.test(pin)) return true
            this.msg("Die PIN besteht aus 4 Ziffern.")
            return false
        }
        switch (act) {
            case "close":
                ProfileSync.close()
                this.panel = null
                return this.renderPanel()
            case "unlock":
                if (Profiles.checkPin(pn.id, pin)) return this.login(pn.id)
                Sound.play("uiBack")
                $("#pfPin").value = ""
                return this.msg("Falsche PIN.")
            case "create": {
                if (pin && !pinOk()) return
                const p = Profiles.create(val("pfName") || "Spieler", { pin })
                return this.login(p.id)
            }
            case "rename":
                Profiles.rename(me().id, val("pfName"))
                this.render()
                return this.msg("Gespeichert.", true)
            case "setpin":
                if (!pinOk()) return
                Profiles.setPin(me().id, pin)
                this.render()
                return this.msg("PIN gesetzt.", true)
            case "clearpin":
                Profiles.setPin(me().id, "")
                this.render()
                return this.msg("PIN entfernt.", true)
            case "send":
            case "export":
                this.panel = { mode: act }
                return this.renderPanel()
            case "copy": {
                const ta = $("#pfText")
                ta.select()
                const done = () => this.msg("Kopiert!", true)
                if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(ta.value).then(done, () => { document.execCommand("copy"); done() })
                else {
                    document.execCommand("copy")
                    done()
                }
                return
            }
            case "delete":
                // zweimal klicken = wirklich löschen
                if (!pn.confirm) {
                    pn.confirm = true
                    return this.msg(`Wirklich löschen? Gold, Skins und Fortschritt von „${me().name}“ sind dann weg. Nochmal klicken zum Bestätigen.`)
                }
                Profiles.remove(me().id)
                this.panel = null
                UI.toast("Profil gelöscht.")
                return this.render()
            case "join":
                return ProfileSync.receive(val("pfCodeIn"), st => {
                    if (st.status === "loading") this.msg("Verbinde …")
                    else if (st.status === "error") this.msg(st.text)
                    else if (st.status === "done") this.enter()
                })
            case "import": {
                const d = unpackProfile(val("pfText"))
                if (!d) return this.msg("Das ist kein gültiger Spielstand-Code.")
                importProfile(d)
                return this.enter()
            }
        }
        function me() {
            return Profiles.current()
        }
    }
}
