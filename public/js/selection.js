const Info = document.getElementById("Info");
const popup = document.getElementById("popup");

let SoldierCard = document.getElementById("SoldierCard")
let OrcCard = document.getElementById("OrcCard")
let WerewolfCard = document.getElementById("WerewolfCard")
let SkeletonCard = document.getElementById("SkeletonCard")

let SoldierName = document.getElementById("SoldierName")
let OrcName = document.getElementById("OrcName")
let WerewolfName = document.getElementById("WerewolfName")
let SkeletonName = document.getElementById("SkeletonName")

let AbilityText = document.getElementById("AbilityText")
let AbilityTitle = document.getElementById("AbilityTitle")
let AbilityIcon = document.getElementById("AbilityIcon")

let Start = document.getElementById("Start")
let GameSpeedInput = document.getElementById("GameSpeed")

let Player1Auswahl = false
let Player2Auswahl = false

let player1Character = null
let player2Character = null


window.addEventListener("keydown", (e) => {
    if (e.key === "l") {
        window.location.href = "/loore"
    }
})

//Texte aktualisieren
SoldierCard.addEventListener("mouseover", () => {
    AbilityText.innerHTML = "Nach 3 Angriffen erhält man die Fähigkeit Shield. Nach Aktivierung ist sie 3sek Aktiv."
    AbilityTitle.innerHTML = "Ability: Shield"
    AbilityIcon.src = "/assets/Faehigkeiten/schield.png"
})
OrcCard.addEventListener("mouseover", () => {
    AbilityText.innerHTML = "Nach 3 Treffern erhält man die Fähigkeit Damage Stack. Es gibt drei Stufen, die mit jeweils einem zusätzlichen Treffer aufgeladen werden. Stufe eins = 12 Schaden; Stufe zwei = 24 Schaden; Stufe derei = 36 Schaden"
    AbilityTitle.innerHTML = "Ability: Damage Stack"
    AbilityIcon.src = "/assets/Faehigkeiten/bombe2.png"
})
WerewolfCard.addEventListener("mouseover", () => {
    AbilityText.innerHTML = "Nach 3 Angriffen erhält man die Fähigkeit Invisibility. Nach Aktivierung ist man 3sek unsichtbar und unverwundbar. Selber kann man den Gegner auch nicht angreifen."
    AbilityTitle.innerHTML = "Ability: Invisibility"
    AbilityIcon.src = "/assets/Faehigkeiten/unsichtbar.png"
})
SkeletonCard.addEventListener("mouseover", () => {
    AbilityText.innerHTML = "Nach 3 Angriffen erhält man die Fähigkeit Heal. Nach Aktivierung bekommt man +25 Leben."
    AbilityTitle.innerHTML = "Ability: Heal"
    AbilityIcon.src = "/assets/Faehigkeiten/leben2.png"
})

//Steuerung der Spielerauswahl
//Soldier(Vanguard)
SoldierCard.addEventListener("click", () => {

    if (Player1Auswahl == false) {
        if (Player2Auswahl == false || Player2Auswahl == true) {

            SoldierName.style.background = "#1e3c8fc7"
            SoldierName.style.color = "white"

            Player1Auswahl = true

            player1Character = "Soldier"
        }
    } else {
        alert("Player 1 hat bereits einen Character gewählt!")
    }

})
SoldierCard.addEventListener("contextmenu", (event) => {

    event.preventDefault()

    if (Player2Auswahl == false) {
        if (Player1Auswahl == false || Player1Auswahl == true) {

            SoldierName.style.background = "#8f1c1cd0"
            SoldierName.style.color = "white"

            Player2Auswahl = true
            player2Character = "Soldier"
        }
    } else {
        alert("Player 2 hat bereits einen Character gewählt!")
    }

})

//Orc (Warbrute)
OrcCard.addEventListener("click", () => {

    if (Player1Auswahl == false) {
        if (Player2Auswahl == false || Player2Auswahl == true) {

            OrcName.style.background = "#1e3c8fc7"
            OrcName.style.color = "white"

            Player1Auswahl = true

            player1Character = "Orc"
        }
    } else {
        alert("Player 1 hat bereits einen Character gewählt!")
    }

})
OrcCard.addEventListener("contextmenu", (event) => {

    event.preventDefault()

    if (Player2Auswahl == false) {
        if (Player1Auswahl == false || Player1Auswahl == true) {

            OrcName.style.background = "#8f1c1cd0"
            OrcName.style.color = "white"

            Player2Auswahl = true

            player2Character = "Orc"
        }
    } else {
        alert("Player 2 hat bereits einen Character gewählt!")
    }

})

//Werewolf(Boneguard)
WerewolfCard.addEventListener("click", () => {

    if (Player1Auswahl == false) {
        if (Player2Auswahl == false || Player2Auswahl == true) {

            WerewolfName.style.background = "#1e3c8fc7"
            WerewolfName.style.color = "white"

            Player1Auswahl = true

            player1Character = "Werewolf"


        }
    } else {
        alert("Player 1 hat bereits einen Character gewählt!")
    }

})
WerewolfCard.addEventListener("contextmenu", (event) => {

    event.preventDefault()

    if (Player2Auswahl == false) {
        if (Player1Auswahl == false || Player1Auswahl == true) {

            WerewolfName.style.background = "#8f1c1cd0"
            WerewolfName.style.color = "white"

            Player2Auswahl = true

            player2Character = "Werewolf"

        }
    } else {
        alert("Player 2 hat bereits einen Character gewählt!")
    }

})


//Skeleton(Rageclaw)
SkeletonCard.addEventListener("click", () => {

    if (Player1Auswahl == false) {
        if (Player2Auswahl == false || Player2Auswahl == true) {

            SkeletonName.style.background = "#1e3c8fc7"
            SkeletonName.style.color = "white"

            Player1Auswahl = true

            player1Character = "Skeleton"

            // alert("Player 1 hat Orc gewählt!")
        }
    } else {
        alert("Player 1 hat bereits einen Character gewählt!")
    }

})
SkeletonCard.addEventListener("contextmenu", (event) => {

    event.preventDefault()

    if (Player2Auswahl == false) {
        if (Player1Auswahl == false || Player1Auswahl == true) {

            SkeletonName.style.background = "#8f1c1cd0"
            SkeletonName.style.color = "white"

            Player2Auswahl = true

            player2Character = "Skeleton"
        }
    } else {
        alert("Player 2 hat bereits einen Character gewählt!")
    }

})

//Startburron Event
Start.addEventListener("click", () => {

    if (player1Character && player2Character) {

        const speedValue = parseFloat(GameSpeedInput.value) || 1; // Default 1
        window.location.href = `/game?player1=${player1Character}&player2=${player2Character}&speed=${speedValue}`

    } else {

        alert("Beide Spieler müssen einen Character wählen!")

    }

})

//Infoanzeige
Info.addEventListener("mouseover", () => {
    popup.style.display = "block"

})
Info.addEventListener("mouseout", () => {
    popup.style.display = "none"

})


//Logout
const logoutButton = document.getElementById("LogOutContainer")

logoutButton.addEventListener("click", () => {
    window.location.href = "/logout"
})

//Reset Button

const resetButton = document.getElementById("resetButton")

resetButton.addEventListener("click", () => {
    Player1Auswahl = false
    Player2Auswahl = false

    player1Character = null
    player2Character = null

    OrcName.style.background = "white"
    OrcName.style.color = "black"

    SkeletonName.style.background = "white"
    SkeletonName.style.color = "black"

    WerewolfName.style.background = "white"
    WerewolfName.style.color = "black"

    SoldierName.style.background = "white"
    SoldierName.style.color = "black"
})