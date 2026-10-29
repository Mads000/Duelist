window.addEventListener("keydown", (e) => {
    if (e.key === "0") {
        checkWin()
    }
})

//Canvas
const canvas = document.getElementById("myCanvas")
const Canvas_Width = canvas.width = 1920
const Canvas_Height = canvas.height = 1080

const ctx = canvas.getContext("2d")
ctx.imageSmoothingEnabled = false

//Spieler Auswahl bekommen
const params = new URLSearchParams(window.location.search) //URL Parameter lesen
let player1Choice = params.get("player1") //Parameter von player1 in eine VAriable speichern
let player2Choice = params.get("player2")
let gameSpeed = parseFloat(params.get("speed")) || 1 // Default = 1

//Hintergrund
const bg = new Image()
bg.src = "assets/ui/Arena2.png"

//States
let gameOver = false
let countdown = 3
let countdownActive = true
let gameStarted = false
let gameCount = 90
let gameEnd = false

//Couldowns Container
let countDownContainer = document.getElementById("startCounter")
let gameCountDownContainer = document.getElementById("gameCountdown")

//Spieler erzeugen
let playerOne = new Player(characters[player1Choice], 400, 250, 2, { left: "a", right: "d", up: "w", down: "s", hit: "e", abilityKey: "r" })
let playerTwo = new Player(characters[player2Choice], 1000, 250, 2, { left: "j", right: "l", up: "i", down: "k", hit: "o", abilityKey: "p" })

//--------Abilities zuweisen--------
//Shield
if (player1Choice === "Soldier") {
    playerOne.shield = new Shield(playerOne)
}
if (player2Choice === "Soldier") {
    playerTwo.shield = new Shield(playerTwo)
}
//Heal
if (player1Choice === "Skeleton") {
    playerOne.heal = new Heal(playerOne)
}
if (player2Choice === "Skeleton") {
    playerTwo.heal = new Heal(playerTwo)
}
//Invisibile
if (player1Choice === "Werewolf") {
    playerOne.invisibil = new Invisibility(playerOne)
}
if (player2Choice === "Werewolf") {
    playerTwo.invisibil = new Invisibility(playerTwo)
}
//damageStack
if (player1Choice === "Orc") {
    playerOne.damageStack = new DamageStack(playerOne)
}
if (player2Choice === "Orc") {
    playerTwo.damageStack = new DamageStack(playerTwo)
}

//Startcooldown
function startCountdown() {
    const interval = setInterval(() => {
        countdown--

        countDownContainer.innerHTML = countdown

        if (countdown <= 0) {
            clearInterval(interval)
            gameStarted = true
            gameCountdown()

            countDownContainer.style.display = "none"
        }
    }, 1000)
}

startCountdown()

//Der Gamecountdown
function gameCountdown() {
    const interval = setInterval(() => {
        gameCount--

        gameCountDownContainer.innerHTML = gameCount

        if (gameCount <= 0) {
            clearInterval(interval)
            gameEnd = true
        }
    }, 1000)
}


function gameLoop() {

    ctx.clearRect(0, 0, Canvas_Width, Canvas_Height)
    ctx.drawImage(bg, 0, 0, Canvas_Width, Canvas_Height)

    playerOne.draw(ctx, "Player 1")
    playerTwo.draw(ctx, "Player 2")

    playerOne.drawHealthBar(ctx, 15, 8, playerOne.hp, { bg: "rgba(0, 46, 142, 0.52)", border: "rgba(0, 46, 142, 1)", fill: "rgba(0, 46, 142, 1)", text: "Player 1" })
    playerTwo.drawHealthBar(ctx, 60, 8, playerTwo.hp, { bg: "rgba(137, 0, 0, 0.52)", border: "rgba(137, 0, 0, 1)", fill: "rgba(137, 0, 0, 1)", text: "Player 2" })

    //Border Anzeigen
    // playerOne.drawBorder(ctx)


    if (!gameStarted) {
        requestAnimationFrame(gameLoop)
        return
    }

    if (!gameOver && gameStarted) {


        playerOne.movingPlayer()
        playerTwo.movingPlayer()

        playerOne.stayInField()
        playerTwo.stayInField()

        playerOne.attackPlayer()
        playerTwo.attackPlayer()

        playerOne.checkCollision(playerTwo)
        playerTwo.checkCollision(playerOne)

        playerOne.draw(ctx, "Player 1")
        playerTwo.draw(ctx, "Player 2")

        playerOne.drawHealthBar(ctx, 15, 8, playerOne.hp, { bg: "rgba(0, 46, 142, 0.52)", border: "rgba(0, 46, 142, 1)", fill: "rgba(0, 46, 142, 1)", text: "Player 1" })
        playerTwo.drawHealthBar(ctx, 60, 8, playerTwo.hp, { bg: "rgba(137, 0, 0, 0.52)", border: "rgba(137, 0, 0, 1)", fill: "rgba(137, 0, 0, 1)", text: "Player 2" })
        
        //----------Abilities----------
        //Shield
        if (playerOne.shield && keys[playerOne.keys.abilityKey]) {
            playerOne.shield.tryActivateShield()
            console.log("Player one has schield")
        }
        if (playerOne.shield) {
            playerOne.shield.draw(ctx)
        }
        if (playerTwo.shield && keys[playerTwo.keys.abilityKey]) {
            playerTwo.shield.tryActivateShield()
            console.log("Player twso has schield")
        }
        if (playerTwo.shield) {
            playerTwo.shield.draw(ctx)
        }

        //heal
        if (playerOne.heal && keys[playerOne.keys.abilityKey]) {
            playerOne.heal.tryToHeal()
            console.log("Player one healed")
        }
        if (playerOne.heal) {
            playerOne.heal.draw(ctx)
        }
        if (playerTwo.heal && keys[playerTwo.keys.abilityKey]) {
            playerTwo.heal.tryToHeal()
            console.log("Player two healed")
        }
        if (playerTwo.heal) {
            playerTwo.heal.draw(ctx)
        }

        //invisibile
        if (playerOne.invisibil && keys[playerOne.keys.abilityKey]) {
            playerOne.invisibil.tryToInvisibil()
            console.log("Player one invisibil")
        }
        if (playerOne.invisibil) {
            playerOne.invisibil.draw(ctx)
        }
        if (playerTwo.invisibil && keys[playerTwo.keys.abilityKey]) {
            playerTwo.invisibil.tryToInvisibil()
            console.log("Player two invisibil")
        }
        if (playerTwo.invisibil) {
            playerTwo.invisibil.draw(ctx)
        }

        //damageStack
        if (playerOne.damageStack && keys[playerOne.keys.abilityKey]) {
            playerOne.damageStack.tryToDamage(playerTwo)
            console.log("Damage Stack true")
        }
        if (playerOne.damageStack) {
            playerOne.damageStack.draw(ctx)
        }
        if (playerTwo.damageStack && keys[playerTwo.keys.abilityKey]) {
            playerTwo.damageStack.tryToDamage(playerOne)
            console.log("Damage Stack true")
        }
        if (playerTwo.damageStack) {
            playerTwo.damageStack.draw(ctx)
        }


        // playerOne.drawHitbox(ctx)
        // playerTwo.drawHitbox(ctx)


        if (gameEnd === true || playerOne.hp <= 0 || playerTwo.hp <= 0) {
            checkWin()
        }

    }

    requestAnimationFrame(gameLoop)
}

//Stets in die URL packen
function sendStats(winner) {
    const url =
        `/updateStats?` +
        `player1=${player1Choice}` +
        `&player2=${player2Choice}` +
        `&p1kills=${playerOne.kills}` +
        `&p1dmg=${playerOne.damageDealt}` +
        `&p1taken=${playerOne.damageTaken}` +
        `&p2kills=${playerTwo.kills}` +
        `&p2dmg=${playerTwo.damageDealt}` +
        `&p2taken=${playerTwo.damageTaken}` +
        `&winner=${winner}`

    window.location.href = url
}


function checkWin() {
    if (gameOver) return

    if (playerOne.hp < playerTwo.hp) {
        playerTwo.kills++
        gameOver = true

        setTimeout(() => {
            sendStats("Player 2")
        }, 500)

    }

    else if (playerTwo.hp < playerOne.hp) {
        playerOne.kills++
        gameOver = true

        setTimeout(() => {
            sendStats("Player 1")
        }, 500)

    }

}

gameLoop()