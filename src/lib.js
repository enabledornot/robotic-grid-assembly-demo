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