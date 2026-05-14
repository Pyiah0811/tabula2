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
};