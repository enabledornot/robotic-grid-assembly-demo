import * as PIXI from 'pixi.js';
import { gridMap } from './lib.js';
import { runAlgorithm as executeAlgorithm } from './algorithm.js';
const presets = import.meta.glob('./models/*.json', { eager: true });
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
function drawCubes(cellColors, blackDots) {
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
      g.fill(blackDots.has(`${cube.x - edgeData.minX},${cube.y - edgeData.minY}`) ? 0x000000 : 0x808080);
    }

    // Highlight the selected start vertex with a colored border
    if (selectedStartVertex && cube.x === selectedStartVertex.gridX && cube.y === selectedStartVertex.gridY) {
      g.rect(px + 2, py + 2, gridSize - 4, gridSize - 4);
      g.stroke({ color: 0x00ff00, width: 4 });
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
  const color = 0x808080;

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
  const blackDots = new Set();
  if (edgeData && animState) {
    const maxEvent = animState.position === 0 ? 0 : animState.steps[animState.position - 1];
    const events = edgeData.eventLog.events;
    for (let i = 0; i < maxEvent; i++) {
      const ev = events[i];
      if (ev.type === 'updateCell') cellColors[`${ev.col},${ev.row}`] = ev.color;
      else if (ev.type === 'addEdge') edges.push(ev);
      else if (ev.type === 'colorDot') blackDots.add(`${ev.col},${ev.row}`);
    }
  }

  const grid = drawGrid();
  const cubeGraphics = drawCubes(cellColors, blackDots);
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

function isConnected(matrix, count) {
  const rows = matrix.length;
  const cols = matrix[0].length;

  // Find first occupied cell
  let startR = -1, startC = -1;
  outer:
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (matrix[r][c]) { startR = r; startC = c; break outer; }
    }
  }

  // BFS using 4-directional adjacency
  const visited = new Set();
  const queue = [[startR, startC]];
  visited.add(`${startR},${startC}`);
  const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];

  while (queue.length > 0) {
    const [r, c] = queue.shift();
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      const key = `${nr},${nc}`;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && matrix[nr][nc] && !visited.has(key)) {
        visited.add(key);
        queue.push([nr, nc]);
      }
    }
  }

  return visited.size === count;
}

function click(cordX, cordY) {
  stopPlay();
  animState = null;
  edgeData = null;
  updateScrubber();
  updatePlayIcon();
  if (checkCube(cordX, cordY)) {
    removeCube(cordX, cordY);
    // If the removed cube was the selected start vertex, clear it
    if (selectedStartVertex && selectedStartVertex.gridX === cordX && selectedStartVertex.gridY === cordY) {
      selectedStartVertex = null;
      selectingStartVertex = false;
      document.getElementById('remove-start-btn').disabled = true;
      document.getElementById('select-start-btn').textContent = 'Select Start Vertex';
      document.getElementById('select-start-btn').style.backgroundColor = '';
    }
  } else if (!eraserActive) {
    addCube(cordX, cordY, 0x808080);
  }
}

function runAlgorithmWithStartVertex(gridX, gridY) {
  clearOutput();
  appendOutput('Starting algorithm from selected vertex...');
  const { matrix, count, minX, minY } = cubeToMatrix();

  if (count === 0) {
    appendOutput('No cubes placed on grid.');
    return;
  }

  // Check if selected vertex is within bounds
  const matrixX = gridX - minX;
  const matrixY = gridY - minY;
  if (matrixX < 0 || matrixX >= matrix[0].length || matrixY < 0 || matrixY >= matrix.length || !matrix[matrixY][matrixX]) {
    appendOutput('Error: Selected vertex must be on a cube.');
    return;
  }

  const rows = matrix.length;
  const cols = matrix[0].length;
  appendOutput(`Matrix: ${rows}x${cols} (${count} cubes)`);

  if (!isConnected(matrix, count)) {
    appendOutput('Error: Figure is not connected. All cubes must be adjacent (up/down/left/right).');
    return;
  }

  const { eventLog, vcompCount } = executeAlgorithm(matrix, { startX: matrixX, startY: matrixY });
  edgeData = { eventLog, minX, minY };
  const vertCount = eventLog.events.filter(e => e.type === 'addEdge' && e.edgeType === 'vertical').length;
  const horzCount = eventLog.events.filter(e => e.type === 'addEdge' && e.edgeType === 'horizontal').length;
  appendOutput(`Vertical edges: ${vertCount}`);
  appendOutput(`Horizontal edges: ${horzCount}`);
  appendOutput(`Waves: ${eventLog.stepsForLevel('wavefront').length}`);
  appendOutput(`Vertical components: ${vcompCount}`);
  const level = document.getElementById('anim-level').value;
  animState = { steps: computeSteps(level), position: 0 };

  // Clear the selected start vertex after running the algorithm
  selectedStartVertex = null;
  selectingStartVertex = false;
  document.getElementById('remove-start-btn').disabled = true;
  document.getElementById('select-start-btn').textContent = 'Select Start Vertex';
  document.getElementById('select-start-btn').style.backgroundColor = '';

  updateScrubber();
  draw();
  startPlay();
}

function paintCell(gridX, gridY) {
  if (paintMode === 'add' && !checkCube(gridX, gridY)) {
    addCube(gridX, gridY, 0x808080);
  } else if (paintMode === 'remove' && checkCube(gridX, gridY)) {
    removeCube(gridX, gridY);
    // If the removed cube was the selected start vertex, clear it
    if (selectedStartVertex && selectedStartVertex.gridX === gridX && selectedStartVertex.gridY === gridY) {
      selectedStartVertex = null;
      selectingStartVertex = false;
      document.getElementById('remove-start-btn').disabled = true;
      document.getElementById('select-start-btn').textContent = 'Select Start Vertex';
      document.getElementById('select-start-btn').style.backgroundColor = '';
    }
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
let selectingStartVertex = false;
let selectedStartVertex = null; // { gridX, gridY } or null

app.canvas.addEventListener('mousedown', e => {
  if (selectingStartVertex) {
    const gridX = Math.floor((e.offsetX / camera.zoom + camera.x) / gridSize);
    const gridY = Math.floor((e.offsetY / camera.zoom + camera.y) / gridSize);

    // Validate that the selected vertex is on a cube
    if (!checkCube(gridX, gridY)) {
      appendOutput('Error: Selected vertex must be on a cube.');
      return;
    }

    // Store the selected vertex
    selectedStartVertex = { gridX, gridY };
    selectingStartVertex = false;
    document.getElementById('remove-start-btn').disabled = false;
    document.getElementById('select-start-btn').textContent = 'Move Start Vertex';
    document.getElementById('select-start-btn').style.backgroundColor = '';
    appendOutput(`Start vertex selected at (${gridX}, ${gridY})`);
    draw(); // Redraw to show visual feedback
    return;
  }
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
window.addEventListener('resize', () => {
  requestAnimationFrame(draw);
});

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
  // If a start vertex is selected, use it
  if (selectedStartVertex) {
    runAlgorithmWithStartVertex(selectedStartVertex.gridX, selectedStartVertex.gridY);
    return;
  }

  // Otherwise, run with default start vertex
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

  if (!isConnected(matrix, count)) {
    appendOutput('Error: Figure is not connected. All cubes must be adjacent (up/down/left/right).');
    return;
  }

  const { eventLog, vcompCount } = executeAlgorithm(matrix);
  edgeData = { eventLog, minX, minY };
  const vertCount = eventLog.events.filter(e => e.type === 'addEdge' && e.edgeType === 'vertical').length;
  const horzCount = eventLog.events.filter(e => e.type === 'addEdge' && e.edgeType === 'horizontal').length;
  appendOutput(`Vertical edges: ${vertCount}`);
  appendOutput(`Horizontal edges: ${horzCount}`);
  appendOutput(`Waves: ${eventLog.stepsForLevel('wavefront').length}`);
  appendOutput(`Vertical components: ${vcompCount}`);
  const level = document.getElementById('anim-level').value;
  animState = { steps: computeSteps(level), position: 0 };

  // Clear the selected start vertex after running the algorithm
  selectedStartVertex = null;
  selectingStartVertex = false;
  document.getElementById('remove-start-btn').disabled = true;
  document.getElementById('select-start-btn').textContent = 'Select Start Vertex';
  document.getElementById('select-start-btn').style.backgroundColor = '';

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

document.getElementById('select-start-btn').addEventListener('click', () => {
  // If already in selection mode, cancel it
  if (selectingStartVertex) {
    selectingStartVertex = false;
    document.getElementById('select-start-btn').style.backgroundColor = '';
    clearOutput();
    appendOutput('Selection cancelled.');
    return;
  }

  // Entering selection mode - validate figure is complete
  const { matrix, count } = cubeToMatrix();

  clearOutput();

  if (count === 0) {
    appendOutput('Error: No cubes placed on grid.');
    return;
  }

  if (!isConnected(matrix, count)) {
    appendOutput('Error: Figure is not connected. All cubes must be adjacent (up/down/left/right).');
    return;
  }

  selectingStartVertex = true;
  document.getElementById('select-start-btn').style.backgroundColor = '#c0392b';
  appendOutput('Click on a cube to select as start vertex...');
  stopPlay();
  animState = null;
  edgeData = null;
  updateScrubber();
  updatePlayIcon();
  draw();
});

document.getElementById('remove-start-btn').addEventListener('click', () => {
  selectedStartVertex = null;
  selectingStartVertex = false;
  document.getElementById('remove-start-btn').disabled = true;
  document.getElementById('select-start-btn').textContent = 'Select Start Vertex';
  document.getElementById('select-start-btn').style.backgroundColor = '';
  clearOutput();
  appendOutput('Start vertex removed.');
  draw();
});

document.getElementById('eraser-btn').addEventListener('click', () => {
  eraserActive = !eraserActive;
  document.getElementById('eraser-btn').classList.toggle('active', eraserActive);
});

document.addEventListener('keydown', e => {
  if (e.key === 'Control' && !e.repeat) {
    eraserActive = !eraserActive;
    document.getElementById('eraser-btn').classList.toggle('active', eraserActive);
  }

  if (e.key === 'Escape' && selectingStartVertex) {
    selectingStartVertex = false;
    document.getElementById('select-start-btn').style.backgroundColor = '';
    clearOutput();
    appendOutput('Selection cancelled.');
  }
});

document.getElementById('clear-btn').addEventListener('click', () => {
  stopPlay();
  animState = null;
  edgeData = null;
  selectedStartVertex = null;
  selectingStartVertex = false;
  document.getElementById('remove-start-btn').disabled = true;
  document.getElementById('select-start-btn').textContent = 'Select Start Vertex';
  document.getElementById('select-start-btn').style.backgroundColor = '';
  updateScrubber();
  updatePlayIcon();
  cubes.map.clear();
  draw();
});

document.getElementById('save-btn').addEventListener('click', async () => {
  const json = JSON.stringify(cubes.toJSON(), null, 2);
  const blob = new Blob([json], { type: 'application/json' });

  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'grid.json',
        types: [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
      // Fall through on SecurityError etc. (e.g. file:// context)
    }
  }

  // Firefox: mozSaveOrOpenBlob opens the native Save As dialog
  if (window.mozSaveOrOpenBlob) {
    window.mozSaveOrOpenBlob(blob, 'grid.json');
  } else {
    const name = prompt('Enter a filename:', 'grid');
    if (name === null) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (name.trim() || 'grid') + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }
});

document.getElementById('load-btn').addEventListener('click', () => {
  document.getElementById('load-input').click();
});

document.getElementById('load-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      cubes.fromJSON(JSON.parse(event.target.result));
      stopPlay();
      animState = null;
      edgeData = null;
      selectedStartVertex = null;
      selectingStartVertex = false;
      document.getElementById('remove-start-btn').disabled = true;
      document.getElementById('select-start-btn').textContent = 'Select Start Vertex';
      document.getElementById('select-start-btn').style.backgroundColor = '';
      updateScrubber();
      updatePlayIcon();
      draw();
    } catch (err) {
      appendOutput('Error loading file: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

function centerOnCubes() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let count = 0;
  cubes.forEach((cube) => {
    count++;
    if (cube.x < minX) minX = cube.x;
    if (cube.x > maxX) maxX = cube.x;
    if (cube.y < minY) minY = cube.y;
    if (cube.y > maxY) maxY = cube.y;
  });
  if (count === 0) return;
  camera.zoom = 1;
  const centerX = (minX + maxX + 1) * gridSize / 2;
  const centerY = (minY + maxY + 1) * gridSize / 2;
  camera.x = centerX - app.screen.width / 2;
  camera.y = centerY - app.screen.height / 2;
}

// --- Populate and handle presets dropdown ---
const presetSelect = document.getElementById('preset-select');
Object.keys(presets).sort().forEach(path => {
  const name = path.split('/').pop().replace('.json', '');
  const label = name.replace(/-/g, ' ');
  const option = document.createElement('option');
  option.value = path;
  option.textContent = label.charAt(0).toUpperCase() + label.slice(1);
  presetSelect.appendChild(option);
});

presetSelect.addEventListener('change', () => {
  const data = presets[presetSelect.value]?.default;
  if (!data) return;
  cubes.fromJSON(data);
  stopPlay();
  animState = null;
  edgeData = null;
  selectedStartVertex = null;
  selectingStartVertex = false;
  document.getElementById('remove-start-btn').disabled = true;
  document.getElementById('select-start-btn').textContent = 'Select Start Vertex';
  document.getElementById('select-start-btn').style.backgroundColor = '';
  updateScrubber();
  updatePlayIcon();
  centerOnCubes();
  draw();
  presetSelect.value = '';
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