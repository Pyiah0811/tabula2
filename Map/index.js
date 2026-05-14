const canvas = document.querySelector('canvas')
const c = canvas.getContext('2d')

// ── Buffer pool: one buffer per building id — prevents same-size buildings sharing a canvas ──
const bufferPool = new Map()
function getBuffer(id, w, h) {
    if (w <= 0 || h <= 0) return null
    if (!bufferPool.has(id)) {
        const bc = document.createElement('canvas')
        bc.width  = w
        bc.height = h
        const bx = bc.getContext('2d')
        bx.imageSmoothingEnabled = false
        bufferPool.set(id, { canvas: bc, ctx: bx, w, h })
    }
    const entry = bufferPool.get(id)
    // Resize if the building dimensions changed (e.g. image finished loading at a different size)
    if (entry.w !== w || entry.h !== h) {
        entry.canvas.width  = w
        entry.canvas.height = h
        entry.w = w
        entry.h = h
    }
    return entry
}

let highlightedBuilding  = null
let searchResults        = []
let currentSearchIndex   = 0
let previewLock          = null
let currentPath          = []     // shared with searchMap.js and pathfinder

canvas.width  = 1500
canvas.height = 750
const scale = 2
const DEBUG = false

const GameState = {
    FREE: 'free', PREVIEW: 'preview',
    NAVIGATE: 'navigate', SEARCH: 'search', TRANSITION: 'transition'
}
let state = GameState.FREE

const keys = { w:{pressed:false}, a:{pressed:false}, s:{pressed:false}, d:{pressed:false} }
let freezePlayer = false
let gameStarted  = false

// ================== AVATAR ==================
const savedAvatar = localStorage.getItem('userAvatar') || 'girl.png'
const avatarBase  = savedAvatar === 'boy.png' ? 'newBoy' : 'newGirl'

// ================== IMAGES ==================
const bImage          = new Image(); bImage.src = './img/MapMain.webp'
const playerUpImage   = new Image(); playerUpImage.src   = `./img/${avatarBase}Back.png`
const playerDownImage = new Image(); playerDownImage.src = `./img/${avatarBase}Front.png`
const playerLeftImage = new Image(); playerLeftImage.src = `./img/${avatarBase}Left.png`
const playerRightImage= new Image(); playerRightImage.src= `./img/${avatarBase}Right.png`
const shadowImage     = new Image(); shadowImage.src     = './img/shadow.png'

let cameraTarget  = null
let panCallback   = null   // fires once when the current pan finishes
let isPanning     = false
let playerAnchorX = 0      // player world X snapshotted before any preview pan
let playerAnchorY = 0      // player world Y snapshotted before any preview pan
let offset       = { x: 0, y: 0 }

// ================== SPRITES ==================
const background = new Sprite({ position: { x: 0, y: 0 }, image: bImage })

const player = new Sprite({
    position: { x: canvas.width / 2 - 250 / 4 / 2, y: canvas.height / 2 - 200 / 2 },
    image: playerUpImage,
    frame: { max: 4 },
    sprites: { up: playerUpImage, down: playerDownImage, left: playerLeftImage, right: playerRightImage }
})

const buildings  = []
const movables   = [background]
const boundaries = []

// ── Sorted render list: rebuilt only when something actually changes ──
let sortedRenderables = []
let renderListDirty   = true   // set true whenever player moves or buildings load

function markRenderDirty() { renderListDirty = true }

// ================== SHADOW ==================
function drawShadow() {
    if (!shadowImage.complete || !player.width) return
    const sw = player.width  * 0.8
    const sh = player.height * 0.4
    c.save()
    c.globalAlpha = 0.5
    c.drawImage(
        shadowImage,
        player.position.x + player.width / 2 - sw / 2,
        player.position.y + player.height - sh / 2 - 47,
        sw, sh
    )
    c.restore()
}

// ================== DETECTION ==================
function isPlayerInZone(player, building) {
    const width  = (building.width  || building.image.width)  * scale
    const height = (building.height || building.image.height) * scale
    const zone   = building.zone || { x: 0, y: 0.4, width: 1, height: 0.6 }
    const left   = building.position.x + width  * zone.x
    const right  = left + width  * zone.width
    const top    = building.position.y + height * zone.y
    const bottom = top  + height * zone.height
    const px = player.position.x + player.width  / 2
    const py = player.position.y + player.height - 10
    return px > left && px < right && py > top && py < bottom
}

// ================== LOAD BUILDINGS ==================
async function loadBuildings() {
    const res = await fetch('../php/api_buildings.php')
    if (!res.ok) { console.error('Failed to load buildings:', res.status); return }
    const data = await res.json()
    if (data.error) { console.error('API error:', data.error); return }

    data.forEach(b => {
        const img = new Image()
        img.decoding = 'async'
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
        sprite.id           = b.id
        sprite.room_meta    = b.room_meta

        buildings.push(sprite)
        movables.push(sprite)
    })

    markRenderDirty()
}

async function loadBoundaries() {
    const res  = await fetch('data/boundaries.json')
    const data = await res.json()
    data.forEach(b => {
        const boundary = {
            position:     { x: b.x, y: b.y },
            width: b.width, height: b.height,
            basePosition: { x: b.x, y: b.y }
        }
        boundaries.push(boundary)
        movables.push(boundary)
    })
}

// ================== COLLISION ==================
// Only runs when the player is actually trying to move
function willCollide(dx, dy) {
    const nextX = player.position.x + dx
    const nextY = player.position.y + dy
    const fw = player.width  * 0.4
    const fh = player.height * 0.3
    const fx = nextX + player.width  / 2 - fw / 2
    const fy = nextY + player.height - fh

    for (const b of buildings) {
        const col    = b.collision
        const width  = (b.width  || b.image.width)  * scale
        const height = (b.height || b.image.height) * scale
        const left   = b.position.x + width  * col.x
        const right  = left + width  * col.width
        const top    = b.position.y + height * col.y
        const bottom = top  + height * col.height
        if (fx < right && fx + fw > left && fy < bottom && fy + fh > top) return true
    }

    for (const boundary of boundaries) {
        const left   = boundary.position.x
        const right  = left + boundary.width
        const top    = boundary.position.y
        const bottom = top  + boundary.height
        if (fx < right && fx + fw > left && fy < bottom && fy + fh > top) return true
    }

    return false
}

// ================== MOVEMENT ==================
function moveWithCollision(moveX, moveY) {
    const steps  = Math.ceil(Math.max(Math.abs(moveX), Math.abs(moveY)))
    const stepX  = moveX / steps
    const stepY  = moveY / steps
    const CENTER_TOLERANCE = 5
    const targetCenterX = canvas.width  / 2 - (player.width  / 2)
    const targetCenterY = canvas.height / 2 - (player.height / 2)
    const minX = canvas.width  - bImage.width
    const minY = canvas.height - bImage.height

    for (let i = 0; i < steps; i++) {
        if (stepY !== 0) {
            const nextMapY      = background.position.y - stepY
            const atMapLimitY   = nextMapY > 0 || nextMapY < minY
            const centerOffsetY = targetCenterY - player.position.y

            if (!atMapLimitY && Math.abs(centerOffsetY) < 15) {
                if (!willCollide(0, stepY)) movables.forEach(m => m.position.y -= stepY)
            } else {
                const nextPlayerY = player.position.y + stepY
                if (nextPlayerY >= 0 && nextPlayerY + player.height <= canvas.height)
                    if (!willCollide(0, stepY)) player.position.y += stepY
            }
        }

        if (stepX !== 0) {
            const nextMapX      = background.position.x - stepX
            const atMapLimitX   = nextMapX > 0 || nextMapX < minX
            const centerOffsetX = targetCenterX - player.position.x

            if (!atMapLimitX && Math.abs(centerOffsetX) < 15) {
                if (!willCollide(stepX, 0)) movables.forEach(m => m.position.x -= stepX)
            } else {
                const nextPlayerX = player.position.x + stepX
                if (nextPlayerX >= 0 && nextPlayerX + player.width <= canvas.width)
                    if (!willCollide(stepX, 0)) player.position.x += stepX
            }
        }
    }

    markRenderDirty()
}

// ================== WAYFINDER PATH ==================
// Pre-baked path canvas — only redrawn when the path array changes, not every frame
let pathCanvas   = null
let pathValid    = false
let lastPathLen  = 0

function invalidatePath() { pathValid = false }

function rebakePath() {
    if (!currentPath || currentPath.length === 0) { pathCanvas = null; pathValid = true; return }

    // Build a canvas that covers the whole map
    if (!pathCanvas) {
        pathCanvas        = document.createElement('canvas')
        pathCanvas.width  = bImage.width
        pathCanvas.height = bImage.height
    }

    const pc = pathCanvas.getContext('2d')
    pc.clearRect(0, 0, pathCanvas.width, pathCanvas.height)

    pc.setLineDash([10, 15])
    pc.strokeStyle = 'rgba(0,255,255,0.8)'
    pc.lineWidth   = 6
    pc.lineCap     = 'round'
    pc.beginPath()

    // Player world pos as start
    const playerWorldX = player.position.x - background.position.x + player.width  / 2
    const playerWorldY = player.position.y - background.position.y + player.height / 2
    pc.moveTo(playerWorldX, playerWorldY)

    currentPath.forEach(node => pc.lineTo(node.x, node.y))
    pc.stroke()

    pathValid   = true
    lastPathLen = currentPath.length
}

function drawWayfinderPath() {
    if (state !== GameState.NAVIGATE || !currentPath || currentPath.length === 0) return

    // Detect path change (node removed as player walks over one)
    if (!pathValid || currentPath.length !== lastPathLen) rebakePath()
    if (!pathCanvas) return

    // Animate the dash offset by re-drawing the cached path canvas with lineDashOffset
    // We stamp the pre-baked path onto the main canvas at the world offset
    c.save()
    c.translate(background.position.x, background.position.y)
    c.setLineDash([10, 15])
    c.lineDashOffset = -(Date.now() / 50) % 25
    c.strokeStyle     = 'rgba(0,255,255,0.8)'
    c.lineWidth       = 6
    c.lineCap         = 'round'
    c.beginPath()

    const playerWorldX = player.position.x - background.position.x + player.width  / 2
    const playerWorldY = player.position.y - background.position.y + player.height / 2
    c.moveTo(playerWorldX, playerWorldY)
    currentPath.forEach(node => c.lineTo(node.x, node.y))
    c.stroke()
    c.restore()

    // Advance waypoint
    const nextNode = currentPath[0]
    const pwx = player.position.x - background.position.x + player.width  / 2
    const pwy = player.position.y - background.position.y + player.height / 2
    if (Math.hypot(pwx - nextNode.x, pwy - nextNode.y) < 40) {
        currentPath.shift()
        invalidatePath()
    }
}

// ================== RENDER SORT (lazy) ==================
function rebuildRenderList() {
    sortedRenderables = []
    buildings.forEach(b => {
        const width  = (b.width  || b.image.width)  * scale
        const height = (b.height || b.image.height) * scale
        sortedRenderables.push({ type: 'building', ref: b, width, height })
    })
    sortedRenderables.push({ type: 'player', ref: player, width: player.width, height: player.height })

    sortedRenderables.sort((a, b) => {
        const aBase = a.type === 'building'
            ? a.ref.position.y + (a.height * (a.ref.collision.y + a.ref.collision.height))
            : a.ref.position.y + a.height
        const bBase = b.type === 'building'
            ? b.ref.position.y + (b.height * (b.ref.collision.y + b.ref.collision.height))
            : b.ref.position.y + b.height
        return aBase - bBase
    })

    renderListDirty = false
}

// ================== ANIMATE ==================
let lastTimestamp = 0

function animate(timestamp = 0) {
    requestAnimationFrame(animate)

    // ── Delta time (ms → seconds, capped at 50ms to prevent spiral of death on tab blur) ──
    const delta = Math.min(timestamp - lastTimestamp, 50)
    lastTimestamp = timestamp

    c.clearRect(0, 0, canvas.width, canvas.height)
    background.draw()

    if (DEBUG) {
        boundaries.forEach(b => {
            c.fillStyle = 'rgba(0,0,255,0.4)'
            c.fillRect(b.position.x, b.position.y, b.width, b.height)
        })
    }

    // Rebuild sorted list only when dirty (player moved or buildings loaded)
    if (renderListDirty) rebuildRenderList()

    sortedRenderables.forEach(obj => {
        if (obj.type === 'building') {
            const b = obj.ref
            if (!b.image || !b.image.complete || b.image.naturalWidth === 0) return

            const x = Math.round(b.position.x)
            const y = Math.round(b.position.y)
            // Re-read live dimensions — obj.width/height may have been 0 at sort time
            const w = Math.round((b.width  || b.image.width)  * scale)
            const h = Math.round((b.height || b.image.height) * scale)
            if (w <= 0 || h <= 0) return   // image not ready yet, skip silently

            const split = Math.round(h * 0.4)

            const isBehind      = isPlayerInZone(player, b)
            const isHighlighted = b === highlightedBuilding

            // ── Get a pooled buffer for this building (keyed by id, not size) ──
            const pooled = getBuffer(b.id, w, h)
            if (!pooled) return
            const { canvas: buf, ctx: bufCtx } = pooled
            bufCtx.clearRect(0, 0, w, h)
            bufCtx.drawImage(b.image, 0, 0,                    b.image.width, b.image.height * 0.4, 0,     0,     w, split + 1)
            bufCtx.drawImage(b.image, 0, b.image.height * 0.4, b.image.width, b.image.height * 0.6, 0, split, w, h - split)

            c.save()
            if (!isHighlighted && highlightedBuilding) c.globalAlpha = 0.4
            else if (isBehind) c.globalAlpha = 0.4

            if (isHighlighted) { c.shadowColor = 'yellow'; c.shadowBlur = 25 }

            c.drawImage(buf, x, y)

            if (DEBUG) {
                const col = b.collision
                c.globalAlpha = 0.4
                c.fillStyle   = 'red'
                c.fillRect(x + w * col.x, y + h * col.y, w * col.width, h * col.height)
            }
            c.restore()
        }

        if (obj.type === 'player') {
            drawShadow()
            obj.ref.draw()
        }
    })

    // ── NPCs (drawn after player sort, before UI overlays) ──
    drawNPCs()
    checkNPCProximity()

    // ── Camera pan (lerp) ──
    // Only the world moves during a pan — the player sprite stays fixed on screen.
    // The world shift is clamped to map bounds so the camera can never pan into the void.
    if (isPanning && cameraTarget) {
        const speed         = 0.1
        const screenCenterX = canvas.width  / 2
        const screenCenterY = canvas.height / 2
        const minX          = canvas.width  - bImage.width
        const minY          = canvas.height - bImage.height

        const targetScreenX = cameraTarget.x + background.position.x
        const targetScreenY = cameraTarget.y + background.position.y
        const dx = (screenCenterX - targetScreenX) * speed
        const dy = (screenCenterY - targetScreenY) * speed

        // Clamp so we never push the background outside map bounds
        const newBgX = Math.min(0, Math.max(minX, background.position.x + dx))
        const newBgY = Math.min(0, Math.max(minY, background.position.y + dy))
        const actualDx = newBgX - background.position.x
        const actualDy = newBgY - background.position.y

        movables.forEach(m => { m.position.x += actualDx; m.position.y += actualDy })
        player.position.x += actualDx
        player.position.y += actualDy

        const settled = Math.abs(actualDx) < 0.5 && Math.abs(actualDy) < 0.5

        if (settled) {
            isPanning    = false
            cameraTarget = null

            if (panCallback) {
                const cb = panCallback
                panCallback = null
                cb()
            }
        }

        markRenderDirty()
    }

    drawWayfinderPath()

    if (DEBUG) {
        c.save()
        c.fillStyle = 'rgba(0,0,0,0.6)'
        c.fillRect(10, 10, 240, 60)
        c.fillStyle = 'white'
        c.font      = 'bold 14px Arial'
        c.fillText(`Map X: ${Math.round(background.position.x)} (Limit: ${canvas.width - 2890})`, 20, 30)
        c.fillText(`Map Y: ${Math.round(background.position.y)} (Limit: ${canvas.height - 2352})`, 20, 50)
        c.restore()

        if (pathFinder) {
            pathFinder.nodes.forEach(node => {
                const nx = node.x + background.position.x
                const ny = node.y + background.position.y
                c.fillStyle = 'yellow'
                c.beginPath(); c.arc(nx, ny, 6, 0, Math.PI * 2); c.fill()
                c.fillStyle = 'black'
                c.fillText(node.id, nx + 8, ny)
            })
        }
    }

    if (!isPanning && state !== GameState.PREVIEW && state !== GameState.SEARCH) {
        // These live in searchMap.js which loads after index.js — guard against load order
        if (typeof drawNavigationArrow === 'function') drawNavigationArrow()
        if (typeof checkArrival       === 'function') checkArrival()
    }

    // ================== MOVEMENT INPUT ==================
    if ((state !== GameState.FREE && state !== GameState.NAVIGATE) || freezePlayer) {
        player.moving = false
        return
    }

    // deltaTime-normalised speed (target: 6px @ 60fps = 360px/s)
    const TARGET_FPS    = 60
    const speedPerFrame = 12
    const speedScale    = (delta / (1000 / TARGET_FPS))
    const speed         = speedPerFrame * Math.min(speedScale, 2) // cap at 2× to prevent tunnelling

    let moveX = 0, moveY = 0
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

// ================== RESIZE ==================
function resizeCanvas() {
    canvas.style.width  = '100%'
    canvas.style.height = '100%'
    if (gameStarted) {
        background.position.x = Math.max(canvas.width  - bImage.width,  Math.min(0, background.position.x))
        background.position.y = Math.max(canvas.height - bImage.height, Math.min(0, background.position.y))
    }
}
window.addEventListener('resize', resizeCanvas)

// ================== START ==================
function startGame() {
    if (gameStarted) return
    gameStarted = true

    player.position.x = canvas.width  / 2 - player.width  / 2
    player.position.y = canvas.height / 2 - player.height / 2

    const spawnPoint = { x: 200, y: bImage.height - 300 }
    const offsetX    = -(spawnPoint.x - canvas.width  / 2)
    const offsetY    = -(spawnPoint.y - canvas.height / 2)
    const minX = canvas.width  - bImage.width
    const minY = canvas.height - bImage.height

    background.position.x = Math.min(0, Math.max(minX, offsetX))
    background.position.y = Math.min(0, Math.max(minY, offsetY))

    buildings.forEach(b => {
        b.position.x = b.basePosition.x + background.position.x
        b.position.y = b.basePosition.y + background.position.y
    })
    boundaries.forEach(b => {
        b.position.x = b.basePosition.x + background.position.x
        b.position.y = b.basePosition.y + background.position.y
    })

    // ── NPCs: offset to world position on start ──
    npcs.forEach(npc => {
        npc.position.x = npc.basePosition.x + background.position.x
        npc.position.y = npc.basePosition.y + background.position.y
    })

    markRenderDirty()
    animate()
    resizeCanvas()
}

console.log(`Width: ${bImage.width}, Height: ${bImage.height}`)

async function loadWaypoints() {
    const res  = await fetch('data/waypoints.json')
    const data = await res.json()
    pathFinder = new PathFinder(data)
}

async function init() {
    await Promise.all([
        new Promise(res => bImage.onload           = res),
        new Promise(res => playerUpImage.onload    = res),
        new Promise(res => playerDownImage.onload  = res),
        new Promise(res => playerLeftImage.onload  = res),
        new Promise(res => playerRightImage.onload = res),
        new Promise(res => shadowImage.onload      = res),
        loadBuildings(),
        loadBoundaries(),
        resizeCanvas(),
        loadWaypoints(),
        loadNPCs()          // ← NPC data loaded in parallel with everything else
    ])

    c.imageSmoothingEnabled    = false
    player.width  = playerUpImage.width  / 4
    player.height = playerUpImage.height

    startGame()
}

init()

// ================== INPUT ==================
function resetKeys() {
    keys.w.pressed = keys.a.pressed = keys.s.pressed = keys.d.pressed = false
}

const mobileBtns = {
    w: document.getElementById('btn-w'),
    a: document.getElementById('btn-a'),
    s: document.getElementById('btn-s'),
    d: document.getElementById('btn-d')
}

Object.keys(mobileBtns).forEach(key => {
    const btn = mobileBtns[key]
    if (!btn) return
    btn.addEventListener('touchstart',  e => { e.preventDefault(); keys[key].pressed = true  }, { passive: false })
    btn.addEventListener('touchend',    e => { e.preventDefault(); keys[key].pressed = false })
    btn.addEventListener('touchcancel', ()  => { keys[key].pressed = false })
})

window.addEventListener('keydown', e => { if (keys[e.key]) keys[e.key].pressed = true  })
window.addEventListener('keyup',   e => { if (keys[e.key]) keys[e.key].pressed = false })
window.addEventListener('blur',    () => resetKeys())

// ================== PAN HELPERS (used by searchMap.js) ==================

/**
 * panTo(worldX, worldY, callback)
 * Cancels any running pan, starts a new one, fires callback when done.
 * Safe to call mid-pan — it just redirects the camera smoothly.
 */
function panTo(worldX, worldY, callback = null) {
    cameraTarget = { x: worldX, y: worldY }
    isPanning    = true
    panCallback  = callback || null
}

/**
 * panToPlayer(callback)
 * Player and movables always move together during a pan, so
 * player.position - background.position is stable at any point.
 * We can always compute the world position live — no anchor needed.
 */
function panToPlayer(callback = null) {
    const worldX = player.position.x - background.position.x + player.width  / 2
    const worldY = player.position.y - background.position.y + player.height / 2
    panTo(worldX, worldY, callback)
}