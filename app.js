/* HTML5 DesktopOS - updated with:
   - Wallpaper selector + live preview
   - Dark window backgrounds
   - White window control buttons (close reliably closes windows)
   - Per-window titlebar accent and animation toggle
   - Desktop shortcuts: pin photos and notes to desktop (persisted)
*/

(() => {
  // Utilities
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const id = (n) => document.getElementById(n);
  const randId = (p = "w") => p + Math.random().toString(36).slice(2, 9);

  // DOM refs
  const desktop = id("desktop");
  const iconsContainer = id("icons");
  const windowsContainer = id("windows");
  const taskbarWindows = id("taskbar-windows");
  const startButton = id("start-button");
  const startMenu = id("start-menu");
  const clockEl = id("clock");
  const themeToggle = id("theme-toggle");

  // Window stacking + state
  let z = 100;
  const windows = new Map(); // id -> window metadata

  // Settings & theme
  const settingsKey = "desktop_settings_v3";
  const defaultSettings = { theme: "dark", wallpaper: "wp-abstract", smallIcons: false, animations: true, accent: "#3b82f6", titlebarAccent: true };
  let settings = Object.assign({}, defaultSettings, JSON.parse(localStorage.getItem(settingsKey) || "{}"));

  // Desktop shortcuts storage
  const shortcutsKey = "desktop_shortcuts_v1";
  let shortcuts = JSON.parse(localStorage.getItem(shortcutsKey) || "[]");

  function applySettings() {
    document.documentElement.classList.remove("theme-light", "theme-dark");
    document.documentElement.classList.add(settings.theme === "light" ? "theme-light" : "theme-dark");
    document.documentElement.style.setProperty("--accent", settings.accent || defaultSettings.accent);
    $$(".icon-img").forEach(i => i.style.fontSize = settings.smallIcons ? "26px" : "36px");
    themeToggle.setAttribute("aria-pressed", settings.theme === "dark" ? "false" : "true");

    // Apply wallpaper class to body
    const wp = settings.wallpaper || defaultSettings.wallpaper;
    document.body.classList.remove("wp-abstract", "wp-geometry", "wp-waves", "wp-svg");
    document.body.classList.add(wp);

    // When accent toggled, update titlebars of open windows
    windows.forEach(meta => {
      const titlebar = meta.el.querySelector(".titlebar");
      if (settings.titlebarAccent) {
        titlebar.style.boxShadow = `inset 0 4px 0 ${hexToRgba(settings.accent, 0.12)}`;
      } else {
        titlebar.style.boxShadow = "";
      }
    });
  }
  applySettings();

  // Save settings helper
  function saveSettings() {
    localStorage.setItem(settingsKey, JSON.stringify(settings));
    applySettings();
  }

  // Shortcuts persistence + rendering
  function saveShortcuts() {
    localStorage.setItem(shortcutsKey, JSON.stringify(shortcuts));
  }
  function renderShortcuts() {
    // remove existing desktop shortcuts to avoid duplicates
    $$(".desktop-shortcut").forEach(el => el.remove());
    shortcuts.forEach((s, idx) => {
      const icon = document.createElement("div");
      icon.className = "icon desktop-shortcut";
      icon.dataset.shortcutId = s.id || (`sc-${idx}`);
      icon.dataset.type = s.type;
      icon.title = s.title || (s.type === "photo" ? "Photo" : "Note");
      // icon content
      const imgWrap = document.createElement("div");
      imgWrap.className = "icon-img";
      if (s.type === "photo") {
        const img = document.createElement("img");
        img.src = s.src;
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "cover";
        img.style.borderRadius = "10px";
        imgWrap.appendChild(img);
      } else if (s.type === "note") {
        imgWrap.textContent = "📝";
      } else {
        imgWrap.textContent = "🔖";
      }
      const lbl = document.createElement("div");
      lbl.className = "icon-label";
      lbl.textContent = s.title || (s.type === "photo" ? "Photo" : "Note");
      icon.appendChild(imgWrap);
      icon.appendChild(lbl);

      // attach handlers
      icon.addEventListener("dblclick", () => {
        if (s.type === "photo") {
          openPhotoViewer(s.src);
        } else if (s.type === "note") {
          openNoteViewer(s.content);
        }
      });
      // simple right-click to remove shortcut (context menu disabled)
      icon.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (confirm("Remove desktop shortcut?")) {
          shortcuts = shortcuts.filter(x => x.id !== s.id);
          saveShortcuts();
          renderShortcuts();
        }
      });

      iconsContainer.appendChild(icon);
    });
  }
  renderShortcuts();

  // Load persisted windows/state
  const saveState = () => {
    const state = { apps: [], settings, shortcuts };
    windows.forEach((w) => {
      state.apps.push({
        id: w.id,
        app: w.app,
        left: w.el.style.left,
        top: w.el.style.top,
        width: w.el.style.width,
        height: w.el.style.height,
        minimized: w.minimized,
        z: Number(w.el.style.zIndex) || 0
      });
    });
    localStorage.setItem("desktop_state_v1", JSON.stringify(state));
    localStorage.setItem(settingsKey, JSON.stringify(settings));
    saveShortcuts();
  };
  const loadState = () => {
    const raw = localStorage.getItem("desktop_state_v1");
    if (!raw) return;
    try {
      const state = JSON.parse(raw);
      if (state.settings) settings = Object.assign(settings, state.settings);
      if (state.shortcuts) {
        shortcuts = state.shortcuts;
        saveShortcuts();
      }
      applySettings();
      renderShortcuts();
      state.apps.forEach(a => {
        const appFunc = apps[a.app];
        if (appFunc) openApp(a.app, { id: a.id, left: a.left, top: a.top, width: a.width, height: a.height, minimized: a.minimized, restore: true });
      });
    } catch (e) { console.warn("Failed to load state", e); }
  };

  // Taskbar clock
  function updateClock() {
    const d = new Date();
    clockEl.textContent = d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  }
  setInterval(updateClock, 1000);
  updateClock();

  // Utility to convert hex to rgba
  function hexToRgba(hex, a = 1) {
    const h = hex.replace("#", "");
    const bigint = parseInt(h.length === 3 ? h.split('').map(c=>c+c).join('') : h, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r},${g},${b},${a})`;
  }

  // Window creation and management
  function createWindow({ title = "Window", width = 520, height = 320, left = 60, top = 60, app = "app", id: givenId } = {}) {
    const winId = givenId || randId();
    const el = document.createElement("div");
    el.className = "window";
    if (settings.animations !== false) {
      el.classList.add("enter");
    } else {
      el.classList.add("no-anim");
    }
    el.dataset.winId = winId;
    el.style.width = typeof width === "number" ? `${width}px` : width;
    el.style.height = typeof height === "number" ? `${height}px` : height;
    el.style.left = typeof left === "number" ? `${left}px` : left;
    el.style.top = typeof top === "number" ? `${top}px` : top;
    el.style.zIndex = ++z;

    el.innerHTML = `
      <div class="titlebar" tabindex="0">
        <div class="title">${escapeHtml(title)}</div>
        <div class="controls">
          <button class="win-btn" data-action="min" title="Minimize">—</button>
          <button class="win-btn" data-action="max" title="Maximize">⬜</button>
          <button class="win-btn" data-action="close" title="Close">✕</button>
        </div>
      </div>
      <div class="content"></div>
      <div class="resizer" aria-hidden="true"></div>
    `;

    windowsContainer.appendChild(el);
    // trigger entrance animation only if enabled
    if (settings.animations !== false) {
      requestAnimationFrame(() => {
        el.classList.remove("enter");
        el.classList.add("show");
      });
    } else {
      el.classList.add("show");
    }

    const meta = { id: winId, el, app, minimized: false, focused: true };
    windows.set(winId, meta);

    // Add to taskbar
    const tb = document.createElement("button");
    tb.className = "taskbar-item";
    tb.textContent = title;
    tb.dataset.winId = winId;
    taskbarWindows.appendChild(tb);
    meta.taskbarBtn = tb;

    // Focus behavior
    const focusWin = () => {
      z++;
      el.style.zIndex = z;
      meta.focused = true;
      $$(".window").forEach(w => w.classList.toggle("focused", w === el));
    };

    el.addEventListener("mousedown", (e) => {
      focusWin();
    });

    // Titlebar drag (pointer) - don't start drag if clicking a control button
    const titlebar = el.querySelector(".titlebar");
    if (settings.titlebarAccent) {
      titlebar.style.boxShadow = `inset 0 4px 0 ${hexToRgba(settings.accent, 0.12)}`;
      titlebar.classList.add("accent");
    }
    let dragging = false, dx = 0, dy = 0;
    titlebar.addEventListener("pointerdown", (ev) => {
      // If the user clicked a control (min/max/close), don't start dragging here so the button click can proceed normally.
      if (ev.target.closest('.win-btn')) return;
      focusWin();
      dragging = true;
      try { titlebar.setPointerCapture(ev.pointerId); } catch (e) {}
      const rect = el.getBoundingClientRect();
      dx = ev.clientX - rect.left;
      dy = ev.clientY - rect.top;
    });
    titlebar.addEventListener("pointermove", (ev) => {
      if (!dragging) return;
      el.style.left = `${Math.max(8, ev.clientX - dx)}px`;
      el.style.top = `${Math.max(8, ev.clientY - dy)}px`;
    });
    titlebar.addEventListener("pointerup", (ev) => {
      dragging = false;
      try { titlebar.releasePointerCapture(ev.pointerId); } catch(e){}
      saveState();
    });

    // Resizer
    const resizer = el.querySelector(".resizer");
    let resizing = false, startW = 0, startH = 0, sX = 0, sY = 0;
    resizer.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      resizing = true;
      resizer.setPointerCapture(ev.pointerId);
      const rect = el.getBoundingClientRect();
      startW = rect.width; startH = rect.height;
      sX = ev.clientX; sY = ev.clientY;
    });
    resizer.addEventListener("pointermove", (ev) => {
      if (!resizing) return;
      const nw = Math.max(220, startW + (ev.clientX - sX));
      const nh = Math.max(120, startH + (ev.clientY - sY));
      el.style.width = nw + "px";
      el.style.height = nh + "px";
    });
    resizer.addEventListener("pointerup", (ev) => {
      resizing = false;
      try { resizer.releasePointerCapture(ev.pointerId); } catch(e){}
      saveState();
    });

    // Controls - attach click handlers for min/max/close
    el.querySelectorAll(".win-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const action = btn.dataset.action;
        if (action === "close") {
          closeWindow(winId);
        } else if (action === "min") {
          minimizeWindow(winId);
        } else if (action === "max") {
          toggleMaximize(winId);
        }
      });
    });

    // Taskbar button click
    tb.addEventListener("click", () => {
      if (meta.minimized) restoreWindow(winId);
      else focusWin();
    });

    return meta;
  }

  function closeWindow(winId) {
    const meta = windows.get(winId);
    if (!meta) return;
    meta.el.remove();
    meta.taskbarBtn.remove();
    windows.delete(winId);
    saveState();
  }
  function minimizeWindow(winId) {
    const meta = windows.get(winId);
    if (!meta || meta.minimized) return;
    meta.el.style.display = "none";
    meta.minimized = true;
    meta.taskbarBtn.classList.add("minimized");
    saveState();
  }
  function restoreWindow(winId) {
    const meta = windows.get(winId);
    if (!meta) return;
    meta.el.style.display = "flex";
    meta.minimized = false;
    meta.taskbarBtn.classList.remove("minimized");
    meta.el.style.zIndex = ++z;
    saveState();
  }
  function toggleMaximize(winId) {
    const meta = windows.get(winId);
    if (!meta) return;
    const el = meta.el;
    if (!el.dataset._max) {
      el.dataset._prevLeft = el.style.left;
      el.dataset._prevTop = el.style.top;
      el.dataset._prevWidth = el.style.width;
      el.dataset._prevHeight = el.style.height;
      el.style.left = "12px";
      el.style.top = "12px";
      el.style.width = `calc(100% - 48px)`;
      el.style.height = `calc(100% - 104px)`;
      el.dataset._max = "1";
    } else {
      el.style.left = el.dataset._prevLeft || "60px";
      el.style.top = el.dataset._prevTop || "60px";
      el.style.width = el.dataset._prevWidth || "520px";
      el.style.height = el.dataset._prevHeight || "320px";
      delete el.dataset._max;
    }
    saveState();
  }

  // ----------------------
  // App registry
  // ----------------------
  const apps = {
    "file-manager": (meta, opts = {}) => {
      const c = meta.el.querySelector(".content");
      c.innerHTML = `
        <div class="small">Simple file list (in-memory)</div>
        <div class="file-list" id="${meta.id}-file-list"></div>
        <div style="margin-top:10px">
          <button class="button-primary" id="${meta.id}-new-file">New File</button>
        </div>
      `;
      const fileListEl = document.getElementById(`${meta.id}-file-list`);
      const filesKey = "desktop_files_v1";
      const raw = localStorage.getItem(filesKey);
      let files = raw ? JSON.parse(raw) : [{name:"welcome.txt", content:"Welcome to HTML5 DesktopOS!\n\nThis is a demo file."}];
      function render() {
        fileListEl.innerHTML = "";
        files.forEach((f, i) => {
          const it = document.createElement("div");
          it.className = "file-item";
          it.innerHTML = `<div style="font-size:20px">📄</div><div style="flex:1"><div style="font-weight:600">${escapeHtml(f.name)}</div><div class="small">${escapeHtml((f.content||"").slice(0,80))}</div></div><div><button data-i="${i}" class="open-file">Open</button></div>`;
          fileListEl.appendChild(it);
        });
        fileListEl.querySelectorAll(".open-file").forEach(b => {
          b.addEventListener("click", () => {
            const i = Number(b.dataset.i);
            openApp("text-editor", { file: files[i] });
          });
        });
      }
      render();
      c.querySelector(`#${meta.id}-new-file`).addEventListener("click", () => {
        const name = prompt("New file name", "note.txt");
        if (!name) return;
        files.unshift({name,content:""});
        localStorage.setItem(filesKey, JSON.stringify(files));
        render();
      });
    },

    "text-editor": (meta, opts = {}) => {
      const c = meta.el.querySelector(".content");
      const initialContent = opts.file ? opts.file.content : localStorage.getItem("desktop_editor_v1") || "";
      const filename = opts.file ? opts.file.name : (opts.name || "untitled.txt");
      c.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><strong>${escapeHtml(filename)}</strong><div class="small">Auto-saves to localStorage</div></div>
        <textarea class="editor-textarea" id="${meta.id}-editor">${escapeHtml(initialContent)}</textarea>
        <div style="margin-top:8px"><button class="button-primary" id="${meta.id}-save-editor">Save</button> <button id="${meta.id}-close-editor">Close</button></div>
      `;
      const ta = c.querySelector(`#${meta.id}-editor`);
      let t;
      ta.addEventListener("input", () => {
        clearTimeout(t);
        t = setTimeout(() => {
          localStorage.setItem("desktop_editor_v1", ta.value);
        }, 500);
      });
      c.querySelector(`#${meta.id}-save-editor`).addEventListener("click", () => {
        localStorage.setItem("desktop_editor_v1", ta.value);
        alert("Saved to localStorage (desktop_editor_v1)");
      });
      c.querySelector(`#${meta.id}-close-editor`).addEventListener("click", () => closeWindow(meta.id));
    },

    "terminal": (meta) => {
      const c = meta.el.querySelector(".content");
      c.innerHTML = `
        <div class="terminal-output" id="${meta.id}-termout"></div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <input id="${meta.id}-termin" style="flex:1;padding:8px;border-radius:6px;border:1px solid #444;font-family:monospace;background:transparent;color:inherit"/>
          <button id="${meta.id}-term-run">Run</button>
        </div>
      `;
      const out = id(`${meta.id}-termout`);
      const input = id(`${meta.id}-termin`);
      const run = id(`${meta.id}-term-run`);
      function write(s){ out.innerHTML += `<div>${escapeHtml(s)}</div>`; out.scrollTop = out.scrollHeight; }
      write("HTML5 Terminal — type 'help' for commands.");
      function handle(cmd) {
        const parts = cmd.trim().split(/\s+/);
        const c0 = parts[0] || "";
        if (!c0) return;
        if (c0 === "help") write("Available: help, echo, clear, date, about, calc");
        else if (c0 === "echo") write(parts.slice(1).join(" "));
        else if (c0 === "clear") out.innerHTML = "";
        else if (c0 === "date") write(new Date().toString());
        else if (c0 === "about") write("HTML5 DesktopOS demo by zippohype");
        else if (c0 === "calc") {
          try { const res = eval(parts.slice(1).join(" ")); write(String(res)); } catch(e){ write("calc: error"); }
        } else write("Unknown command: " + c0);
      }
      run.addEventListener("click", () => { handle(input.value); input.value = ""; });
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") { handle(input.value); input.value = ""; } });
    },

    "calculator": (meta) => {
      const c = meta.el.querySelector(".content");
      c.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:8px">
          <input id="${meta.id}-calc-screen" readonly style="padding:10px;border-radius:8px;border:1px solid #ddd;font-size:20px"/>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">
            ${["7","8","9","/","4","5","6","*","1","2","3","-","0",".","=","+"].map(t => `<button class="calc-btn">${t}</button>`).join("")}
          </div>
        </div>
      `;
      const screen = id(`${meta.id}-calc-screen`);
      let expr = "";
      function refresh(){ screen.value = expr || "0"; }
      $$(".calc-btn", meta.el).forEach(b => {
        b.addEventListener("click", () => {
          const t = b.textContent;
          if (t === "=") {
            try { expr = String(eval(expr)); } catch (e) { expr = "ERR"; }
          } else expr += t;
          refresh();
        });
      });
      refresh();
    },

    // Calendar
    "calendar": (meta) => {
      const c = meta.el.querySelector(".content");
      const now = new Date();
      let viewDate = new Date(now.getFullYear(), now.getMonth(), 1);
      c.innerHTML = `
        <div class="calendar">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <button id="${meta.id}-prev">&larr;</button>
            <div><strong id="${meta.id}-title"></strong></div>
            <button id="${meta.id}-next">&rarr;</button>
          </div>
          <div class="calendar-grid" id="${meta.id}-grid"></div>
        </div>
      `;
      function render() {
        id(`${meta.id}-title`).textContent = viewDate.toLocaleDateString([], {month:'long', year:'numeric'});
        const grid = id(`${meta.id}-grid`);
        grid.innerHTML = "";
        const start = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
        const end = new Date(viewDate.getFullYear(), viewDate.getMonth()+1, 0);
        const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
        days.forEach(d => {
          const h = document.createElement("div");
          h.className = "calendar-cell";
          h.style.fontWeight = 700;
          h.style.background = "transparent";
          h.textContent = d;
          grid.appendChild(h);
        });
        const lead = start.getDay();
        for (let i=0;i<lead;i++) {
          const ccell = document.createElement("div");
          ccell.className = "calendar-cell";
          ccell.innerHTML = "&nbsp;";
          grid.appendChild(ccell);
        }
        for (let day=1; day<=end.getDate(); day++) {
          const dcell = document.createElement("div");
          dcell.className = "calendar-cell";
          dcell.textContent = day;
          const cellDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
          const today = new Date();
          if (cellDate.toDateString() === today.toDateString()) dcell.classList.add("today");
          grid.appendChild(dcell);
        }
      }
      id(`${meta.id}-prev`).addEventListener("click", () => { viewDate.setMonth(viewDate.getMonth()-1); render(); });
      id(`${meta.id}-next`).addEventListener("click", () => { viewDate.setMonth(viewDate.getMonth()+1); render(); });
      render();
    },

    // Music
    "music": (meta) => {
      const c = meta.el.querySelector(".content");
      c.innerHTML = `
        <div style="display:flex;gap:12px">
          <div style="flex:1">
            <div class="small">Playlist</div>
            <div class="music-playlist" id="${meta.id}-playlist"></div>
          </div>
          <div style="width:260px">
            <div style="display:flex;align-items:center;gap:8px">
              <button class="button-primary" id="${meta.id}-play">Play</button>
              <button id="${meta.id}-stop">Stop</button>
            </div>
            <div style="margin-top:10px" class="small">Volume</div>
            <input type="range" id="${meta.id}-volume" min="0" max="1" step="0.01" value="0.6"/>
          </div>
        </div>
      `;
      const playlistEl = id(`${meta.id}-playlist`);
      const tracks = [
        { name: "Soft Pulse", pattern: [262,330,392,330], bpm: 80 },
        { name: "Bright Arp", pattern: [392,440,523,440], bpm: 110 },
        { name: "Calm Bass", pattern: [130,130,164,130], bpm: 70 }
      ];
      tracks.forEach((t,i)=>{
        const it = document.createElement("div");
        it.className = "track";
        it.innerHTML = `<div>${escapeHtml(t.name)}</div><div><button data-i="${i}" class="select-track">Load</button></div>`;
        playlistEl.appendChild(it);
      });
      let audioCtx, masterGain, isPlaying=false, currentInterval, currentPattern=[];
      const getCtx = () => {
        if (!audioCtx) {
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          masterGain = audioCtx.createGain();
          masterGain.gain.value = Number(id(`${meta.id}-volume`).value || 0.6);
          masterGain.connect(audioCtx.destination);
        }
        return audioCtx;
      };
      function playPattern(pattern, bpm) {
        stop();
        const ctx = getCtx();
        let idx=0;
        const interval = 60000 / bpm;
        currentInterval = setInterval(()=>{
          const freq = pattern[idx % pattern.length];
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = "sine";
          o.frequency.value = freq;
          g.gain.value = 0.0001;
          o.connect(g); g.connect(masterGain);
          o.start();
          g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
          o.stop(ctx.currentTime + 0.5);
          idx++;
        }, interval);
        isPlaying = true;
      }
      function stop() {
        if (currentInterval) clearInterval(currentInterval);
        currentInterval = null;
        isPlaying = false;
      }
      id(`${meta.id}-play`).addEventListener("click", ()=> {
        if (!currentPattern.length) {
          alert("Load a track first.");
          return;
        }
        if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
        playPattern(currentPattern.pattern, currentPattern.bpm);
      });
      id(`${meta.id}-stop`).addEventListener("click", () => stop());
      id(`${meta.id}-volume`).addEventListener("input", (e)=> {
        if (masterGain) masterGain.gain.value = Number(e.target.value);
      });
      playlistEl.querySelectorAll(".select-track").forEach(b=>{
        b.addEventListener("click", ()=>{
          const i = Number(b.dataset.i);
          currentPattern = tracks[i];
          alert(`Loaded: ${tracks[i].name}`);
        });
      });
    },

    // Photos (upload + viewer + pin to desktop)
    "photos": (meta) => {
      const c = meta.el.querySelector(".content");
      c.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
          <input type="file" id="${meta.id}-u" accept="image/*" multiple />
          <button class="button-primary" id="${meta.id}-clear">Clear</button>
        </div>
        <div class="photos-grid" id="${meta.id}-grid"></div>
      `;
      const input = id(`${meta.id}-u`);
      const grid = id(`${meta.id}-grid`);
      const photosKey = "desktop_photos_v1";
      let photos = JSON.parse(localStorage.getItem(photosKey) || "[]");
      function render() {
        grid.innerHTML = "";
        photos.forEach((p,i)=>{
          const img = document.createElement("img");
          img.className = "photo-thumb";
          img.src = p;
          img.addEventListener("click", ()=> openPhotoViewer(p));
          const wrapper = document.createElement("div");
          wrapper.style.position = "relative";
          wrapper.appendChild(img);
          const pinBtn = document.createElement("button");
          pinBtn.textContent = "Pin";
          pinBtn.style.position = "absolute";
          pinBtn.style.right = "6px";
          pinBtn.style.bottom = "6px";
          pinBtn.className = "button-primary";
          pinBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            createDesktopShortcut({ type: "photo", src: p, title: `Photo ${i+1}` });
            alert("Pinned to desktop");
          });
          wrapper.appendChild(pinBtn);
          grid.appendChild(wrapper);
        });
      }
      function openPhotoViewer(src) {
        const w = openApp("photo-viewer", { width: 720, height: 520 });
        const c2 = w.el.querySelector(".content");
        c2.innerHTML = `<div style="display:flex;flex-direction:column;height:100%"><div style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><button id="${w.id}-pin" class="button-primary">Pin to Desktop</button><div class="small">Right-click pinned icon to remove</div></div><div style="display:flex;justify-content:center;align-items:center;flex:1"><img src="${src}" style="max-width:100%;max-height:100%;border-radius:8px" /></div></div>`;
        id(`${w.id}-pin`).addEventListener("click", ()=> {
          createDesktopShortcut({ type: "photo", src, title: "Pinned Photo" });
          alert("Pinned to desktop");
        });
      }
      input.addEventListener("change", (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        const readers = files.map(f => new Promise((res) => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.readAsDataURL(f);
        }));
        Promise.all(readers).then(data => {
          photos = data.concat(photos).slice(0, 200);
          localStorage.setItem(photosKey, JSON.stringify(photos));
          render();
        });
      });
      id(`${meta.id}-clear`).addEventListener("click", ()=>{
        if (!confirm("Clear all saved photos?")) return;
        photos = [];
        localStorage.setItem(photosKey, JSON.stringify(photos));
        render();
      });
      render();
    },

    // photo-viewer placeholder app (content created by photos)
    "photo-viewer": (meta) => {
      const c = meta.el.querySelector(".content");
      c.innerHTML = `<div class="small">Photo Viewer</div><div style="display:flex;justify-content:center;align-items:center;height:100%"></div>`;
    },

    // Notes with Pin to Desktop
    "notes": (meta) => {
      const c = meta.el.querySelector(".content");
      const notesKey = "desktop_notes_v1";
      let notes = JSON.parse(localStorage.getItem(notesKey) || "[]");
      c.innerHTML = `
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <button class="button-primary" id="${meta.id}-new">New Note</button>
          <button id="${meta.id}-clear">Clear All</button>
        </div>
        <div id="${meta.id}-notes-list" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px"></div>
      `;
      const list = id(`${meta.id}-notes-list`);
      function render() {
        list.innerHTML = "";
        notes.forEach((n,i)=>{
          const container = document.createElement("div");
          container.style.display = "flex";
          container.style.flexDirection = "column";
          const eln = document.createElement("div");
          eln.className = "note";
          eln.contentEditable = true;
          eln.innerHTML = escapeHtml(n);
          eln.addEventListener("input", ()=> {
            notes[i] = eln.innerText;
            localStorage.setItem(notesKey, JSON.stringify(notes));
          });
          const toolbar = document.createElement("div");
          toolbar.style.display = "flex";
          toolbar.style.gap = "6px";
          toolbar.style.marginTop = "6px";
          const pin = document.createElement("button");
          pin.textContent = "Pin";
          pin.className = "button-primary";
          pin.addEventListener("click", ()=> {
            createDesktopShortcut({ type: "note", content: eln.innerText, title: (eln.innerText||"Note").slice(0,20) || "Note" });
            alert("Pinned note to desktop");
          });
          const del = document.createElement("button");
          del.textContent = "Delete";
          del.addEventListener("click", ()=> {
            if (!confirm("Delete note?")) return;
            notes.splice(i,1);
            localStorage.setItem(notesKey, JSON.stringify(notes));
            render();
          });
          toolbar.appendChild(pin);
          toolbar.appendChild(del);
          container.appendChild(eln);
          container.appendChild(toolbar);
          list.appendChild(container);
        });
      }
      id(`${meta.id}-new`).addEventListener("click", ()=>{
        notes.unshift("New note...");
        localStorage.setItem(notesKey, JSON.stringify(notes));
        render();
      });
      id(`${meta.id}-clear`).addEventListener("click", ()=>{
        if (!confirm("Clear all notes?")) return;
        notes = [];
        localStorage.setItem(notesKey, JSON.stringify(notes));
        render();
      });
      render();
    },

    // Mini Browser
    "browser": (meta) => {
      const c = meta.el.querySelector(".content");
      c.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
          <input id="${meta.id}-url" placeholder="https://example.com" style="flex:1;padding:8px;border-radius:6px;border:1px solid #ddd"/>
          <button id="${meta.id}-go" class="button-primary">Go</button>
        </div>
        <iframe id="${meta.id}-iframe" sandbox="allow-forms allow-scripts allow-same-origin allow-popups" style="width:100%;height:100%;border:0;border-radius:8px"></iframe>
      `;
      const input = id(`${meta.id}-url`);
      const go = id(`${meta.id}-go`);
      const iframe = id(`${meta.id}-iframe`);
      go.addEventListener("click", ()=> {
        let url = input.value.trim();
        if (!url) return;
        if (!/^https?:\/\//i.test(url)) url = "https://" + url;
        try {
          iframe.src = url;
        } catch (e) { alert("Failed to load URL"); }
      });
    },

    // Settings (wallpaper selector + preview + accent + animations + titlebar accent)
    "settings": (meta) => {
      const c = meta.el.querySelector(".content");
      c.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:8px">
          <label><input type="checkbox" id="${meta.id}-small-icons"> Use small desktop icons</label>
          <label>Theme: 
            <select id="${meta.id}-theme">
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </label>
          <label>Wallpaper:
            <select id="${meta.id}-wallpaper">
              <option value="wp-abstract">Abstract</option>
              <option value="wp-geometry">Geometry</option>
              <option value="wp-waves">Waves</option>
              <option value="wp-svg">SVG Art</option>
            </select>
          </label>
          <label>Accent color: <input type="color" id="${meta.id}-accent" value="${settings.accent || '#3b82f6'}"/></label>
          <label><input type="checkbox" id="${meta.id}-animations"> Enable window animations</label>
          <label><input type="checkbox" id="${meta.id}-titlebar-accent"> Show accent on window titlebars</label>
          <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
            <button id="${meta.id}-save-settings" class="button-primary">Save</button>
            <button id="${meta.id}-reset">Reset</button>
            <div style="margin-left:auto" class="small">Preview:</div>
            <div id="preview" style="width:64px;height:36px;border-radius:6px;border:1px solid rgba(255,255,255,0.04)"></div>
          </div>
        </div>
      `;
      const si = id(`${meta.id}-small-icons`), th = id(`${meta.id}-theme`), ac = id(`${meta.id}-accent`), an = id(`${meta.id}-animations`), wp = id(`${meta.id}-wallpaper`), tba = id(`${meta.id}-titlebar-accent`);
      si.checked = settings.smallIcons;
      th.value = settings.theme;
      ac.value = settings.accent || "#3b82f6";
      an.checked = settings.animations;
      wp.value = settings.wallpaper || defaultSettings.wallpaper;
      tba.checked = settings.titlebarAccent !== false;

      // preview reflects wallpaper selection by applying the same classes we use on body.
      const preview = id("preview");
      function updatePreview() {
        preview.classList.remove("wp-abstract","wp-geometry","wp-waves","wp-svg");
        preview.classList.add(wp.value);
      }
      updatePreview();
      wp.addEventListener("change", updatePreview);

      id(`${meta.id}-save-settings`).addEventListener("click", () => {
        settings.smallIcons = si.checked;
        settings.theme = th.value;
        settings.accent = ac.value;
        settings.animations = an.checked;
        settings.wallpaper = wp.value;
        settings.titlebarAccent = tba.checked;
        saveSettings();
        applySettings();
        alert("Settings saved");
      });
      id(`${meta.id}-reset`).addEventListener("click", ()=> {
        if (!confirm("Reset settings to defaults?")) return;
        settings = Object.assign({}, defaultSettings);
        saveSettings();
        location.reload();
      });
    }
  };

  // Helper escape
  function escapeHtml(s) {
    return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  // Desktop shortcut helper
  function createDesktopShortcut(obj) {
    const sc = Object.assign({ id: randId("sc"), title: obj.title || "" }, obj);
    shortcuts.unshift(sc);
    saveShortcuts();
    renderShortcuts();
  }

  function openPhotoViewer(src) {
    const w = openApp("photo-viewer", { width: 720, height: 520 });
    const c2 = w.el.querySelector(".content");
    c2.innerHTML = `<div style="display:flex;flex-direction:column;height:100%"><div style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><button id="${w.id}-pin" class="button-primary">Pin to Desktop</button><div class="small">Right-click pinned icon to remove</div></div><div style="display:flex;justify-content:center;align-items:center;flex:1"><img src="${src}" style="max-width:100%;max-height:100%;border-radius:8px" /></div></div>`;
    id(`${w.id}-pin`).addEventListener("click", ()=> {
      createDesktopShortcut({ type: "photo", src, title: "Pinned Photo" });
      alert("Pinned to desktop");
    });
  }
  function openNoteViewer(content) {
    const w = openApp("text-editor", { width: 420, height: 320, title: "Pinned Note" });
    const c2 = w.el.querySelector(".content");
    c2.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px"><textarea class="editor-textarea" id="${w.id}-note">${escapeHtml(content)}</textarea><div><button class="button-primary" id="${w.id}-save">Save</button></div></div>`;
    id(`${w.id}-save`).addEventListener("click", ()=> {
      alert("Saved (note in this editor only)");
    });
  }

  // Open app convenience
  function openApp(appName, opts = {}) {
    const title = (opts.file && opts.file.name) || (opts.title) || appName.replace(/-/g," ").replace(/\b\w/g,c=>c.toUpperCase());
    const meta = createWindow({ title, app: appName, width: opts.width || 560, height: opts.height || 360, left: opts.left || (50 + windows.size*18), top: opts.top || (50 + windows.size*18), id: opts.id });
    const fn = apps[appName];
    if (fn) fn(meta, opts);
    if (opts.restore && opts.minimized) minimizeWindow(meta.id);
    saveState();
    return meta;
  }

  // UI wiring: icons & start menu
  function wireDesktopIcons() {
    $$(".icon").forEach(ic => {
      // Avoid binding duplicate listeners if called multiple times
      if (ic.dataset.bound) return;
      ic.dataset.bound = "1";
      ic.addEventListener("dblclick", () => {
        const app = ic.dataset.app;
        if (app) openApp(app);
      });
      ic.addEventListener("click", () => {
        $$(".icon").forEach(i => i.classList.remove("selected"));
        ic.classList.add("selected");
      });
    });
  }
  wireDesktopIcons();

  startButton.addEventListener("click", (e) => {
    const show = startMenu.style.display !== "block";
    startMenu.style.display = show ? "block" : "none";
    startButton.setAttribute("aria-expanded", show ? "true" : "false");
    startMenu.setAttribute("aria-hidden", show ? "false" : "true");
  });

  startMenu.addEventListener("click", (e) => {
    const t = e.target;
    if (t.dataset.launch) openApp(t.dataset.launch);
    if (t.id === "restart-button") {
      alert("Restarting desktop (reloading page)...");
      location.reload();
    }
    if (t.id === "clear-state") {
      if (confirm("Clear saved desktop state (localStorage)?")) {
        localStorage.clear();
        alert("Cleared. Reloading.");
        location.reload();
      }
    }
    startMenu.style.display = "none";
  });

  // Theme toggle in taskbar
  themeToggle.addEventListener("click", ()=> {
    settings.theme = settings.theme === "dark" ? "light" : "dark";
    saveSettings();
  });

  // Global keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const top = Array.from(windows.values()).sort((a,b) => (Number(b.el.style.zIndex) - Number(a.el.style.zIndex)))[0];
      if (top) closeWindow(top.id);
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
      e.preventDefault();
      openApp("text-editor");
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "t") {
      e.preventDefault();
      openApp("terminal");
    }
  });

  // Click desktop to hide start menu and deselect icons
  desktop.addEventListener("click", (e) => {
    startMenu.style.display = "none";
    $$(".icon").forEach(i => i.classList.remove("selected"));
  });

  // public API for debug
  window.HTML5Desktop = { openApp, windowsMap: windows, settings, saveSettings, createDesktopShortcut };

  // Load persisted state and welcome windows
  loadState();

  // If no windows open, open a welcome file-manager and editor
  if (windows.size === 0) {
    openApp("file-manager");
    openApp("text-editor");
  }

  // Save state periodically
  setInterval(saveState, 2000);
})();
