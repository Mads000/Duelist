function drawAbilityIcon(ctx, player, img, alpha, breite, höhe=2) {
    const centerX = player.x + player.width / breite     //2
    const centerY = player.y + player.height / höhe

    const width = player.width * 0.1
    const height = player.height * 0.1

    ctx.globalAlpha = alpha

    ctx.drawImage(
        img,
        centerX - width / 2,
        centerY - height / 0.48,
        width,
        height
    )

    ctx.globalAlpha = 1
}

//----------------Shield-----------------
class Shield {
    constructor(player) {
        this.player = player
        this.active = false

        this.img = new Image()
        this.img.src = "/assets/Faehigkeiten/schield.png"
    }

    
    tryActivateShield() {
        if (this.player.collisionCounter >= 3 && !this.active) {
            this.active = true

            this.player.collisionCounter = 0

            setTimeout(() => {
                this.active = false
            }, 3000)
        }
    }

    draw(ctx) {
        if (this.player.collisionCounter >= 3) {
            drawAbilityIcon(ctx, this.player, this.img, 0.3, 2)
        }

        if (this.active) {
            drawAbilityIcon(ctx, this.player, this.img, 1, 2)
        }
    }
}

//-----------------Heal--------------------
class Heal {
    constructor(player) {
        this.player = player
        this.active = false

        this.img = new Image()
        this.img.src = "/assets/Faehigkeiten/leben2.png"
    }

    tryToHeal() {
        if (this.player.collisionCounter >= 3 && !this.active) {
            this.active = true
            console.log("Heal !")

            this.player.hp += 25
            if (this.player.hp > 100) this.player.hp = 100

            setTimeout(() => {
                this.active = false
                console.log("Healed")
            }, 1000)

            this.player.collisionCounter = 0
        }
    }

    draw(ctx) {
        if (this.player.collisionCounter >= 3) {
            drawAbilityIcon(ctx, this.player, this.img, 0.3, 1.9)
        }

        if (this.active) {
            drawAbilityIcon(ctx, this.player, this.img, 1, 1.9)
        }
    }
}

//-------------------Invisibility-------------------
class Invisibility {
    constructor(player) {
        this.player = player
        this.active = false
        this.player.invisible = false

        this.img = new Image()
        this.img.src = "/assets/Faehigkeiten/unsichtbar.png"
    }

    tryToInvisibil() {
        if (this.player.collisionCounter >= 3 && !this.active) {
            this.active = true
            console.log("Invisibility activated!")

            this.player.invisible = true

            setTimeout(() => {
                this.active = false
                console.log("Sichtbar")
                this.player.invisible = false
            }, 3000)

            this.player.collisionCounter = 0
        }
    }

    draw(ctx) {
        if (this.player.collisionCounter >= 3) {
            drawAbilityIcon(ctx, this.player, this.img, 0.3, 1.9, 2.1)
        }

        if (this.active) {
            drawAbilityIcon(ctx, this.player, this.img, 0, 1.9, 2.1)
        }
    }
}

//------------Damage Stack---------------------
class DamageStack {
    constructor(player) {
        this.player = player
        this.active = false

        this.img = new Image()
        this.img.src = "/assets/Faehigkeiten/bombe2.png"
    }

    tryToDamage(enemy) {
        if (this.player.collisionCounter >= 5 && !this.active) {
            this.active = true
            enemy.hp -= 36
        } else if (this.player.collisionCounter >= 4 && !this.active) {
            this.active = true
            enemy.hp -= 24
        } else if (this.player.collisionCounter >= 3 && !this.active) {
            this.active = true
            enemy.hp -= 12
        }

        if (this.active) {
            setTimeout(() => {
                this.active = false
                console.log("Damaged")
            }, 1000)

            this.player.collisionCounter = 0
        }
    }

    draw(ctx) {
        if (this.player.collisionCounter >= 3) {
            drawAbilityIcon(ctx, this.player, this.img, 0.3, 1.9, 2.3)
        }

        if (this.active) {
            drawAbilityIcon(ctx, this.player, this.img, 1, 1.9, 2.3)
        }
    }
}