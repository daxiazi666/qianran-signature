(() => {
  'use strict';
  const { SignatureDocument, exportLayout, fitTransform, render } = window.SignatureCore;
  const $ = (id) => document.getElementById(id);
  const board = $('signature-canvas');
  const ctx = board.getContext('2d');
  const preview = $('preview-canvas');
  const previewCtx = preview.getContext('2d');
  const signature = new SignatureDocument();
  const dialog = $('download-dialog');
  let color = '#202c3b', penWidth = 3.5, background = 'transparent';
  let pointerId = null, drawScheduled = false, toastTimer, resultURL, resultFile;
  let surface = { width: 800, height: 340 };

  function showToast(message) {
    $('toast').textContent = message;
    $('toast').classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3200);
  }

  function boardRect() { return { x: 0, y: 0, width: signature.width, height: signature.height }; }
  function cropEnabled() { return $('crop').checked; }

  function updateUI() {
    const hasInk = signature.strokes.length > 0;
    $('undo').disabled = !signature.undoStack.length || pointerId !== null;
    $('redo').disabled = !signature.redoStack.length || pointerId !== null;
    $('clear').disabled = !hasInk || pointerId !== null;
    $('download').disabled = !hasInk || pointerId !== null;
    $('canvas-placeholder').hidden = hasInk || !!signature.activeStroke;
    $('preview-placeholder').hidden = hasInk || !!signature.activeStroke;
    $('board-status').textContent = pointerId !== null ? '正在书写' : hasInk ? `${signature.strokes.length} 笔，随时可下载` : '等待落笔';
    $('download-hint').textContent = hasInk ? '手机也可在预览中长按保存图片' : '先在签名板上写下你的名字';
    const layout = exportLayout(signature, cropEnabled());
    $('export-size').textContent = layout ? `${layout.width} × ${layout.height} px` : '保留原始笔迹';
  }

  function draw() {
    drawScheduled = false;
    const strokes = signature.allStrokes();
    render(ctx, board.width, board.height, strokes, boardRect());
    const layout = exportLayout(signature, cropEnabled(), strokes);
    render(previewCtx, preview.width, preview.height, strokes, layout ? layout.rect : boardRect(), background);
    updateUI();
  }

  function scheduleDraw() {
    if (!drawScheduled) { drawScheduled = true; requestAnimationFrame(draw); }
  }

  function resizeBoard() {
    const rect = board.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    surface = { width: rect.width, height: rect.height };
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    board.width = Math.round(rect.width * ratio);
    board.height = Math.round(rect.height * ratio);
    if (!signature.strokes.length && !signature.undoStack.length && !signature.activeStroke) {
      signature.width = rect.width;
      signature.height = rect.height;
    }
    scheduleDraw();
  }

  function eventPoint(event) {
    const rect = board.getBoundingClientRect();
    const transform = fitTransform(rect.width, rect.height, boardRect());
    return { x: (event.clientX - rect.left - transform.x) / transform.scale, y: (event.clientY - rect.top - transform.y) / transform.scale };
  }

  board.addEventListener('pointerdown', (event) => {
    if (pointerId !== null || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    if (!signature.strokes.length && !signature.undoStack.length) {
      signature.width = surface.width;
      signature.height = surface.height;
    }
    const transform = fitTransform(surface.width, surface.height, boardRect());
    signature.begin(eventPoint(event), color, penWidth / transform.scale, surface.width, surface.height);
    pointerId = event.pointerId;
    board.setPointerCapture(pointerId);
    scheduleDraw();
  });
  board.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointerId) return;
    event.preventDefault();
    const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
    for (const point of events.length ? events : [event]) signature.append(eventPoint(point));
    scheduleDraw();
  });
  function finishStroke(event) {
    if (event.pointerId !== pointerId) return;
    if (event.type === 'pointerup') signature.append(eventPoint(event));
    signature.finish();
    const oldPointer = pointerId;
    pointerId = null;
    if (board.hasPointerCapture(oldPointer)) board.releasePointerCapture(oldPointer);
    scheduleDraw();
  }
  board.addEventListener('pointerup', finishStroke);
  board.addEventListener('pointercancel', finishStroke);
  board.addEventListener('lostpointercapture', finishStroke);
  board.addEventListener('contextmenu', (event) => event.preventDefault());

  $('undo').addEventListener('click', () => { if (signature.undo()) scheduleDraw(); });
  $('redo').addEventListener('click', () => { if (signature.redo()) scheduleDraw(); });
  $('clear').addEventListener('click', () => { if (signature.clear()) { scheduleDraw(); showToast('已清空，点击撤销可以恢复'); } });
  document.addEventListener('keydown', (event) => {
    if (dialog.open || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey ? signature.redo() : signature.undo()) scheduleDraw();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      if (signature.redo()) scheduleDraw();
    }
  });

  for (const button of document.querySelectorAll('[data-color]')) {
    button.addEventListener('click', () => {
      color = button.dataset.color;
      for (const item of document.querySelectorAll('[data-color]')) {
        item.classList.toggle('selected', item === button);
        item.setAttribute('aria-pressed', String(item === button));
      }
    });
  }
  for (const button of document.querySelectorAll('[data-width]')) {
    button.addEventListener('click', () => {
      penWidth = Number(button.dataset.width);
      for (const item of document.querySelectorAll('[data-width]')) {
        item.classList.toggle('selected', item === button);
        item.setAttribute('aria-pressed', String(item === button));
      }
    });
  }

  function setBackground(value) {
    background = value;
    for (const [id, name] of [['bg-transparent', 'transparent'], ['bg-white', 'white']]) {
      $(id).classList.toggle('selected', value === name);
      $(id).setAttribute('aria-pressed', String(value === name));
    }
    $('preview-wrap').classList.toggle('checkerboard', value === 'transparent');
    scheduleDraw();
  }
  $('bg-transparent').addEventListener('click', () => setBackground('transparent'));
  $('bg-white').addEventListener('click', () => setBackground('white'));
  $('crop').addEventListener('change', scheduleDraw);

  function beginDownload(url, name) {
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function releaseResult() {
    if (resultURL) URL.revokeObjectURL(resultURL);
    resultURL = null;
    resultFile = null;
    $('result-image').removeAttribute('src');
    $('save-again').removeAttribute('href');
  }

  $('download').addEventListener('click', () => {
    const layout = exportLayout(signature, cropEnabled());
    if (!layout || pointerId !== null) return;
    const output = document.createElement('canvas');
    output.width = layout.width;
    output.height = layout.height;
    render(output.getContext('2d'), output.width, output.height, signature.strokes, layout.rect, background);
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const name = `签然-我的签名-${date}.png`;
    try {
      // Start synchronously within the tap so mobile browsers retain activation.
      const dataURL = output.toDataURL('image/png');
      beginDownload(dataURL, name);
      releaseResult();
      $('result-image').src = dataURL;
      $('save-again').href = dataURL;
      $('save-again').download = name;
      $('result-wrap').classList.toggle('checkerboard', background === 'transparent');
      $('share-image').hidden = true;
      if (!dialog.open) dialog.showModal();
      output.toBlob((blob) => {
        if (!blob || !dialog.open) return;
        resultFile = new File([blob], name, { type: 'image/png' });
        resultURL = URL.createObjectURL(blob);
        $('result-image').src = resultURL;
        $('save-again').href = resultURL;
        try { $('share-image').hidden = !(navigator.canShare && navigator.canShare({ files: [resultFile] })); }
        catch { $('share-image').hidden = true; }
      }, 'image/png');
    } catch {
      showToast('图片生成失败，请重试或减少笔迹后再下载');
    }
  });

  $('close-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', releaseResult);
  $('share-image').addEventListener('click', async () => {
    if (!resultFile || !navigator.share) return;
    try { await navigator.share({ files: [resultFile], title: '我的签名' }); }
    catch (error) { if (error.name !== 'AbortError') showToast('暂时无法分享，可长按图片保存或点击再次下载'); }
  });

  $('copy-link').addEventListener('click', async () => {
    const url = new URL(window.location.href);
    url.hash = '';
    url.search = '';
    try { await navigator.clipboard.writeText(url.href); showToast('链接已复制，发给朋友就能使用'); }
    catch {
      if (navigator.share) {
        try { await navigator.share({ title: '签然 · 免费电子签名', url: url.href }); }
        catch (error) { if (error.name !== 'AbortError') showToast('可复制浏览器地址栏中的链接分享'); }
      } else showToast('可复制浏览器地址栏中的链接分享');
    }
  });

  window.addEventListener('beforeunload', (event) => {
    if (signature.strokes.length || signature.activeStroke) { event.preventDefault(); event.returnValue = ''; }
  });
  if (typeof ResizeObserver === 'function') new ResizeObserver(resizeBoard).observe($('canvas-area'));
  else window.addEventListener('resize', resizeBoard);
  resizeBoard();
})();
