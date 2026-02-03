const vcomps = [];
const vert_edges = [];
const horz_edges = [];

function reset() {
  vcomps.length = 0;
  vert_edges.length = 0;
  horz_edges.length = 0;
}

function addVerticalComponent(col, rowStart, rowEnd) {
  vcomps.push({
    isVisited: false,
    col: col,
    row_range: [rowStart, rowEnd],
    adj_comp_range_left: undefined,
    adj_comp_range_right: undefined,
    edge_range_vert: undefined,
    edge_range_left: undefined,
    edge_range_right: undefined
  });
}

function rowRangesOverlap(range1, range2) {
  const [start1, end1] = range1;
  const [start2, end2] = range2;
  return !(end1 < start2 || end2 < start1);
}

function computeVerticalEdges() {
  for (let i = 0; i < vcomps.length; i++) {
    const vcomp = vcomps[i];
    const [rowStart, rowEnd] = vcomp.row_range;

    // Track the starting edge index for this component
    const edgeRangeStart = vert_edges.length;

    // Create edge for each pair of adjacent cubes within this component
    for (let row = rowStart; row < rowEnd; row++) {
      vert_edges.push({
        col: vcomp.col,
        row: row,
        vcomp_index: i,
        orientation: undefined
      });
    }

    // Set the edge range [inclusive, exclusive]
    vcomp.edge_range_vert = [edgeRangeStart, vert_edges.length];
  }
}

function computeHorizontalEdges() {
  // First pass: add edges during right adjacency processing and set right ranges
  for (let i = 0; i < vcomps.length; i++) {
    const vcomp = vcomps[i];
    const [row1Start, row1End] = vcomp.row_range;

    if (vcomp.adj_comp_range_right !== undefined) {
      const edgeRangeStart = horz_edges.length;
      const [rightStart, rightEnd] = vcomp.adj_comp_range_right;

      for (let j = rightStart; j < rightEnd; j++) {
        const rightVcomp = vcomps[j];
        const [row2Start, row2End] = rightVcomp.row_range;

        // Find overlapping rows
        const overlapStart = Math.max(row1Start, row2Start);
        const overlapEnd = Math.min(row1End, row2End);

        for (let row = overlapStart; row <= overlapEnd; row++) {
          horz_edges.push({
            vcomp_1: i,
            vcomp_2: j,
            row: row,
            orientation: undefined
          });
        }
      }

      // Set right range immediately - all edges just added
      vcomp.edge_range_right = [edgeRangeStart, horz_edges.length];
    }
  }

  // Second pass: set left ranges by finding edges where vcomp_2 === i
  for (let i = 0; i < vcomps.length; i++) {
    if (vcomps[i].adj_comp_range_left !== undefined) {
      let leftRangeStart = -1;
      let leftRangeEnd = -1;

      // Find first and last edge where this vcomp is vcomp_2
      for (let j = 0; j < horz_edges.length; j++) {
        if (horz_edges[j].vcomp_2 === i) {
          if (leftRangeStart === -1) leftRangeStart = j;
          leftRangeEnd = j + 1;
        }
      }

      if (leftRangeStart !== -1) {
        vcomps[i].edge_range_left = [leftRangeStart, leftRangeEnd];
      }
    }
  }
}

function computeAdjacencies(cols) {
  // For each column, compute adjacencies to the right
  for (let col = 0; col < cols - 1; col++) {
    const currentColVcomps = vcomps.filter(v => v.col === col);

    for (const vcomp of currentColVcomps) {
      const adjacentIndices = [];

      for (let i = 0; i < vcomps.length; i++) {
        if (vcomps[i].col === col + 1 && rowRangesOverlap(vcomp.row_range, vcomps[i].row_range)) {
          adjacentIndices.push(i);
        }
      }

      // Check if indices are continuous
      if (adjacentIndices.length > 0) {
        let isContinuous = true;
        for (let i = 1; i < adjacentIndices.length; i++) {
          if (adjacentIndices[i] !== adjacentIndices[i - 1] + 1) {
            isContinuous = false;
            break;
          }
        }
        if (isContinuous) {
          vcomp.adj_comp_range_right = [adjacentIndices[0], adjacentIndices[adjacentIndices.length - 1] + 1];
        }
      }
    }
  }

  // For each column, compute adjacencies to the left
  for (let col = 1; col < cols; col++) {
    const currentColVcomps = vcomps.filter(v => v.col === col);

    for (const vcomp of currentColVcomps) {
      const adjacentIndices = [];

      for (let i = 0; i < vcomps.length; i++) {
        if (vcomps[i].col === col - 1 && rowRangesOverlap(vcomp.row_range, vcomps[i].row_range)) {
          adjacentIndices.push(i);
        }
      }

      // Check if indices are continuous
      if (adjacentIndices.length > 0) {
        let isContinuous = true;
        for (let i = 1; i < adjacentIndices.length; i++) {
          if (adjacentIndices[i] !== adjacentIndices[i - 1] + 1) {
            isContinuous = false;
            break;
          }
        }
        if (isContinuous) {
          vcomp.adj_comp_range_left = [adjacentIndices[0], adjacentIndices[adjacentIndices.length - 1] + 1];
        }
      }
    }
  }
}

function initalizeVerticalComponents(matrix) {
  const rows = matrix.length;
  const cols = matrix[0].length;

  for (let col = 0; col < cols; col++) {
    let inComponent = false;
    let componentStart = 0;

    for (let row = 0; row < rows; row++) {
      if (matrix[row][col]) {
        if (!inComponent) {
          componentStart = row;
          inComponent = true;
        }
      } else {
        if (inComponent) {
          addVerticalComponent(col, componentStart, row - 1);
          inComponent = false;
        }
      }
    }

    // Handle component that extends to end of matrix
    if (inComponent) {
      addVerticalComponent(col, componentStart, rows - 1);
    }
  }

  // Compute left and right adjacencies
  computeAdjacencies(cols);

  // Compute vertical edges
  computeVerticalEdges();

  // Compute horizontal edges
  computeHorizontalEdges();
}


/**
 * Runs the wavefront sweep algorithm on the provided matrix grid.
 * @param {boolean[][]} matrix - 2D matrix where true represents a cube and false represents empty space
 * @returns {Object} Result object containing algorithm output
 */
export function runAlgorithm(matrix) {
  reset();
  initalizeVerticalComponents(matrix);
  console.log(vcomps);
  console.log(vert_edges);
  console.log(horz_edges);
}
