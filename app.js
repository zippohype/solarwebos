// Mini Desktop OS - app.js (extended: persistence, alt-tab, snap, App Store)
(() => {
  const STORAGE_KEY = 'mini-desktop-state-v2';

  const APPS = [
    { id: 'notepad', name: 'Notepad', icon: '📝', create: createNotepad },
    { id: 'calculator', name: 'Calculator', icon: '🧮', create: createCalculator },
    { id: 'files', name: 'Files', icon: '📁', create: createFiles },
    { id: 'app-store', name: 'App Store', icon: '🏬', create: createAppStore }
  ];

  const desktop = document.getElementById('desktop');
  const startButton = document.getElementById('start-button');
  const startMenu = document.getElementById('start-menu');
  const startList = document.getElementById('start-list');
  const startSearchInput = document.getElementById('start-search-input');
  const taskbarCenter = document.getElementById('taskbar-center');
  const clockEl = document.getElementById('clock');
  const windowTemplate = document.getElementById('window-template');
  const altTabOverlay = document.getElementById('altTabOverlay');

  let zIndexCounter = 1000;
  let windows = {}; // winId -> el
  let taskButtons = {}; // winId -> button
  let winOrder = []; // winIds by z-order (lowest first)
  let altDown = false;
  let altTabIndex = 0;
  let snapPreviewEl = null;

  // Build start menu list
  function buildStartMenu(filter = '') {
    startList.innerHTML = '';
    APPS.filter(a => a.name.toLowerCase().includes(filter.toLowerCase()))
      .forEach(app => {
        const el = document.createElement('div');
        el.className = 'app-entry';
        el.innerHTML = `<div class="app-icon" aria-hidden="true">${app.icon}</div><div>${app.name}</div>`;
        el.addEventListener('click', () => {
          openApp(app);
          hideStartMenu();
        });
        startList.appendChild(el);
      });
  }
  buildStartMenu();

  // Start button behavior
  startButton.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleStartMenu();
  });
  document.addEventListener('click', () => hideStartMenu());
  startMenu.addEventListener('click', e => e.stopPropagation());
  startSearchInput.addEventListener('input', () => buildStartMenu(startSearchInput.value));

  function toggleStartMenu(){
    startMenu.classList.toggle('hidden');
    if(!startMenu.classList.contains('hidden')) startSearchInput.focus();
  }
  function hideStartMenu(){
    startMenu.classList.add('hidden');
  }

  // Clock
  function updateClock(){
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  }
  setInterval(updateClock, 1000);
  updateClock();

  // Persistence: save & restore
  function saveState(){
    const data = {
      windows: winOrder.map(id => {
        const el = windows[id];
        if(!el) return null;
        const rect = el.getBoundingClientRect();
        return {
          id,
          appId: el.dataset.appId,
          title: el.dataset.title,
          left: el.style.left,
          top: el.style.top,
          width: el.style.width,
          height: el.style.height,
          max: el.dataset.max === '1',
          minimized: el.classList.contains('minimized')
        };
      }).filter(Boolean)
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch(e){ console.warn('Could not save state', e); }
  }

  function restoreState(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return false;
      const data = JSON.parse(raw);
      if(!data || !data.windows) return false;
      // Recreate windows in saved order
      data.windows.forEach(win => {
        const app = APPS.find(a => a.id === win.appId);
        if(!app) return;
        openApp(app, win);
      });
      return true;
    } catch(e) {
      console.warn('Restore failed', e);
      return false;
    }
  }

  // Open app (app object), optional state to restore
  function openApp(app, state = {}) {
    const winId = state.id || `win-${app.id}-${Date.now()}`;
    const win = createWindow(winId, app, state);
    app.create(win.body, winId);
    windows[winId] = win.el;
    addToTaskbar(winId, app);
    focusWindow(win.el);
    // apply restored flags
    if(state.minimized) minimizeWindow(winId);
    if(state.max) toggleMaximize(winId);
    saveState();
    return winId;
  }

  // Create window from template
  function createWindow(id, app, state = {}) {
    const tpl = windowTemplate.content.cloneNode(true);
    const el = tpl.querySelector('.window');
    const header = tpl.querySelector('.window-header');
    const titleEl = tpl.querySelector('.window-title');
    const body = tpl.querySelector('.window-body');
    el.setAttribute('data-win-id', id);
    el.dataset.appId = app.id;
    el.dataset.title = state.title || app.name;
    titleEl.textContent = el.dataset.title;

    // default placement or restored
    el.style.left = state.left || `${40 + (Object.keys(windows).length * 30) % 300}px`;
    el.style.top = state.top || `${40 + (Object.keys(windows).length * 20) % 200}px`;
    el.style.width = state.width || '540px';
    el.style.height = state.height || '340px';

    // events
    const btnClose = el.querySelector('.btn-close');
    const btnMin = el.querySelector('.btn-min');
    const btnMax = el.querySelector('.btn-max');
    btnClose.addEventListener('click', () => { closeWindow(id); saveState(); });
    btnMin.addEventListener('click', () => { minimizeWindow(id); saveState(); });
    btnMax.addEventListener('click', () => { toggleMaximize(id); saveState(); });

    // dragging with snap
    makeDraggable(el, header);

    // resizing
    makeResizable(el, el.querySelector('.resize-handle'));

    // focus on mousedown
    el.addEventListener('mousedown', () => focusWindow(el));

    desktop.appendChild(el);

    // z-order: push to end
    winOrder = winOrder.filter(x => x !== id);
    winOrder.push(id);
    el.style.zIndex = ++zIndexCounter;

    // ensure keyboard focus for accessibility
    header.addEventListener('keydown', (e) => {
      if(e.key === 'Enter') focusWindow(el);
    });

    return { el, body };
  }

  // Taskbar button
  function addToTaskbar(winId, app){
    const btn = document.createElement('button');
    btn.className = 'task-icon';
    btn.innerHTML = `<div style="font-size:18px">${app.icon}</div><div style="margin-left:6px">${app.name}</div>`;
    btn.addEventListener('click', () => {
      const winEl = windows[winId];
      if(!winEl) return;
      if(winEl.classList.contains('minimized')){
        restoreWindow(winId);
      } else {
        // if focused, minimize; otherwise focus
        const topId = winOrder[winOrder.length-1];
        if(topId === winId) minimizeWindow(winId);
        else focusWindow(winEl);
      }
      saveState();
    });
    taskbarCenter.appendChild(btn);
    taskButtons[winId] = btn;
  }

  // window actions
  function closeWindow(winId){
    const el = windows[winId];
    if(!el) return;
    el.remove();
    delete windows[winId];
    winOrder = winOrder.filter(x => x !== winId);
    // remove taskbar
    const btn = taskButtons[winId];
    if(btn) btn.remove();
    delete taskButtons[winId];
    saveState();
  }
  function minimizeWindow(winId){
    const el = windows[winId];
    if(!el) return;
    el.style.display = 'none';
    el.classList.add('minimized');
    const btn = taskButtons[winId];
    if(btn) btn.classList.remove('active');
    // move out of top z-order but keep ordering for restore
    winOrder = winOrder.filter(x => x !== winId);
    saveState();
  }
  function restoreWindow(winId){
    const el = windows[winId];
    if(!el) return;
    el.style.display = '';
    el.classList.remove('minimized');
    focusWindow(el);
    saveState();
  }
  function toggleMaximize(winId){
    const el = windows[winId];
    if(!el) return;
    if(el.dataset.max === '1'){
      // restore
      el.style.left = el.dataset.prevLeft || el.style.left;
      el.style.top = el.dataset.prevTop || el.style.top;
      el.style.width = el.dataset.prevWidth || el.style.width;
      el.style.height = el.dataset.prevHeight || el.style.height;
      el.dataset.max = '0';
    } else {
      // save prev
      el.dataset.prevLeft = el.style.left;
      el.dataset.prevTop = el.style.top;
      el.dataset.prevWidth = el.style.width;
      el.dataset.prevHeight = el.style.height;
      // maximize
      const pad = 10;
      el.style.left = `${pad}px`;
      el.style.top = `${pad}px`;
      el.style.width = `${window.innerWidth - pad*2}px`;
      el.style.height = `${window.innerHeight - pad - parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-height'))}px`;
      el.dataset.max = '1';
    }
    focusWindow(el);
    saveState();
  }

  // focus window
  function focusWindow(el){
    if(typeof el === 'string') el = windows[el];
    if(!el) return;
    // bring to front
    zIndexCounter += 1;
    el.style.zIndex = zIndexCounter;
    // update order: move el to last
    const id = el.getAttribute('data-win-id');
    winOrder = winOrder.filter(x => x !== id);
    winOrder.push(id);

    // mark others not-focused
    document.querySelectorAll('.window').forEach(w => {
      if(w === el) w.classList.remove('not-focused');
      else w.classList.add('not-focused');
    });
    // set taskbar active
    Object.keys(taskButtons).forEach(k => {
      if(k === id) taskButtons[k].classList.add('active');
      else taskButtons[k].classList.remove('active');
    });
    // ensure visible (not minimized)
    if(el.classList.contains('minimized')) restoreWindow(id);
    saveState();
  }

  // drag implementation with snap preview
  function makeDraggable(winEl, handle){
    let dragging = false;
    let offsetX = 0, offsetY = 0;
    let startedRect = null;
    handle.addEventListener('mousedown', (e) => {
      if(e.button !== 0) return;
      dragging = true;
      const rect = winEl.getBoundingClientRect();
      startedRect = rect;
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      focusWindow(winEl);
      document.body.style.userSelect = 'none';
      createSnapPreview();
    });
    window.addEventListener('mousemove', (e) => {
      if(!dragging) return;
      winEl.style.left = `${Math.max(6, e.clientX - offsetX)}px`;
      winEl.style.top = `${Math.max(6, e.clientY - offsetY)}px`;
      updateSnapPreview(winEl);
    });
    window.addEventListener('mouseup', (e) => {
      if(dragging) {
        dragging = false;
        document.body.style.userSelect = '';
        removeSnapPreview();
        applySnapIfNeeded(winEl);
        // clear maximized state if moved
        if(winEl.dataset.max === '1') {
          // if previously maximized and user drags, restore to previous
          winEl.dataset.max = '0';
        }
        saveState();
      }
    });
    // double-click header to toggle maximize
    handle.addEventListener('dblclick', () => {
      const id = winEl.getAttribute('data-win-id');
      toggleMaximize(id);
    });
  }

  // resize implementation
  function makeResizable(winEl, handle){
    let resizing = false;
    let startW, startH, startX, startY;
    handle.addEventListener('mousedown', (e) => {
      if(e.button !== 0) return;
      resizing = true;
      const rect = winEl.getBoundingClientRect();
      startW = rect.width; startH = rect.height; startX = e.clientX; startY = e.clientY;
      focusWindow(winEl);
      document.body.style.userSelect = 'none';
    });
    window.addEventListener('mousemove', (e) => {
      if(!resizing) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      winEl.style.width = `${Math.max(200, startW + dx)}px`;
      winEl.style.height = `${Math.max(120, startH + dy)}px`;
      saveState();
    });
    window.addEventListener('mouseup', () => {
      if(resizing){ resizing = false; document.body.style.userSelect = ''; saveState(); }
    });
  }

  // Snap helpers
  function createSnapPreview(){
    if(snapPreviewEl) return;
    snapPreviewEl = document.createElement('div');
    snapPreviewEl.className = 'snap-preview';
    document.body.appendChild(snapPreviewEl);
  }
  function removeSnapPreview(){
    if(!snapPreviewEl) return;
    snapPreviewEl.remove();
    snapPreviewEl = null;
  }
  function updateSnapPreview(winEl){
    if(!snapPreviewEl) return;
    const rect = winEl.getBoundingClientRect();
    const gap = 40;
    const threshold = 50;
    const w = window.innerWidth, h = window.innerHeight;
    // top
    if(rect.top < threshold){
      snapPreviewEl.style.left = '10px';
      snapPreviewEl.style.top = '10px';
      snapPreviewEl.style.width = `${w - 20}px`;
      snapPreviewEl.style.height = `${h - 20 - parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-height'))}px`;
      return;
    }
    // left
    if(rect.left < threshold){
      snapPreviewEl.style.left = '10px';
      snapPreviewEl.style.top = '10px';
      snapPreviewEl.style.width = `${Math.floor((w - 20) / 2)}px`;
      snapPreviewEl.style.height = `${h - 20 - parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-height'))}px`;
      return;
    }
    // right
    if((w - (rect.left + rect.width)) < threshold){
      snapPreviewEl.style.left = `${Math.ceil(10 + (w - 20) / 2)}px`;
      snapPreviewEl.style.top = '10px';
      snapPreviewEl.style.width = `${Math.floor((w - 20) / 2)}px`;
      snapPreviewEl.style.height = `${h - 20 - parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-height'))}px`;
      return;
    }
    // default: hide preview
    snapPreviewEl.style.width = '0px';
    snapPreviewEl.style.height = '0px';
  }
  function applySnapIfNeeded(winEl){
    const rect = winEl.getBoundingClientRect();
    const threshold = 50;
    const w = window.innerWidth, h = window.innerHeight;
    // top => maximize
    if(rect.top < threshold){
      const pad = 10;
      // save prev
      winEl.dataset.prevLeft = winEl.style.left;
      winEl.dataset.prevTop = winEl.style.top;
      winEl.dataset.prevWidth = winEl.style.width;
      winEl.dataset.prevHeight = winEl.style.height;
      winEl.style.left = `${pad}px`;
      winEl.style.top = `${pad}px`;
      winEl.style.width = `${w - pad*2}px`;
      winEl.style.height = `${h - pad - parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-height'))}px`;
      winEl.dataset.max = '1';
      return;
    }
    // left half
    if(rect.left < threshold){
      const pad = 10;
      winEl.dataset.prevLeft = winEl.style.left;
      winEl.dataset.prevTop = winEl.style.top;
      winEl.dataset.prevWidth = winEl.style.width;
      winEl.dataset.prevHeight = winEl.style.height;
      winEl.style.left = `${pad}px`;
      winEl.style.top = `${pad}px`;
      winEl.style.width = `${Math.floor((w - pad*2) / 2)}px`;
      winEl.style.height = `${h - pad - parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-height'))}px`;
      winEl.dataset.max = '0';
      return;
    }
    // right half
    if((w - (rect.left + rect.width)) < threshold){
      const pad = 10;
      winEl.dataset.prevLeft = winEl.style.left;
      winEl.dataset.prevTop = winEl.style.top;
      winEl.dataset.prevWidth = winEl.style.width;
      winEl.dataset.prevHeight = winEl.style.height;
      const halfW = Math.floor((w - pad*2) / 2);
      winEl.style.left = `${pad + halfW + 0}px`;
      winEl.style.top = `${pad}px`;
      winEl.style.width = `${halfW}px`;
      winEl.style.height = `${h - pad - parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-height'))}px`;
      winEl.dataset.max = '0';
      return;
    }
  }

  // Alt-Tab support
  function showAltTabOverlay(selectIndex = 0){
    altTabOverlay.innerHTML = '';
    const visibleWins = winOrder.filter(id => windows[id] && !windows[id].classList.contains('minimized'));
    if(visibleWins.length === 0) return;
    visibleWins.forEach((id, i) => {
      const el = document.createElement('div');
      el.className = 'item';
      const w = windows[id];
      const title = w.dataset.title || id;
      const appIcon = APPS.find(a => a.id === w.dataset.appId)?.icon || '▣';
      el.innerHTML = `<div style="font-size:18px">${appIcon}</div><div>${title}</div>`;
      if(i === selectIndex) el.classList.add('active');
      altTabOverlay.appendChild(el);
    });
    altTabOverlay.classList.remove('hidden');
    altTabOverlay.setAttribute('aria-hidden', 'false');
  }
  function hideAltTabOverlay(){
    altTabOverlay.classList.add('hidden');
    altTabOverlay.setAttribute('aria-hidden', 'true');
    altTabOverlay.innerHTML = '';
  }
  window.addEventListener('keydown', (e) => {
    // Start menu with Meta or Ctrl+Esc
    if((e.key === 'Meta') || (e.key === 'Escape' && e.ctrlKey)){
      toggleStartMenu();
      e.preventDefault();
      return;
    }

    // Alt-Tab logic
    if(e.key === 'Alt') {
      altDown = true;
      altTabIndex = 0;
      showAltTabOverlay(altTabIndex);
      return;
    }
    if(altDown && e.key === 'Tab') {
      e.preventDefault();
      const visibleWins = winOrder.filter(id => windows[id] && !windows[id].classList.contains('minimized'));
      if(visibleWins.length === 0) return;
      // cycle forward unless Shift is held (backwards)
      if(e.shiftKey) altTabIndex = (altTabIndex - 1 + visibleWins.length) % visibleWins.length;
      else altTabIndex = (altTabIndex + 1) % visibleWins.length;
      showAltTabOverlay(altTabIndex);
      return;
    }
    // Close alt-tab overlay with Escape
    if(altDown && e.key === 'Escape'){
      hideAltTabOverlay();
      altDown = false;
    }
  });
  window.addEventListener('keyup', (e) => {
    if(e.key === 'Alt' && altDown){
      // select currently highlighted window
      const visibleWins = winOrder.filter(id => windows[id] && !windows[id].classList.contains('minimized'));
      if(visibleWins.length > 0){
        const id = visibleWins[altTabIndex % visibleWins.length];
        focusWindow(windows[id]);
      }
      altDown = false;
      hideAltTabOverlay();
    }
  });

  // Example apps
  function createNotepad(container){
    container.classList.add('notepad');
    const ta = document.createElement('textarea');
    ta.placeholder = 'Type something...';
    // persist content per window (optional)
    ta.addEventListener('input', debounce(saveState, 400));
    container.appendChild(ta);
  }

  function createCalculator(container){
    container.classList.add('calculator');
    const screen = document.createElement('div'); screen.className = 'calc-screen'; screen.textContent = '0';
    const pad = document.createElement('div'); pad.className = 'calc-pad';
    const buttons = [
      '7','8','9','/',
      '4','5','6','*',
      '1','2','3','-',
      '0','.','=','+'
    ];
    buttons.forEach(b => {
      const btn = document.createElement('button');
      btn.textContent = b;
      btn.addEventListener('click', () => onClick(b));
      pad.appendChild(btn);
    });
    container.appendChild(screen); container.appendChild(pad);
    let expr = '';
    function onClick(key){
      if(key === '='){
        try { expr = String(eval(expr || '0')); screen.textContent = expr; }
        catch(e){ screen.textContent = 'Error'; expr = ''; }
        return;
      }
      expr += key;
      screen.textContent = expr;
    }
  }

  function createFiles(container){
    container.classList.add('files');
    const list = document.createElement('div');
    list.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
        <button id="new-file" style="padding:6px;border-radius:6px;border:0;background:rgba(255,255,255,0.02);color:var(--text)">New File</button>
        <div style="color:var(--muted)">This is a fake file explorer for demo.</div>
      </div>`;
    const content = document.createElement('div');
    content.style.display='grid';content.style.gridTemplateColumns='1fr 1fr';content.style.gap='8px';
    for(let i=1;i<=6;i++){
      const card = document.createElement('div');
      card.style.padding='10px';card.style.borderRadius='6px';card.style.background='rgba(255,255,255,0.02)';
      card.innerHTML = `<div style="font-size:24px">📄</div><div style="margin-top:6px">File-${i}.txt</div>`;
      content.appendChild(card);
    }
    container.appendChild(list); container.appendChild(content);
  }

  // App Store app: shows available apps and allows launching or "install" (creates start shortcut)
  function createAppStore(container){
    container.classList.add('app-store');
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '8px';
    header.innerHTML = `<div style="font-weight:700">App Store</div><div style="color:var(--muted)">Browse demo apps</div>`;
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(2,1fr)';
    grid.style.gap = '8px';
    APPS.forEach(a => {
      const card = document.createElement('div');
      card.style.padding = '10px';
      card.style.borderRadius = '8px';
      card.style.background = 'rgba(255,255,255,0.02)';
      card.innerHTML = `<div style="font-size:24px">${a.icon}</div>
        <div style="font-weight:600;margin-top:6px">${a.name}</div>
        <div style="color:var(--muted);margin-top:6px">Demo app</div>`;
      const actions = document.createElement('div');
      actions.style.marginTop = '8px';
      const btnLaunch = document.createElement('button');
      btnLaunch.textContent = 'Launch';
      btnLaunch.style.padding = '6px';
      btnLaunch.style.borderRadius = '6px';
      btnLaunch.style.border = '0';
      btnLaunch.style.background = 'rgba(255,255,255,0.02)';
      btnLaunch.style.color = 'var(--text)';
      btnLaunch.addEventListener('click', () => {
        // launch a new instance of the app
        const app = APPS.find(x => x.id === a.id);
        if(app) openApp(app);
      });
      actions.appendChild(btnLaunch);
      card.appendChild(actions);
      grid.appendChild(card);
    });
    container.appendChild(header);
    container.appendChild(grid);
  }

  // debounce helper
  function debounce(fn, wait=200){
    let t;
    return function(...args){ clearTimeout(t); t = setTimeout(()=>fn.apply(this,args), wait); };
  }

  // keyboard shortcuts: Alt handled above. Add Ctrl+W to close focused window
  window.addEventListener('keydown', (e) => {
    if(e.ctrlKey && e.key.toLowerCase() === 'w'){
      const topId = winOrder[winOrder.length-1];
      if(topId) closeWindow(topId);
    }
  });

  // initial helpful windows or restore
  setTimeout(() => {
    const restored = restoreState();
    if(!restored){
      // open Notepad and Files for demo
      openApp(APPS[0]);
      openApp(APPS[2]);
    }
  }, 300);

  // Save state before unload
  window.addEventListener('beforeunload', () => saveState());

  // expose for dev
  window.MINI_DESKTOP = { openApp, APPS, saveState, restoreState };

})();
