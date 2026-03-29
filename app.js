// app.js — APCSP IDE glue
// Wires up: multi-file tabs, syntax highlighting, line numbers,
// resizable panels, find bar, menus, keyboard shortcuts, console I/O

'use strict';

// ─────────────────────────────────────────────
// constants / default content
// ─────────────────────────────────────────────

const DEFAULT_CODE = `// Welcome to the APCSP Pseudocode IDE!
// Press Ctrl+Enter (or the Run button) to execute your code.
// Open Help → Pseudocode Reference for a syntax cheat sheet.

PROCEDURE greet(name)
{
   DISPLAY("Hello, " + name + "!")
}

greet("world")

// Try some list operations
nums ← [3, 1, 4, 1, 5, 9, 2, 6]
total ← 0

FOR EACH n IN nums
{
   total ← total + n
}

avg ← total / LENGTH(nums)
DISPLAY("Sum: " + total)
DISPLAY("Average: " + avg)
`;

const EXAMPLE_CODE = `// Fibonacci + user input demo
PROCEDURE fibonacci(n)
{
   IF (n <= 1)
   {
      RETURN(n)
   }
   RETURN(fibonacci(n - 1) + fibonacci(n - 2))
}

DISPLAY("How many Fibonacci numbers?")
count ← INPUT()

i ← 0
REPEAT count TIMES
{
   DISPLAY(fibonacci(i))
   i ← i + 1
}

// Bubble sort a list
list ← [64, 34, 25, 12, 22, 11, 90]
n ← LENGTH(list)
i ← 1

REPEAT n - 1 TIMES
{
   j ← 1
   REPEAT n - i TIMES
   {
      IF (list[j] > list[j + 1])
      {
         temp ← list[j]
         list[j] ← list[j + 1]
         list[j + 1] ← temp
      }
      j ← j + 1
   }
   i ← i + 1
}

DISPLAY("Sorted list:")
DISPLAY(list)
`;

// ─────────────────────────────────────────────
// state
// ─────────────────────────────────────────────

let files = [
  { id: 1, name: 'main.apcsp', content: DEFAULT_CODE, dirty: false }
];
let nextId = 2;
let activeId = 1;
let fontSize = 13.5;
let isRunning = false;
let inputResolve = null;
let findMatches = [];
let findIdx = 0;

// ─────────────────────────────────────────────
// DOM refs
// ─────────────────────────────────────────────

const editor         = document.getElementById('editor');
const highlightCode  = document.getElementById('highlight-code');
const gutter         = document.getElementById('gutter');
const codeScroll     = document.getElementById('code-scroll');
const tabBar         = document.getElementById('tab-bar');
const fileTree       = document.getElementById('file-tree');
const consoleOutput  = document.getElementById('console-output');
const consoleStdin   = document.getElementById('console-stdin');
const stdinInput     = document.getElementById('stdin-input');
const stdinSend      = document.getElementById('stdin-send');
const findBar        = document.getElementById('find-bar');
const findInput      = document.getElementById('find-input');
const findCount      = document.getElementById('find-count');
const sbPos          = document.getElementById('sb-pos');
const sbStatus       = document.getElementById('sb-status');
const sbErr          = document.getElementById('sb-err');
const activeFilename = document.getElementById('active-filename');
const overlay        = document.getElementById('overlay');
const sidebarResize  = document.getElementById('sidebar-resize');
const consoleResize  = document.getElementById('console-resize');
const sidebar        = document.getElementById('sidebar');
const consolePanel   = document.getElementById('console-panel');
const btnRun         = document.getElementById('btn-run');

// ─────────────────────────────────────────────
// syntax highlighting
// ─────────────────────────────────────────────

// keywords, builtins, etc
const KW = /\b(IF|ELSE|REPEAT|TIMES|UNTIL|FOR|EACH|IN|PROCEDURE|RETURN|NOT|AND|OR|MOD|DISPLAY|INPUT|APPEND|REMOVE|INSERT|LENGTH)\b/g;
const BOOL_LIT = /\b(TRUE|FALSE)\b/g;
const PROC_DEF = /\bPROCEDURE\s+([A-Za-z_][A-Za-z0-9_]*)/g;

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function highlight(src) {
  // Process line by line so comments don't bleed
  return src.split('\n').map(line => {
    // strip trailing \r
    line = line.replace(/\r$/, '');

    // Check for comment first
    const commentIdx = line.indexOf('//');

    let code = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
    let comment = commentIdx >= 0 ? line.slice(commentIdx) : '';

    // Tokenize the code portion character by character to handle strings
    let out = '';
    let i = 0;
    while (i < code.length) {
      // String literals
      if (code[i] === '"' || code[i] === "'") {
        const q = code[i];
        let s = q; i++;
        while (i < code.length && code[i] !== q) {
          if (code[i] === '\\') { s += code[i++]; }
          s += code[i++] || '';
        }
        s += q; i++;
        out += `<span class="tok-string">${escHtml(s)}</span>`;
        continue;
      }
      // Numbers
      if (/\d/.test(code[i]) || (code[i] === '-' && /\d/.test(code[i+1] || '') && (out.endsWith('←') || out.endsWith('(') || out.endsWith(',') || out.trim() === ''))) {
        let n = code[i++];
        while (i < code.length && /[\d.]/.test(code[i])) n += code[i++];
        out += `<span class="tok-number">${escHtml(n)}</span>`;
        continue;
      }
      // Identifiers / keywords
      if (/[A-Za-z_]/.test(code[i])) {
        let w = ''; const start = i;
        while (i < code.length && /[A-Za-z0-9_]/.test(code[i])) w += code[i++];
        const upper = w.toUpperCase();
        const kwList = ['IF','ELSE','REPEAT','TIMES','UNTIL','FOR','EACH','IN','PROCEDURE','RETURN','NOT','AND','OR','MOD'];
        const builtins = ['DISPLAY','INPUT','APPEND','REMOVE','INSERT','LENGTH'];
        if (upper === 'TRUE' || upper === 'FALSE') {
          out += `<span class="tok-bool">${escHtml(w)}</span>`;
        } else if (kwList.includes(upper)) {
          out += `<span class="tok-keyword">${escHtml(w)}</span>`;
        } else if (builtins.includes(upper)) {
          out += `<span class="tok-builtin">${escHtml(w)}</span>`;
        } else {
          // peek: is next non-space char a '('? → procedure call
          let j = i;
          while (j < code.length && code[j] === ' ') j++;
          if (code[j] === '(') {
            out += `<span class="tok-proc-name">${escHtml(w)}</span>`;
          } else {
            out += `<span class="tok-ident">${escHtml(w)}</span>`;
          }
        }
        continue;
      }
      // Brackets / braces / parens
      if ('()[]{}'.includes(code[i])) {
        out += `<span class="tok-bracket">${escHtml(code[i++])}</span>`;
        continue;
      }
      // Arrow ←
      if (code[i] === '←') {
        out += `<span class="tok-op">←</span>`; i++;
        continue;
      }
      // Everything else
      out += escHtml(code[i++]);
    }

    // append comment span
    if (comment) {
      out += `<span class="tok-comment">${escHtml(comment)}</span>`;
    }
    return out;
  }).join('\n');
}

function syncHighlight() {
  const src = editor.value;
  highlightCode.innerHTML = highlight(src) + '\n'; // trailing newline keeps height correct
}

// ─────────────────────────────────────────────
// line numbers / gutter
// ─────────────────────────────────────────────

function buildGutter() {
  const lines = editor.value.split('\n').length;
  const curLine = getCurrentLine();
  let html = '';
  for (let i = 1; i <= lines; i++) {
    html += `<span class="gutter-line${i === curLine ? ' current' : ''}">${i}</span>`;
  }
  gutter.innerHTML = html;
}

function getCurrentLine() {
  const text = editor.value.slice(0, editor.selectionStart);
  return text.split('\n').length;
}

function syncGutterScroll() {
  gutter.scrollTop = codeScroll.scrollTop;
}

// ─────────────────────────────────────────────
// file / tab management
// ─────────────────────────────────────────────

function activeFile() { return files.find(f => f.id === activeId); }

function saveActive() {
  const f = activeFile();
  if (f) f.content = editor.value;
}

function loadFile(id) {
  saveActive();
  activeId = id;
  const f = activeFile();
  editor.value = f.content;
  syncHighlight();
  buildGutter();
  updateTabs();
  updateFileTree();
  updateTitlebar();
  editor.focus();
}

function newFile(name) {
  name = name || `untitled${nextId}.apcsp`;
  const f = { id: nextId++, name, content: '', dirty: false };
  files.push(f);
  loadFile(f.id);
}

function closeFile(id) {
  const idx = files.findIndex(f => f.id === id);
  if (idx === -1) return;
  if (files[idx].dirty && !confirm(`Close '${files[idx].name}' without saving?`)) return;
  files.splice(idx, 1);
  if (files.length === 0) {
    newFile('main.apcsp');
    return;
  }
  const nextFile = files[Math.min(idx, files.length - 1)];
  loadFile(nextFile.id);
}

function markDirty() {
  const f = activeFile();
  if (f && !f.dirty) {
    f.dirty = true;
    updateTabs();
    updateFileTree();
  }
}

function updateTabs() {
  tabBar.innerHTML = '';
  files.forEach(f => {
    const tab = document.createElement('div');
    tab.className = 'tab' + (f.id === activeId ? ' active' : '') + (f.dirty ? ' dirty' : '');
    tab.innerHTML = `<span class="tab-dot">●</span><span class="tab-name">${escHtml(f.name)}</span><span class="tab-close">✕</span>`;
    tab.querySelector('.tab-name').addEventListener('click', () => loadFile(f.id));
    tab.querySelector('.tab-close').addEventListener('click', e => { e.stopPropagation(); closeFile(f.id); });
    tabBar.appendChild(tab);
  });
}

function updateFileTree() {
  fileTree.innerHTML = '';
  files.forEach(f => {
    const item = document.createElement('div');
    item.className = 'file-item' + (f.id === activeId ? ' active' : '') + (f.dirty ? ' dirty' : '');
    item.innerHTML = `<span class="file-icon">📄</span><span class="file-name">${escHtml(f.name)}</span><span class="file-close">✕</span>`;
    item.querySelector('.file-name').addEventListener('click', () => loadFile(f.id));
    item.querySelector('.file-close').addEventListener('click', e => { e.stopPropagation(); closeFile(f.id); });
    fileTree.appendChild(item);
  });
}

function updateTitlebar() {
  const f = activeFile();
  activeFilename.textContent = f ? (f.dirty ? '● ' : '') + f.name : '';
}

// ─────────────────────────────────────────────
// console output
// ─────────────────────────────────────────────

function clearConsole() {
  consoleOutput.innerHTML = '';
}

function conPrint(text, type = 'output') {
  // split on newlines so each physical line gets the right prefix
  String(text).split('\n').forEach(line => {
    const span = document.createElement('span');
    span.className = `con-line ${type}`;
    span.textContent = line;
    consoleOutput.appendChild(span);
  });
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

// ─────────────────────────────────────────────
// status bar helpers
// ─────────────────────────────────────────────

function updateCursorPos() {
  const text = editor.value.slice(0, editor.selectionStart);
  const ln = text.split('\n').length;
  const col = text.split('\n').pop().length + 1;
  sbPos.textContent = `Ln ${ln}, Col ${col}`;
  buildGutter();
}

function setStatus(txt, cls = '') {
  sbStatus.textContent = txt;
  sbStatus.className = 'sb-item sb-status ' + cls;
}

// ─────────────────────────────────────────────
// save
// ─────────────────────────────────────────────

function saveFile() {
  const f = activeFile();
  if (!f) return;
  f.content = editor.value;
  f.dirty = false;
  const blob = new Blob([f.content], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = f.name;
  a.click();
  URL.revokeObjectURL(a.href);
  updateTabs();
  updateFileTree();
  updateTitlebar();
  setStatus('Saved', '');
  setTimeout(() => setStatus('Ready'), 1500);
}

// ─────────────────────────────────────────────
// open file
// ─────────────────────────────────────────────

const fileInput = document.getElementById('file-input');
fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const existing = files.find(f => f.name === file.name);
    if (existing) {
      existing.content = ev.target.result;
      loadFile(existing.id);
    } else {
      const f = { id: nextId++, name: file.name, content: ev.target.result, dirty: false };
      files.push(f);
      loadFile(f.id);
    }
  };
  reader.readAsText(file);
  fileInput.value = '';
});

// ─────────────────────────────────────────────
// run / interpreter
// ─────────────────────────────────────────────

async function runCode() {
  if (isRunning) return;
  saveActive();
  const src = editor.value.trim();
  if (!src) return;

  isRunning = true;
  btnRun.textContent = '■ Stop';
  btnRun.classList.add('running');
  setStatus('Running…', '');
  clearConsole();
  conPrint('▸ Running ' + (activeFile()?.name || 'file') + '…', 'info');

  const t0 = performance.now();

  await runApcsp(
    src,
    (text, type) => conPrint(text, type),
    () => requestStdin()
  );

  const elapsed = ((performance.now() - t0) / 1000).toFixed(3);
  conPrint(`▸ Finished in ${elapsed}s`, 'info');

  isRunning = false;
  btnRun.textContent = '▶ Run';
  btnRun.classList.remove('running');
  setStatus('Ready');
}

function requestStdin() {
  return new Promise(resolve => {
    inputResolve = resolve;
    consoleStdin.classList.remove('hidden');
    stdinInput.value = '';
    stdinInput.focus();
  });
}

function submitStdin() {
  if (!inputResolve) return;
  const val = stdinInput.value;
  conPrint(val, 'stdin');
  consoleStdin.classList.add('hidden');
  const fn = inputResolve;
  inputResolve = null;
  fn(val);
}

stdinSend.addEventListener('click', submitStdin);
stdinInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitStdin(); });

// ─────────────────────────────────────────────
// find
// ─────────────────────────────────────────────

function openFind() {
  findBar.classList.remove('hidden');
  findInput.value = '';
  findInput.focus();
  findCount.textContent = '';
  findMatches = [];
}
function closeFind() {
  findBar.classList.add('hidden');
  editor.focus();
}

function doFind() {
  const term = findInput.value;
  findMatches = [];
  if (!term) { findCount.textContent = ''; return; }
  const src = editor.value;
  let idx = 0;
  while (true) {
    const i = src.toLowerCase().indexOf(term.toLowerCase(), idx);
    if (i === -1) break;
    findMatches.push(i);
    idx = i + 1;
  }
  findCount.textContent = findMatches.length
    ? `${Math.min(findIdx + 1, findMatches.length)} / ${findMatches.length}`
    : 'No results';
  if (findMatches.length) jumpToMatch(0);
}

function jumpToMatch(i) {
  findIdx = ((i % findMatches.length) + findMatches.length) % findMatches.length;
  const pos = findMatches[findIdx];
  editor.focus();
  editor.setSelectionRange(pos, pos + findInput.value.length);
  // scroll editor to selection
  const lines = editor.value.slice(0, pos).split('\n');
  const lineH = parseFloat(getComputedStyle(editor).lineHeight);
  codeScroll.scrollTop = (lines.length - 3) * lineH;
  findCount.textContent = `${findIdx + 1} / ${findMatches.length}`;
}

findInput.addEventListener('input', doFind);
document.getElementById('find-next').addEventListener('click', () => {
  if (findMatches.length) jumpToMatch(findIdx + 1);
});
document.getElementById('find-prev').addEventListener('click', () => {
  if (findMatches.length) jumpToMatch(findIdx - 1);
});
document.getElementById('find-close').addEventListener('click', closeFind);

// ─────────────────────────────────────────────
// toggle comment (Ctrl+/)
// ─────────────────────────────────────────────

function toggleComment() {
  const start = editor.selectionStart;
  const end   = editor.selectionEnd;
  const val   = editor.value;

  // find the line range
  const lineStart = val.lastIndexOf('\n', start - 1) + 1;
  const lineEnd   = val.indexOf('\n', end);
  const block     = val.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);

  const lines = block.split('\n');
  const allCommented = lines.every(l => l.trimStart().startsWith('//'));

  const toggled = lines.map(l => {
    if (allCommented) return l.replace(/^(\s*)\/\/\s?/, '$1');
    return l.replace(/^(\s*)/, '$1// ');
  }).join('\n');

  const newVal = val.slice(0, lineStart) + toggled + (lineEnd === -1 ? '' : val.slice(lineEnd));
  editor.value = newVal;
  editor.selectionStart = start;
  editor.selectionEnd   = end + (toggled.length - block.length);

  onEditorInput();
  markDirty();
}

// ─────────────────────────────────────────────
// editor events
// ─────────────────────────────────────────────

function onEditorInput() {
  syncHighlight();
  buildGutter();
  markDirty();
  updateTitlebar();
}

editor.addEventListener('input', onEditorInput);

editor.addEventListener('keydown', e => {
  // Tab → insert spaces
  if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    const s = editor.selectionStart;
    const en = editor.selectionEnd;
    editor.value = editor.value.slice(0, s) + '   ' + editor.value.slice(en);
    editor.selectionStart = editor.selectionEnd = s + 3;
    onEditorInput();
    return;
  }
  // Auto-close braces
  if (e.key === '{') {
    // let it type, then auto-add newline + closing brace hint is too complex; skip
  }
  // Ctrl+Enter → run
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runCode(); return; }
  // Ctrl+/ → comment
  if (e.key === '/' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); toggleComment(); return; }
  // Ctrl+S → save
  if (e.key === 's' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveFile(); return; }
  // Ctrl+F → find
  if (e.key === 'f' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); openFind(); return; }
  // Esc → close find
  if (e.key === 'Escape') { closeFind(); }
});

editor.addEventListener('keyup', updateCursorPos);
editor.addEventListener('click', updateCursorPos);

// keep gutter in sync with editor scroll
codeScroll.addEventListener('scroll', () => {
  gutter.scrollTop = codeScroll.scrollTop;
});

// ─────────────────────────────────────────────
// menus
// ─────────────────────────────────────────────

const menuItems = document.querySelectorAll('.menu-item');
const menuDropdowns = document.querySelectorAll('.menu-dropdown');

let openMenu = null;

menuItems.forEach(item => {
  item.addEventListener('click', e => {
    e.stopPropagation();
    const id = 'menu-' + item.dataset.menu;
    const drop = document.getElementById(id);
    if (!drop) return;
    if (openMenu && openMenu !== drop) {
      openMenu.classList.add('hidden');
      document.querySelector('.menu-item.active')?.classList.remove('active');
    }
    const isOpen = !drop.classList.contains('hidden');
    drop.classList.toggle('hidden', isOpen);
    item.classList.toggle('active', !isOpen);

    if (!isOpen) {
      // position it below the menu item
      const rect = item.getBoundingClientRect();
      drop.style.left = rect.left + 'px';
      openMenu = drop;
    } else {
      openMenu = null;
    }
  });
});

document.addEventListener('click', () => {
  menuDropdowns.forEach(d => d.classList.add('hidden'));
  menuItems.forEach(m => m.classList.remove('active'));
  openMenu = null;
});

document.querySelectorAll('.menu-opt').forEach(opt => {
  opt.addEventListener('click', e => {
    e.stopPropagation();
    menuDropdowns.forEach(d => d.classList.add('hidden'));
    menuItems.forEach(m => m.classList.remove('active'));
    openMenu = null;
    handleMenuAction(opt.dataset.action);
  });
});

function handleMenuAction(action) {
  switch (action) {
    case 'new':     newFile(); break;
    case 'open':    fileInput.click(); break;
    case 'save':    saveFile(); break;
    case 'example': loadExample(); break;
    case 'comment': toggleComment(); break;
    case 'find':    openFind(); break;
    case 'run':     runCode(); break;
    case 'stop':    /* TODO: abort controller */ break;
    case 'clear-console': clearConsole(); break;
    case 'toggle-sidebar': sidebar.style.display = sidebar.style.display === 'none' ? '' : 'none'; break;
    case 'toggle-console': consolePanel.style.display = consolePanel.style.display === 'none' ? '' : 'none'; break;
    case 'zoom-in':  fontSize = Math.min(24, fontSize + 1); applyFontSize(); break;
    case 'zoom-out': fontSize = Math.max(9, fontSize - 1);  applyFontSize(); break;
    case 'reference': overlay.classList.remove('hidden'); break;
    case 'about':
      conPrint('APCSP Pseudocode IDE — built for the College Board AP CS Principles course.', 'info');
      break;
  }
}

function applyFontSize() {
  const px = fontSize + 'px';
  editor.style.fontSize = px;
  document.getElementById('highlight-layer').style.fontSize = px;
  gutter.style.fontSize = px;
  buildGutter();
}

// ─────────────────────────────────────────────
// toolbar buttons
// ─────────────────────────────────────────────

document.getElementById('btn-run').addEventListener('click', runCode);
document.getElementById('btn-new').addEventListener('click', () => newFile());
document.getElementById('btn-save').addEventListener('click', saveFile);
document.getElementById('btn-new-file').addEventListener('click', () => {
  const name = prompt('File name:', 'new.apcsp');
  if (name) newFile(name.endsWith('.apcsp') ? name : name + '.apcsp');
});
document.getElementById('btn-clear-console').addEventListener('click', clearConsole);

// ─────────────────────────────────────────────
// global keyboard shortcuts
// ─────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (e.target === editor) return; // handled above
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runCode(); }
  if (e.key === 'n' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); newFile(); }
  if (e.key === 'o' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); fileInput.click(); }
  if (e.key === 's' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveFile(); }
  if (e.key === 'f' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); openFind(); }
  if (e.key === 'b' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleMenuAction('toggle-sidebar'); }
  if (e.key === '`' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleMenuAction('toggle-console'); }
  if (e.key === 'Escape') closeFind();
});

// ─────────────────────────────────────────────
// resizable panels
// ─────────────────────────────────────────────

// sidebar ←→
(function() {
  let dragging = false, startX, startW;
  sidebarResize.addEventListener('mousedown', e => {
    dragging = true; startX = e.clientX; startW = sidebar.offsetWidth;
    sidebarResize.classList.add('dragging');
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const w = Math.max(120, Math.min(400, startW + (e.clientX - startX)));
    sidebar.style.width = w + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    sidebarResize.classList.remove('dragging');
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  });
})();

// console ↕
(function() {
  let dragging = false, startY, startH;
  consoleResize.addEventListener('mousedown', e => {
    dragging = true; startY = e.clientY; startH = consolePanel.offsetHeight;
    consoleResize.classList.add('dragging');
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const h = Math.max(80, Math.min(window.innerHeight * 0.7, startH - (e.clientY - startY)));
    consolePanel.style.height = h + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    consoleResize.classList.remove('dragging');
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  });
})();

// ─────────────────────────────────────────────
// modal
// ─────────────────────────────────────────────

document.getElementById('modal-close').addEventListener('click', () => overlay.classList.add('hidden'));
overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.add('hidden'); });

// ─────────────────────────────────────────────
// example
// ─────────────────────────────────────────────

function loadExample() {
  const f = activeFile();
  if (f && f.content.trim() && !confirm('Replace current file with the example?')) return;
  editor.value = EXAMPLE_CODE;
  if (f) f.content = EXAMPLE_CODE;
  onEditorInput();
  editor.focus();
}

// ─────────────────────────────────────────────
// init
// ─────────────────────────────────────────────

(function init() {
  editor.value = files[0].content;
  syncHighlight();
  buildGutter();
  updateTabs();
  updateFileTree();
  updateTitlebar();
  updateCursorPos();
  editor.focus();
  // put cursor at end
  editor.selectionStart = editor.selectionEnd = editor.value.length;
  updateCursorPos();
})();
