(function (root) {
  'use strict';

  // Keep original vector coordinates so resizing never stretches a signature.
  class SignatureDocument {
    constructor(width = 800, height = 340) {
      this.width = width;
      this.height = height;
      this.strokes = [];
      this.undoStack = [];
      this.redoStack = [];
      this.activeStroke = null;
    }
    begin(point, color, width, surfaceWidth, surfaceHeight) {
      if (this.activeStroke) return false;
      if (!this.strokes.length && !this.undoStack.length && surfaceWidth > 0 && surfaceHeight > 0) {
        this.width = surfaceWidth;
        this.height = surfaceHeight;
      }
      this.activeStroke = { color, width, points: [this.clampPoint(point)] };
      return true;
    }
    clampPoint(point) {
      return { x: Math.max(0, Math.min(this.width, point.x)), y: Math.max(0, Math.min(this.height, point.y)) };
    }
    append(point) {
      if (!this.activeStroke) return;
      const next = this.clampPoint(point);
      const points = this.activeStroke.points;
      const last = points[points.length - 1];
      if (Math.hypot(next.x - last.x, next.y - last.y) >= 0.35) points.push(next);
    }
    finish() {
      if (!this.activeStroke) return false;
      this.remember();
      this.strokes = [...this.strokes, this.activeStroke];
      this.activeStroke = null;
      return true;
    }
    remember() {
      this.undoStack.push(this.strokes);
      if (this.undoStack.length > 100) this.undoStack.shift();
      this.redoStack = [];
    }
    undo() {
      if (!this.undoStack.length || this.activeStroke) return false;
      this.redoStack.push(this.strokes);
      this.strokes = this.undoStack.pop();
      return true;
    }
    redo() {
      if (!this.redoStack.length || this.activeStroke) return false;
      this.undoStack.push(this.strokes);
      this.strokes = this.redoStack.pop();
      return true;
    }
    clear() {
      if (!this.strokes.length || this.activeStroke) return false;
      this.remember();
      this.strokes = [];
      return true;
    }
    allStrokes() {
      return this.activeStroke ? [...this.strokes, this.activeStroke] : this.strokes;
    }
  }

  function inkBounds(strokes) {
    if (!strokes.length) return null;
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const stroke of strokes) {
      const edge = stroke.width / 2 + 1;
      for (const p of stroke.points) {
        left = Math.min(left, p.x - edge);
        top = Math.min(top, p.y - edge);
        right = Math.max(right, p.x + edge);
        bottom = Math.max(bottom, p.y + edge);
      }
    }
    if (!Number.isFinite(left)) return null;
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  function exportLayout(document, crop = true, strokes = document.strokes) {
    const bounds = inkBounds(strokes);
    if (!bounds) return null;
    let rect;
    if (crop) {
      const padding = Math.max(18, Math.max(bounds.width, bounds.height) * 0.055);
      rect = { x: bounds.x - padding, y: bounds.y - padding, width: bounds.width + padding * 2, height: bounds.height + padding * 2 };
    } else {
      // Include edge caps even when someone starts directly on the board edge.
      const left = Math.min(0, bounds.x), top = Math.min(0, bounds.y);
      rect = { x: left, y: top, width: Math.max(document.width, bounds.x + bounds.width) - left, height: Math.max(document.height, bounds.y + bounds.height) - top };
    }
    const scale = Math.min(3, 4096 / Math.max(rect.width, rect.height), Math.sqrt(12000000 / (rect.width * rect.height)));
    return { rect, width: Math.max(1, Math.ceil(rect.width * scale)), height: Math.max(1, Math.ceil(rect.height * scale)) };
  }

  function fitTransform(width, height, rect) {
    const scale = Math.min(width / rect.width, height / rect.height);
    return { scale, x: (width - rect.width * scale) / 2 - rect.x * scale, y: (height - rect.height * scale) / 2 - rect.y * scale };
  }

  function drawStroke(ctx, stroke) {
    const points = stroke.points;
    if (!points.length) return;
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (points.length === 1) {
      ctx.arc(points[0].x, points[0].y, stroke.width / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length - 1; i++) {
      ctx.quadraticCurveTo(points[i].x, points[i].y, (points[i].x + points[i + 1].x) / 2, (points[i].y + points[i + 1].y) / 2);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }

  function render(ctx, width, height, strokes, rect, background = 'transparent') {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (background === 'white') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
    const transform = fitTransform(width, height, rect);
    ctx.setTransform(transform.scale, 0, 0, transform.scale, transform.x, transform.y);
    for (const stroke of strokes) drawStroke(ctx, stroke);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return transform;
  }

  const api = { SignatureDocument, inkBounds, exportLayout, fitTransform, drawStroke, render };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SignatureCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
