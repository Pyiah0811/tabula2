class Sprite{
    constructor({position, velocity, image, frame = {max : 1}, sprites = {}}) {
        this.position = position
        this.image = image
        this.frame = {...frame, val: 0, elapsed : 0}
        this.sprites = sprites
        this.moving = false

    if (this.image.complete) {
        this.width = this.image.width / this.frame.max
        this.height = this.image.height
    } else {
        this.image.onload = () => {
            this.width = this.image.width / this.frame.max
            this.height = this.image.height
        }
    }
    }

    draw(){
        if (!this.image || !this.image.complete || this.image.naturalWidth === 0) {
            return // 🚫 prevents crash
        }

        const cropWidth = this.image.width / this.frame.max
        const cropHeight = this.image.height

        c.drawImage(
            this.image,
            this.frame.val * cropWidth,
            0,
            cropWidth,
            cropHeight,
            this.position.x,
            this.position.y,
            this.image.width / this.frame.max,
            this.image.height
        )

        if(!this.moving) return

        if (this.frame.max > 1){
            this.frame.elapsed++
        }

        if (this.frame.elapsed % 10 === 0){
            if (this.frame.val < this.frame.max - 1) this.frame.val++
            else this.frame.val = 0
        }
    }
}

// Search Bar Logic
const searchContainer = document.getElementById('searchContainer');

// Toggle the search bar expansion
let lastSearchValue = "";

searchBtn.addEventListener('click', (e) => {
    e.stopPropagation(); 

    const isExpanded = searchContainer.classList.contains('active');
    const currentInput = searchInput.value.trim();

    if (!isExpanded) {
        searchContainer.classList.add('active');
        searchInput.focus();
    } else if (currentInput !== "") {
        handleSearch();
    } else {
        searchContainer.classList.remove('active');
    }
});

window.addEventListener('click', (e) => {
    // If the click is NOT inside the searchContainer, and it's currently active
    if (!searchContainer.contains(e.target) && searchContainer.classList.contains('active')) {
        searchContainer.classList.remove('active');
    }
});