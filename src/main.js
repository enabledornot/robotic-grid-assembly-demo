import * as PIXI from 'pixi.js';
import { gridMap } from './lib.js';
// --- Initialize Pixi Application ---
const app = new PIXI.Application();
await app.init({                    // initialize it
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: 0xFFFFFF,
  resizeTo: window // auto-resize on window size change
});

// Append the canvas
document.body.appendChild(app.canvas);

// --- World container for pan/zoom ---
const world = new PIXI.Container();
app.stage.addChild(world);

// Camera parameters
const camera = { x: 0, y: 0, zoom: 1 };

// Grid settings
const gridSize = 50;
const gridLineColor = 0x696969;

// Example cubes
// const cubes = [
//   { x: 0, y: 0, color: 0xff0000 },
//   { x: 0, y: 1, color: 0x00ff00 }
//   // { x: -1, y: -2, color: 0x0000ff }
// ];

const cubes = gridMap();

  // --- Draw grid function ---
  function drawGrid() {
    const g = new PIXI.Graphics();
    // Scale line width inversely to zoom to keep lines visible
    g.lineStyle(Math.max(0.5, 1 / camera.zoom), gridLineColor);

    const cols = Math.ceil(app.screen.width / (gridSize * camera.zoom)) + 2;
    const rows = Math.ceil(app.screen.height / (gridSize * camera.zoom)) + 2;

    const startX = Math.floor(camera.x / gridSize) - 1;
    const startY = Math.floor(camera.y / gridSize) - 1;

    // Vertical lines
    for (let i = 0; i < cols; i++) {
      const x = (startX + i) * gridSize;
      g.moveTo(x, startY * gridSize);
      g.lineTo(x, (startY + rows) * gridSize);
      g.stroke();
    }

    // Horizontal lines
    for (let j = 0; j < rows; j++) {
      const y = (startY + j) * gridSize;
      g.moveTo(startX * gridSize, y);
      g.lineTo((startX + cols) * gridSize, y);
      g.stroke();
    }

    return g;
  }

// --- Draw cubes ---
function drawCubes() {
  const g = new PIXI.Graphics();
  for (const c of cubes) {
    const px = c.x * gridSize;
    const py = c.y * gridSize;
    g.rect(px, py, gridSize, gridSize);
    g.fill(c.color);
  }
  return g;
}

// --- Main draw ---
function draw() {
  world.removeChildren();

  const grid = drawGrid();
  const cubeGraphics = drawCubes();

  world.addChild(grid);
  world.addChild(cubeGraphics);

  // Apply camera transform
  world.scale.set(camera.zoom);
  world.position.set(-camera.x * camera.zoom, -camera.y * camera.zoom);
}

draw();

// --- Pan handling ---
let dragging = false;
let lastMouse = null;
let firstMouse = null;
let clickThreshold = 5; // pixels

app.canvas.addEventListener('mousedown', e => {
  dragging = true;
  lastMouse = { x: e.clientX, y: e.clientY };
  firstMouse = { x: e.clientX, y: e.clientY };
});

app.canvas.addEventListener('mousemove', e => {
  if (!dragging) return;
  const dx = (e.clientX - lastMouse.x) / camera.zoom;
  const dy = (e.clientY - lastMouse.y) / camera.zoom;
  camera.x -= dx;
  camera.y -= dy;
  lastMouse = { x: e.clientX, y: e.clientY };
  draw();
});

app.canvas.addEventListener('mouseup', e => {
  if (!lastMouse) return;
  if (!firstMouse) return;
  dragging = false;

  const dx = e.clientX - firstMouse.x;
  const dy = e.clientY - firstMouse.y;

  if (Math.abs(dx) < clickThreshold && Math.abs(dy) < clickThreshold) {
    const gridX = Math.floor((e.offsetX / camera.zoom + camera.x) / gridSize);
    const gridY = Math.floor((e.offsetY / camera.zoom + camera.y) / gridSize);
    console.log('Grid clicked at:', gridX, gridY);
  }

  lastMouse = null;
});

app.canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const zoomFactor = 1.1;
  const mouseX = e.offsetX;
  const mouseY = e.offsetY;

  const worldX = mouseX / camera.zoom + camera.x;
  const worldY = mouseY / camera.zoom + camera.y;

  camera.zoom *= e.deltaY < 0 ? zoomFactor : 1 / zoomFactor;
  camera.zoom = Math.max(0.1, Math.min(camera.zoom, 10));

  camera.x = worldX - mouseX / camera.zoom;
  camera.y = worldY - mouseY / camera.zoom;

  draw();
});

// Optional: prevent dragging from continuing outside canvas
window.addEventListener('mouseleave', () => (dragging = false));
