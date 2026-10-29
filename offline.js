// ============================================================
//  DUELIST – Offline-Start ohne Datenbank
//  Startet nur einen kleinen Webserver für das Spiel.
//  Aufruf: npm start   (oder "DUELIST starten.bat" doppelklicken)
// ============================================================
import express from "express"
import os from "os"

const app = express()
const port = process.env.PORT || 8080

app.get("/", (req, res) => res.redirect("/duelist/"))
app.use(express.static("public"))

app.listen(port, "0.0.0.0", () => {
    console.log("")
    console.log("  DUELIST läuft (offline, ohne Datenbank)")
    console.log("")
    console.log(`  Am PC:    http://localhost:${port}`)

    // Adressen im WLAN anzeigen, damit man auf dem Handy mitspielen kann
    for (const list of Object.values(os.networkInterfaces())) {
        for (const net of list || []) {
            if (net.family === "IPv4" && !net.internal) console.log(`  Am Handy: http://${net.address}:${port}  (gleiches WLAN)`)
        }
    }
    console.log("")
    console.log("  Beenden mit Strg + C")
})
