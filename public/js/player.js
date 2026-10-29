
//Border einstellen
const gameBorder = {
    x: 1920 * 0.07,
    y: 1080 * 0.2,
    width: 1920 * 0.87,
    height: 1080 * 0.6
}

//Sprite Einstellungen
const spriteWidth = 100
const spriteHeight = 100
let gameFrame = 0 //welches bild läuft
let stagger = 0
const staggerFrame = 18 //wie schnell die Animation ist
let index = 2
let size = 4

//Charaktere
const characters = {
    Soldier: {
        run: { frames: 8, image: new Image() },
        attack: { frames: 8, image: new Image() },
        idle: { frames: 6, image: new Image() },
        hitbox: {
            offsetX: 154,
            offsetY: 143,
            width: (spriteWidth * size) - 314,
            height: (spriteHeight * size) - 304
        }
    },
    Orc: {
        run: { frames: 8, image: new Image() },
        attack: { frames: 7, image: new Image() },
        idle: { frames: 6, image: new Image() },
        hitbox: {
            offsetX: 160,
            offsetY: 125,
            width: (spriteWidth * size) - 315,
            height: (spriteHeight * size) - 290
        }
    },
    Werewolf: {
        run: { frames: 8, image: new Image() },
        attack: { frames: 9, image: new Image() },
        idle: { frames: 6, image: new Image() },
        hitbox: {
            offsetX: 170,
            offsetY: 143,
            width: (spriteWidth * size) - 325,
            height: (spriteHeight * size) - 304
        }
    },
    Skeleton: {
        run: { frames: 8, image: new Image() },
        attack: { frames: 13, image: new Image() },
        idle: { frames: 6, image: new Image() },
        hitbox: {
            offsetX: 160,
            offsetY: 143,
            width: (spriteWidth * size) - 305,
            height: (spriteHeight * size) - 304
        }
    }
}

// Bilder für die Charaktere
characters.Soldier.run.image.src = "assets/characters/Knight Templar/Knight Templar-Walk02.png"
characters.Soldier.attack.image.src = "assets/characters/Knight Templar/Knight Templar-Attack02.png"
characters.Soldier.idle.image.src = "assets/characters/Knight Templar/Knight Templar-Idle.png"

characters.Orc.run.image.src = "assets/characters/Elite Orc/Elite Orc-Walk.png"
characters.Orc.attack.image.src = "assets/characters/Elite Orc/Elite Orc-Attack01.png"
characters.Orc.idle.image.src = "assets/characters/Elite Orc/Elite Orc-Idle.png"

characters.Werewolf.run.image.src = "assets/characters/Armored Skeleton/Armored Skeleton-Walk.png"
characters.Werewolf.attack.image.src = "assets/characters/Armored Skeleton/Armored Skeleton-Attack02.png"
characters.Werewolf.idle.image.src = "assets/characters/Armored Skeleton/Armored Skeleton-Idle.png"

characters.Skeleton.run.image.src = "assets/characters/Werebear/Werebear-Walk.png"
characters.Skeleton.attack.image.src = "assets/characters/Werebear/Werebear-Attack02.png"
characters.Skeleton.idle.image.src = "assets/characters/Werebear/Werebear-Idle.png"

// Funktion zum Zeichnen der Spieler und Spritesheets durchlaufen
function drawPlayer(ctx, animation, x, y) {
    if ((stagger % staggerFrame) === 0) {
        gameFrame++
    }

    const frameX = spriteWidth * (gameFrame % animation.frames)
    const frameY = spriteHeight * 0

    ctx.drawImage(
        animation.image,
        frameX,
        frameY,
        spriteWidth,
        spriteHeight,
        x,
        y,
        spriteWidth * size,
        spriteHeight * size
    )
    stagger++
}

//Tasteneingabe Prüfen
const keys = {}
window.addEventListener("keydown", e => keys[e.key] = true)
window.addEventListener("keyup", e => keys[e.key] = false)

//Spieler Klasse
class Player {
    constructor(characters, x, y, speed = 5, keys = {}) {
        this.characters = characters

        this.x = x
        this.y = y
        this.speed = speed
        this.keys = keys

        this.width = spriteWidth * size
        this.height = spriteHeight * size

        this.state = "idle"
        this.moving = false

        this.facingLeft = false
        this.facingUp = false

        this.attack = false
        this.canAttack = true
        this.hasHit = false

        this.knockback = speed

        this.hp = 100

        this.hitbox = characters.hitbox

        //stats
        this.damageDealt = 0
        this.damageTaken = 0
        this.kills = 0
        this.collisionCounter = 0

        //abilities
        this.shield = null
        this.heal = null
        this.invisibil = null
        this.damageStack = null
        this.invisible = false




        this.movingTop = true
        this.movingBottom = false
        this.movingLeft = true
        this.movingRight = false
    }

    movingPlayer() {

        if (elemCoordinates.top <= 0) {
            this.movingTop = false
            this.movingBottom = true
        } else if (elemCoordinates.bottom >= window.innerHeight) {
            this.movingBottom = false
            this.movingTop = true
        }
        if (elemCoordinates.left <= 0) {
            this.movingLeft = false
            this.movingRight = true
        } else if (elemCoordinates.right >= window.innerWidth) {
            this.movingRight = false
            this.movingLeft = true
        }


        this.moving = false
        if (keys[this.keys.left] && movingLeft == true) {
            this.x -= this.speed * gameSpeed
            this.moving = true
            this.facingLeft = true
        }
        if (keys[this.keys.right]) {
            this.x += this.speed * gameSpeed
            this.moving = true
            this.facingLeft = false
        }
        if (keys[this.keys.up]) {
            this.y -= this.speed * gameSpeed
            this.moving = true
            this.facingUp = true
        }
        if (keys[this.keys.down]) {
            this.y += this.speed * gameSpeed
            this.moving = true
            this.facingUp = false
        }

        if (this.moving) {
            this.state = "run"
        } else {
            this.state = "idle"
        }
    }

    attackPlayer() {
        if (this.canAttack && keys[this.keys.hit]) {
            this.attack = true
            this.canAttack = false
            this.hasHit = false
            this.state = "attack"

            //Damit man nicht schlagen spamen kann
            setTimeout(() => {
                this.attack = false
                this.state = "idle"
            }, 300 / gameSpeed)

            setTimeout(() => {
                this.canAttack = true
            }, 800 / gameSpeed)
        }

        if (this.attack) {
            this.state = "attack"
        }
    }

    checkCollision(player) {
        if (player.invisible) return
        if (this.invisible) return

        //Collision prüfen
        let hit = (this.x + this.hitbox.offsetX) < (player.x + player.hitbox.offsetX + player.hitbox.width) &&  //AABB Collision, player.links<player.rechts, rechts>links, oben<unten, unten>oben
            (this.x + this.hitbox.offsetX + this.hitbox.width) > (player.x + player.hitbox.offsetX) &&
            (this.y + this.hitbox.offsetY) < (player.y + player.hitbox.offsetY + player.hitbox.height) &&
            (this.y + this.hitbox.offsetY + this.hitbox.height) > (player.y + player.hitbox.offsetY)

        if (hit && this.attack && !this.hasHit) {
            this.collisionCounter++

            //Wenn das Shield aktiv ist wird das nicht mehr ausgefürt
            if (!player.shield || !player.shield.active) {
                player.hp -= 7
                this.damageDealt += 7
                player.damageTaken += 7
            }

            this.hasHit = true

            //Knockback
            const knockbackForce = this.knockback * 40

            setTimeout(() => {
                this.hasHit = false
            }, 300 / gameSpeed)

            if (this.facingLeft) {
                player.x -= knockbackForce
            } else {
                player.x += knockbackForce
            }

            if (this.facingUp) {
                player.y -= knockbackForce
            } else {
                player.y += knockbackForce
            }
        }
    }

    //Damit man nicht das Feld verlassen kann
    stayInField() {
        const minX = gameBorder.x - this.hitbox.offsetX
        const maxX = gameBorder.x + gameBorder.width - this.hitbox.width - this.hitbox.offsetX

        const minY = gameBorder.y - this.hitbox.offsetY
        const maxY = gameBorder.y + gameBorder.height - this.hitbox.height - this.hitbox.offsetY

        this.x = Math.max(minX, Math.min(this.x, maxX))
        this.y = Math.max(minY, Math.min(this.y, maxY))
    }

    drawHealthBar(ctx, x, y, hp, { bg, border, fill, text }) {
        const width = Canvas_Width * 0.25 
        const height = Canvas_Height * 0.05

        const healthBarX = (x / 100) * Canvas_Width
        const healthBarY = (y / 100) * Canvas_Height

        ctx.fillStyle = bg
        ctx.fillRect(healthBarX, healthBarY, width, height)

        ctx.fillStyle = fill
        ctx.fillRect(healthBarX, healthBarY, width * (hp / 100), height)

        ctx.strokeStyle = border
        ctx.lineWidth = 2
        ctx.strokeRect(healthBarX, healthBarY, width, height)

        ctx.fillStyle = "white"
        ctx.font = "20px Arial"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(text, healthBarX + width / 2, healthBarY + height / 2)
    }

    drawBorder(ctx) {
        ctx.strokeStyle = "red"
        ctx.lineWidth = 6
        ctx.strokeRect(
            gameBorder.x,
            gameBorder.y,
            gameBorder.width,
            gameBorder.height
        )
    }

    draw(ctx, playerName = "") {
        if (this.invisible) {
            ctx.globalAlpha = 0
        }

        const animation = this.characters[this.state]
        drawPlayer(ctx, animation, this.x, this.y)

        ctx.globalAlpha = 1

        if (!this.invisible) {
            ctx.fillStyle = "white"
            ctx.font = "20px Arial"
            ctx.textAlign = "center"
            ctx.textBaseline = "bottom"
            ctx.fillText(playerName, this.x + this.width / 2, this.y + 255)
        }
    }
}
