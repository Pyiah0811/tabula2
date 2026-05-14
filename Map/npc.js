    // =============================================
    //  npc.js — NPC System
    //  Loads NPCs from api_npcs.php, renders them
    //  on the map, detects proximity, and runs
    //  the dialogue panel.
    // =============================================

    const npcs = []          // all loaded NPC objects
    let activeNPC    = null  // NPC currently in dialogue
    let dialogueLine = 0     // current line index

    // ── Dialogue DOM refs (built once) ──
    let dlgPanel  = null
    let dlgName   = null
    let dlgText   = null
    let dlgNext   = null
    let dlgClose  = null

    // ── Proximity prompt ref ──
    let npcPrompt = null
    let npcPromptTarget = null  // which NPC the prompt is for

    // =============================================
    //  LOAD NPCs FROM API
    // =============================================
    async function loadNPCs() {
        try {
            const res  = await fetch('../php/api_npc.php')
            if (!res.ok) { console.error('Failed to load NPCs:', res.status); return }
            const data = await res.json()
            if (data.error) { console.error('NPC API error:', data.error); return }

            data.forEach(n => {
                const img     = new Image()
                img.decoding  = 'async'
                img.src       = n.image

                const npc = {
                    id:          n.id,
                    name:        n.name,
                    image:       img,
                    zoneRadius:  n.zone_radius,
                    dialogue:    n.dialogue,   // string[]
                    basePosition:{ x: n.x, y: n.y },
                    position:    { x: n.x, y: n.y },  // updated when map moves
                }

                npcs.push(npc)
                console.log('NPC loaded:', npc.name, 'at', npc.position.x, npc.position.y)
                movables.push(npc)  // so NPC moves with the map like buildings do
            })
        } catch (e) {
            console.error('NPC load error:', e)
        }
    }

    // =============================================
    //  RENDER NPCs
    //  Call this from animate() after buildings/player draw
    // =============================================
    function drawNPCs() {
        npcs.forEach(npc => {
            if (!npc.image || !npc.image.complete || npc.image.naturalWidth === 0) return
            const w = npc.image.naturalWidth || 64
            const h = npc.image.naturalHeight || 64
            const x = Math.round(npc.position.x)
            const y = Math.round(npc.position.y)
            const bob = Math.abs(Math.sin(Date.now() / 800) * 5)
            const tagY = y - 8

            c.save()
            if (activeNPC && activeNPC !== npc) c.globalAlpha = 0.5
            c.drawImage(npc.image, x, y - bob, w, h)

            // Name tag
            c.font      = 'bold 11px Courier New'
            c.textAlign = 'center'
            c.fillStyle = 'rgba(0,0,0,0.7)'
            c.fillText(npc.name, x + w / 2 + 1, tagY + 1)
            c.fillStyle = '#f1c40f'
            c.fillText(npc.name, x + w / 2, tagY)
            c.textAlign = 'left'
            c.restore()

            // "!"
            if (isPlayerNearNPC(npc) && !activeNPC) {
                const bounce = Math.sin(Date.now() / 300) * 4
                c.save()
                c.font      = 'bold 16px Courier New'
                c.textAlign = 'center'
                c.fillStyle = '#f1c40f'
                c.shadowBlur  = 4
                c.shadowColor = '#000'
                c.fillText('!', x + w / 2, tagY - 14 + bounce)
                c.restore()
            }
        })
    }

    // =============================================
    //  PROXIMITY
    // =============================================
    function isPlayerNearNPC(npc) {
        const w = npc.image.naturalWidth || 64
        const h = npc.image.naturalHeight || 64
        const px = player.position.x + player.width  / 2
        const py = player.position.y + player.height / 2
        const nx = npc.position.x + w / 2
        const ny = npc.position.y + h / 2
        return Math.hypot(px - nx, py - ny) < npc.zoneRadius
    }
    // Called every frame from animate() in index.js
    function checkNPCProximity() {
        // Don't show prompts during dialogue, panning, or non-free states
        if (activeNPC) { hideNPCPrompt(); return }
        if (state !== GameState.FREE) { hideNPCPrompt(); return }

        let found = null
        for (const npc of npcs) {
            if (isPlayerNearNPC(npc)) { found = npc; break }
        }

        if (found) {
            if (npcPromptTarget !== found) {
                npcPromptTarget = found
                showNPCPrompt(found)
            }
        } else {
            if (npcPromptTarget) {
                npcPromptTarget = null
                hideNPCPrompt()
            }
        }
    }

    function showNPCPrompt(npc) {
        if (!npcPrompt) buildNPCPrompt()
        npcPrompt.querySelector('.npc-prompt-name').textContent = npc.name
        npcPrompt.querySelector('.npc-talk-btn').onclick = () => startDialogue(npc)
        npcPrompt.style.display = 'flex'
    }

    function hideNPCPrompt() {
        if (npcPrompt) npcPrompt.style.display = 'none'
    }

    function buildNPCPrompt() {
        npcPrompt = document.createElement('div')
        npcPrompt.id = 'npcPrompt'
        npcPrompt.innerHTML = `
            <span class="npc-prompt-name"></span>
            <button class="npc-talk-btn">💬 TALK</button>
        `
        document.querySelector('.canvas-wrapper').appendChild(npcPrompt)
    }

    // =============================================
    //  DIALOGUE
    // =============================================
    function buildDialoguePanel() {
        dlgPanel = document.createElement('div')
        dlgPanel.id = 'dialoguePanel'
        dlgPanel.innerHTML = `
            <div class="dlg-portrait" id="dlgPortrait"></div>
            <div class="dlg-body">
                <div class="dlg-name" id="dlgName"></div>
                <div class="dlg-text" id="dlgText"></div>
                <div class="dlg-actions">
                    <button class="dlg-btn" id="dlgNext">Next ▶</button>
                    <button class="dlg-btn dlg-btn-close" id="dlgClose">✕ Close</button>
                </div>
            </div>
        `
        document.querySelector('.canvas-wrapper').appendChild(dlgPanel)

        dlgName  = document.getElementById('dlgName')
        dlgText  = document.getElementById('dlgText')
        dlgNext  = document.getElementById('dlgNext')
        dlgClose = document.getElementById('dlgClose')

        dlgNext.addEventListener('click',  advanceDialogue)
        dlgClose.addEventListener('click', endDialogue)
    }

    function startDialogue(npc) {
        if (!dlgPanel) buildDialoguePanel()

        activeNPC    = npc
        dialogueLine = 0
        freezePlayer = true
        resetKeys()
        hideNPCPrompt()

        // Portrait — show NPC sprite as a small image
        const portrait = document.getElementById('dlgPortrait')
        if (npc.image.complete && npc.image.naturalWidth > 0) {
            portrait.style.backgroundImage = `url('${npc.image.src}')`
        } else {
            portrait.style.backgroundImage = ''
        }

        dlgName.textContent = npc.name
        showDialogueLine()
        dlgPanel.style.display = 'flex'
    }

    function showDialogueLine() {
        if (!activeNPC) return
        const lines = activeNPC.dialogue
        const line  = lines[dialogueLine] || ''

        // Typewriter effect
        typewriterEffect(dlgText, line, 28)

        // Update Next button label
        dlgNext.textContent = dialogueLine >= lines.length - 1 ? 'Done ▶' : 'Next ▶'
    }

    function advanceDialogue() {
        if (!activeNPC) return
        const lines = activeNPC.dialogue

        if (dialogueLine < lines.length - 1) {
            dialogueLine++
            showDialogueLine()
        } else {
            endDialogue()
        }
    }

    function endDialogue() {
        if (dlgPanel) dlgPanel.style.display = 'none'
        activeNPC    = null
        dialogueLine = 0
        freezePlayer = false
    }

    // ── Typewriter effect ──
    let typewriterTimer = null
    function typewriterEffect(el, text, speed = 30) {
        if (typewriterTimer) clearInterval(typewriterTimer)
        el.textContent = ''
        let i = 0
        typewriterTimer = setInterval(() => {
            el.textContent += text[i]
            i++
            if (i >= text.length) clearInterval(typewriterTimer)
        }, speed)
    }