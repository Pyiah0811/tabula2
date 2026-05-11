const canvas = document.querySelector('canvas')
const c = canvas.getContext('2d')
const bufferCanvas = document.createElement('canvas')
const bufferCtx = bufferCanvas.getContext('2d')
canvas.width = 1500
canvas.height = 750
const scale = 2
const DEBUG = true
const keys = 
{ 
    w: { pressed: false }, 
    a: { pressed: false }, 
    s: { pressed: false }, 
    d: { pressed: false } 
}
let freezePlayer = false

window.mode = 'free'
// 'free' | 'preview' | 'navigate' | 'search'

let gameStarted = false

// ================== AVATAR INTEGRATION ==================
// Reads the avatar chosen in setup.html from localStorage.
// Falls back to 'girl.png' for guests or users who haven't set one.
const savedAvatar = localStorage.getItem('userAvatar') || 'girl.png'
const avatarBase  = savedAvatar === 'boy.png' ? 'newBoy' : 'newGirl'

// ================== IMAGES ==================
const bImage = new Image()
bImage.src = './img/MapMain.png'

const playerUpImage = new Image()
playerUpImage.src = `./img/${avatarBase}Back.png`
const playerDownImage = new Image()
playerDownImage.src = `./img/${avatarBase}Front.png`
const playerLeftImage = new Image()
playerLeftImage.src = `./img/${avatarBase}Left.png`
const playerRightImage = new Image()
playerRightImage.src = `./img/${avatarBase}Right.png`

const shadowImage = new Image()
shadowImage.src = './img/shadow.png'

let cameraTarget = null
let isPanning = false
// ================== SPRITES ==================
let offset = { x: 0, y: 0 }

const background = new Sprite({
    position: { x: 0, y: 0 }, 
    image: bImage
})

const player = new Sprite({
    position: {
        x: canvas.width / 2 - 250 / 4 / 2,
        y: canvas.height / 2 - 200 / 2
    },
    image: playerUpImage,
    frame: { max: 4 },
    sprites: {
        up: playerUpImage,
        down: playerDownImage,
        left: playerLeftImage,
        right: playerRightImage
    }
})

const buildings = []
const movables = [background]
const boundaries = []

/*boundaries.push,({
    position: { x: b.x, y: b.y },
    width: b.width,
    height: b.height
})*/

// ================== INPUT ==================


// ================== SHADOW ==================
function drawShadow() {
    if (!shadowImage.complete || !player.width) return
    const shadowWidth = player.width * 0.8
    const shadowHeight = player.height * 0.4

    c.save()
    c.globalAlpha = 0.5
    c.drawImage(
        shadowImage,
        player.position.x + player.width / 2 - shadowWidth / 2,
        player.position.y + player.height - shadowHeight / 2 - 47,
        shadowWidth,
        shadowHeight
    )
    c.restore()
}

// ================== DETECTION ==================
function isPlayerInZone(player, building) {
    const width = (building.width || building.image.width) * scale
    const height = (building.height || building.image.height) * scale
    const zone = building.zone || { x: 0, y: 0.4, width: 1, height: 0.6 }

    const left = building.position.x + width * zone.x
    const right = left + width * zone.width
    const top = building.position.y + height * zone.y
    const bottom = top + height * zone.height

    const playerFeetX = player.position.x + player.width / 2
    const playerFeetY = player.position.y + player.height - 10

    return playerFeetX > left && playerFeetX < right && playerFeetY > top && playerFeetY < bottom
}

// ================== LOAD BUILDINGS ==================
// ✅ CHANGED: Now fetches from php/api_buildings.php instead of data/buildings.json
// This means any admin edit to the database reflects on the map instantly.
async function loadBuildings() {
    const res = await fetch('../php/api_buildings.php')

    if (!res.ok) {
        console.error('Failed to load buildings from API:', res.status)
        return
    }

    const data = await res.json()

    if (data.error) {
        console.error('API returned an error:', data.error)
        return
    }

    data.forEach(b => {
        const img = new Image()
        // Image path in the DB is stored as "img/buildings/chapel.png"
        // which is relative to the map folder — no path change needed.
        img.src = b.image

        const sprite = new Sprite({
            position: { x: b.x, y: b.y },
            image: img,
            frame: { max: b.frames || 1 }
        })

        sprite.basePosition = { x: b.x, y: b.y }
        sprite.zone         = b.zone      || { x: 0, y: 0.4, width: 1, height: 0.6 }
        sprite.collision    = b.collision || { x: 0, y: 0.6, width: 1, height: 0.4 }
        sprite.name         = b.name
        sprite.description  = b.description

        buildings.push(sprite)
        movables.push(sprite)
    })
}

async function loadBoundaries() {
    const res = await fetch('data/boundaries.json')
    const data = await res.json()

    data.forEach(b => {
        const boundary = {
            position: { x: b.x, y: b.y },
            width: b.width,
            height: b.height,
            basePosition: { x: b.x, y: b.y }
        }

        boundaries.push(boundary)
        movables.push(boundary) // ✅ move here
    })
}

// ================== COLLISION ==================
function willCollide(dx, dy, isPlayerMoving = true) {
    const nextPlayerX = player.position.x + dx
    const nextPlayerY = player.position.y + dy

    const feetWidth = player.width * 0.4
    const feetHeight = player.height * 0.3
    const feetX = nextPlayerX + player.width / 2 - feetWidth / 2
    const feetY = nextPlayerY + player.height - feetHeight

    // 🔴 BUILDINGS
    for (let b of buildings) {
        const col = b.collision
        const width = (b.width || b.image.width) * scale
        const height = (b.height || b.image.height) * scale

        const left = b.position.x + width * col.x
        const right = left + width * col.width
        const top = b.position.y + height * col.y
        const bottom = top + height * col.height

        if (feetX < right && feetX + feetWidth > left &&
            feetY < bottom && feetY + feetHeight > top) {
            return true
        }
    }

    // 🔵 BOUNDARIES (VOID BLOCKERS)
    for (let boundary of boundaries) {
        const left = boundary.position.x
        const right = left + boundary.width
        const top = boundary.position.y
        const bottom = top + boundary.height

        if (feetX < right && feetX + feetWidth > left &&
            feetY < bottom && feetY + feetHeight > top) {
            return true
        }
    }

    return false
}

// ================== MOVEMENT ==================
function moveWithCollision(moveX, moveY) {
    const steps = Math.ceil(Math.max(Math.abs(moveX), Math.abs(moveY)))
    const stepX = moveX / steps
    const stepY = moveY / steps
    const CENTER_TOLERANCE = 5
    const targetCenterX = canvas.width / 2 - (player.width / 2)
    const targetCenterY = canvas.height / 2 - (player.height / 2)
    const minX = canvas.width - bImage.width
    const maxX = 0
    const minY = canvas.height - bImage.height
    const maxY = 0

    for (let i = 0; i < steps; i++) {
        // Y
        if (stepY !== 0) {
            const nextMapY = background.position.y - stepY
            const insideYBoundary = nextMapY <= 0 && (nextMapY + bImage.height) >= canvas.height
            const atMapLimitY = nextMapY > maxY || nextMapY < minY
            const centerOffsetY = targetCenterY - player.position.y
            const isCenteredY = Math.abs(centerOffsetY) < CENTER_TOLERANCE

        if (!atMapLimitY && Math.abs(centerOffsetY) < 15) {
            // Move camera ONLY when centered
            if (!willCollide(0, stepY)) {
                movables.forEach(m => m.position.y -= stepY)
            }
        } else {
            // Move player until centered OR when at edge
            const nextPlayerY = player.position.y + stepY
            if (nextPlayerY >= 0 && nextPlayerY + player.height <= canvas.height) {
                if (!willCollide(0, stepY)) {
                    player.position.y += stepY
                }
            }
        }
    }
        // X
        if (stepX !== 0) {
            const nextMapX = background.position.x - stepX
            const insideXBoundary = nextMapX <= 0 && (nextMapX + bImage.width) >= canvas.width
            const atMapLimitX = nextMapX > maxX || nextMapX < minX
            const playerNotCenteredX = Math.abs(player.position.x - targetCenterX) > 1

            const centerOffsetX = targetCenterX - player.position.x
            const isCenteredX = Math.abs(centerOffsetX) < CENTER_TOLERANCE

            if (!atMapLimitX && Math.abs(centerOffsetX) < 15){
                if (!willCollide(stepX, 0)) {
                    movables.forEach(m => m.position.x -= stepX)
                }
            } else {
                const nextPlayerX = player.position.x + stepX
                if (nextPlayerX >= 0 && nextPlayerX + player.width <= canvas.width) {
                    if (!willCollide(stepX, 0)) {
                        player.position.x += stepX
                    }
                }
            }
        }
    }
}

function drawWayfinderPath() {
    if (mode !== 'navigate' || currentPath.length === 0) return;

    c.save();
    c.setLineDash([10, 15]); 
    c.lineDashOffset = -Date.now() / 50; // Animates the line forward
    c.strokeStyle = "rgba(0, 255, 255, 0.8)";
    c.lineWidth = 6;
    c.lineCap = "round";

    c.beginPath();
    c.moveTo(player.position.x + player.width / 2, player.position.y + player.height / 2);

    currentPath.forEach(node => {
        const screenX = node.x + background.position.x;
        const screenY = node.y + background.position.y;
        c.lineTo(screenX, screenY);
    });

    c.stroke();
    c.restore();

    // Remove nodes as we walk over them
    const nextNode = currentPath[0];
    const playerWorldX = player.position.x - background.position.x + player.width / 2;
    const playerWorldY = player.position.y - background.position.y + player.height / 2;
    
    // If player is within 40px of the next waypoint, "complete" that waypoint
    if (Math.hypot(playerWorldX - nextNode.x, playerWorldY - nextNode.y) < 40) {
        currentPath.shift();
    }
}

// ================== ANIMATE ==================
function animate() {
    requestAnimationFrame(animate)
    c.clearRect(0, 0, canvas.width, canvas.height)

    background.draw()

    boundaries.forEach(b => {
        c.fillStyle = 'rgba(0,0,255,0.4)'
        c.fillRect(b.position.x, b.position.y, b.width, b.height)
    })
    
    const renderables = []

    buildings.forEach(b => {
        renderables.push({ type: 'building', ref: b, width: (b.width || b.image.width) * scale, height: (b.height || b.image.height) * scale })
    })

    renderables.push({ type: 'player', ref: player, width: player.width, height: player.height })

    renderables.sort((a, b) => {
        // Get the "feet" Y for A
        const aBase = a.type === 'building' 
            ? a.ref.position.y + (a.height * (a.ref.collision.y + a.ref.collision.height))
            : a.ref.position.y + a.height;

        // Get the "feet" Y for B
        const bBase = b.type === 'building' 
            ? b.ref.position.y + (b.height * (b.ref.collision.y + b.ref.collision.height))
            : b.ref.position.y + b.height;

        return aBase - bBase;
    });

    renderables.forEach(obj => {
        if (obj.type === 'building') {
            const b = obj.ref
            if (!b.image || !b.image.complete || b.image.naturalWidth === 0) return
            const x = b.position.x, y = b.position.y, w = obj.width, h = obj.height
            const split = h * 0.4
            const isBehind = isPlayerInZone(player, b)
            const isHighlighted = b === highlightedBuilding

            c.save()

            // 👇 Dim others
            if (!isHighlighted && highlightedBuilding) {
                c.globalAlpha = 0.4
            }

            // 👇 Player behind effect
            if (isBehind) {
                c.globalAlpha = 0.4
            }

            // ✨ Highlight (ONLY ONCE)
            if (isHighlighted) {
                if (bufferCanvas.width !== w || bufferCanvas.height !== h) {
                    bufferCanvas.width = w
                    bufferCanvas.height = h
                }

                bufferCtx.clearRect(0, 0, w, h)

                // draw full building into buffer
                bufferCtx.drawImage(b.image, 0, 0, b.image.width, b.image.height * 0.4, 0, 0, w, split)
                bufferCtx.drawImage(b.image, 0, b.image.height * 0.4, b.image.width, b.image.height * 0.6, 0, split, w, h - split)

                c.shadowColor = 'yellow'
                c.shadowBlur = 25

                c.drawImage(bufferCanvas, x, y, w, h)
            } else {
                // normal draw
                c.drawImage(b.image, 0, 0, b.image.width, b.image.height * 0.4, x, y, w, split)
                c.drawImage(b.image, 0, b.image.height * 0.4, b.image.width, b.image.height * 0.6, x, y + split, w, h - split)
            }

            // DEBUG
            if (DEBUG) {
                const col = b.collision
                c.globalAlpha = 0.4
                c.fillStyle = 'red'
                c.fillRect(x + w * col.x, y + h * col.y, w * col.width, h * col.height)
            }

            c.restore()
        }

        if (obj.type === 'player') {
            drawShadow()
            obj.ref.draw()
        }
    })

    if (isPanning && cameraTarget) {
        const speed = 0.1 
        const screenCenterX = canvas.width / 2
        const screenCenterY = canvas.height / 2

        // 1. Calculate the gap between where we want to be and where we are
        const targetScreenX = cameraTarget.x + background.position.x
        const targetScreenY = cameraTarget.y + background.position.y

        const dx = screenCenterX - targetScreenX
        const dy = screenCenterY - targetScreenY

        // 2. Move ONLY the world objects
        movables.forEach(m => {
            m.position.x += dx * speed
            m.position.y += dy * speed
        })

        // 3. Move the player by the same amount so they stay "stuck" to the ground
        player.position.x += dx * speed
        player.position.y += dy * speed

        // 4. STOP CONDITION
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
            isPanning = false
            cameraTarget = null

            // SNAP: This prevents the "random position" bug
            // If we are returning to the player, force them back to perfect center
            if (mode === 'transition') {
                const targetCenterX = canvas.width / 2 - player.width / 2
                const targetCenterY = canvas.height / 2 - player.height / 2
                
                // We only snap if we aren't hitting the edge of the big map
                const minX = canvas.width - bImage.width
                const minY = canvas.height - bImage.height
                const maxX = 0
                const maxY = 0

                if (background.position.x < maxX && background.position.x > minX) {
                    player.position.x = targetCenterX
                }
                if (background.position.y < maxY && background.position.y > minY) {
                    player.position.y = targetCenterY
                }
            }
        }
    }

    drawWayfinderPath()

    if (DEBUG) {
        c.save()
        c.fillStyle = 'rgba(0, 0, 0, 0.6)'
        c.fillRect(10, 10, 240, 60)
        c.fillStyle = 'white'
        c.font = 'bold 14px Arial'
        c.fillText(`Map X: ${Math.round(background.position.x)} (Limit: ${canvas.width - 2890})`, 20, 30)
        c.fillText(`Map Y: ${Math.round(background.position.y)} (Limit: ${canvas.height - 2352})`, 20, 50)
        c.restore()
    }

    if (DEBUG && pathFinder) {
        pathFinder.nodes.forEach(node => {
            const x = node.x + background.position.x;
            const y = node.y + background.position.y;

            c.fillStyle = 'yellow';
            c.beginPath();
            c.arc(x, y, 6, 0, Math.PI * 2);
            c.fill();

            c.fillStyle = 'black';
            c.fillText(node.id, x + 8, y);
        });
    }

    //drawHighlightOverlay()
    if (!isPanning && mode !== 'preview' && mode !== 'search') {
        drawNavigationArrow()
        checkArrival()
    }

    // ================== MOVEMENT INPUT ==================
    const speed = 6
    let moveX = 0, moveY = 0

    if ((mode !== 'free' && mode !== 'navigate') || freezePlayer) {
        player.moving = false
        return
    }

    if (keys.w.pressed) moveY -= speed
    if (keys.s.pressed) moveY += speed
    if (keys.a.pressed) moveX -= speed
    if (keys.d.pressed) moveX += speed

    player.moving = moveX !== 0 || moveY !== 0

    if (player.moving) {
        moveWithCollision(moveX, moveY)
        if (Math.abs(moveX) > Math.abs(moveY)) {
            player.image = moveX > 0 ? player.sprites.right : player.sprites.left
        } else {
            player.image = moveY > 0 ? player.sprites.down : player.sprites.up
        }
    }
}

function resizeCanvas() {
    const wrapper = canvas.parentElement;
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    const dpr = window.devicePixelRatio || 1;
    // Maintain aspect ratio or just fill screen
    canvas.style.width = '100%';
    canvas.style.height = '100%';
}
window.addEventListener('resize', resizeCanvas);
    


// ================== START ==================
function startGame() {
    if (gameStarted) return
        gameStarted = true
    const spawnPoint = {
        x: 200,
        y: bImage.height - 300
    }

    // Ensure player has width/height now
    player.position.x = canvas.width / 2 - player.width / 2
    player.position.y = canvas.height / 2 - player.height / 2

    const offsetX = -(spawnPoint.x - canvas.width / 2)
    const offsetY = -(spawnPoint.y - canvas.height / 2)

    const minX = canvas.width - bImage.width
    const minY = canvas.height - bImage.height
    const maxX = 0
    const maxY = 0

    background.position.x = Math.min(maxX, Math.max(minX, offsetX))
    background.position.y = Math.min(maxY, Math.max(minY, offsetY))

    buildings.forEach(b => {
        b.position.x = b.basePosition.x + background.position.x
        b.position.y = b.basePosition.y + background.position.y
    })

    boundaries.forEach(b => {
        b.position.x = b.basePosition.x + background.position.x
        b.position.y = b.basePosition.y + background.position.y
    })

    animate()
    resizeCanvas();
}

console.log(`Width: ${bImage.width}, Height: ${bImage.height}`);

async function loadWaypoints() {
    const res = await fetch('data/waypoints.json');
    const data = await res.json();
    pathFinder = new PathFinder(data);
}

async function init() {
    await Promise.all([
        new Promise(res => bImage.onload = res),
        new Promise(res => playerUpImage.onload = res),
        new Promise(res => playerDownImage.onload = res),
        new Promise(res => playerLeftImage.onload = res),
        new Promise(res => playerRightImage.onload = res),
        new Promise(res => shadowImage.onload = res),
        loadBuildings(),
        loadBoundaries(),
        resizeCanvas(),
        loadWaypoints()
    ])

    player.width = playerUpImage.width / 4
    player.height = playerUpImage.height

    startGame()
}

init()

function resetKeys() {
    keys.w.pressed = false
    keys.a.pressed = false
    keys.s.pressed = false
    keys.d.pressed = false
}

const mobileBtns = {
    'w': document.getElementById('btn-w'),
    'a': document.getElementById('btn-a'),
    's': document.getElementById('btn-s'),
    'd': document.getElementById('btn-d')
};

Object.keys(mobileBtns).forEach(key => {
    const btn = mobileBtns[key];
    if (!btn) return; // Guard in case buttons aren't in HTML yet

    btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        keys[key].pressed = true;
    }, { passive: false });

    btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        keys[key].pressed = false;
    });
    
    // Also handle touchcancel (if a notification pops up or finger slides off)
    btn.addEventListener('touchcancel', (e) => {
        keys[key].pressed = false;
    });
});

// ================== EVENTS ==================
window.addEventListener('keydown', e => { if (keys[e.key]) keys[e.key].pressed = true })
window.addEventListener('keyup', e => { if (keys[e.key]) keys[e.key].pressed = false })
window.addEventListener('blur', () => {resetKeys()})