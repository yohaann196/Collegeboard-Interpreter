# APCSP Pseudocode IDE

A full browser-based IDE for **AP Computer Science Principles (APCSP) College Board pseudocode**. No install, no build step — just open `index.html`.


## Features

### IDE
- **Syntax highlighting** — keywords, builtins, strings, numbers, comments, procedure names all colored distinctly
- **Line numbers** — gutter that tracks cursor position
- **Multi-file tabs** — open several files at once, switch between them
- **File explorer** sidebar with open/close/new file
- **Find in file** — `Ctrl+F`, navigate with ↑↓, match counter
- **Toggle line comments** — `Ctrl+/`
- **Resizable panels** — drag the sidebar or console divider
- **Save to disk** — `Ctrl+S` downloads the file
- **Open from disk** — `Ctrl+O` or File → Open
- **Zoom** — `Ctrl++` / `Ctrl+-` adjusts font size
- **Menu bar** — File, Edit, View, Run, Help with keyboard shortcuts
- **Status bar** — cursor position, language, file encoding
- **Pseudocode Reference** modal — Help → Pseudocode Reference

### Language (full College Board spec)
| Feature | Syntax |
|---|---|
| Assignment | `x ← value` or `x <- value` |
| Display | `DISPLAY(x)` |
| Input | `x ← INPUT()` |
| If | `IF (cond) { }` |
| If / Else | `IF (cond) { } ELSE { }` |
| Repeat N times | `REPEAT n TIMES { }` |
| Repeat until | `REPEAT UNTIL (cond) { }` |
| For each | `FOR EACH item IN list { }` |
| Procedures | `PROCEDURE name(params) { }` |
| Return | `RETURN(value)` |
| Lists | `x ← [1, 2, 3]` |
| List index *(1-based)* | `x[1]` |
| Append | `APPEND(list, val)` |
| Remove | `REMOVE(list, i)` |
| Insert | `INSERT(list, i, val)` |
| Length | `LENGTH(list)` |
| Modulo | `x MOD y` |
| Logic | `NOT AND OR` |
| Comparison | `= != < > <= >=` |
| Comments | `// comment` |

## Usage

1. Clone or download this repo
2. Open `index.html` in any modern browser
3. Write pseudocode in the editor
4. Press **▶ Run** or `Ctrl+Enter`

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Enter` | Run |
| `Ctrl+S` | Save file |
| `Ctrl+N` | New file |
| `Ctrl+O` | Open file |
| `Ctrl+F` | Find in file |
| `Ctrl+/` | Toggle comment |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+\`` | Toggle console |
| `Ctrl++` / `Ctrl+-` | Zoom in / out |
| `Tab` | Insert 3 spaces |



## Architecture

```
index.html      — page structure, menus, panels, modal
style.css       — VS Code–inspired dark theme (JetBrains Mono)
interpreter.js  — Lexer → Parser (AST) → Interpreter  (pure JS, no deps)
app.js          — UI: tabs, highlight, gutter, find, resize, I/O
```

The interpreter uses standard compiler stages:
1. **Lexer** — tokenises source into a flat token stream
2. **Parser** — recursive-descent parser builds an AST
3. **Interpreter** — async tree-walk evaluator with lexical scoping

## License

MIT
