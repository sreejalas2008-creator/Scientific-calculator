/* ==========================================================
   Scientific Calculator - script.js
   Part 1: expression engine (tokenizer + recursive-descent parser, no eval)
   Part 2: user interface (buttons, keyboard, memory, history, theme)
   ========================================================== */

// ===== ENGINE START =====

// Splits the expression text into tokens: numbers, functions, constants, operators
const TOKEN_PATTERN = /\s*(?:(\d+\.?\d*(?:E[+-]?\d+)?|\.\d+(?:E[+-]?\d+)?)|(sin⁻¹|cos⁻¹|tan⁻¹|sin|cos|tan|log|ln|√|∛|abs)|(π|e)|([+\-−×÷*\/^!%()]))/y;

function tokenize(text) {
  const tokens = [];
  let index = 0;
  while (index < text.length) {
    TOKEN_PATTERN.lastIndex = index;
    const match = TOKEN_PATTERN.exec(text);
    if (!match) {
      if (/^\s*$/.test(text.slice(index))) break;
      throw new Error("Invalid expression");
    }
    if (match[1] !== undefined) tokens.push({ type: "num", value: parseFloat(match[1]) });
    else if (match[2]) tokens.push({ type: "fn", value: match[2] });
    else if (match[3]) tokens.push({ type: "const", value: match[3] === "π" ? Math.PI : Math.E });
    else {
      let op = match[4];
      if (op === "*") op = "×";
      if (op === "/") op = "÷";
      if (op === "−") op = "-";
      tokens.push({ type: "op", value: op });
    }
    index = TOKEN_PATTERN.lastIndex;
  }
  return tokens;
}

function factorial(n) {
  if (!Number.isInteger(n) || n < 0) throw new Error("Factorial needs a whole number ≥ 0");
  if (n > 170) throw new Error("Result too large");
  let product = 1;
  for (let i = 2; i <= n; i++) product *= i;
  return product;
}

// Evaluates the expression. angleMode is "DEG" or "RAD".
function evaluate(text, angleMode) {
  const tokens = tokenize(text);
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (value) => peek() && peek().type === "op" && peek().value === value;

  const toRadians = (x) => (angleMode === "DEG" ? (x * Math.PI) / 180 : x);
  const fromRadians = (x) => (angleMode === "DEG" ? (x * 180) / Math.PI : x);
  const cleanZero = (x) => (Math.abs(x) < 1e-12 ? 0 : x); // hides 1e-16 rounding noise
  const needRange = (x) => { if (x < -1 || x > 1) throw new Error("Input must be between -1 and 1"); return x; };

  // Applies a named function to its argument
  const FUNCTIONS = {
    "sin": (x) => cleanZero(Math.sin(toRadians(x))),
    "cos": (x) => cleanZero(Math.cos(toRadians(x))),
    "tan": (x) => {
      if (Math.abs(Math.cos(toRadians(x))) < 1e-12) throw new Error("tan is undefined here");
      return cleanZero(Math.tan(toRadians(x)));
    },
    "sin⁻¹": (x) => fromRadians(Math.asin(needRange(x))),
    "cos⁻¹": (x) => fromRadians(Math.acos(needRange(x))),
    "tan⁻¹": (x) => fromRadians(Math.atan(x)),
    "log": (x) => { if (x <= 0) throw new Error("log needs a positive number"); return Math.log10(x); },
    "ln": (x) => { if (x <= 0) throw new Error("ln needs a positive number"); return Math.log(x); },
    "√": (x) => { if (x < 0) throw new Error("Square root of a negative number"); return Math.sqrt(x); },
    "∛": (x) => Math.cbrt(x),
    "abs": (x) => Math.abs(x),
  };

  // expression := term (('+' | '-') term)*
  function parseExpression() {
    let value = parseTerm();
    while (isOp("+") || isOp("-")) {
      const op = tokens[pos++].value;
      const right = parseTerm();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  }

  // term := unary (('×' | '÷' | implicit multiplication) unary)*
  function parseTerm() {
    let value = parseUnary();
    while (true) {
      const token = peek();
      if (!token) break;
      if (token.type === "op" && (token.value === "×" || token.value === "÷")) {
        pos++;
        const right = parseUnary();
        if (token.value === "÷") {
          if (right === 0) throw new Error("Cannot divide by zero");
          value /= right;
        } else value *= right;
      } else if (token.type !== "op" || token.value === "(") {
        value *= parseUnary(); // e.g. 2π or 3(4+1)
      } else break;
    }
    return value;
  }

  // unary := ('-' | '+') unary | power
  function parseUnary() {
    if (isOp("-")) { pos++; return -parseUnary(); }
    if (isOp("+")) { pos++; return parseUnary(); }
    return parsePower();
  }

  // power := postfix ('^' unary)?   (right-associative)
  function parsePower() {
    const base = parsePostfix();
    if (isOp("^")) {
      pos++;
      const exponent = parseUnary();
      if (base === 0 && exponent < 0) throw new Error("Cannot divide by zero");
      return Math.pow(base, exponent);
    }
    return base;
  }

  // postfix := primary ('!' | '%')*
  function parsePostfix() {
    let value = parsePrimary();
    while (isOp("!") || isOp("%")) {
      value = tokens[pos++].value === "!" ? factorial(value) : value / 100;
    }
    return value;
  }

  // primary := number | constant | '(' expression ')' | function '(' expression ')'
  function parsePrimary() {
    const token = tokens[pos++];
    if (!token) throw new Error("Incomplete expression");
    if (token.type === "num" || token.type === "const") return token.value;
    if (token.type === "op" && token.value === "(") {
      const value = parseExpression();
      if (isOp(")")) pos++; // missing ")" at the very end is closed automatically
      return value;
    }
    if (token.type === "fn") {
      if (!isOp("(")) throw new Error("Function needs brackets");
      pos++;
      const argument = parseExpression();
      if (isOp(")")) pos++;
      return FUNCTIONS[token.value](argument);
    }
    throw new Error("Invalid expression");
  }

  if (tokens.length === 0) throw new Error("Empty expression");
  const result = parseExpression();
  if (pos < tokens.length) throw new Error("Invalid expression");
  if (!Number.isFinite(result)) throw new Error("Math error");
  return result;
}

// Rounds to 12 significant digits and switches to E-notation for very large/small values
function formatNumber(value) {
  if (Object.is(value, -0)) value = 0;
  const size = Math.abs(value);
  if (size !== 0 && (size >= 1e15 || size < 1e-9)) {
    return value.toExponential(8).replace(/\.?0+e/, "e").replace("e", "E");
  }
  return String(parseFloat(value.toPrecision(12)));
}

// ===== ENGINE END =====

// ===== USER INTERFACE =====
if (typeof document !== "undefined") {
  const $ = (id) => document.getElementById(id);
  const state = {
    expression: "", resultText: "", angleMode: "DEG", memory: 0,
    justEvaluated: false, hasError: false, lastValue: 0, history: [],
  };

  // Load saved history and theme (wrapped in try/catch in case storage is blocked)
  try { state.history = JSON.parse(localStorage.getItem("sciCalcHistory")) || []; } catch (e) { state.history = []; }
  try { document.documentElement.dataset.theme = localStorage.getItem("sciCalcTheme") || "dark"; } catch (e) {}

  // Redraws the display from the current state
  function render() {
    $("expression").textContent = state.expression || "0";
    const resultBox = $("result");
    resultBox.className = "result";
    if (state.hasError) {
      resultBox.classList.add("error");
      resultBox.textContent = state.resultText;
    } else if (state.justEvaluated) {
      resultBox.textContent = state.resultText;
    } else {
      // Live preview while typing (stays blank if the expression is not complete yet)
      let preview = "";
      try { if (state.expression) preview = formatNumber(evaluate(state.expression, state.angleMode)); } catch (e) {}
      resultBox.classList.add("preview");
      resultBox.textContent = preview || "0";
    }
    $("modeBadge").textContent = state.angleMode;
    $("modeBtn").textContent = state.angleMode;
    $("memBadge").hidden = state.memory === 0;
    $("themeToggle").textContent = document.documentElement.dataset.theme === "dark" ? "☀️" : "🌙";
  }

  // Adds text to the expression
  function insert(text) {
    if (state.justEvaluated) {
      // An operator continues from the last answer; anything else starts fresh
      state.expression = !state.hasError && /^[+\-×÷^!%]/.test(text) ? state.resultText : "";
      state.justEvaluated = false;
      state.hasError = false;
    }
    if (text === "." && /\d*\.\d*$/.test(state.expression)) return; // one decimal point per number
    state.expression += text;
    render();
  }

  function clearAll() { Object.assign(state, { expression: "", resultText: "", justEvaluated: false, hasError: false }); render(); }

  function deleteLast() {
    if (state.justEvaluated) return clearAll();
    state.expression = state.expression.replace(/(sin⁻¹\(|cos⁻¹\(|tan⁻¹\(|sin\(|cos\(|tan\(|log\(|ln\(|√\(|∛\(|abs\(|.)$/, "");
    render();
  }

  function calculate() {
    if (!state.expression || state.justEvaluated) return;
    try {
      const value = evaluate(state.expression, state.angleMode);
      state.lastValue = value;
      state.resultText = formatNumber(value);
      state.hasError = false;
      addHistory(state.expression, state.resultText);
    } catch (error) {
      state.resultText = error.message;
      state.hasError = true;
    }
    state.justEvaluated = true;
    render();
  }

  // Current numeric value for memory and copy: last answer, or the live expression
  function currentValue() {
    if (state.justEvaluated && !state.hasError) return state.lastValue;
    try { return evaluate(state.expression, state.angleMode); } catch (e) { return null; }
  }

  function memoryAction(action) {
    if (action === "mc") state.memory = 0;
    else if (action === "mr") {
      const text = formatNumber(state.memory);
      insert(state.memory < 0 ? `(${text})` : text);
    } else {
      const value = currentValue();
      if (value === null) return showToast("Enter a valid number first");
      state.memory += action === "mplus" ? value : -value;
    }
    render();
  }

  // ----- History -----
  function addHistory(expression, result) {
    state.history.unshift({ expression, result });
    state.history = state.history.slice(0, 30);
    saveHistory();
  }
  function saveHistory() {
    try { localStorage.setItem("sciCalcHistory", JSON.stringify(state.history)); } catch (e) {}
    renderHistory();
  }
  function renderHistory() {
    const list = $("historyList");
    list.innerHTML = "";
    if (!state.history.length) {
      list.innerHTML = '<li class="empty">No calculations yet.</li>';
      return;
    }
    state.history.forEach((item) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.setAttribute("aria-label", `Reuse ${item.expression} equals ${item.result}`);
      const small = document.createElement("small");
      small.textContent = item.expression;
      const strong = document.createElement("strong");
      strong.textContent = "= " + item.result;
      button.append(small, strong);
      button.addEventListener("click", () => { // load the expression back for editing
        Object.assign(state, { expression: item.expression, justEvaluated: false, hasError: false });
        render();
      });
      li.appendChild(button);
      list.appendChild(li);
    });
  }

  // ----- Copy, toast, theme -----
  function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 1600);
  }
  function copyResult() {
    const value = currentValue();
    if (value === null) return showToast("Nothing to copy");
    const text = formatNumber(value);
    const done = () => showToast("Copied: " + text);
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, () => showToast("Copy failed"));
    } else { // fallback for older browsers
      const box = document.createElement("textarea");
      box.value = text; document.body.appendChild(box); box.select();
      try { document.execCommand("copy"); done(); } catch (e) { showToast("Copy failed"); }
      box.remove();
    }
  }
  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("sciCalcTheme", next); } catch (e) {}
    render();
  }

  // ----- Button clicks (one listener for the whole page) -----
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.insert !== undefined) return insert(button.dataset.insert);
    switch (button.dataset.action) {
      case "clear": clearAll(); break;
      case "delete": deleteLast(); break;
      case "equals": calculate(); break;
      case "mode": state.angleMode = state.angleMode === "DEG" ? "RAD" : "DEG"; render(); break;
      case "copy": copyResult(); break;
      case "theme": toggleTheme(); break;
      case "clearHistory": state.history = []; saveHistory(); break;
      case "mc": case "mr": case "mplus": case "mminus": memoryAction(button.dataset.action); break;
    }
  });

  // ----- Keyboard support -----
  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key;
    if (/^[0-9.+\-^!%()]$/.test(key)) insert(key);
    else if (key === "*") insert("×");
    else if (key === "/") { event.preventDefault(); insert("÷"); }
    else if (key === "p") insert("π");
    else if (key === "r") insert("√(");
    else if (key === "Enter" || key === "=") { event.preventDefault(); calculate(); }
    else if (key === "Backspace") deleteLast();
    else if (key === "Escape") clearAll();
  });

  renderHistory();
  render();
}
