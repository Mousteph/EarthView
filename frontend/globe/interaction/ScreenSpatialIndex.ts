/** A small fixed-size screen grid used to reduce per-pointer work on batched geometry. */
export class ScreenSpatialIndex {
  private readonly cellSize: number;
  private columns = 1;
  private rows = 1;
  private buckets = new Map<number, number[]>();
  private marks = new Uint32Array(0);
  private queryStamp = 0;
  private readonly results: number[] = [];

  constructor(cellSize = 24) {
    this.cellSize = Math.max(8, cellSize);
  }

  reset(width: number, height: number) {
    this.columns = Math.max(1, Math.ceil(width / this.cellSize));
    this.rows = Math.max(1, Math.ceil(height / this.cellSize));
    this.buckets = new Map();
  }

  insertPoint(x: number, y: number, index: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= this.columns * this.cellSize || y >= this.rows * this.cellSize) return;
    this.insertCell(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize), index);
  }

  insertSegment(x1: number, y1: number, x2: number, y2: number, index: number, padding = 0) {
    const minX = Math.max(0, Math.floor((Math.min(x1, x2) - padding) / this.cellSize));
    const maxX = Math.min(this.columns - 1, Math.floor((Math.max(x1, x2) + padding) / this.cellSize));
    const minY = Math.max(0, Math.floor((Math.min(y1, y2) - padding) / this.cellSize));
    const maxY = Math.min(this.rows - 1, Math.floor((Math.max(y1, y2) + padding) / this.cellSize));
    if (minX > maxX || minY > maxY) return;
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) this.insertCell(x, y, index);
    }
  }

  query(x: number, y: number, radius: number) {
    this.results.length = 0;
    this.queryStamp = (this.queryStamp + 1) >>> 0;
    if (this.queryStamp === 0) {
      this.marks.fill(0);
      this.queryStamp = 1;
    }
    const minX = Math.max(0, Math.floor((x - radius) / this.cellSize));
    const maxX = Math.min(this.columns - 1, Math.floor((x + radius) / this.cellSize));
    const minY = Math.max(0, Math.floor((y - radius) / this.cellSize));
    const maxY = Math.min(this.rows - 1, Math.floor((y + radius) / this.cellSize));
    if (minX > maxX || minY > maxY) return this.results;
    for (let row = minY; row <= maxY; row += 1) {
      for (let column = minX; column <= maxX; column += 1) {
        const bucket = this.buckets.get(row * this.columns + column);
        if (!bucket) continue;
        for (const index of bucket) {
          this.ensureMarks(index + 1);
          if (this.marks[index] === this.queryStamp) continue;
          this.marks[index] = this.queryStamp;
          this.results.push(index);
        }
      }
    }
    return this.results;
  }

  private insertCell(column: number, row: number, index: number) {
    const key = row * this.columns + column;
    const bucket = this.buckets.get(key);
    if (bucket) bucket.push(index);
    else this.buckets.set(key, [index]);
  }

  private ensureMarks(length: number) {
    if (length <= this.marks.length) return;
    const next = new Uint32Array(Math.max(length, this.marks.length * 2, 16));
    next.set(this.marks);
    this.marks = next;
  }
}

export function matrixChanged(matrix: ArrayLike<number>, previous: Float64Array | null, tolerance = 0.001) {
  if (!previous || previous.length !== matrix.length) return true;
  for (let index = 0; index < matrix.length; index += 1) {
    if (Math.abs(matrix[index] - previous[index]) > tolerance) return true;
  }
  return false;
}

/** Tighten the cached projection tolerance as the camera approaches the globe. */
export function pickingMatrixTolerance(cameraDistance: number) {
  return Math.min(0.001, Math.max(0.00001, (cameraDistance - 1) * 0.0005));
}

export function saveMatrix(matrix: ArrayLike<number>, previous: Float64Array | null) {
  const target = previous?.length === matrix.length ? previous : new Float64Array(matrix.length);
  for (let index = 0; index < matrix.length; index += 1) target[index] = matrix[index];
  return target;
}
