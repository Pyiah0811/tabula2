// ================== DOM REFS (cached once) ==================
const searchInput     = document.getElementById('searchInput')
const searchBtn       = document.getElementById('searchBtn')
const searchContainer = document.querySelector('.search-container')
const infoPanel       = document.getElementById('infoPanel')
const roomPanel       = document.getElementById('roomPanel')
const roomList        = document.getElementById('roomList')

let navigationTarget = null   // shared with index.js

// ================== BUILDING INFO PANEL ==================
function showBuildingInfo(building) {
    infoPanel.innerHTML = `
        <h3>${building.name}</h3>
        <p>${building.description || 'No description available.'}</p>
        <button onclick="startNavigation('${building.name}')">Go To Building</button>
        <button onclick="closePreview()">Close</button>
        <div class="search-counter">${currentSearchIndex + 1} / ${searchResults.length}</div>
        ${searchResults.length > 1 ? `
        <div class="search-nav">
            <button onclick="prevSearchResult()">◀ Prev</button>
            <button onclick="nextSearchResult()">Next ▶</button>
        </div>` : ''}
    `
    infoPanel.style.display = 'block'

    if (building.room_meta) {
        const floors = {}
        building.room_meta.split(', ').forEach(roomStr => {
            const parts    = roomStr.split(' (Floor ')
            const roomName = parts[0]
            const floorNum = parts[1] ? parts[1].replace(')', '') : 'Unknown'
            if (!floors[floorNum]) floors[floorNum] = []
            floors[floorNum].push(roomName)
        })

        roomList.innerHTML = Object.keys(floors)
            .sort((a, b) => a - b)
            .map(floor => `
                <div class="floor-section">
                    <div class="floor-header">FLOOR ${floor}</div>
                    ${floors[floor].map(name => `<div class="room-item">${name}</div>`).join('')}
                </div>`)
            .join('')
    } else {
        roomList.innerHTML = "<div class='room-item'>No rooms available</div>"
    }
    roomPanel.style.display = 'block'
}

// ================== FOCUS / PREVIEW ==================
function focusOnBuilding(target) {
    if (!target) return

    freezePlayer        = true
    highlightedBuilding = target

    if (state !== GameState.PREVIEW) {
        previewLock = { x: background.position.x, y: background.position.y }
    }

    const worldX = target.basePosition.x + (target.width  || target.image.width)  * scale / 2
    const worldY = target.basePosition.y + (target.height || target.image.height) * scale / 2

    state            = GameState.PREVIEW
    navigationTarget = null
    resetKeys()

    panTo(worldX, worldY, () => showBuildingInfo(target))
}

function closePreview() {
    freezePlayer        = false
    highlightedBuilding = null
    infoPanel.style.display = 'none'
    roomPanel.style.display = 'none'

    state = GameState.TRANSITION
    panToPlayer(() => { state = GameState.FREE })
}

// ================== SEARCH ==================
function handleSearch() {
    const value = searchInput.value.trim().toLowerCase()
    if (!value) return

    searchResults = buildings.filter(b =>
        (b.name      && b.name.toLowerCase().includes(value)) ||
        (b.room_meta && b.room_meta.toLowerCase().includes(value))
    )

    if (searchResults.length === 0) {
        console.log('No matching buildings or rooms found')
        return
    }

    currentSearchIndex = 0
    focusOnCurrentSearchResult()

    searchContainer.classList.remove('active')
    searchInput.blur()
    searchInput.value = ''
}

function focusOnCurrentSearchResult() {
    const target = searchResults[currentSearchIndex]
    if (target) focusOnBuilding(target)
}

function nextSearchResult() {
    if (searchResults.length <= 1) return
    currentSearchIndex = (currentSearchIndex + 1) % searchResults.length
    focusOnCurrentSearchResult()
}

function prevSearchResult() {
    if (searchResults.length <= 1) return
    currentSearchIndex = (currentSearchIndex - 1 + searchResults.length) % searchResults.length
    focusOnCurrentSearchResult()
}

// ================== SEARCH BAR TOGGLE ==================
searchBtn.addEventListener('click', () => {
    if (!searchContainer.classList.contains('active')) {
        searchContainer.classList.add('active')
        searchInput.focus()
    } else {
        handleSearch()
    }
})

searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter')  handleSearch()
    if (e.key === 'Escape') {
        searchContainer.classList.remove('active')
        searchInput.blur()
    }
})

searchInput.addEventListener('focus', () => {
    state        = GameState.SEARCH
    freezePlayer = true     // prevent movement while typing
    resetKeys()
})

searchInput.addEventListener('blur', () => {
    if (state === GameState.SEARCH) {
        state        = GameState.FREE
        freezePlayer = false
    }
    // Delay so a click on searchBtn registers before the bar closes
    setTimeout(() => {
        if (!searchInput.value) searchContainer.classList.remove('active')
    }, 150)
})

// ================== NAVIGATION ==================
function startNavigation(buildingName) {
    const target = buildings.find(b =>
        b.name && b.name.toLowerCase().includes(buildingName.toLowerCase())
    )
    if (!target || !pathFinder) return

    const playerWorldX = player.position.x - background.position.x + player.width  / 2
    const playerWorldY = player.position.y - background.position.y + player.height / 2

    const startNode = pathFinder.getClosestNode(playerWorldX, playerWorldY)
    const endNode   = pathFinder.getClosestNode(target.basePosition.x, target.basePosition.y)
    currentPath     = pathFinder.findPath(startNode, endNode)

    freezePlayer            = false
    highlightedBuilding     = null
    infoPanel.style.display = 'none'
    roomPanel.style.display = 'none'

    state = GameState.TRANSITION

    // panToPlayer redirects any running pan (including the preview pan)
    panToPlayer(() => {
        navigationTarget = target
        state            = GameState.NAVIGATE
    })
}

function drawNavigationArrow() {
    if (!navigationTarget || state !== GameState.NAVIGATE) return

    const targetX = navigationTarget.basePosition.x + (navigationTarget.width  || navigationTarget.image.width)  * scale / 2
    const targetY = navigationTarget.basePosition.y + (navigationTarget.height || navigationTarget.image.height) * scale / 2

    const screenX = targetX + background.position.x
    const screenY = targetY + background.position.y
    const playerX = player.position.x + player.width  / 2
    const playerY = player.position.y + player.height / 2

    const dx = screenX - playerX
    const dy = screenY - playerY
    if (Math.sqrt(dx * dx + dy * dy) < 50) return

    const angle  = Math.atan2(dy, dx)
    const pulse  = Math.sin(Date.now() / 200) * 5
    const arrowX = playerX + Math.cos(angle) * (60 + pulse)
    const arrowY = playerY + Math.sin(angle) * (60 + pulse)

    c.save()
    c.translate(arrowX, arrowY)
    c.rotate(angle)
    c.beginPath()
    c.moveTo(10,   0)
    c.lineTo(-10, -10)
    c.lineTo(-5,   0)
    c.lineTo(-10,  10)
    c.closePath()
    c.fillStyle   = '#f1c40f'
    c.shadowBlur  = 10
    c.shadowColor = 'black'
    c.fill()
    c.restore()
}

function checkArrival() {
    if (!navigationTarget || state !== GameState.NAVIGATE) return
    if (isPlayerInZone(player, navigationTarget)) {
        navigationTarget = null
        state            = GameState.FREE
    }
}

// ================== LEGACY WRAPPER ==================
// Keeps any external calls to returnCameraToPlayer() working
function returnCameraToPlayer(callback = null) {
    panToPlayer(callback)
}