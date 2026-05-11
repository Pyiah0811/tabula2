class PathFinder {
    constructor(nodes) {
        this.nodes = nodes;
    }

    // Find the closest waypoint to any given world coordinate
    getClosestNode(x, y) {
        return this.nodes.reduce((prev, curr) => {
            const prevDist = Math.hypot(x - prev.x, y - prev.y);
            const currDist = Math.hypot(x - curr.x, y - curr.y);
            return currDist < prevDist ? curr : prev;
        });
    }

    // A* implementation
    findPath(startNode, targetNode) {
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
            // Get node in openSet with lowest fScore
            let current = openSet.reduce((a, b) => fScore.get(a.id) < fScore.get(b.id) ? a : b);

            if (current.id === targetNode.id) {
                return this.reconstructPath(cameFrom, current);
            }

            openSet = openSet.filter(n => n !== current);

            current.neighbors.forEach(neighborId => {
                let neighbor = this.nodes.find(n => n.id === neighborId);

                if (!neighbor) return; // ✅ prevent crash

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
        return []; // No path found
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

