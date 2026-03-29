// app.js — APCSP IDE
// Wires up: multi-file tabs, run/stop, console I/O, save/open

'use strict';

// ─────────────────────────────────────────────
// constants / default content
// ─────────────────────────────────────────────

const DEFAULT_CODE = `// Welcome to the APCSP Pseudocode IDE!
// Press Ctrl+Enter (or the Run button) to execute your code.
// Press the Help (?) button for a syntax cheat sheet.

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
let isRunning = false;
let abortController = null;
let inputResolve = null;

// ─────────────────────────────────────────────
// DOM refs
// ─────────────────────────────────────────────

const editor         = document.getElementById('editor');
const tabBar         = document.getElementById('tab-bar');
const consoleOutput  = document.getElementById('console-output');
const consoleStdin   = document.getElementById('console-stdin');
const stdinInput     = document.getElementById('stdin-input');
const stdinSend      = document.getElementById('stdin-send');
const activeFilename = document.getElementById('active-filename');
const overlay        = document.getElementById('overlay');
const btnRun         = document.getElementById('btn-run');

// ─────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
  updateTabs();
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
  String(text).split('\n').forEach(line => {
    const span = document.createElement('span');
    span.className = `con-line ${type}`;
    span.textContent = line;
    consoleOutput.appendChild(span);
  });
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
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
  updateTitlebar();
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
  if (isRunning) { stopExecution(); return; }
  saveActive();
  const src = editor.value.trim();
  if (!src) return;

  isRunning = true;
  abortController = new AbortController();
  btnRun.textContent = '■ Stop';
  btnRun.classList.add('running');
  clearConsole();
  conPrint('▸ Running ' + (activeFile()?.name || 'file') + '…', 'info');

  const t0 = performance.now();
  const { signal } = abortController;

  await runApcsp(
    src,
    (text, type) => conPrint(text, type),
    () => requestStdin(),
    signal
  );

  const elapsed = ((performance.now() - t0) / 1000).toFixed(3);
  if (signal.aborted) {
    conPrint('▸ Execution stopped by user.', 'info');
  } else {
    conPrint(`▸ Finished in ${elapsed}s`, 'info');
  }

  isRunning = false;
  abortController = null;
  btnRun.textContent = '▶ Run';
  btnRun.classList.remove('running');
}

function stopExecution() {
  if (abortController) abortController.abort();
  if (inputResolve) {
    consoleStdin.classList.add('hidden');
    const fn = inputResolve;
    inputResolve = null;
    fn('');
  }
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
// toggle comment (Ctrl+/)
// ─────────────────────────────────────────────

function toggleComment() {
  const start = editor.selectionStart;
  const end   = editor.selectionEnd;
  const val   = editor.value;

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
// indent selection (Tab)
// ─────────────────────────────────────────────

function indentSelection() {
  const start = editor.selectionStart;
  const end   = editor.selectionEnd;
  const val   = editor.value;

  const lineStart = val.lastIndexOf('\n', start - 1) + 1;
  const lineEnd   = val.indexOf('\n', end);
  const block     = val.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);

  const indented = block.split('\n').map(l => l ? '   ' + l : l).join('\n');
  const newVal = val.slice(0, lineStart) + indented + (lineEnd === -1 ? '' : val.slice(lineEnd));
  editor.value = newVal;
  editor.selectionStart = start + 3;
  editor.selectionEnd   = end + (indented.length - block.length);

  onEditorInput();
  markDirty();
}

// ─────────────────────────────────────────────
// editor events
// ─────────────────────────────────────────────

function onEditorInput() {
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
  // Enter → auto-indent (preserve current indent; add extra level after '{')
  if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    const s = editor.selectionStart;
    const val = editor.value;
    const lineStart = val.lastIndexOf('\n', s - 1) + 1;
    const currentLine = val.slice(lineStart, s);
    const indent = currentLine.match(/^(\s*)/)?.[1] || '';
    const extraIndent = currentLine.trimEnd().endsWith('{') ? '   ' : '';
    const insertion = '\n' + indent + extraIndent;
    editor.value = val.slice(0, s) + insertion + val.slice(editor.selectionEnd);
    editor.selectionStart = editor.selectionEnd = s + insertion.length;
    onEditorInput();
    return;
  }
  // Ctrl+Enter → run
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runCode(); return; }
  // Ctrl+/ → comment
  if (e.key === '/' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); toggleComment(); return; }
  // Ctrl+S → save
  if (e.key === 's' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveFile(); return; }
});

// ─────────────────────────────────────────────
// toolbar buttons
// ─────────────────────────────────────────────

document.getElementById('btn-run').addEventListener('click', runCode);
document.getElementById('btn-new').addEventListener('click', () => {
  const name = prompt('File name:', `untitled${nextId}.apcsp`);
  if (name) newFile(name.endsWith('.apcsp') ? name : name + '.apcsp');
});
document.getElementById('btn-open').addEventListener('click', () => fileInput.click());
document.getElementById('btn-save').addEventListener('click', saveFile);
document.getElementById('btn-reference').addEventListener('click', () => overlay.classList.remove('hidden'));
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
});

// ─────────────────────────────────────────────
// modal
// ─────────────────────────────────────────────

document.getElementById('modal-close').addEventListener('click', () => overlay.classList.add('hidden'));
overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.add('hidden'); });

// ─────────────────────────────────────────────
// init
// ─────────────────────────────────────────────

(function init() {
  editor.value = files[0].content;
  updateTabs();
  updateTitlebar();
  editor.focus();
  editor.selectionStart = editor.selectionEnd = editor.value.length;
})();
