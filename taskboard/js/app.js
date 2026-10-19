(function () {
  'use strict';

  /* ==========================================================
     Constants
     ========================================================== */
  const STORE_KEY = 'taskboard.tasks.v2';
  const CATS_KEY  = 'taskboard.cats.v2';
  const THEME_KEY = 'taskboard.theme.v1';

  const PRIORITIES = {
    low:  { label: 'Low',    weight: 1 },
    med:  { label: 'Medium', weight: 2 },
    high: { label: 'High',   weight: 3 },
  };

  const PALETTE = [
    '#4f46e5', '#0891b2', '#059669', '#ca8a04', '#dc2626',
    '#db2777', '#7c3aed', '#0d9488', '#ea580c', '#2563eb',
  ];

  /* ==========================================================
     State
     ========================================================== */
  let tasks = [];
  let cats  = [];
  let filter = 'all';
  let categoryFilter = 'all';
  let sortBy = 'manual';
  let query = '';
  let editingId = null;
  let dragId = null;
  let toastTimer = null;
  let undoAction = null;
  let searchTimer = null;

  /* ==========================================================
     Element cache
     ========================================================== */
  const $ = (s) => document.querySelector(s);
  const el = {
    addForm:     $('#addForm'),
    text:        $('#text'),
    cat:         $('#cat'),
    prio:        $('#prio'),
    due:         $('#due'),
    catFilter:   $('#catFilter'),
    sortBy:      $('#sortBy'),
    search:      $('#search'),
    list:        $('#list'),
    count:       $('#count'),
    clearBtn:    $('#clearBtn'),
    themeBtn:    $('#themeBtn'),
    menuBtn:     $('#menuBtn'),
    menu:        $('#menu'),
    exportBtn:   $('#exportBtn'),
    importBtn:   $('#importBtn'),
    importFile:  $('#importFile'),
    toast:       $('#toast'),
    toastMsg:    $('#toastMsg'),
    toastUndo:   $('#toastUndo'),
    tabs:        document.querySelectorAll('[data-filter]'),
  };

  /* ==========================================================
     Utils
     ========================================================== */
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
  const pad = (n) => String(n).padStart(2, '0');

  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const formatDate = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const now = new Date();
    const t = new Date(now); t.setDate(now.getDate() + 1);
    const tomorrowStr = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
    if (iso === todayISO()) return 'Today';
    if (iso === tomorrowStr) return 'Tomorrow';
    return date.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
    });
  };

  const isOverdue = (iso) => !!iso && iso < todayISO();
  const isDueToday = (iso) => iso === todayISO();

  /* ==========================================================
     Persistence
     ========================================================== */
  function safeParse(raw, fallback) {
    try { return raw ? JSON.parse(raw) : fallback; }
    catch { return fallback; }
  }

  function loadTasks() {
    const v2 = safeParse(localStorage.getItem(STORE_KEY), null);
    if (Array.isArray(v2)) {
      return v2.filter((t) => t && typeof t.text === 'string');
    }
    // One-time migration from v1 schema
    const v1 = safeParse(localStorage.getItem('taskboard.tasks.v1'), null);
    if (Array.isArray(v1)) {
      return v1.filter((t) => t && typeof t.text === 'string').map((t, i) => ({
        id:         t.id || uid(),
        text:       t.text,
        categoryId: String(t.category || 'work').toLowerCase(),
        priority:   'med',
        due:        t.due || '',
        done:       !!t.done,
        createdAt:  Date.now(),
        order:      i,
      }));
    }
    return [];
  }

  function loadCats() {
    const stored = safeParse(localStorage.getItem(CATS_KEY), null);
    if (Array.isArray(stored) && stored.length) return stored;
    return [
      { id: 'work',     name: 'Work',     color: PALETTE[0] },
      { id: 'personal', name: 'Personal', color: PALETTE[2] },
      { id: 'study',    name: 'Study',    color: PALETTE[1] },
    ];
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(tasks)); } catch {}
    try { localStorage.setItem(CATS_KEY,  JSON.stringify(cats));  } catch {}
  }

  const findTask = (id) => tasks.find((t) => t.id === id);
  const findCat  = (id) => cats.find((c) => c.id === id) || cats[0];

  /* ==========================================================
     Theme
     ========================================================== */
  function applyTheme(mode) {
    const root = document.documentElement;
    if (mode === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);
    try { localStorage.setItem(THEME_KEY, mode); } catch {}
    el.themeBtn.setAttribute('aria-label', `Theme: ${mode}. Click to change.`);
  }

  function cycleTheme() {
    const cur = localStorage.getItem(THEME_KEY) || 'auto';
    const next = cur === 'auto' ? 'light' : cur === 'light' ? 'dark' : 'auto';
    applyTheme(next);
    showToast(`Theme: ${next}`);
  }

  /* ==========================================================
     Toast + undo
     ========================================================== */
  function showToast(msg, undoFn) {
    clearTimeout(toastTimer);
    el.toastMsg.textContent = msg;
    undoAction = undoFn || null;
    el.toastUndo.hidden = !undoFn;
    el.toast.hidden = false;
    void el.toast.offsetWidth;           // force reflow so transition plays
    el.toast.classList.add('show');
    toastTimer = setTimeout(hideToast, undoFn ? 5000 : 2500);
  }

  function hideToast() {
    el.toast.classList.remove('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.toast.hidden = true;
      undoAction = null;
    }, 200);
  }

  /* ==========================================================
     Filter / sort
     ========================================================== */
  function visibleTasks() {
    const q = query.trim().toLowerCase();

    const list = tasks.filter((t) => {
      if (filter === 'active' && t.done) return false;
      if (filter === 'completed' && !t.done) return false;
      if (categoryFilter !== 'all' && t.categoryId !== categoryFilter) return false;
      if (q) {
        const hay = `${t.text} ${findCat(t.categoryId).name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (sortBy === 'due') {
      list.sort((a, b) => {
        if (a.done !== b.done) return Number(a.done) - Number(b.done);
        if (!a.due && !b.due) return (a.order || 0) - (b.order || 0);
        if (!a.due) return 1;
        if (!b.due) return -1;
        return a.due.localeCompare(b.due);
      });
    } else if (sortBy === 'priority') {
      list.sort((a, b) => {
        if (a.done !== b.done) return Number(a.done) - Number(b.done);
        const d = (PRIORITIES[b.priority]?.weight || 0) - (PRIORITIES[a.priority]?.weight || 0);
        return d || (a.order || 0) - (b.order || 0);
      });
    } else if (sortBy === 'created') {
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } else {
      list.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
    return list;
  }

  /* ==========================================================
     Rendering
     ========================================================== */
  function renderSelects() {
    const catOpts = cats
      .map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`)
      .join('');

    const prevAdd = el.cat.value;
    el.cat.innerHTML = catOpts;
    if (prevAdd && cats.some((c) => c.id === prevAdd)) el.cat.value = prevAdd;

    const prevFilter = el.catFilter.value || 'all';
    el.catFilter.innerHTML = `<option value="all">All categories</option>` + catOpts;
    el.catFilter.value = prevFilter;

    if (!el.prio.options.length) {
      el.prio.innerHTML = Object.entries(PRIORITIES)
        .map(([id, p]) => `<option value="${id}"${id === 'med' ? ' selected' : ''}>${p.label}</option>`)
        .join('');
    }
  }

  function taskHTML(t) {
    const cat      = findCat(t.categoryId);
    const late     = !t.done && isOverdue(t.due);
    const dueToday = !t.done && isDueToday(t.due);
    const prio     = PRIORITIES[t.priority] || PRIORITIES.med;

    if (t.id === editingId) {
      return `<li class="task editing" data-id="${esc(t.id)}" style="--cat:${cat.color}">
        <form class="edit-form" data-edit novalidate>
          <input name="text" value="${esc(t.text)}" maxlength="200" required aria-label="Task title">
          <div class="edit-row">
            <div class="select-wrap"><select name="cat" aria-label="Category">
              ${cats.map((c) => `<option value="${esc(c.id)}"${c.id === t.categoryId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}
            </select></div>
            <div class="select-wrap"><select name="prio" aria-label="Priority">
              ${Object.entries(PRIORITIES).map(([id, p]) => `<option value="${id}"${id === t.priority ? ' selected' : ''}>${p.label}</option>`).join('')}
            </select></div>
            <input type="date" name="due" value="${esc(t.due || '')}" aria-label="Due date">
          </div>
          <div class="edit-actions">
            <button type="submit" class="primary sm">Save</button>
            <button type="button" class="ghost sm" data-act="cancel">Cancel</button>
          </div>
        </form>
      </li>`;
    }

    const draggable = sortBy === 'manual' ? 'true' : 'false';

    return `<li class="task${t.done ? ' done' : ''}${late ? ' overdue' : ''}"
              data-id="${esc(t.id)}" style="--cat:${cat.color}"
              tabindex="0" draggable="${draggable}"
              aria-label="${esc(t.text)}${t.done ? ', completed' : ''}">
      <button type="button" class="check${t.done ? ' checked' : ''}"
              data-act="toggle" role="checkbox" aria-checked="${t.done}"
              aria-label="Toggle complete">
        <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
          <path d="M4 10.5l4 4 8-8" fill="none" stroke="currentColor"
                stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="body">
        <span class="title">${esc(t.text)}</span>
        <div class="meta">
          <span class="tag" style="color:${cat.color}">${esc(cat.name)}</span>
          <span class="prio prio-${t.priority || 'med'}">${prio.label}</span>
          ${t.due ? `<span class="due${late ? ' late' : ''}${dueToday ? ' today' : ''}">${late ? 'Overdue · ' : ''}${formatDate(t.due)}</span>` : ''}
        </div>
      </div>
      <div class="task-actions">
        <button type="button" class="icon-btn sm" data-act="edit" aria-label="Edit task">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
          </svg>
        </button>
        <button type="button" class="icon-btn sm danger" data-act="delete" aria-label="Delete task">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 6h18"/>
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          </svg>
        </button>
      </div>
    </li>`;
  }

  function render() {
    const items = visibleTasks();

    if (!items.length) {
      const msg = tasks.length
        ? 'No tasks match this view.'
        : 'You’re all clear. Add your first task above.';
      el.list.innerHTML = `<li class="empty">${msg}</li>`;
    } else {
      el.list.innerHTML = items.map(taskHTML).join('');
      if (editingId) {
        const input = el.list.querySelector('.edit-form input');
        if (input) { input.focus(); input.select(); }
      }
    }

    const total = tasks.length;
    const left  = tasks.filter((t) => !t.done).length;
    el.count.textContent = total === 0
      ? 'No tasks'
      : `${left} of ${total} task${total === 1 ? '' : 's'} left`;

    el.clearBtn.hidden = !tasks.some((t) => t.done);
  }

  /* ==========================================================
     Actions
     ========================================================== */
  function addTask(text, categoryId, priority, due) {
    const minOrder = tasks.length ? Math.min(...tasks.map((t) => t.order || 0)) : 0;
    tasks.unshift({
      id: uid(),
      text,
      categoryId,
      priority,
      due,
      done: false,
      createdAt: Date.now(),
      order: minOrder - 1,
    });
    save();
    render();
  }

  function toggleTask(id) {
    const t = findTask(id);
    if (!t) return;
    t.done = !t.done;
    t.completedAt = t.done ? Date.now() : null;
    save();
    render();
    if (t.done) showToast('Task completed');
  }

  function deleteTask(id) {
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const removed = tasks[idx];
    tasks.splice(idx, 1);
    save();
    render();
    showToast('Task deleted', () => {
      tasks.splice(idx, 0, removed);
      save();
      render();
      showToast('Restored');
    });
  }

  function clearCompleted() {
    const snapshot = tasks.slice();
    const doneCount = tasks.filter((t) => t.done).length;
    if (!doneCount) return;
    tasks = tasks.filter((t) => !t.done);
    save();
    render();
    showToast(`${doneCount} task${doneCount === 1 ? '' : 's'} cleared`, () => {
      tasks = snapshot;
      save();
      render();
      showToast('Restored');
    });
  }

  function startEdit(id) {
    editingId = id;
    render();
  }

  function cancelEdit() {
    editingId = null;
    render();
  }

  function saveEdit(id, data) {
    const t = findTask(id);
    if (!t) { editingId = null; render(); return; }
    if (data.text) t.text = data.text;
    if (data.categoryId) t.categoryId = data.categoryId;
    if (data.priority) t.priority = data.priority;
    t.due = data.due || '';
    save();
    editingId = null;
    render();
    showToast('Task updated');
  }

  function moveTask(id, delta) {
    if (sortBy !== 'manual') {
      showToast('Switch to “Manual” sort to reorder');
      return;
    }
    const ordered = tasks.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const idx = ordered.findIndex((t) => t.id === id);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target >= ordered.length) return;
    const [item] = ordered.splice(idx, 1);
    ordered.splice(target, 0, item);
    ordered.forEach((t, i) => { t.order = i; });
    save();
    render();
    el.list.querySelector(`[data-id="${id}"]`)?.focus();
  }

  /* ==========================================================
     Export / import
     ========================================================== */
  function exportTasks() {
    const payload = { version: 2, exportedAt: new Date().toISOString(), tasks, cats };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `taskboard-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Exported');
  }

  function importTasks(file) {
    const reader = new FileReader();
    reader.onerror = () => showToast('Import failed: could not read file');
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.tasks)) throw new Error('missing tasks array');

        const incoming = data.tasks.filter((t) => t && typeof t.text === 'string');
        if (!incoming.length) throw new Error('no valid tasks');

        const seen = new Set(tasks.map((t) => t.id));
        let added = 0;
        incoming.forEach((t) => {
          const id = t.id && !seen.has(t.id) ? t.id : uid();
          seen.add(id);
          tasks.push({
            id,
            text: t.text,
            categoryId: t.categoryId || cats[0].id,
            priority: t.priority in PRIORITIES ? t.priority : 'med',
            due: t.due || '',
            done: !!t.done,
            createdAt: t.createdAt || Date.now(),
            order: typeof t.order === 'number' ? t.order : tasks.length,
          });
          added++;
        });

        if (Array.isArray(data.cats)) {
          data.cats.forEach((c) => {
            if (c && c.id && !cats.find((x) => x.id === c.id)) cats.push(c);
          });
        }

        save();
        renderSelects();
        render();
        showToast(`Imported ${added} task${added === 1 ? '' : 's'}`);
      } catch (err) {
        showToast('Import failed: ' + (err.message || 'invalid file'));
      }
    };
    reader.readAsText(file);
  }

  /* ==========================================================
     Events — add form
     ========================================================== */
  el.addForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = el.text.value.trim();
    if (!text) { el.text.focus(); return; }
    addTask(text, el.cat.value, el.prio.value, el.due.value);
    el.text.value = '';
    el.due.value = '';
    el.text.focus();
  });

  /* ==========================================================
     Events — list
     ========================================================== */
  el.list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const li = btn.closest('[data-id]');
    if (!li) return;
    const id = li.dataset.id;
    switch (btn.dataset.act) {
      case 'toggle': toggleTask(id); break;
      case 'delete': deleteTask(id); break;
      case 'edit':   startEdit(id);  break;
      case 'cancel': cancelEdit();   break;
    }
  });

  el.list.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-edit]');
    if (!form) return;
    e.preventDefault();
    const id = form.closest('[data-id]').dataset.id;
    const text = form.text.value.trim();
    if (!text) { form.text.focus(); return; }
    saveEdit(id, {
      text,
      categoryId: form.cat.value,
      priority:   form.prio.value,
      due:        form.due.value,
    });
  });

  el.list.addEventListener('keydown', (e) => {
    const li = e.target.closest('[data-id]');
    if (!li) return;

    // Inside the edit form: only Escape matters
    if (e.target.matches('.edit-form input, .edit-form select')) {
      if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
      return;
    }

    const id = li.dataset.id;

    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      moveTask(id, e.key === 'ArrowUp' ? -1 : 1);
    } else if (e.key === 'Enter' && e.target === li) {
      e.preventDefault();
      startEdit(id);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && e.target === li) {
      e.preventDefault();
      deleteTask(id);
    }
  });

  /* ==========================================================
     Events — drag & drop
     ========================================================== */
  el.list.addEventListener('dragstart', (e) => {
    const li = e.target.closest('[data-id]');
    if (!li || sortBy !== 'manual') { e.preventDefault(); return; }
    dragId = li.dataset.id;
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', dragId); } catch {}
  });

  el.list.addEventListener('dragover', (e) => {
    if (!dragId) return;
    const li = e.target.closest('[data-id]');
    if (!li) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    el.list.querySelectorAll('.over').forEach((x) => x.classList.remove('over'));
    if (li.dataset.id !== dragId) li.classList.add('over');
  });

  el.list.addEventListener('drop', (e) => {
    if (!dragId) return;
    const li = e.target.closest('[data-id]');
    if (!li) return;
    e.preventDefault();
    const from = tasks.findIndex((t) => t.id === dragId);
    const to   = tasks.findIndex((t) => t.id === li.dataset.id);
    if (from > -1 && to > -1 && from !== to) {
      const [moved] = tasks.splice(from, 1);
      tasks.splice(to, 0, moved);
      tasks.forEach((t, i) => { t.order = i; });
      save();
    }
    dragId = null;
    render();
  });

  el.list.addEventListener('dragend', () => {
    dragId = null;
    el.list.querySelectorAll('.dragging, .over')
      .forEach((x) => x.classList.remove('dragging', 'over'));
    render();
  });

  /* ==========================================================
     Events — toolbar
     ========================================================== */
  document.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      filter = btn.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach((b) => {
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
      });
      render();
    });
  });

  el.catFilter.addEventListener('change', () => {
    categoryFilter = el.catFilter.value;
    render();
  });

  el.sortBy.addEventListener('change', () => {
    sortBy = el.sortBy.value;
    render();
  });

  el.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      query = el.search.value;
      render();
    }, 120);
  });

  el.clearBtn.addEventListener('click', clearCompleted);
  el.themeBtn.addEventListener('click', cycleTheme);

  /* ==========================================================
     Events — menu
     ========================================================== */
  el.menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = el.menu.hidden;
    el.menu.hidden = !willOpen;
    el.menuBtn.setAttribute('aria-expanded', String(willOpen));
    if (willOpen) el.menu.querySelector('button')?.focus();
  });

  document.addEventListener('click', (e) => {
    if (el.menu.hidden) return;
    if (!e.target.closest('.menu-wrap')) {
      el.menu.hidden = true;
      el.menuBtn.setAttribute('aria-expanded', 'false');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.menu.hidden) {
      el.menu.hidden = true;
      el.menuBtn.setAttribute('aria-expanded', 'false');
      el.menuBtn.focus();
    }
  });

  el.exportBtn.addEventListener('click', () => { el.menu.hidden = true; exportTasks(); });
  el.importBtn.addEventListener('click', () => { el.menu.hidden = true; el.importFile.click(); });
  el.importFile.addEventListener('change', () => {
    const f = el.importFile.files?.[0];
    if (f) importTasks(f);
    el.importFile.value = '';
  });

  /* ==========================================================
     Toast undo
     ========================================================== */
  el.toastUndo.addEventListener('click', () => {
    if (undoAction) { const fn = undoAction; undoAction = null; fn(); }
    hideToast();
  });

  /* ==========================================================
     Cross-tab sync
     ========================================================== */
  window.addEventListener('storage', (e) => {
    if (e.key === STORE_KEY) {
      tasks = loadTasks();
      render();
    } else if (e.key === CATS_KEY) {
      cats = loadCats();
      renderSelects();
      render();
    }
  });

  /* ==========================================================
     Init
     ========================================================== */
  function init() {
    tasks = loadTasks();
    if (tasks.some((t) => typeof t.order !== 'number')) {
      tasks.forEach((t, i) => { if (typeof t.order !== 'number') t.order = i; });
    }
    cats = loadCats();
    applyTheme(localStorage.getItem(THEME_KEY) || 'auto');
    renderSelects();
    render();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline-only bonus */ });
    }
  }

  init();
})();