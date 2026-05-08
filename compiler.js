/* ═══════════════════════════════════════════════════════════
   compiler.js — StudyBuddy AI Code Lab
   Monaco Editor + Piston API + Groq AI
   ═══════════════════════════════════════════════════════════ */
'use strict';

const GROQ_API_KEY = "YOUR_API_KEY";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL   = "llama-3.1-8b-instant";

// ── CONSTANTS ──────────────────────────────────────────────
// Judge0 CE — free public instance, no API key required
// Language IDs: C=50, C++=54, Python=71 (pyodide handles Python in-browser)
const JUDGE0_API  = 'https://ce.judge0.com/submissions?base64_encoded=false&wait=true';
const JUDGE0_LANG = { c: 50, 'c++': 54, python: 71 };
const MAX_HISTORY = 10;

// ── LOCAL JS SANDBOX ─────────────────────────────────────────
function runJSSandbox(code, stdinLines) {
  const logs = [], errs = [];
  function fmt(v) {
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    if (typeof v === 'object') { try { return JSON.stringify(v, null, 2); } catch { return String(v); } }
    return String(v);
  }
  const mockConsole = {
    log:   (...a) => logs.push(a.map(fmt).join(' ')),
    error: (...a) => errs.push(a.map(fmt).join(' ')),
    warn:  (...a) => logs.push('⚠ ' + a.map(fmt).join(' ')),
    info:  (...a) => logs.push(a.map(fmt).join(' ')),
    table: (v)    => logs.push(JSON.stringify(v, null, 2)),
    dir:   (v)    => logs.push(fmt(v)),
  };
  let stdinIdx = 0;
  const mockPrompt = (msg) => { if (msg) logs.push(String(msg)); return stdinLines[stdinIdx++] ?? ''; };
  let stdout = '', stderr = '', exitCode = 0;
  try {
    // eslint-disable-next-line no-new-func
    new Function('console', 'prompt', 'alert', 'confirm', code)(mockConsole, mockPrompt, mockPrompt, () => true);
    stdout = logs.join('\n');
    if (errs.length) stderr = errs.join('\n');
  } catch (err) {
    exitCode = 1;
    stderr = err.toString();
    stdout = logs.join('\n');
  }
  return { stdout, stderr, exitCode };
}

// ── PYODIDE PYTHON SANDBOX ───────────────────────────────────
let pyodideInstance  = null;
let pyodideLoading   = false;
let pyodideCallbacks = [];

async function ensurePyodide() {
  if (pyodideInstance) return pyodideInstance;
  if (pyodideLoading) {
    return new Promise(resolve => pyodideCallbacks.push(resolve));
  }
  pyodideLoading = true;

  // Dynamically load Pyodide from CDN
  if (!window.loadPyodide) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  showToast('Loading Python runtime… (first time only)', 'info');
  pyodideInstance = await loadPyodide({
    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/'
  });

  pyodideCallbacks.forEach(cb => cb(pyodideInstance));
  pyodideCallbacks = [];
  return pyodideInstance;
}

async function runPythonSandbox(code, stdinLines) {
  const pyodide = await ensurePyodide();
  let stdout = '', stderr = '', exitCode = 0;

  // Redirect stdout/stderr and mock input()
  const setupCode = `
import sys, io

_stdout_buf = io.StringIO()
_stderr_buf = io.StringIO()
sys.stdout  = _stdout_buf
sys.stderr  = _stderr_buf

_stdin_lines = ${JSON.stringify(stdinLines)}
_stdin_idx   = [0]

def input(prompt=''):
    if prompt:
        sys.stdout.write(str(prompt))
    val = _stdin_lines[_stdin_idx[0]] if _stdin_idx[0] < len(_stdin_lines) else ''
    _stdin_idx[0] += 1
    return val

import builtins
builtins.input = input
`;

  try {
    pyodide.runPython(setupCode);
    pyodide.runPython(code);
    stdout = pyodide.runPython('_stdout_buf.getvalue()');
    const errOut = pyodide.runPython('_stderr_buf.getvalue()');
    if (errOut) stderr = errOut;
  } catch (err) {
    exitCode = 1;
    // Get any partial stdout
    try { stdout = pyodide.runPython('_stdout_buf.getvalue()'); } catch {}
    stderr = String(err);
  } finally {
    // Restore sys streams
    try { pyodide.runPython('sys.stdout = sys.__stdout__; sys.stderr = sys.__stderr__'); } catch {}
  }

  return { stdout, stderr, exitCode };
}

// ── JUDGE0 — C / C++ ─────────────────────────────────────────
async function runViaJudge0(code, lang, stdin) {
  const language_id = JUDGE0_LANG[lang];
  if (!language_id) throw new Error('Unsupported language: ' + lang);

  const res = await fetch(JUDGE0_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_code: code, language_id, stdin })
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Judge0 error (${res.status}): ${txt}`);
  }

  const data    = await res.json();
  // data.status.id: 3=Accepted, 4=WrongAnswer, 5=TLE, 6=CE, 11=RuntimeError
  const stdout   = data.stdout  ?? '';
  const stderr   = (data.stderr ?? '') || (data.compile_output ?? '') || (data.message ?? '');
  const exitCode = data.status?.id === 3 ? 0 : 1;
  return { stdout, stderr, exitCode, statusDesc: data.status?.description };
}
const LANG_CONFIG = {
  javascript: {
    icon: '🟨',
    label: 'JavaScript',
    filename: 'main.js',
    pistonLang: 'javascript',
    monacoLang: 'javascript',
    template: `// ✦ StudyBuddy AI Code Lab — JavaScript
// Write your code below and hit ▶ Run!

function greet(name) {
  return \`Hello, \${name}! Welcome to StudyBuddy.\`;
}

const message = greet("Student");
console.log(message);

// Try solving: Find the sum of all even numbers up to n
function sumEven(n) {
  let sum = 0;
  for (let i = 2; i <= n; i += 2) sum += i;
  return sum;
}

console.log("Sum of evens up to 20:", sumEven(20));
`
  },
  python: {
    icon: '🐍',
    label: 'Python',
    filename: 'main.py',
    pistonLang: 'python',
    monacoLang: 'python',
    template: `# ✦ StudyBuddy AI Code Lab — Python
# Write your code below and hit ▶ Run!

def greet(name: str) -> str:
    return f"Hello, {name}! Welcome to StudyBuddy."

message = greet("Student")
print(message)

# Try solving: Find all prime numbers up to n (Sieve of Eratosthenes)
def sieve(n):
    primes = [True] * (n + 1)
    primes[0] = primes[1] = False
    for i in range(2, int(n**0.5) + 1):
        if primes[i]:
            for j in range(i*i, n+1, i):
                primes[j] = False
    return [i for i, p in enumerate(primes) if p]

print("Primes up to 30:", sieve(30))
`
  },
  c: {
    icon: '🔵',
    label: 'C',
    filename: 'main.c',
    pistonLang: 'c',
    monacoLang: 'c',
    template: `/* ✦ StudyBuddy AI Code Lab — C
   Write your code below and hit ▶ Run! */

#include <stdio.h>

void greet(const char* name) {
    printf("Hello, %s! Welcome to StudyBuddy.\\n", name);
}

int factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}

int main() {
    greet("Student");

    // Try solving: Factorial using recursion
    int n = 6;
    printf("Factorial of %d = %d\\n", n, factorial(n));

    return 0;
}
`
  },
  cpp: {
    icon: '🔷',
    label: 'C++',
    filename: 'main.cpp',
    pistonLang: 'c++',
    monacoLang: 'cpp',
    template: `// ✦ StudyBuddy AI Code Lab — C++
// Write your code below and hit ▶ Run!

#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;

void greet(const string& name) {
    cout << "Hello, " << name << "! Welcome to StudyBuddy." << endl;
}

// Try solving: Binary search
int binarySearch(vector<int>& arr, int target) {
    int lo = 0, hi = arr.size() - 1;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        if (arr[mid] == target) return mid;
        else if (arr[mid] < target) lo = mid + 1;
        else hi = mid - 1;
    }
    return -1;
}

int main() {
    greet("Student");

    vector<int> arr = {1, 3, 5, 7, 11, 13, 17, 19, 23};
    int idx = binarySearch(arr, 13);
    cout << "Found 13 at index: " << idx << endl;

    return 0;
}
`
  }
};

const DYK_TIPS = [
  "💡 In C++, prefer <code>nullptr</code> over <code>NULL</code> — it's type-safe and part of modern C++.",
  "💡 Python's <code>enumerate()</code> gives you both index and value when iterating a list.",
  "💡 JavaScript's <code>===</code> checks value AND type — always prefer it over <code>==</code>.",
  "💡 In C, remember to always initialize pointers — uninitialized pointers cause undefined behavior.",
  "💡 Big-O notation describes the <em>worst case</em>. Binary search is O(log n) vs linear search O(n).",
  "💡 Use <code>const</code> in C/C++ to protect values from accidental mutation — good practice!",
  "💡 Python lists are dynamic arrays under the hood — O(1) append but O(n) insert at index.",
  "💡 In JavaScript, <code>Array.prototype.reduce()</code> can replace most loops elegantly.",
  "💡 Stack overflow in recursion happens when there's no base case or the depth is too large.",
  "💡 Try solving every problem brute-force first, then optimize — that's how real interviews work!"
];

// ── STATE ──────────────────────────────────────────────────
let monacoEditor   = null;
let currentLang    = 'javascript';
let isRunning      = false;
let lastCode       = '';
let runHistory     = [];
let currentTab     = 'output';
let dykInterval    = null;
let resizing       = false;
let resizeStartX   = 0;
let editorStartW   = 0;

// ── CODING TIME TRACKING ───────────────────────────────────
let codingSessionStart = null;
let codingTimeInterval = null;

function startCodingTimer() {
  if (codingSessionStart) return; // already running
  codingSessionStart = Date.now();
  // Save tick every 30s
  codingTimeInterval = setInterval(saveCodingTime, 30000);
}

function saveCodingTime() {
  if (!codingSessionStart) return;
  const elapsedMin = Math.floor((Date.now() - codingSessionStart) / 60000);
  if (elapsedMin < 1) return;

  const today = new Date().toISOString().slice(0, 10);
  let codingLog = [];
  try { codingLog = JSON.parse(localStorage.getItem('sb_coding_log') || '[]'); } catch {}

  const existing = codingLog.find(e => e.date === today);
  if (existing) {
    existing.minutes = (existing.minutes || 0) + elapsedMin;
  } else {
    codingLog.push({ date: today, minutes: elapsedMin });
  }
  localStorage.setItem('sb_coding_log', JSON.stringify(codingLog));

  // Also bump the general study log so analytics picks it up
  let studyLog = [];
  try { studyLog = JSON.parse(localStorage.getItem('sb_study_log') || '[]'); } catch {}
  const studyEntry = studyLog.find(e => e.date === today);
  if (studyEntry) {
    studyEntry.minutes = (studyEntry.minutes || 0) + elapsedMin;
  } else {
    studyLog.push({ date: today, minutes: elapsedMin });
  }
  localStorage.setItem('sb_study_log', JSON.stringify(studyLog));

  // Reset so we don't double-count next tick
  codingSessionStart = Date.now();
}

function stopCodingTimer() {
  saveCodingTime();
  clearInterval(codingTimeInterval);
  codingTimeInterval = null;
  codingSessionStart = null;
}

// ── INIT ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Restore saved theme
  const savedTheme = localStorage.getItem('sb_compiler_theme') || 'dark';
  document.documentElement.setAttribute('data-ctheme', savedTheme);
  document.querySelectorAll('.theme-option').forEach(el => {
    el.classList.toggle('active', el.dataset.theme === savedTheme);
  });
  const themeIconEl = document.getElementById('themeIcon');
  if (themeIconEl) themeIconEl.textContent = THEME_ICONS[savedTheme] || '🌑';

  // Restore saved language
  const savedLang = localStorage.getItem('sb_compiler_lang') || 'javascript';
  if (savedLang && LANG_CONFIG[savedLang]) {
    // will be applied after monaco init
    setTimeout(() => selectLang(savedLang), 100);
  }

  loadHistory();
  initMonaco();
  initResizeHandle();
  rotateTip();
  dykInterval = setInterval(rotateTip, 8000);
  startCodingTimer();

  // Save coding time when leaving the page
  window.addEventListener('beforeunload', stopCodingTimer);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveCodingTime();
    else if (!codingSessionStart) startCodingTimer();
  });

  // Keyboard shortcut: Ctrl+Enter / Cmd+Enter → Run
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runCode();
    }
  });
});

// ── MONACO INIT ────────────────────────────────────────────
function initMonaco() {
  require.config({
    paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' }
  });

  require(['vs/editor/editor.main'], () => {
    // Define all 3 themes upfront; active one is picked from localStorage
    Object.entries(MONACO_THEMES).forEach(([key, def]) => {
      monaco.editor.defineTheme('studybuddy-' + key, {
        base: def.base, inherit: true,
        rules: def.rules, colors: def.colors
      });
    });
    const activeTheme = localStorage.getItem('sb_compiler_theme') || 'dark';

    monacoEditor = monaco.editor.create(document.getElementById('monacoEditor'), {
      value: LANG_CONFIG[currentLang].template,
      language: LANG_CONFIG[currentLang].monacoLang,
      theme: 'studybuddy-' + activeTheme,
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontLigatures: true,
      lineHeight: 22,
      letterSpacing: 0.3,
      minimap: { enabled: true, scale: 0.8, renderCharacters: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      padding: { top: 16, bottom: 16 },
      renderLineHighlight: 'gutter',
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      bracketPairColorization: { enabled: true },
      formatOnPaste: true,
      suggestOnTriggerCharacters: true,
      wordWrap: 'off',
      tabSize: 2,
      insertSpaces: true,
      guides: { bracketPairs: 'active' },
      overviewRulerLanes: 2,
      scrollbar: {
        vertical: 'auto',
        horizontal: 'auto',
        verticalScrollbarSize: 6,
        horizontalScrollbarSize: 6
      }
    });

    // Restore last code if available
    const saved = localStorage.getItem(`sb_code_${currentLang}`);
    if (saved) {
      monacoEditor.setValue(saved);
      showToast('↩ Last session restored', 'info');
    }

    // Auto-save on change
    monacoEditor.onDidChangeModelContent(() => {
      const code = monacoEditor.getValue();
      localStorage.setItem(`sb_code_${currentLang}`, code);
      detectStdinNeeded(code);
    });

    // Initial height sync + resize listener
    setTimeout(updateMonacoHeight, 50);
    window.addEventListener('resize', updateMonacoHeight);
  });
}

// ── LANGUAGE SWITCH (hidden select kept in sync, custom dropdown drives it) ─

function switchLanguage(lang) {
  if (!monacoEditor) return;
  // Save CURRENT lang code before switching (not the new lang)
  localStorage.setItem(`sb_code_${currentLang}`, monacoEditor.getValue());

  currentLang = lang;
  const cfg = LANG_CONFIG[lang];

  // Update Monaco model language
  const model = monacoEditor.getModel();
  monaco.editor.setModelLanguage(model, cfg.monacoLang);

  // Load saved code for new lang, or template
  const saved = localStorage.getItem(`sb_code_${lang}`);
  monacoEditor.setValue(saved || cfg.template);

  // Update UI
  document.getElementById('langIcon').textContent    = cfg.icon;
  document.getElementById('filenamePill').textContent = cfg.filename;
  document.getElementById('langSelect').value         = lang;

  localStorage.setItem('sb_compiler_lang', lang);
  setStatus('ready');
  showToast(`Switched to ${cfg.label}`, 'info');
}

// ── RUN CODE ───────────────────────────────────────────────
async function runCode() {
  if (isRunning) return;
  if (!monacoEditor) { showToast('Editor not ready', 'error'); return; }

  const code = monacoEditor.getValue().trim();
  if (!code) { showToast('Write some code first!', 'error'); return; }

  isRunning = true;
  lastCode  = code;
  const cfg = LANG_CONFIG[currentLang];

  // UI: start state
  const runBtn = document.getElementById('runBtn');
  runBtn.textContent = '⏳ Running…';
  runBtn.classList.add('loading');
  showCompileOverlay(true);
  setStatus('running');
  clearOutput();

  const startTime = performance.now();

  try {
    const stdinValue = document.getElementById('stdinInput')?.value || '';
    const stdinLines  = stdinValue.split('\n');

    let result, elapsed;

    // ── Route to correct execution backend ─────────────────
    if (currentLang === 'javascript') {
      // Runs entirely in the browser — instant, no network
      result  = runJSSandbox(code, stdinLines);
      elapsed = Math.round(performance.now() - startTime);

    } else if (currentLang === 'python') {
      // Pyodide: full CPython compiled to WASM — no network after first load
      result  = await runPythonSandbox(code, stdinLines);
      elapsed = Math.round(performance.now() - startTime);

    } else {
      // C / C++ → Judge0 CE (free public instance, no key needed)
      result  = await runViaJudge0(code, cfg.pistonLang, stdinValue);
      elapsed = Math.round(performance.now() - startTime);
      // Append Judge0 status if not Accepted
      if (result.statusDesc && result.exitCode !== 0) {
        result.stderr = `[${result.statusDesc}]\n` + (result.stderr || '');
      }
    }

    showCompileOverlay(false);
    displayResult({ ...result, elapsed, code, lang: currentLang });
    addToHistory({ code, lang: currentLang, ...result, elapsed, ts: Date.now() });
    setTimeout(() => analyzeWithAI(code, currentLang, result.stdout, result.stderr, result.exitCode), 300);

  } catch (err) {
    showCompileOverlay(false);
    const elapsed = Math.round(performance.now() - startTime);
    displayResult({
      stdout: '',
      stderr: `Network error: ${err.message}\n\nMake sure you're connected to the internet.`,
      exitCode: 1,
      elapsed,
      code,
      lang: currentLang
    });
    setStatus('error');
  } finally {
    isRunning = false;
    runBtn.textContent = '▶ \u00A0Run';
    runBtn.classList.remove('loading');
  }
}

// ── DISPLAY RESULTS ────────────────────────────────────────
function displayResult({ stdout, stderr, exitCode, elapsed, lang }) {
  const hasError   = exitCode !== 0 || stderr.trim().length > 0;
  const outputEl   = document.getElementById('outputContent');
  const metaEl     = document.getElementById('outputMeta');
  const execTime   = document.getElementById('execTime');
  const execLang   = document.getElementById('execLang');
  const execStatus = document.getElementById('execStatus');

  // Output tab
  metaEl.style.display = 'flex';
  execTime.textContent  = `⏱ ${elapsed}ms`;
  execLang.textContent  = LANG_CONFIG[lang].label;

  if (hasError) {
    outputEl.className   = 'output-content has-error';
    outputEl.textContent = stderr || stdout || 'Unknown error occurred.';
    execStatus.textContent = '❌ Error';
    execStatus.className   = 'meta-pill fail';
    setStatus('error');
    showErrorsTab(stderr || stdout);
    flashTab('errors');
  } else {
    outputEl.className   = 'output-content has-success success-pop';
    outputEl.textContent = stdout || '(Program exited with no output)';
    execStatus.textContent = '✅ Success';
    execStatus.className   = 'meta-pill success';
    setStatus('success');
    clearErrorsTab();
  }

  switchTab('output');
}

// ── ERRORS TAB ─────────────────────────────────────────────
function showErrorsTab(errorText) {
  const el    = document.getElementById('errorContent');
  const badge = document.getElementById('errorBadge');
  const lines = errorText.trim().split('\n');

  el.innerHTML = `
    <div class="error-block">
      <div class="error-block-header">❌ Runtime / Compile Error</div>
      <div class="error-block-body">${escHtml(errorText.trim())}</div>
    </div>
    <div class="error-block" style="border-color:rgba(251,191,36,0.2);background:rgba(251,191,36,0.05)">
      <div class="error-block-header" style="color:#fbbf24">⚠️ ${lines.length} line(s) of error output</div>
      <div class="error-block-body" style="color:rgba(251,191,36,0.8)">
        Exit code indicates non-zero termination. Check your logic and syntax.
      </div>
    </div>
  `;
  badge.textContent = lines.length;
  badge.style.display = 'inline-flex';
}

function clearErrorsTab() {
  const el    = document.getElementById('errorContent');
  const badge = document.getElementById('errorBadge');
  el.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">✅</div>
      <div class="empty-text">No errors!</div>
      <div class="empty-sub">Your code ran successfully.</div>
    </div>
  `;
  badge.style.display = 'none';
}

// ── AI ANALYSIS ────────────────────────────────────────────
async function analyzeWithAI(code, lang, stdout, stderr, exitCode) {
  const aiBadge = document.getElementById('aiBadge');
  const aiEl    = document.getElementById('aiContent');

  // Show loading
  aiEl.innerHTML = `
    <div class="ai-loading">
      <div class="ai-orb-wrap" style="width:36px;height:36px">
        <div class="ai-orb" style="width:26px;height:26px"></div>
        <div class="ai-orb-ring"></div>
      </div>
      <div>
        <div style="font-weight:600;margin-bottom:3px">AI Mentor analyzing…</div>
        <div class="ai-dots"><span></span><span></span><span></span></div>
      </div>
    </div>
  `;
  aiBadge.style.display = 'inline-flex';
  flashTab('ai');

  const hasError  = exitCode !== 0 || stderr.trim().length > 0;
  const langLabel = LANG_CONFIG[lang].label;

  const systemPrompt = `You are an expert programming mentor for students. Analyze code and give concise educational feedback.
Respond ONLY in valid JSON — no markdown fences, no preamble. Use this exact structure:
{
  "type": "error or success",
  "primary": { "title": "string", "body": "string (HTML ok: use <code> for inline code, <strong> for emphasis)" },
  "fix": { "title": "string", "body": "string" },
  "complexity": { "title": "Time & Space Complexity", "body": "string" },
  "improvement": { "title": "Optimization Hint", "body": "string" },
  "challenge": { "title": "Try Next", "body": "string", "label": "button label text" }
}
Include "fix" only if there is an error. Include "complexity" and "improvement" only on success. Always include "challenge".`;

  const userMsg = hasError
    ? `Language: ${langLabel}
Code:
\`\`\`
${code}
\`\`\`
Error output:
${stderr || stdout}

Analyze the error: explain what went wrong simply, and suggest how to fix it. Be concise and educational.`
    : `Language: ${langLabel}
Code:
\`\`\`
${code}
\`\`\`
Output: ${stdout}

Code ran successfully. Give complexity analysis, an optimization hint, and suggest a next challenge problem.`;

  try {
    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userMsg }
        ],
        temperature: 0.7,
        max_tokens: 800
      })
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Groq API error ${res.status}: ${errBody}`);
    }

    const data = await res.json();
    const raw  = data?.choices?.[0]?.message?.content || '{}';

    let parsed = null;
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {
      // If JSON parse fails try to extract from raw text
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch {}
      }
    }

    renderAIInsights(parsed, hasError, aiEl);

  } catch (err) {
    console.error('Groq AI error:', err);
    aiEl.innerHTML = `
      <div class="ai-section error-type">
        <div class="ai-section-header">⚠️ AI Unavailable</div>
        <div class="ai-section-body">
          ${escHtml(err.message)}<br><br>
          💡 Check your Groq API key or network connection.
        </div>
      </div>
    `;
  }
}

// ── RENDER AI INSIGHTS ─────────────────────────────────────
function renderAIInsights(data, hasError, container) {
  if (!data) {
    container.innerHTML = `<div class="ai-section"><div class="ai-section-header">🤖 Analysis</div><div class="ai-section-body">Could not parse AI response. Try running your code again.</div></div>`;
    return;
  }

  let html = '';

  if (data.primary) {
    html += `
      <div class="ai-section ${hasError ? 'error-type' : 'success-type'} success-pop">
        <div class="ai-section-header">${hasError ? '❌' : '✅'} ${escHtml(data.primary.title)}</div>
        <div class="ai-section-body">${data.primary.body}</div>
      </div>`;
  }

  if (data.fix) {
    html += `
      <div class="ai-section error-type" style="animation-delay:0.08s">
        <div class="ai-section-header">🔧 ${escHtml(data.fix.title)}</div>
        <div class="ai-section-body">${data.fix.body}</div>
      </div>`;
  }

  if (data.complexity) {
    html += `
      <div class="ai-section" style="animation-delay:0.08s">
        <div class="ai-section-header">📊 ${escHtml(data.complexity.title)}</div>
        <div class="ai-section-body">${data.complexity.body}</div>
      </div>`;
  }

  if (data.improvement) {
    html += `
      <div class="ai-section" style="animation-delay:0.12s">
        <div class="ai-section-header">⚡ ${escHtml(data.improvement.title)}</div>
        <div class="ai-section-body">${data.improvement.body}</div>
      </div>`;
  }

  if (data.challenge) {
    html += `
      <div class="ai-section challenge-type" style="animation-delay:0.16s">
        <div class="ai-section-header">🎯 ${escHtml(data.challenge.title)}</div>
        <div class="ai-section-body">${data.challenge.body}</div>
        <button class="ai-challenge-btn" onclick="showToast('Challenge mode coming soon! 🚀','info')">
          ${escHtml(data.challenge.label || 'Try this challenge →')} →
        </button>
      </div>`;
  }

  container.innerHTML = html || '<div class="empty-state"><div class="empty-text">No insights available</div></div>';
}

// ── HISTORY ────────────────────────────────────────────────
function addToHistory(entry) {
  runHistory.unshift(entry);
  if (runHistory.length > MAX_HISTORY) runHistory.pop();
  localStorage.setItem('sb_run_history', JSON.stringify(runHistory));
  renderHistory();
}

function loadHistory() {
  try {
    runHistory = JSON.parse(localStorage.getItem('sb_run_history') || '[]');
  } catch { runHistory = []; }
  renderHistory();
}

function renderHistory() {
  const el = document.getElementById('historyContent');
  if (!runHistory.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📂</div>
        <div class="empty-text">No history yet</div>
        <div class="empty-sub">Your recent runs will appear here</div>
      </div>`;
    return;
  }

  el.innerHTML = runHistory.map((h, i) => {
    const preview  = h.code.split('\n').find(l => l.trim() && !l.startsWith('//') && !l.startsWith('#')) || '(empty)';
    const status   = h.exitCode === 0 ? '✅ Success' : '❌ Error';
    const timeAgo  = formatTimeAgo(h.ts);
    const cfg      = LANG_CONFIG[h.lang] || LANG_CONFIG.javascript;
    return `
      <div class="history-item" onclick="restoreHistoryItem(${i})" title="Click to restore this code">
        <div class="history-item-header">
          <span class="history-lang-badge">${cfg.icon} ${cfg.label}</span>
          <span class="history-time">${timeAgo}</span>
        </div>
        <div class="history-preview">${escHtml(preview.trim())}</div>
        <div class="history-status" style="color:${h.exitCode===0?'var(--success)':'var(--error)'}">${status} · ${h.elapsed}ms</div>
      </div>`;
  }).join('');
}

function restoreHistoryItem(index) {
  const h = runHistory[index];
  if (!h || !monacoEditor) return;
  switchLanguage(h.lang);
  setTimeout(() => {
    monacoEditor.setValue(h.code);
    switchTab('output');
    showToast('Code restored from history ↩', 'success');
  }, 100);
}

function formatTimeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

// ── EDITOR UTILITIES ───────────────────────────────────────
function clearEditor() {
  if (!monacoEditor) return;
  if (!confirm('Clear the editor? (Your code will be lost)')) return;
  monacoEditor.setValue('');
  monacoEditor.focus();
  showToast('Editor cleared', 'info');
}

function restoreLastCode() {
  if (!monacoEditor) return;
  const saved = localStorage.getItem(`sb_code_${currentLang}`);
  if (saved) {
    monacoEditor.setValue(saved);
    showToast('Last session restored ↩', 'success');
  } else if (lastCode) {
    monacoEditor.setValue(lastCode);
    showToast('Last run restored ↩', 'success');
  } else {
    monacoEditor.setValue(LANG_CONFIG[currentLang].template);
    showToast('Template loaded', 'info');
  }
}

function formatCode() {
  if (!monacoEditor) return;
  monacoEditor.getAction('editor.action.formatDocument')?.run();
  showToast('Code formatted ✦', 'success');
}

async function copyCode() {
  if (!monacoEditor) return;
  const code = monacoEditor.getValue();
  try {
    await navigator.clipboard.writeText(code);
    const btn = document.getElementById('copyBtn');
    btn.textContent = '✅ Copied!';
    setTimeout(() => btn.textContent = '⎘ Copy', 2000);
    showToast('Code copied to clipboard!', 'success');
  } catch {
    showToast('Copy failed', 'error');
  }
}

// ── FULLSCREEN ─────────────────────────────────────────────
function toggleFullscreen() {
  const body  = document.body;
  const fsBtn = document.getElementById('fsBtn');
  body.classList.toggle('fullscreen');
  const isFs = body.classList.contains('fullscreen');
  fsBtn.innerHTML = isFs ? '<span>⊠</span> Exit' : '<span>⛶</span> Fullscreen';
  monacoEditor?.layout();
  showToast(isFs ? 'Fullscreen on ⛶' : 'Fullscreen off', 'info');
}

// ── TABS ───────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === name);
    t.setAttribute('aria-selected', t.dataset.tab === name);
  });
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === `tab-${name}`);
  });
  currentTab = name;
}

function flashTab(name) {
  const tab = document.querySelector(`.tab[data-tab="${name}"]`);
  if (!tab) return;
  tab.style.animation = 'none';
  tab.offsetHeight; // force reflow
  tab.style.animation = 'tabFlash 0.5s ease';
}

// ── STATUS ─────────────────────────────────────────────────
function setStatus(state) {
  const dot  = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  const map  = { ready: ['', 'Ready'], running: ['running', 'Compiling…'], success: ['success', 'Success'], error: ['error', 'Error'] };
  const [cls, label] = map[state] || map.ready;
  dot.className  = `badge-dot ${cls}`;
  text.textContent = label;
}

// ── OVERLAY ────────────────────────────────────────────────
function showCompileOverlay(show) {
  const el = document.getElementById('compileOverlay');
  el.classList.toggle('hidden', !show);
  if (show) {
    const msgs = ['Compiling…', 'Linking…', 'Executing…', 'Almost done…'];
    let i = 0;
    const compileText = document.getElementById('compileText');
    const iv = setInterval(() => {
      compileText.textContent = msgs[i++ % msgs.length];
      if (!show) clearInterval(iv);
    }, 700);
    el._interval = iv;
  } else {
    clearInterval(el._interval);
  }
}

// ── DID YOU KNOW ───────────────────────────────────────────
let dykIndex = 0;
function rotateTip() {
  const el = document.getElementById('dykText');
  if (!el) return;
  el.style.opacity = '0';
  setTimeout(() => {
    el.innerHTML = DYK_TIPS[dykIndex++ % DYK_TIPS.length];
    el.style.opacity = '1';
  }, 300);
}

// ── TOAST ──────────────────────────────────────────────────
let toastTimeout;
function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  clearTimeout(toastTimeout);
  toast.textContent = msg;
  toast.className   = `toast ${type} show`;
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── CLEAR OUTPUT ───────────────────────────────────────────
function clearOutput() {
  const el   = document.getElementById('outputContent');
  const meta = document.getElementById('outputMeta');
  // Reset class but keep base styling intact
  el.className   = 'output-content';
  el.textContent = '';
  meta.style.display = 'none';
}

// ── LANGUAGE DROPDOWN ──────────────────────────────────────
function toggleLangDropdown() {
  const dropdown = document.getElementById('langDropdown');
  const trigger  = document.getElementById('langTrigger');
  const isOpen   = dropdown.classList.contains('open');

  closeAllDropdowns();
  if (!isOpen) {
    const rect = trigger.getBoundingClientRect();
    dropdown.style.top  = (rect.bottom + 6) + 'px';
    dropdown.style.left = rect.left + 'px';
    dropdown.classList.add('open');
    trigger.classList.add('open');
  }
}

function selectLang(lang) {
  closeAllDropdowns();
  switchLanguage(lang);

  // Update dropdown active state
  document.querySelectorAll('.lang-option').forEach(el => {
    el.classList.toggle('active', el.dataset.lang === lang);
  });

  // Update trigger label & icon
  const cfg = LANG_CONFIG[lang];
  document.getElementById('langTriggerLabel').textContent = cfg.label;
  document.getElementById('langIcon').textContent = cfg.icon;
}

// ── THEME SYSTEM ───────────────────────────────────────────
const MONACO_THEMES = {
  dark: {
    base: 'vs-dark',
    rules: [
      { token: 'comment',   foreground: '4a5568', fontStyle: 'italic' },
      { token: 'keyword',   foreground: '68d391' },
      { token: 'string',    foreground: 'fbd38d' },
      { token: 'number',    foreground: '76e4f7' },
      { token: 'type',      foreground: '9f7aea' },
      { token: 'function',  foreground: '90cdf4' },
      { token: 'operator',  foreground: 'fc8181' },
    ],
    colors: {
      'editor.background':                '#0c1017',
      'editor.foreground':                '#e2e8f0',
      'editorLineNumber.foreground':      '#2d3748',
      'editorLineNumber.activeForeground':'#68d391',
      'editor.selectionBackground':       '#22c55e22',
      'editor.lineHighlightBackground':   '#ffffff07',
      'editorCursor.foreground':          '#22c55e',
      'editorBracketMatch.background':    '#22c55e22',
      'editorBracketMatch.border':        '#22c55e55',
    }
  },
  light: {
    base: 'vs',
    rules: [
      { token: 'comment',   foreground: '6b7280', fontStyle: 'italic' },
      { token: 'keyword',   foreground: '065f46' },
      { token: 'string',    foreground: '92400e' },
      { token: 'number',    foreground: '1d4ed8' },
      { token: 'type',      foreground: '6d28d9' },
      { token: 'function',  foreground: '0369a1' },
      { token: 'operator',  foreground: 'b45309' },
    ],
    colors: {
      'editor.background':                '#ffffff',
      'editor.foreground':                '#0f172a',
      'editorLineNumber.foreground':      '#94a3b8',
      'editorLineNumber.activeForeground':'#059669',
      'editor.selectionBackground':       '#05966922',
      'editor.lineHighlightBackground':   '#f0fdf4',
      'editorCursor.foreground':          '#059669',
      'editorBracketMatch.background':    '#05966922',
      'editorBracketMatch.border':        '#05966955',
    }
  },
  midnight: {
    base: 'vs-dark',
    rules: [
      { token: 'comment',   foreground: '4c4a6e', fontStyle: 'italic' },
      { token: 'keyword',   foreground: 'c4b5fd' },
      { token: 'string',    foreground: 'f9a8d4' },
      { token: 'number',    foreground: '93c5fd' },
      { token: 'type',      foreground: 'e879f9' },
      { token: 'function',  foreground: 'a5f3fc' },
      { token: 'operator',  foreground: 'fb7185' },
    ],
    colors: {
      'editor.background':                '#06060e',
      'editor.foreground':                '#f1f0ff',
      'editorLineNumber.foreground':      '#2d2a50',
      'editorLineNumber.activeForeground':'#a78bfa',
      'editor.selectionBackground':       '#a78bfa22',
      'editor.lineHighlightBackground':   '#ffffff05',
      'editorCursor.foreground':          '#a78bfa',
      'editorBracketMatch.background':    '#a78bfa22',
      'editorBracketMatch.border':        '#a78bfa55',
    }
  }
};

const THEME_ICONS = { dark: '🌑', light: '☀️', midnight: '🌌' };

function applyTheme(theme) {
  closeAllDropdowns();

  // 1. HTML attribute (drives all CSS vars)
  document.documentElement.setAttribute('data-ctheme', theme);

  // 2. Monaco editor theme
  if (window.monaco) {
    const def = MONACO_THEMES[theme];
    const monacoThemeName = 'studybuddy-' + theme;
    monaco.editor.defineTheme(monacoThemeName, {
      base: def.base, inherit: true,
      rules: def.rules, colors: def.colors
    });
    monaco.editor.setTheme(monacoThemeName);
  }

  // 3. Update theme panel active state
  document.querySelectorAll('.theme-option').forEach(el => {
    el.classList.toggle('active', el.dataset.theme === theme);
  });

  // 4. Update button icon
  document.getElementById('themeIcon').textContent = THEME_ICONS[theme] || '🎨';

  // 5. Persist
  localStorage.setItem('sb_compiler_theme', theme);
  showToast(`${theme.charAt(0).toUpperCase() + theme.slice(1)} theme applied`, 'info');
}

function toggleThemePanel() {
  const panel   = document.getElementById('themePanel');
  const trigger = document.getElementById('themeBtnTrigger');
  const isOpen  = panel.classList.contains('open');

  closeAllDropdowns();
  if (!isOpen) {
    const rect = trigger.getBoundingClientRect();
    panel.style.top   = (rect.bottom + 6) + 'px';
    panel.style.right = (window.innerWidth - rect.right) + 'px';
    panel.style.left  = 'auto';
    panel.classList.add('open');
  }
}


// ── CLICK OUTSIDE to close dropdowns ──────────────────────
document.addEventListener('click', function(e) {
  const langWrap   = document.getElementById('langSelectorWrap');
  const themeWrap  = document.getElementById('themeSwitcher');
  const langDD     = document.getElementById('langDropdown');
  const themePanel = document.getElementById('themePanel');

  // If click is outside lang selector, close lang dropdown
  if (langDD?.classList.contains('open') && langWrap && !langWrap.contains(e.target) && !langDD.contains(e.target)) {
    document.getElementById('langDropdown')?.classList.remove('open');
    document.getElementById('langTrigger')?.classList.remove('open');
  }
  // If click is outside theme switcher, close theme panel
  if (themePanel?.classList.contains('open') && themeWrap && !themeWrap.contains(e.target) && !themePanel.contains(e.target)) {
    themePanel.classList.remove('open');
  }
}, true); // useCapture=true so it fires before stopPropagation

function closeAllDropdowns() {
  document.getElementById('langDropdown')?.classList.remove('open');
  document.getElementById('langTrigger')?.classList.remove('open');
  document.getElementById('themePanel')?.classList.remove('open');
}

// ── PDF EXPORT ──────────────────────────────────────────────
function exportPDF() {
  // Pre-fill title with current lang
  const cfg = LANG_CONFIG[currentLang];
  const titleEl = document.getElementById('pdfTitle');
  if (titleEl && !titleEl.value) {
    titleEl.value = `${cfg.label} Solution — StudyBuddy`;
  }
  document.getElementById('pdfModalOverlay').classList.add('open');
}

function closePDFModal() {
  document.getElementById('pdfModalOverlay').classList.remove('open');
}

function generatePDF() {
  const title      = document.getElementById('pdfTitle').value || 'My Solution';
  const author     = document.getElementById('pdfAuthor').value || 'StudyBuddy Student';
  const notes      = document.getElementById('pdfNotes').value;
  const inclOutput = document.getElementById('pdfIncludeOutput').checked;
  const inclAI     = document.getElementById('pdfIncludeAI').checked;
  const code       = monacoEditor ? monacoEditor.getValue() : '';
  const cfg        = LANG_CONFIG[currentLang];
  const outputText = document.getElementById('outputContent')?.textContent || '';
  const aiText     = inclAI ? (document.getElementById('aiContent')?.innerText || '') : '';
  const date       = new Date().toLocaleDateString('en-IN', { year:'numeric', month:'long', day:'numeric' });

  // Build printable HTML
  const printWin = window.open('', '_blank', 'width=900,height=700');
  if (!printWin) { showToast('Pop-up blocked — allow pop-ups and try again', 'error'); return; }

  printWin.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'DM Sans', sans-serif;
      background: #fff; color: #0f172a;
      padding: 40px 48px; max-width: 860px; margin: 0 auto;
      font-size: 13px; line-height: 1.7;
    }

    /* Header */
    .pdf-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      border-bottom: 3px solid #059669; padding-bottom: 18px; margin-bottom: 24px;
    }
    .pdf-brand { font-family: 'Syne', sans-serif; font-size: 0.75rem; font-weight: 700;
      letter-spacing: 0.12em; color: #059669; text-transform: uppercase; margin-bottom: 6px; }
    .pdf-main-title { font-family: 'Syne', sans-serif; font-size: 1.55rem; font-weight: 800;
      color: #0f172a; line-height: 1.25; }
    .pdf-meta { text-align: right; font-size: 0.72rem; color: #64748b; line-height: 2; }
    .pdf-meta strong { color: #0f172a; }

    /* Lang badge */
    .lang-badge {
      display: inline-block; padding: 3px 10px; border-radius: 100px;
      background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0;
      font-size: 0.7rem; font-weight: 700; margin-bottom: 16px;
    }

    /* Section */
    .section { margin-bottom: 24px; }
    .section-title {
      font-family: 'Syne', sans-serif; font-size: 0.68rem; font-weight: 700;
      letter-spacing: 0.14em; text-transform: uppercase; color: #059669;
      margin-bottom: 10px; padding-bottom: 4px;
      border-bottom: 1px solid #d1fae5;
    }

    /* Notes */
    .notes-box {
      background: #f8fafc; border: 1px solid #e2e8f0; border-left: 3px solid #059669;
      border-radius: 6px; padding: 12px 16px;
      font-size: 0.82rem; color: #334155; line-height: 1.65;
      white-space: pre-wrap;
    }

    /* Code block */
    .code-block {
      background: #0f172a; border-radius: 10px; padding: 20px 22px;
      font-family: 'JetBrains Mono', monospace; font-size: 0.78rem;
      color: #e2e8f0; line-height: 1.75; white-space: pre-wrap;
      word-break: break-word; overflow: hidden;
      border: 1px solid #1e293b;
    }
    .code-block .kw  { color: #86efac; }
    .code-block .str { color: #fde68a; }
    .code-block .num { color: #7dd3fc; }
    .code-block .cmt { color: #4b5563; font-style: italic; }

    /* Output block */
    .output-block {
      background: #f0fdf4; border: 1px solid #a7f3d0; border-radius: 8px;
      padding: 14px 18px; font-family: 'JetBrains Mono', monospace;
      font-size: 0.78rem; color: #065f46; white-space: pre-wrap;
      word-break: break-word; line-height: 1.65;
    }
    .output-block.error-out {
      background: #fff5f5; border-color: #fca5a5; color: #991b1b;
    }

    /* AI block */
    .ai-block {
      background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px;
      padding: 14px 18px; font-size: 0.8rem; color: #78350f;
      white-space: pre-wrap; line-height: 1.65;
    }

    /* Footer */
    .pdf-footer {
      margin-top: 32px; padding-top: 14px; border-top: 1px solid #e2e8f0;
      font-size: 0.68rem; color: #94a3b8;
      display: flex; justify-content: space-between;
    }

    @media print {
      body { padding: 24px 32px; }
      @page { margin: 0.6in; size: A4; }
    }
  </style>
</head>
<body>

<div class="pdf-header">
  <div>
    <div class="pdf-brand">✦ StudyBuddy AI Code Lab</div>
    <div class="pdf-main-title">${escHtml(title)}</div>
  </div>
  <div class="pdf-meta">
    <div><strong>Author:</strong> ${escHtml(author)}</div>
    <div><strong>Language:</strong> ${cfg.label}</div>
    <div><strong>Date:</strong> ${date}</div>
  </div>
</div>

<span class="lang-badge">${cfg.icon} ${cfg.label} • ${cfg.filename}</span>

${notes ? `<div class="section">
  <div class="section-title">📝 Notes & Explanation</div>
  <div class="notes-box">${escHtml(notes)}</div>
</div>` : ''}

<div class="section">
  <div class="section-title">💻 Source Code</div>
  <div class="code-block">${syntaxHighlightPDF(escHtml(code), currentLang)}</div>
</div>

${inclOutput && outputText ? `<div class="section">
  <div class="section-title">⚡ Program Output</div>
  <div class="output-block">${escHtml(outputText)}</div>
</div>` : ''}

${inclAI && aiText ? `<div class="section">
  <div class="section-title">🤖 AI Insights</div>
  <div class="ai-block">${escHtml(aiText)}</div>
</div>` : ''}

<div class="pdf-footer">
  <span>Generated by StudyBuddy AI Code Lab</span>
  <span>${date}</span>
</div>

<script>window.onload = () => { window.print(); }<\/script>
</body></html>`);

  printWin.document.close();
  closePDFModal();
  showToast('PDF ready — print dialog opened!', 'success');
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function syntaxHighlightPDF(code, lang) {
  // Lightweight syntax highlighting for PDF — safe, no broken escape sequences
  const esc = s => s; // already escaped before calling this
  if (lang === 'javascript') {
    return code
      .replace(/\b(const|let|var|function|return|if|else|for|while|class|import|export|async|await|new|typeof|null|undefined|true|false)\b/g, '<span class="kw">$1</span>')
      .replace(/(\/\/[^\n]*)/g, '<span class="cmt">$1</span>')
      .replace(/(\b\d+\.?\d*\b)/g, '<span class="num">$1</span>');
  } else if (lang === 'python') {
    return code
      .replace(/\b(def|class|return|if|elif|else|for|while|import|from|as|with|lambda|pass|break|continue|print|True|False|None|in|not|and|or|is)\b/g, '<span class="kw">$1</span>')
      .replace(/(#[^\n]*)/g, '<span class="cmt">$1</span>')
      .replace(/(\b\d+\.?\d*\b)/g, '<span class="num">$1</span>');
  } else {
    return code
      .replace(/\b(int|char|void|return|if|else|for|while|include|define|using|namespace|std|cout|cin|printf|scanf|struct|typedef|auto|bool|float|double|long|short|unsigned|const|static|break|continue|endl|nullptr|new|delete)\b/g, '<span class="kw">$1</span>')
      .replace(/(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g, '<span class="cmt">$1</span>')
      .replace(/(\b\d+\.?\d*\b)/g, '<span class="num">$1</span>');
  }
}

// ── RESIZE HANDLE ──────────────────────────────────────────
function initResizeHandle() {
  const handle = document.getElementById('resizeHandle');
  const editor = document.getElementById('editorPane');
  const pane   = document.getElementById('splitPane');

  handle.addEventListener('mousedown', e => {
    resizing     = true;
    resizeStartX = e.clientX;
    editorStartW = editor.offsetWidth;
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', e => {
    if (!resizing) return;
    const dx        = e.clientX - resizeStartX;
    const totalW    = pane.offsetWidth;
    const newW      = Math.min(Math.max(editorStartW + dx, 280), totalW - 280);
    const pct       = (newW / totalW) * 100;
    editor.style.flex = `0 0 ${pct}%`;
    monacoEditor?.layout();
  });

  document.addEventListener('mouseup', () => {
    if (!resizing) return;
    resizing = false;
    handle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

// ── STDIN HELPERS ──────────────────────────────────────────
function toggleStdin() {
  const panel = document.getElementById('stdinPanel');
  panel.classList.toggle('collapsed');
  // Recalculate Monaco height after stdin panel expands/collapses
  updateMonacoHeight();
}

function updateMonacoHeight() {
  const editorEl  = document.getElementById('monacoEditor');
  const paneHeader = document.querySelector('.pane-header');
  const stdinPanel = document.getElementById('stdinPanel');
  if (!editorEl) return;
  const paneHeaderH = paneHeader ? paneHeader.offsetHeight : 44;
  const stdinH      = stdinPanel ? stdinPanel.offsetHeight : 0;
  editorEl.style.height = `calc(100% - ${paneHeaderH + stdinH}px)`;
  monacoEditor?.layout();
}

function clearStdin() {
  const ta = document.getElementById('stdinInput');
  if (ta) { ta.value = ''; updateStdinCount(); }
}

function updateStdinCount() {
  const ta    = document.getElementById('stdinInput');
  const count = document.getElementById('stdinCount');
  if (!ta || !count) return;
  const lines = ta.value.trim().split('\n').filter(l => l.trim()).length;
  if (lines > 0) {
    count.textContent = `${lines} line${lines > 1 ? 's' : ''}`;
    count.style.display = 'inline-flex';
  } else {
    count.style.display = 'none';
  }
}

// Detect if current code uses stdin-based input and highlight the panel
const STDIN_PATTERNS = {
  python:     /\binput\s*\(/,
  c:          /\bscanf\s*\(/,
  cpp:        /\bcin\s*>>/,
  javascript: /readline\s*\(|process\.stdin/
};

function detectStdinNeeded(code) {
  const panel   = document.getElementById('stdinPanel');
  const pattern = STDIN_PATTERNS[currentLang];
  const needs   = pattern && pattern.test(code);
  panel?.classList.toggle('needs-input', needs);
}

// Live line count update
document.addEventListener('DOMContentLoaded', () => {
  const ta = document.getElementById('stdinInput');
  ta?.addEventListener('input', updateStdinCount);
});

// ── UTILITIES (escHtml defined above) ────────────────────