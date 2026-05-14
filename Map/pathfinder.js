class PathFinder {
    constructor(nodes) {
        this.nodes = nodes;
        // Optimization: Create a lookup map so we don't use .find() in loops
        this.nodeMap = new Map();
        nodes.forEach(node => this.nodeMap.set(node.id, node));
    }

    getClosestNode(x, y) {
        return this.nodes.reduce((prev, curr) => {
            const prevDist = Math.hypot(x - prev.x, y - prev.y);
            const currDist = Math.hypot(x - curr.x, y - curr.y);
            return currDist < prevDist ? curr : prev;
        });
    }

    findPath(startNode, targetNode) {
        if (!startNode || !targetNode) return [];
        
        let openSet = [startNode];
        let cameFrom = new Map();
        let gScore = new Map(); 
        let fScore = new Map();

        this.nodes.forEach(n => {
            gScore.set(n.id, Infinity);
            fScore.set(n.id, Infinity);
        });

        gScore.set(startNode.id, 0);
        fScore.set(startNode.id, Math.hypot(startNode.x - targetNode.x, startNode.y - targetNode.y));

        while (openSet.length > 0) {
            // Lowest fScore node
            let current = openSet.reduce((a, b) => fScore.get(a.id) < fScore.get(b.id) ? a : b);

            if (current.id === targetNode.id) {
                return this.reconstructPath(cameFrom, current);
            }

            openSet = openSet.filter(n => n !== current);

            current.neighbors.forEach(neighborId => {
                // INSTANT LOOKUP using the Map instead of .find()
                let neighbor = this.nodeMap.get(neighborId);

                if (!neighbor) return; 

                let tentativeGScore =
                    gScore.get(current.id) +
                    Math.hypot(current.x - neighbor.x, current.y - neighbor.y);

                if (tentativeGScore < gScore.get(neighbor.id)) {
                    cameFrom.set(neighbor.id, current);
                    gScore.set(neighbor.id, tentativeGScore);
                    fScore.set(
                        neighbor.id,
                        tentativeGScore +
                        Math.hypot(neighbor.x - targetNode.x, neighbor.y - targetNode.y)
                    );

                    if (!openSet.includes(neighbor)) openSet.push(neighbor);
                }
            });
        }
        return []; 
    }

    reconstructPath(cameFrom, current) {
        const path = [current];
        while (cameFrom.has(current.id)) {
            current = cameFrom.get(current.id);
            path.unshift(current);
        }
        return path;
    }
}

