import express from "express"
import mysql from "./node_modules/mysql2/promise.js"
import bcrypt from "bcrypt"
import { dbLoginDatas } from "./configApp.js"
import session from "express-session"

const app = express()
const port = 8080
const pool = mysql.createPool(dbLoginDatas)

app.set("view engine", "ejs")
app.set("views", "./views")

app.use(session({
    secret: "OK",
    resave: false,
    saveUninitialized: false
}))

app.use(express.urlencoded({ extended: true }))
app.use(express.static("public"))

//Routen
app.get("/", (req, res) => {
    res.render("login.ejs")
})

app.get("/loore", (req, res) => {
    res.render("Loore.ejs")
})

app.get("/selection", async (req, res) => {
    if (!req.session || !req.session.user) {
        return res.redirect("/login")
    }

    try {
        const [rows] = await pool.query(`SELECT * FROM benutzer WHERE username = ?`, [req.session.user.username]) 
        if (rows.length === 0) return res.redirect("/login")

        const user = rows[0]
        res.render("selection.ejs", {user})
    } catch (err) {
        console.error(err)
        res.status(500).send("Fehler beim Laden des Benutzers.")
    }
})

app.get("/game", (req, res) => {
    res.render("game.ejs")
})

app.get("/register", (req, res) => {
    res.render("register.ejs")
})

app.get("/login", (req, res) => {
    res.render("login.ejs")
})

app.get("/loseScreen", (req, res) => {
    const winner = req.query.winner || "Niemand"
    res.render("loseScreen.ejs", { winner: winner })
})

//Regestrieren
app.post("/register", async (req, res) => {
    const { username, password } = req.body
    try {
        const hash = await bcrypt.hash(password, 10)
        await pool.query(
            "INSERT INTO benutzer (username, password, kills, damageDealt, damageTaken) VALUES (?, ?, 0, 0, 0)", //für spieler 2 noch malk 0,0,0
            [username, hash]
        )
        res.render("login.ejs")
    } catch (err) {
        console.error("Fehler bei der Registrierung:", err.message)
        res.send("Fehler bei der Registrierung: " + err.message)
    }
})

//LogIn
app.post("/login", async (req, res) => {
    const { username, password } = req.body
    try {
        const [rows] = await pool.query("SELECT * FROM benutzer WHERE username = ?", [username])
        if (rows.length === 0) return res.render("login_err.ejs")

        const user = rows[0]
        const match = await bcrypt.compare(password, user.Password)

        if (match) {
            req.session.user = {
                id: user.ID,
                username: user.Username
            }

            //NAch jedem LogIn auf null setzen, für faire Punkte
            await pool.query(
                `UPDATE benutzer SET kills = 0, damageDealt = 0, damageTaken = 0, p2kills = 0, p2damageDealt = 0, p2damageTaken = 0 WHERE username = ?`,
                [username]
            )

            res.redirect("/selection")
        } else {
            res.render("login_err.ejs")
        }
    } catch (err) {
        console.error("Login-Fehler:", err)
        res.status(500).send("Fehler beim Login.")
    }
})

//Stats 
app.get("/updateStats", async (req, res) => {
       if (!req.session || !req.session.user) {
        return res.redirect("/login")
    }

    const username = req.session.user.username
    const { player1, player2, p1kills, p1dmg, p1taken, p2kills, p2dmg, p2taken, winner } = req.query
    try {
        await pool.query(`UPDATE benutzer SET kills = kills + ?, damageDealt = damageDealt + ?, damageTaken = damageTaken + ? WHERE username = ?`,
            [parseInt(p1kills || 0), parseInt(p1dmg || 0), parseInt(p1taken || 0), username])

        await pool.query(`UPDATE benutzer SET p2kills = p2kills + ?, p2damageDealt = p2damageDealt + ?, p2damageTaken = p2damageTaken + ? WHERE username = ?`,
            [parseInt(p2kills || 0), parseInt(p2dmg || 0), parseInt(p2taken || 0), username])


        res.redirect(`/loseScreen?winner=${winner}`)
    } catch (err) {
        console.error(err)
        res.send("Fehler beim Update der Stats")
    }
})

//LogOut
app.get("/logout", (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error(err)
            return res.status(500).send("Logout fehlgeschlagen")
        }

        res.redirect("/login")
    })
})

app.listen(port, () => {
    console.log("Server läuft: http://localhost:8080")
})