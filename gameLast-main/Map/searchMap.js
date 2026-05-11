let highlightedBuilding = null
let previewLock = null

function showBuildingInfo(building) {
    const panel = document.getElementById('infoPanel')

    panel.innerHTML = `
        <h3>${building.name}</h3>
        <p>${building.description || 'No description available.'}</p>
        
        <button onclick="startNavigation('${building.name}')">Go To</button>
        <button onclick="closePreview()">Close</button>
    `

    panel.style.display = 'block'
}

function focusOnBuilding(buildingName) {
    freezePlayer = true
    if (isPanning || mode === 'preview') return

    const target = buildings.find(
        b => b.name && b.name.toLowerCase().includes(buildingName.toLowerCase())
    )

    if (!target) return console.log("Building not found")

    // ✅ NOW it's safe
    highlightedBuilding = target

    previewLock = {
        x: background.position.x,
        y: background.position.y
    }

    const worldX = target.basePosition.x + (target.width * scale) / 2
    const worldY = target.basePosition.y + (target.height * scale) / 2

    cameraTarget = { x: worldX, y: worldY }
    isPanning = true
    mode = 'preview'

    showBuildingInfo(target)
    navigationTarget = null

    resetKeys()
}

function closePreview() {
    freezePlayer = false
    if (isPanning) return

    highlightedBuilding = null
    document.getElementById('infoPanel').style.display = 'none'

    mode = 'transition'

    returnCameraToPlayer(() => {
        mode = 'free'
    })
}

const searchInput = document.getElementById('searchInput')
const searchBtn = document.getElementById('searchBtn')

// Click icon
searchBtn.addEventListener('click', handleSearch)

// Press Enter
searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSearch()
})

function handleSearch() {
    const value = searchInput.value.trim()
    if (!value) return

    focusOnBuilding(value)
    searchContainer.classList.remove('active'); 
    searchInput.blur();

    searchInput.value = ""
}

let navigationTarget = null

// Refined startNavigation

function startNavigation(buildingName) {
    freezePlayer = false;
    const target = buildings.find(b => 
        b.name && b.name.toLowerCase().includes(buildingName.toLowerCase())
    );

    if (!target || !pathFinder) return;

    // 1. Calculate Player World Position
    const playerWorldX = player.position.x - background.position.x + player.width / 2;
    const playerWorldY = player.position.y - background.position.y + player.height / 2;

    // 2. Find closest nodes for Start and End
    const startNode = pathFinder.getClosestNode(playerWorldX, playerWorldY);
    const endNode = pathFinder.getClosestNode(target.basePosition.x, target.basePosition.y);

    // 3. Generate the path
    currentPath = pathFinder.findPath(startNode, endNode);

    // 4. Reset UI and Transition Camera
    highlightedBuilding = null;
    document.getElementById('infoPanel').style.display = 'none';
    mode = 'transition';

    returnCameraToPlayer(() => {
        navigationTarget = target;
        mode = 'navigate';
    });
}

function drawNavigationArrow() {
    if (!navigationTarget || mode !== 'navigate') return;

    // Target world center
    const targetX = navigationTarget.basePosition.x + (navigationTarget.width * scale) / 2;
    const targetY = navigationTarget.basePosition.y + (navigationTarget.height * scale) / 2;

    // Convert world to current screen coordinates
    const screenX = targetX + background.position.x;
    const screenY = targetY + background.position.y;

    const playerX = player.position.x + player.width / 2;
    const playerY = player.position.y + player.height / 2;

    const dx = screenX - playerX;
    const dy = screenY - playerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // If we are very close, hide the arrow (we arrived)
    if (distance < 50) return;

    const angle = Math.atan2(dy, dx);
    
    // Position arrow in a circle around the player
    const radius = 60; 
    let arrowX = playerX + Math.cos(angle) * radius;
    let arrowY = playerY + Math.sin(angle) * radius;

    // Visual Polish: Pulsing effect
    const pulse = Math.sin(Date.now() / 200) * 5;

    c.save();
    c.translate(arrowX + Math.cos(angle) * pulse, arrowY + Math.sin(angle) * pulse);
    c.rotate(angle);

    // Draw Arrow Shape
    c.beginPath();
    c.moveTo(10, 0);
    c.lineTo(-10, -10);
    c.lineTo(-5, 0);
    c.lineTo(-10, 10);
    c.closePath();
    
    c.fillStyle = '#f1c40f'; // Bright Gold
    c.shadowBlur = 10;
    c.shadowColor = 'black';
    c.fill();
    c.restore();
}

function checkArrival() {
    if (!navigationTarget || mode !== 'navigate') return;

    // Use your existing isPlayerInZone function
    if (isPlayerInZone(player, navigationTarget)) {
        console.log("Destination Reached!");
        navigationTarget = null;
        mode = 'free';
        // Add a visual "You Arrived" toast/popup here if you like
    }
}

function returnCameraToPlayer(callback = null) {
    if (isPanning) return

    // Calculate world coordinates of the player's CURRENT location
    const worldX = player.position.x - background.position.x + player.width / 2
    const worldY = player.position.y - background.position.y + player.height / 2

    cameraTarget = { x: worldX, y: worldY }
    isPanning = true

    // Use a more reliable check than setInterval
    const checkPanning = () => {
        if (!isPanning) {
            if (callback) callback()
        } else {
            requestAnimationFrame(checkPanning)
        }
    }
    requestAnimationFrame(checkPanning)
}

searchInput.addEventListener('focus', () => {
    mode = 'search'
    resetKeys()
})

searchInput.addEventListener('blur', () => {
    if (mode === 'search') {
        mode = 'free'
    }
})