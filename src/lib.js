export class gridMap {
    constructor() {
        this.map = new Map();
    }
    key(x, y) {
        return `${x},${y}`
    }
    get(x, y) {
        return this.map.get(this.key(x, y));
    }
    add(x, y, value) {
        this.map.set(this.key(x, y), value);
    }
    clear(x, y) {
        return this.map.delete(this.key(x, y));
    }
    forEach(fn) {
        this.map.forEach(fn);
    }
}

export class EventLog {
    constructor() {
        this.events = [];
        this.componentBoundaries = [];
        this.wavefrontBoundaries = [];
    }

    addEdge(edgeType, col, row, orientation) {
        this.events.push({ type: 'addEdge', edgeType, col, row, orientation });
    }

    updateCell(col, row, color) {
        this.events.push({ type: 'updateCell', col, row, color });
    }

    markComponent() {
        this.componentBoundaries.push(this.events.length);
    }

    markWavefront() {
        this.wavefrontBoundaries.push(this.events.length);
    }

    stepsForLevel(level) {
        const len = this.events.length;
        if (len === 0) return [];
        switch (level) {
            case 'full':
                return Array.from({ length: len }, (_, i) => i + 1);
            case 'edge': {
                const steps = [];
                for (let i = 0; i < len; i++) {
                    if (this.events[i].type === 'addEdge') steps.push(i + 1);
                }
                return steps;
            }
            case 'component':
                return this.componentBoundaries.filter((v, i) => v > 0 && (i === 0 || v !== this.componentBoundaries[i - 1]));
            case 'wavefront':
                return this.wavefrontBoundaries.filter((v, i) => v > 0 && (i === 0 || v !== this.wavefrontBoundaries[i - 1]));
            default:
                return [];
        }
    }
}