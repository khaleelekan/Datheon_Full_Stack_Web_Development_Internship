(function(){
  var KEY = 'taskboard.tasks.v1';
  var tasks = loadFromLocalStorage();
  var filter = 'all', query = '', editingId = null, dragId = null;
  var list = document.getElementById('list');

  function loadFromLocalStorage(){
    try { var raw = localStorage.getItem(KEY); var d = raw ? JSON.parse(raw) : []; return Array.isArray(d) ? d : []; }
    catch (e) { return []; }
  }
  function saveToLocalStorage(){
    try { localStorage.setItem(KEY, JSON.stringify(tasks)); } catch (e) {}
  }
  function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function today(){ var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
  function fmt(iso){ var p = iso.split('-'); return new Date(p[0], p[1]-1, p[2]).toLocaleDateString(undefined, {day:'numeric', month:'short', year:'numeric'}); }
  var CATS = ['Work','Personal','Study'];
  function catVar(c){ return 'var(--' + c.toLowerCase() + ')'; }

  function visible(){
    var q = query.trim().toLowerCase();
    return tasks.filter(function(t){
      if (filter === 'active' && t.done) return false;
      if (filter === 'completed' && !t.done) return false;
      return !q || t.text.toLowerCase().indexOf(q) > -1 || t.category.toLowerCase().indexOf(q) > -1;
    });
  }

  function render(){
    var items = visible(), now = today();
    if (!items.length){
      list.innerHTML = '<li class="empty" style="display:block;border-left-width:1px">' +
        (tasks.length ? 'No tasks match this view.' : 'You’re all clear. Add your first task above.') + '</li>';
    } else {
      list.innerHTML = items.map(function(t){
        if (t.id === editingId){
          return '<li data-id="' + t.id + '" style="--cat:' + catVar(t.category) + '"><form class="edit" data-edit>' +
            '<input name="text" value="' + esc(t.text) + '" maxlength="140" required aria-label="Task title">' +
            '<div><select name="cat" aria-label="Category">' + CATS.map(function(c){ return '<option' + (c === t.category ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select>' +
            '<input type="date" name="due" value="' + (t.due || '') + '" aria-label="Due date">' +
            '<button class="primary" type="submit">Save</button><button class="icon" type="button" data-act="cancel">Cancel</button></div></form></li>';
        }
        var late = t.due && !t.done && t.due < now;
        return '<li draggable="true" class="' + (t.done ? 'done' : '') + '" data-id="' + t.id + '" style="--cat:' + catVar(t.category) + '">' +
          '<input class="check" type="checkbox" data-act="toggle" aria-label="Mark complete"' + (t.done ? ' checked' : '') + '>' +
          '<div class="body"><span class="title">' + esc(t.text) + '</span><div class="meta"><span class="tag">' + esc(t.category) + '</span>' +
          (t.due ? '<span class="' + (late ? 'late' : '') + '">' + (late ? 'Overdue: ' : 'Due ') + fmt(t.due) + '</span>' : '') + '</div></div>' +
          '<button class="icon" data-act="edit" aria-label="Edit task">Edit</button>' +
          '<button class="icon del" data-act="delete" aria-label="Delete task">Delete</button></li>';
      }).join('');
    }
    var left = tasks.filter(function(t){ return !t.done; }).length;
    document.getElementById('count').textContent = left + (left === 1 ? ' task' : ' tasks') + ' left';
    document.getElementById('clear').style.visibility = tasks.some(function(t){ return t.done; }) ? 'visible' : 'hidden';
  }

  function find(id){ return tasks.filter(function(t){ return t.id === id; })[0]; }

  // Create
  document.getElementById('addForm').addEventListener('submit', function(e){
    e.preventDefault();
    var text = document.getElementById('text').value.trim();
    if (!text) return;
    tasks.unshift({ id: uid(), text: text, category: document.getElementById('cat').value, due: document.getElementById('due').value, done: false });
    saveToLocalStorage();
    this.reset();
    render();
    document.getElementById('text').focus();
  });

  // Update / delete / toggle
  list.addEventListener('click', function(e){
    var btn = e.target.closest('[data-act]'); if (!btn) return;
    var li = btn.closest('li'), id = li.dataset.id, act = btn.dataset.act, t = find(id);
    if (act === 'toggle'){
      t.done = btn.checked; li.classList.toggle('done', t.done); saveToLocalStorage();
      setTimeout(render, 350);
    } else if (act === 'delete'){
      li.classList.add('leaving');
      setTimeout(function(){ tasks = tasks.filter(function(x){ return x.id !== id; }); saveToLocalStorage(); render(); }, 250);
    } else if (act === 'edit'){ editingId = id; render(); var i = list.querySelector('.edit input'); if (i) i.focus(); }
    else if (act === 'cancel'){ editingId = null; render(); }
  });
  list.addEventListener('submit', function(e){
    e.preventDefault();
    var f = e.target, t = find(editingId);
    var text = f.text.value.trim();
    if (t && text){ t.text = text; t.category = f.cat.value; t.due = f.due.value; saveToLocalStorage(); }
    editingId = null; render();
  });

  // Filters, search, clear
  document.getElementById('tabs').addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    filter = b.dataset.f;
    this.querySelectorAll('button').forEach(function(x){ x.setAttribute('aria-pressed', x === b); });
    render();
  });
  document.getElementById('search').addEventListener('input', function(){ query = this.value; render(); });
  document.getElementById('clear').addEventListener('click', function(){
    tasks = tasks.filter(function(t){ return !t.done; }); saveToLocalStorage(); render();
  });

  // Drag-and-drop reordering
  list.addEventListener('dragstart', function(e){
    var li = e.target.closest('li[data-id]'); if (!li) return;
    dragId = li.dataset.id; li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
  });
  list.addEventListener('dragover', function(e){
    var li = e.target.closest('li[data-id]'); if (!li || !dragId) return;
    e.preventDefault();
    list.querySelectorAll('.over').forEach(function(x){ x.classList.remove('over'); });
    if (li.dataset.id !== dragId) li.classList.add('over');
  });
  list.addEventListener('drop', function(e){
    var li = e.target.closest('li[data-id]'); if (!li || !dragId) return;
    e.preventDefault();
    var from = tasks.findIndex(function(t){ return t.id === dragId; });
    var to = tasks.findIndex(function(t){ return t.id === li.dataset.id; });
    if (from > -1 && to > -1 && from !== to){ var m = tasks.splice(from, 1)[0]; tasks.splice(to, 0, m); saveToLocalStorage(); }
    dragId = null; render();
  });
  list.addEventListener('dragend', function(){ dragId = null; render(); });

  // Keep tabs in sync if the app is open in two windows
  window.addEventListener('storage', function(e){ if (e.key === KEY){ tasks = loadFromLocalStorage(); render(); } });

  render();
})();
