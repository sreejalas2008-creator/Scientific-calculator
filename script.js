'use strict';

/* =====================================================================
   PART 1 - EXPRESSION ENGINE (no eval): tokenizer + recursive-descent parser
   Grammar (lowest to highest precedence):
     expression = term { (+|-) term }
     term       = unary { (×|÷|implicit multiplication) unary }
     unary      = (+|-) unary | power
     power      = postfix [ ^ unary ]          (right-associative)
     postfix    = primary { ! | % }
     primary    = number | π | e | function "(" expression ")" | "(" expression ")"
   ===================================================================== */

// Function names as shown in the expression (longest first so "sin⁻¹" matches before "sin")
const FUNCTION_NAMES = ['sin⁻¹', 'cos⁻¹', 'tan⁻¹', 'sin', 'cos', 'tan', 'log', 'ln', '√', '∛', 'abs', 'exp'];
const OPERATOR_CHARS = '+-−×÷*/^!%()';

/** Convert an expression string into a list of tokens. */
function tokenize(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === ' ') { i++; continue; }

    // Numbers: 12, 3.5, .5, and results in exponent form like 1.5E+20 (capital E only)
    const numberMatch = text.slice(i).match(/^(\d+\.?\d*|\.\d+)(E[+-]?\d+)?/);
    if (numberMatch) {
      tokens.push({ type: 'num', value: parseFloat(numberMatch[0]) });
      i += numberMatch[0].length;
      continue;
    }

    const fn = FUNCTION_NAMES.find(name => text.startsWith(name, i));
    if (fn) { tokens.push({ type: 'fn', value: fn }); i += fn.length; continue; }

    if (ch === 'π') { tokens.push({ type: 'num', value: Math.PI }); i++; continue; }
    if (ch === 'e') { tokens.push({ type: 'num', value: Math.E }); i++; continue; }

    if (OPERATOR_CHARS.includes(ch)) {
      const op = ch === '−' ? '-' : ch === '*' ? '×' : ch === '/' ? '÷' : ch;
      tokens.push({ type: 'op', value: op });
      i++;
      continue;
    }
    throw new Error('Invalid expression');
  }
  return tokens;
}

/** Factorial for whole numbers 0..170. */
function factorial(n) {
  if (!Number.isInteger(n) || n < 0 || n > 170) throw new Error('Factorial needs a whole number from 0 to 170');
  let product = 1;
  for (let k = 2; k <= n; k++) product *= k;
  return product;
}

/** Remove floating-point noise such as sin(180°) = 1.2e-16. */
function cleanTiny(value) {
  return Math.abs(value) < 1e-15 ? 0 : value;
}

/** Apply a named function. Trig input/output respects the angle mode. */
function applyFunction(name, x, angleMode) {
  const toRadians = v => (angleMode === 'deg' ? v * Math.PI / 180 : v);
  const fromRadians = v => (angleMode === 'deg' ? v * 180 / Math.PI : v);
  switch (name) {
    case 'sin': return cleanTiny(Math.sin(toRadians(x)));
    case 'cos': return cleanTiny(Math.cos(toRadians(x)));
    case 'tan': {
      const cosine = Math.cos(toRadians(x));
      if (Math.abs(cosine) < 1e-15 || (angleMode === 'deg' && Math.abs(x % 180) === 90)) {
        throw new Error('tan is undefined here');
      }
      return cleanTiny(Math.tan(toRadians(x)));
    }
    case 'sin⁻¹':
    case 'cos⁻¹':
      if (x < -1 || x > 1) throw new Error('Input must be between -1 and 1');
      return fromRadians(name === 'sin⁻¹' ? Math.asin(x) : Math.acos(x));
    case 'tan⁻¹': return fromRadians(Math.atan(x));
    case 'log':
      if (x <= 0) throw new Error('log needs a positive number');
      return Math.log10(x);
    case 'ln':
      if (x <= 0) throw new Error('ln needs a positive number');
      return Math.log(x);
    case '√':
      if (x < 0) throw new Error('Square root of a negative number');
      return Math.sqrt(x);
    case '∛': return Math.cbrt(x);
    case 'abs': return Math.abs(x);
    case 'exp': return Math.exp(x);
    default: throw new Error('Unknown function');
  }
}

/** Parse and evaluate an expression string. Returns a number or throws Error. */
function evaluate(expression, angleMode = 'deg') {
  const tokens = tokenize(expression);
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (t, ...ops) => t && t.type === 'op' && ops.includes(t.value);
  // Can this token start a new value? (used for implicit multiplication like 2π or 3(4))
  const startsValue = t => t && (t.type === 'num' || t.type === 'fn' || isOp(t, '('));

  function parseExpression() {
    let value = parseTerm();
    while (isOp(peek(), '+', '-')) {
      const op = tokens[pos++].value;
      const right = parseTerm();
      value = op === '+' ? value + right : value - right;
    }
    return value;
  }

  function parseTerm() {
    let value = parseUnary();
    for (;;) {
      const t = peek();
      if (isOp(t, '×', '÷')) {
        pos++;
        const right = parseUnary();
        if (t.value === '÷' && right === 0) throw new Error('Cannot divide by zero');
        value = t.value === '×' ? value * right : value / right;
      } else if (startsValue(t)) {
        value *= parseUnary(); // implicit multiplication
      } else {
        return value;
      }
    }
  }

  function parseUnary() {
    if (isOp(peek(), '-')) { pos++; return -parseUnary(); }
    if (isOp(peek(), '+')) { pos++; return parseUnary(); }
    return parsePower();
  }

  function parsePower() {
    const base = parsePostfix();
    if (isOp(peek(), '^')) {
      pos++;
      const result = Math.pow(base, parseUnary());
      if (Number.isNaN(result)) throw new Error('Invalid power operation');
      return result;
    }
    return base;
  }

  function parsePostfix() {
    let value = parsePrimary();
    while (isOp(peek(), '!', '%')) {
      value = tokens[pos++].value === '!' ? factorial(value) : value / 100;
    }
    return value;
  }

  function parsePrimary() {
    const t = tokens[pos++];
    if (!t) throw new Error('Incomplete expression');
    if (t.type === 'num') return t.value;
    if (t.type === 'fn') {
      if (!isOp(peek(), '(')) throw new Error('Invalid expression');
      pos++;
      const argument = parseExpression();
      if (!isOp(peek(), ')')) throw new Error('Missing closing parenthesis');
      pos++;
      return applyFunction(t.value, argument, angleMode);
    }
    if (isOp(t, '(')) {
      const value = parseExpression();
      if (!isOp(peek(), ')')) throw new Error('Missing closing parenthesis');
      pos++;
      return value;
    }
    throw new Error('Invalid expression');
  }

  const result = parseExpression();
  if (pos < tokens.length) throw new Error('Invalid expression');
  if (!Number.isFinite(result)) throw new Error('Result is too large or undefined');
  return result;
}

/** Round to 12 significant digits and format; very large/small numbers use exponent form. */
function formatNumber(value) {
  const rounded = parseFloat(value.toPrecision(12));
  if (rounded === 0) return '0';
  const magnitude = Math.abs(rounded);
  if (magnitude >= 1e15 || magnitude < 1e-9) return rounded.toExponential().toUpperCase();
  return String(rounded);
}

/** Add missing closing parentheses so "sin(30" works. */
function autoClose(expression) {
  const open = (expression.match(/\(/g) || []).length;
  const close = (expression.match(/\)/g) || []).length;
  return expression + ')'.repeat(Math.max(0, open - close));
}

/* =====================================================================
   PART 2 - USER INTERFACE
   ===================================================================== */
function initCalculator() {
  const state = {
    expression: '',
    result: '0',
    evaluated: false,   // true right after pressing "="
    hasError: false,
    angleMode: 'deg',
    memory: 0,
    history: []
  };

  const el = {
    expression: document.getElementById('expression'),
    result: document.getElementById('result'),
    memoryBadge: document.getElementById('memoryIndicator'),
    historyList: document.getElementById('historyList'),
    copyBtn: document.getElementById('copyBtn'),
    themeToggle: document.getElementById('themeToggle')
  };

  /* ---------- Storage helpers (safe if storage is blocked) ---------- */
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* ignore */ } }
  };

  /* ---------- Display ---------- */
  function updateDisplay() {
    el.expression.textContent = state.expression || '0';
    el.expression.scrollLeft = el.expression.scrollWidth;
    el.result.classList.toggle('error', state.hasError);
    el.result.textContent = state.result;
    el.memoryBadge.hidden = state.memory === 0;
  }

  /** Show a live preview of the result while typing (errors stay silent until "="). */
  function updatePreview() {
    state.hasError = false;
    if (!state.expression) { state.result = '0'; return; }
    try {
      state.result = formatNumber(evaluate(autoClose(state.expression), state.angleMode));
    } catch (e) { /* keep previous preview */ }
  }

  /* ---------- Input handling ---------- */
  /** Insert text into the expression. Operators continue from the last result; other input starts fresh. */
  function insert(text) {
    const continuesResult = /^[+\-×÷^!%]/.test(text);
    if (state.hasError) { state.expression = ''; state.hasError = false; }
    if (state.evaluated) {
      state.expression = continuesResult ? state.result : '';
      state.evaluated = false;
    }
    state.expression += text;
    updatePreview();
    updateDisplay();
  }

  function clearAll() {
    Object.assign(state, { expression: '', result: '0', evaluated: false, hasError: false });
    updateDisplay();
  }

  function deleteLast() {
    if (state.hasError) { clearAll(); return; }
    state.evaluated = false;
    const fn = FUNCTION_NAMES.find(name => state.expression.endsWith(name + '('));
    state.expression = fn ? state.expression.slice(0, -(fn.length + 1)) : state.expression.slice(0, -1);
    updatePreview();
    updateDisplay();
  }

  function calculate() {
    if (!state.expression) return;
    const finalExpression = autoClose(state.expression);
    try {
      const text = formatNumber(evaluate(finalExpression, state.angleMode));
      state.expression = finalExpression;
      state.result = text;
      state.hasError = false;
      state.evaluated = true;
      addHistory(finalExpression, text);
    } catch (error) {
      state.result = error.message;
      state.hasError = true;
    }
    updateDisplay();
  }

  /** 1/x wraps the whole current expression (or last result). */
  function reciprocal() {
    if (state.hasError) return;
    const base = state.evaluated ? state.result : state.expression;
    if (!base) return;
    state.expression = '1÷(' + base + ')';
    state.evaluated = false;
    updatePreview();
    updateDisplay();
  }

  function setAngleMode(mode) {
    state.angleMode = mode;
    document.querySelectorAll('.mode-btn').forEach(btn => {
      const active = btn.dataset.action === mode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    if (!state.evaluated) updatePreview();
    updateDisplay();
  }

  /* ---------- Memory ---------- */
  function currentValue() {
    try { return evaluate(autoClose(state.expression), state.angleMode); }
    catch (e) { const n = parseFloat(state.result); return Number.isFinite(n) ? n : 0; }
  }
  function memoryAction(action) {
    if (action === 'mc') state.memory = 0;
    if (action === 'mplus') state.memory += currentValue();
    if (action === 'mminus') state.memory -= currentValue();
    if (action === 'mr') {
      const text = formatNumber(state.memory);
      insert(state.memory < 0 ? '(' + text + ')' : text);
      return;
    }
    updateDisplay();
  }

  /* ---------- History ---------- */
  function addHistory(expression, result) {
    state.history.unshift({ expression, result });
    state.history = state.history.slice(0, 30);
    store.set('calcHistory', JSON.stringify(state.history));
    renderHistory();
  }

  function renderHistory() {
    el.historyList.innerHTML = '';
    if (state.history.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'history-empty';
      empty.textContent = 'No calculations yet';
      el.historyList.appendChild(empty);
      return;
    }
    state.history.forEach(item => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', 'Use result ' + item.result + ' from ' + item.expression);
      button.innerHTML = '<span class="h-expr"></span><span class="h-res"></span>';
      button.querySelector('.h-expr').textContent = item.expression + ' =';
      button.querySelector('.h-res').textContent = item.result;
      button.addEventListener('click', () => {
        state.evaluated = false; state.hasError = false;
        state.expression = item.result;
        updatePreview(); updateDisplay();
      });
      li.appendChild(button);
      el.historyList.appendChild(li);
    });
  }

  /* ---------- Copy result ---------- */
  function copyResult() {
    if (state.hasError) return;
    const text = state.result;
    const done = () => {
      el.copyBtn.textContent = 'Copied!';
      setTimeout(() => { el.copyBtn.textContent = 'Copy result'; }, 1200);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }
  function fallbackCopy(text, done) {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
    document.body.removeChild(area);
  }

  /* ---------- Theme ---------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    el.themeToggle.textContent = theme === 'dark' ? '\u2600' : '\u263E';
    store.set('calcTheme', theme);
  }

  /* ---------- Event wiring ---------- */
  document.querySelector('.calculator').addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.insert !== undefined) { insert(button.dataset.insert); return; }
    switch (button.dataset.action) {
      case 'clear': clearAll(); break;
      case 'delete': deleteLast(); break;
      case 'equals': calculate(); break;
      case 'reciprocal': reciprocal(); break;
      case 'deg': setAngleMode('deg'); break;
      case 'rad': setAngleMode('rad'); break;
      case 'mc': case 'mr': case 'mplus': case 'mminus': memoryAction(button.dataset.action); break;
    }
  });

  document.getElementById('copyBtn').addEventListener('click', copyResult);
  document.getElementById('clearHistory').addEventListener('click', () => {
    state.history = [];
    store.set('calcHistory', '[]');
    renderHistory();
  });
  el.themeToggle.addEventListener('click', () => {
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });

  // Keyboard support
  const keyInserts = {
    '*': '×', '/': '÷', '-': '-', '+': '+', '^': '^', '(': '(', ')': ')', '!': '!', '%': '%', '.': '.',
    p: 'π', e: 'e', s: 'sin(', c: 'cos(', t: 'tan(', l: 'log(', n: 'ln(', r: '√('
  };
  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key;
    if (/^[0-9]$/.test(key)) { insert(key); }
    else if (keyInserts[key] !== undefined) { insert(keyInserts[key]); }
    else if (key === 'Enter' || key === '=') { event.preventDefault(); calculate(); }
    else if (key === 'Backspace') { deleteLast(); }
    else if (key === 'Escape' || key === 'Delete') { clearAll(); }
    else { return; }
    if (key === '/' || key === "'") event.preventDefault(); // stop browser quick-find
  });

  /* ---------- Start-up ---------- */
  applyTheme(store.get('calcTheme') === 'light' ? 'light' : 'dark');
  try { state.history = JSON.parse(store.get('calcHistory') || '[]'); } catch (e) { state.history = []; }
  renderHistory();
  updateDisplay();
}

// Run in the browser; export the engine for Node-based testing.
if (typeof document !== 'undefined') initCalculator();
if (typeof module !== 'undefined') module.exports = { evaluate, formatNumber, autoClose };
