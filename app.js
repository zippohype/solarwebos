// app.js
// Self-contained script that injects CSS + HTML and implements a draggable window
// with Close, Full Screen (maximize/restore) and Minimize (pin to bottom-left).
// Drop this file into a page and include <script src="app.js"></script> or import it as a module.

(function () {
  // ---------- Styles ----------
  const css = `
:root{
  --win-width:420px;
  --win-height:280px;
  --header-height:36px;
  --accent:#2b6ef6;
  --muted:#6b7280;
  --shadow: 0 8px 28px rgba(17,24,39,0.12);
}
*{box-sizing:border-box}
body{font-family:Inter,system-ui,Segoe UI,Roboto,Helvetica,Arial;background:linear-gradient(180deg,#eef2ff 0%, #ffffff 100%);}

/* open button */
#__dw_open {
  position: fixed;
  left: 16px;
  top: 16px;
  padding: 8px 12px;
  border-radius: 6px;
  border: none;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(43,110,246,0.2);
  z-index: 2147483000;
}

/* window */
#__dw_window {
  position: absolute;
  left: 60px;
  top: 80px;
  width: var(--win-width);
  height: var(--win-height);
  background: linear-gradient(180deg,#fff,#fbfdff);
  border-radius: 10px;
  box-shadow: var(--shadow);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  user-select: none;
  touch-action: none;
  transition: box-shadow .15s, transform .12s;
  z-index: 1000;
}
#__dw_window:active{box-shadow: 0 18px 42px rgba(17,24,39,0.18);}

/* header */
#__dw_header {
  height: var(--header-height);
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:0 8px;
  background: linear-gradient(180deg, rgba(255,255,255,0.7), rgba(255,255,255,0.5));
  cursor: move;
  gap:8px;
}
#__dw_header:focus{outline:2px solid rgba(43,110,246,0.18);}

#__dw_title {
  font-weight:600;
  color:#111827;
  padding-left:8px;
  font-size:13px;
}

#__dw_controls { display:flex; gap:6px; align-items:center; }

/* buttons */
.__dw_btn {
  width:32px;
  height:28px;
  border-radius:6px;
  border:none;
  background:transparent;
  font-weight:700;
  cursor:pointer;
  color:var(--muted);
  display:inline-grid;
  place-items:center;
  transition:background .12s,color .12s,transform .08s;
}
.__dw_btn:hover{background:rgba(15,23,42,0.04); color:#000}
.__dw_btn:active{transform:translateY(1px);}

.__dw_btn.close{color:#b91c1c}
.__dw_btn.close:hover{background:rgba(185,28,28,0.08); color:#b91c1c}

/* content */
#__dw_content {
  padding:16px;
  color:#111827;
  font-size:14px;
  overflow:auto;
  flex:1;
}

/* minimized */
#__dw_window.__dw_minimized {
  height: var(--header-height);
  width: 220px;
  border-radius:10px;
  position: fixed;
  left: 12px;
  bottom: 12px;
  top: auto !important;
  transform: none !important;
}

/* maximized */
#__dw_window.__dw_maximized {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  border-radius: 0 !important;
  margin:0;
  z-index: 2147483640 !important;
}

/* closed */
#__dw_window.__dw_closed { display:none !important; }

/* responsive tweaks */
@media (max-width:520px){
  #__dw_window{width: calc(100% - 28px); left:14px; right:14px}
  #__dw_window.__dw_minimized{width:160px}
}
`;

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ---------- DOM ----------
  // Open button
  const openBtn = document.createElement('button');
  openBtn.id = '__dw_open';
  openBtn.type = 'button';
  openBtn.textContent = 'Open Window';
  openBtn.title = 'Open window';
  document.body.appendChild(openBtn);

  // Window container
  const win = document.createElement('div');
  win.id = '__dw_window';
  win.setAttribute('role', 'dialog');
  win.setAttribute('aria-label', 'Demo window');

  // Header
  const header = document.createElement('div');
  header.id = '__dw_header';
  header.tabIndex = 0;
  header.setAttribute('aria-grabbed', 'false');

  const title = document.createElement('div');
  title.id = '__dw_title';
  title.textContent = 'Draggable Window';

  const controls = document.createElement('div');
  controls.id = '__dw_controls';
  controls.setAttribute('role', 'toolbar');
  controls.setAttribute('aria-label', 'Window controls');

  const btnMin = document.createElement('button');
  btnMin.className = '__dw_btn';
  btnMin.id = '__dw_min';
  btnMin.title = 'Minimize';
  btnMin.ariaLabel = 'Minimize';
  btnMin.textContent = '—';

  const btnMax = document.createElement('button');
  btnMax.className = '__dw_btn';
  btnMax.id = '__dw_max';
  btnMax.title = 'Full screen';
  btnMax.ariaLabel = 'Full screen';
  btnMax.textContent = '▢';

  const btnClose = document.createElement('button');
  btnClose.className = '__dw_btn close';
  btnClose.id = '__dw_close';
  btnClose.title = 'Close';
  btnClose.ariaLabel = 'Close';
  btnClose.textContent = '✕';

  controls.appendChild(btnMin);
  controls.appendChild(btnMax);
  controls.appendChild(btnClose);

  header.appendChild(title);
  header.appendChild(controls);

  // Content
  const content = document.createElement('div');
  content.id = '__dw_content';
  content.innerHTML = `
    <p>This is a draggable window. Drag the header, double-click the header to toggle full screen, or use the controls to minimize/restore/close.</p>
    <p>Keyboard: Esc = close, M = minimize/restore, F = full screen toggle.</p>
  `;

  win.appendChild(header);
  win.appendChild(content);
  document.body.appendChild(win);

  // ---------- Behavior ----------
  let isDragging = false;
  let dragPointerId = null;
  let startX = 0, startY = 0;
  let origLeft = 0, origTop = 0;
  let zIndexCounter = 1000;
  let restoreState = null; // {left,top,width,height}

  function bringToFront() {
    zIndexCounter++;
    win.style.zIndex = zIndexCounter;
  }

  // Pointer events for drag (mouse & touch)
  header.addEventListener('pointerdown', (ev) => {
    // ignore if clicking a button
    if (ev.target.closest('.__dw_btn')) return;
    // don't drag when maximized
    if (win.classList.contains('__dw_maximized')) return;

    isDragging = true;
    dragPointerId = ev.pointerId;
    header.setPointerCapture(dragPointerId);
    startX = ev.clientX;
    startY = ev.clientY;

    const rect = win.getBoundingClientRect();
    origLeft = rect.left + window.scrollX;
    origTop = rect.top + window.scrollY;

    bringToFront();
    header.setAttribute('aria-grabbed', 'true');
  });

  header.addEventListener('pointermove', (ev) => {
    if (!isDragging || ev.pointerId !== dragPointerId) return;
    ev.preventDefault();
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    win.style.left = (origLeft + dx) + 'px';
    win.style.top = (origTop + dy) + 'px';
    win.style.position = 'absolute';
  });

  header.addEventListener('pointerup', (ev) => {
    if (ev.pointerId !== dragPointerId) return;
    isDragging = false;
    dragPointerId = null;
    try { header.releasePointerCapture(ev.pointerId); } catch (e) {}
    header.setAttribute('aria-grabbed', 'false');
  });

  header.addEventListener('dblclick', toggleMaximize);

  // Button actions
  btnClose.addEventListener('click', () => {
    win.classList.add('__dw_closed');
  });

  btnMin.addEventListener('click', toggleMinimize);
  btnMax.addEventListener('click', toggleMaximize);

  openBtn.addEventListener('click', () => {
    win.classList.remove('__dw_closed');
    if (win.classList.contains('__dw_minimized')) {
      win.classList.remove('__dw_minimized');
      // restore inline styles if we had them
      if (restoreState && restoreState.left !== undefined) {
        win.style.left = restoreState.left;
        win.style.top = restoreState.top;
        win.style.width = restoreState.width;
        win.style.height = restoreState.height;
      }
      restoreState = null;
    }
    bringToFront();
  });

  function toggleMinimize() {
    if (win.classList.contains('__dw_minimized')) {
      // restore
      win.classList.remove('__dw_minimized');
      if (restoreState) {
        win.style.left = restoreState.left;
        win.style.top = restoreState.top;
        win.style.width = restoreState.width;
        win.style.height = restoreState.height;
        restoreState = null;
      }
      bringToFront();
    } else {
      // store state
      const rect = win.getBoundingClientRect();
      restoreState = {
        left: win.style.left || (rect.left + window.scrollX) + 'px',
        top: win.style.top || (rect.top + window.scrollY) + 'px',
        width: win.style.width || rect.width + 'px',
        height: win.style.height || rect.height + 'px',
      };
      win.classList.remove('__dw_maximized');
      win.classList.add('__dw_minimized');
      bringToFront();
    }
  }

  function toggleMaximize() {
    if (win.classList.contains('__dw_maximized')) {
      // restore
      win.classList.remove('__dw_maximized');
      if (restoreState) {
        win.style.left = restoreState.left;
        win.style.top = restoreState.top;
        win.style.width = restoreState.width;
        win.style.height = restoreState.height;
        restoreState = null;
      }
      bringToFront();
    } else {
      // if minimized, clear minimize state but keep restore
      if (win.classList.contains('__dw_minimized')) {
        win.classList.remove('__dw_minimized');
      }
      const rect = win.getBoundingClientRect();
      restoreState = {
        left: win.style.left || (rect.left + window.scrollX) + 'px',
        top: win.style.top || (rect.top + window.scrollY) + 'px',
        width: win.style.width || rect.width + 'px',
        height: win.style.height || rect.height + 'px',
      };
      win.classList.add('__dw_maximized');
      // ensure full coverage
      win.style.left = '0';
      win.style.top = '0';
      win.style.width = '100vw';
      win.style.height = '100vh';
      bringToFront();
    }
  }

  // Keyboard shortcuts
  window.addEventListener('keydown', (ev) => {
    const ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
    if (ev.key === 'Escape') {
      win.classList.add('__dw_closed');
    } else if (ev.key.toLowerCase() === 'm') {
      toggleMinimize();
    } else if (ev.key.toLowerCase() === 'f') {
      toggleMaximize();
    }
  });

  // Bring to front on pointerdown inside window
  win.addEventListener('pointerdown', bringToFront);

  // Ensure visible on resize
  window.addEventListener('resize', () => {
    const rect = win.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    if (rect.right < 60 || rect.bottom < 60 || rect.left > window.innerWidth - 60 || rect.top > window.innerHeight - 60) {
      win.style.left = Math.max(12, (window.innerWidth - rect.width) / 2) + 'px';
      win.style.top = Math.max(40, (window.innerHeight - rect.height) / 3) + 'px';
    }
  });

  // Accessibility: keyboard activate for control buttons
  [btnClose, btnMin, btnMax, openBtn].forEach((b) => {
    b.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        b.click();
      }
    });
  });

  // Prevent dragstart ghosting
  win.addEventListener('dragstart', (ev) => ev.preventDefault());

  // Expose a small API on window for quick debugging/control
  window.__DraggableWindow = {
    element: win,
    open: () => win.classList.remove('__dw_closed'),
    close: () => win.classList.add('__dw_closed'),
    toggleMinimize,
    toggleMaximize
  };

  // Start with window visible (user can close)
  win.classList.remove('__dw_closed');
})();
