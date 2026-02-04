import * as PIXI from 'pixi.js';
import { gridMap } from './lib.js';
import { runAlgorithm as executeAlgorithm } from './algorithm.js';
// --- Initialize Pixi Application ---
const app = new PIXI.Application();
const container = document.getElementById('canvas-container');
await app.init({                    // initialize it
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: 0xFFFFFF,
  resizeTo: window // auto-resize on window size change
});

// Append the canvas
container.appendChild(app.canvas);

// --- World container for pan/zoom ---
const world = new PIXI.Container();
app.stage.addChild(world);

// Camera parameters
const camera = { x: 0, y: 0, zoom: 1 };

// Grid settings
const gridSize = 50;
const gridLineColor = 0xA0A0A0;
const dotRadius = gridSize * 0.1;
const arrowGap = gridSize * 0.05;

// Example cubes
// const cubes = [
//   { x: 0, y: 0, color: 0xff0000 },
//   { x: 0, y: 1, color: 0x00ff00 }
//   // { x: -1, y: -2, color: 0x0000ff }
// ];

const cubes = new gridMap();
let edgeData = null;
let animState = null;
let playInterval = null;

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
function drawCubes(cellColors) {
  const g = new PIXI.Graphics();
  cubes.forEach((cube) => {
    const px = cube.x * gridSize;
    const py = cube.y * gridSize;
    let color = cube.color;
    if (edgeData) {
      const key = `${cube.x - edgeData.minX},${cube.y - edgeData.minY}`;
      if (cellColors[key] !== undefined) color = cellColors[key];
    }
    g.rect(px, py, gridSize, gridSize);
    g.fill(color);
    if (edgeData) {
      g.circle(px + gridSize / 2, py + gridSize / 2, dotRadius);
      g.fill(0x000000);
    }
  });
  return g;
}

// --- Draw a single arrow from (x1,y1) to (x2,y2) ---
function drawArrow(g, x1, y1, x2, y2, color) {
  const headLen = gridSize * 0.25;
  const headWidth = gridSize * 0.15;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / len;
  const uy = dy / len;

  // Pull start/end inward past the dot with a visible gap
  const offset = dotRadius + arrowGap;
  const sx = x1 + offset * ux;
  const sy = y1 + offset * uy;
  const ex = x2 - offset * ux;
  const ey = y2 - offset * uy;

  // Shaft stops at arrowhead base
  const baseX = ex - headLen * ux;
  const baseY = ey - headLen * uy;

  g.moveTo(sx, sy);
  g.lineTo(baseX, baseY);
  g.stroke({ color, width: 2 });

  // Filled arrowhead triangle
  g.moveTo(ex, ey);
  g.lineTo(baseX - headWidth * uy, baseY + headWidth * ux);
  g.lineTo(baseX + headWidth * uy, baseY - headWidth * ux);
  g.closePath();
  g.fill(color);
}

// --- Draw oriented edges as arrows ---
function drawEdges(edges) {
  const g = new PIXI.Graphics();
  if (!edgeData) return g;

  const { minX, minY } = edgeData;
  const color = 0x000000;

  for (const edge of edges) {
    if (edge.edgeType === 'vertical') {
      const col = edge.col + minX;
      const fromRow = (edge.orientation === 1 ? edge.row     : edge.row + 1) + minY;
      const toRow   = (edge.orientation === 1 ? edge.row + 1 : edge.row)     + minY;
      drawArrow(g,
        (col + 0.5) * gridSize, (fromRow + 0.5) * gridSize,
        (col + 0.5) * gridSize, (toRow   + 0.5) * gridSize,
        color
      );
    } else if (edge.edgeType === 'horizontal') {
      const leftCol  = edge.col + minX;
      const rightCol = edge.col + 1 + minX;
      const row = edge.row + minY;
      const fromCol = edge.orientation === 1 ? leftCol  : rightCol;
      const toCol   = edge.orientation === 1 ? rightCol : leftCol;
      drawArrow(g,
        (fromCol + 0.5) * gridSize, (row + 0.5) * gridSize,
        (toCol   + 0.5) * gridSize, (row + 0.5) * gridSize,
        color
      );
    }
  }

  return g;
}

// function drawCube(cube) {
//   const px = c.x * gridSize;
//   const py = cy * gridSize;
//   g.rect(px, py, gridSize, gridSize);
//   g.fill(c.color);
// }

// --- Main draw ---
function draw() {
  world.removeChildren();

  // Replay event log up to current animation position
  const cellColors = {};
  const edges = [];
  if (edgeData && animState) {
    const maxEvent = animState.position === 0 ? 0 : animState.steps[animState.position - 1];
    const events = edgeData.eventLog.events;
    for (let i = 0; i < maxEvent; i++) {
      const ev = events[i];
      if (ev.type === 'updateCell') cellColors[`${ev.col},${ev.row}`] = ev.color;
      else if (ev.type === 'addEdge') edges.push(ev);
    }
  }

  const grid = drawGrid();
  const cubeGraphics = drawCubes(cellColors);
  const edgeGraphics = drawEdges(edges);

  world.addChild(grid);
  world.addChild(cubeGraphics);
  world.addChild(edgeGraphics);

  // Apply camera transform
  world.scale.set(camera.zoom);
  world.position.set(-camera.x * camera.zoom, -camera.y * camera.zoom);
}

draw();

function addCube(cordX, cordY, color) {
  cubes.add(cordX, cordY, {x: cordX, y: cordY, color: color});
  draw();
}

function checkCube(cordX, cordY) {
  return cubes.get(cordX, cordY);
}

function removeCube(cordX, cordY) {
  const remCube = cubes.clear(cordX, cordY);
  draw();
  return remCube;
}

function cubeToMatrix() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let count = 0;

  cubes.forEach((cube) => {
    count++;
    if (cube.x < minX) minX = cube.x;
    if (cube.x > maxX) maxX = cube.x;
    if (cube.y < minY) minY = cube.y;
    if (cube.y > maxY) maxY = cube.y;
  });

  if (minX === Infinity) return { matrix: [], count: 0 };

  const rows = maxY - minY + 1;
  const cols = maxX - minX + 1;
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(false));

  cubes.forEach((cube) => {
    matrix[cube.y - minY][cube.x - minX] = true;
  });

  return { matrix, count, minX, minY };
}

function click(cordX, cordY) {
  stopPlay();
  animState = null;
  edgeData = null;
  updateScrubber();
  updatePlayIcon();
  if (checkCube(cordX, cordY)) {
    removeCube(cordX, cordY);
  } else if (!eraserActive) {
    addCube(cordX, cordY, 0x808080);
  }
}

function paintCell(gridX, gridY) {
  if (paintMode === 'add' && !checkCube(gridX, gridY)) {
    addCube(gridX, gridY, 0x808080);
  } else if (paintMode === 'remove' && checkCube(gridX, gridY)) {
    removeCube(gridX, gridY);
  }
}

// --- Pan handling ---
let dragging = false;
let lastMouse = null;
let firstMouse = null;
let clickThreshold = 5; // pixels
let shiftDragging = false;
let paintMode = null; // 'add' or 'remove'
let eraserActive = false;

app.canvas.addEventListener('mousedown', e => {
  if (e.shiftKey) {
    shiftDragging = true;
    const gridX = Math.floor((e.offsetX / camera.zoom + camera.x) / gridSize);
    const gridY = Math.floor((e.offsetY / camera.zoom + camera.y) / gridSize);
    paintMode = eraserActive ? 'remove' : 'add';
    stopPlay();
    animState = null;
    edgeData = null;
    updateScrubber();
    updatePlayIcon();
    paintCell(gridX, gridY);
  } else {
    dragging = true;
    lastMouse = { x: e.clientX, y: e.clientY };
    firstMouse = { x: e.clientX, y: e.clientY };
  }
});

app.canvas.addEventListener('mousemove', e => {
  if (shiftDragging) {
    const gridX = Math.floor((e.offsetX / camera.zoom + camera.x) / gridSize);
    const gridY = Math.floor((e.offsetY / camera.zoom + camera.y) / gridSize);
    paintCell(gridX, gridY);
    return;
  }
  if (!dragging) return;
  const dx = (e.clientX - lastMouse.x) / camera.zoom;
  const dy = (e.clientY - lastMouse.y) / camera.zoom;
  camera.x -= dx;
  camera.y -= dy;
  lastMouse = { x: e.clientX, y: e.clientY };
  draw();
});

app.canvas.addEventListener('mouseup', e => {
  if (shiftDragging) {
    shiftDragging = false;
    paintMode = null;
    return;
  }
  if (!lastMouse) return;
  if (!firstMouse) return;
  dragging = false;

  const dx = e.clientX - firstMouse.x;
  const dy = e.clientY - firstMouse.y;

  if (Math.abs(dx) < clickThreshold && Math.abs(dy) < clickThreshold) {
    const gridX = Math.floor((e.offsetX / camera.zoom + camera.x) / gridSize);
    const gridY = Math.floor((e.offsetY / camera.zoom + camera.y) / gridSize);
    // console.log('Grid clicked at:', gridX, gridY);
    click(gridX, gridY);
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
window.addEventListener('mouseleave', () => { dragging = false; shiftDragging = false; });
window.addEventListener('resize', draw);

// --- Output Helper ---
function clearOutput() {
  const output = document.getElementById('algorithm-output');
  output.textContent = '';
  output.scrollTop = 0;
}

function appendOutput(text) {
  const output = document.getElementById('algorithm-output');
  output.textContent += (output.textContent ? '\n' : '') + text;
  output.scrollTop = output.scrollHeight; // auto-scroll to bottom
}

// --- Run Algorithm ---
function runAlgorithm() {
  clearOutput();
  appendOutput('Starting algorithm...');
  const { matrix, count, minX, minY } = cubeToMatrix();

  if (count === 0) {
    appendOutput('No cubes placed on grid.');
    return;
  }

  const rows = matrix.length;
  const cols = matrix[0].length;
  appendOutput(`Matrix: ${rows}x${cols} (${count} cubes)`);

  const { eventLog } = executeAlgorithm(matrix);
  edgeData = { eventLog, minX, minY };
  const vertCount = eventLog.events.filter(e => e.type === 'addEdge' && e.edgeType === 'vertical').length;
  const horzCount = eventLog.events.filter(e => e.type === 'addEdge' && e.edgeType === 'horizontal').length;
  appendOutput(`Vertical edges: ${vertCount}`);
  appendOutput(`Horizontal edges: ${horzCount}`);
  appendOutput(`Steps: wavefront=${eventLog.stepsForLevel('wavefront').length} component=${eventLog.stepsForLevel('component').length} edge=${eventLog.stepsForLevel('edge').length} full=${eventLog.stepsForLevel('full').length}`);
  const level = document.getElementById('anim-level').value;
  animState = { steps: computeSteps(level), position: 0 };
  updateScrubber();
  draw();
  startPlay();
}

// --- Animation helpers ---
function computeSteps(level) {
  if (!edgeData) return [];
  return edgeData.eventLog.stepsForLevel(level);
}

function updateScrubber() {
  const slider = document.getElementById('speed-slider');
  const label = document.getElementById('speed-val');
  if (!animState) {
    slider.max = 0;
    slider.value = 0;
    label.textContent = '0 / 0';
  } else {
    slider.max = animState.steps.length;
    slider.value = animState.position;
    label.textContent = `${animState.position} / ${animState.steps.length}`;
  }
}

function updatePlayIcon() {
  const playing = playInterval !== null;
  document.getElementById('icon-play').style.display = playing ? 'none' : 'block';
  document.getElementById('icon-pause').style.display = playing ? 'block' : 'none';
}

function stopPlay() {
  if (playInterval !== null) {
    clearInterval(playInterval);
    playInterval = null;
    updatePlayIcon();
  }
}

function startPlay() {
  stopPlay();
  if (!animState) return;
  if (animState.position >= animState.steps.length) {
    animState.position = 0;
    updateScrubber();
    draw();
  }
  playInterval = setInterval(() => {
    if (!animState) { stopPlay(); return; }
    if (animState.position >= animState.steps.length) { stopPlay(); return; }
    animState.position++;
    updateScrubber();
    draw();
  }, 500);
  updatePlayIcon();
}

// --- Event handlers ---
document.getElementById('run-btn').addEventListener('click', runAlgorithm);

document.getElementById('eraser-btn').addEventListener('click', () => {
  eraserActive = !eraserActive;
  document.getElementById('eraser-btn').classList.toggle('active', eraserActive);
});

document.addEventListener('keydown', e => {
  if (e.key === 'Control' && !e.repeat) {
    eraserActive = !eraserActive;
    document.getElementById('eraser-btn').classList.toggle('active', eraserActive);
  }
});

document.getElementById('clear-btn').addEventListener('click', () => {
  stopPlay();
  animState = null;
  edgeData = null;
  updateScrubber();
  updatePlayIcon();
  cubes.map.clear();
  draw();
});

document.getElementById('play-btn').addEventListener('click', () => {
  if (playInterval !== null) stopPlay();
  else if (!edgeData) runAlgorithm();
  else startPlay();
});

document.getElementById('speed-slider').addEventListener('input', (e) => {
  if (!animState) return;
  stopPlay();
  animState.position = parseInt(e.target.value);
  updateScrubber();
  draw();
});

document.getElementById('anim-level').addEventListener('change', () => {
  if (!edgeData) return;
  stopPlay();
  animState = { steps: computeSteps(document.getElementById('anim-level').value), position: 0 };
  updateScrubber();
  draw();
});