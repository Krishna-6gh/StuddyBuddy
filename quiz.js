'use strict';

/* ============================================================
   StudyBuddy Quiz — v4 Fully Upgraded
   Features: Topic chips, 25Q option, exam mode, recent history,
   countdown animation, per-subject topic banks
   ============================================================ */

const API_KEY    = 'YOUR_API_KEY';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// ===== CONSTANTS =====
const PASS_THRESHOLD = 60;

// Per-subject topic bank (15 topics each)
const SUBJECT_TOPICS = {
  // Sciences
  'Physics': [
    'Mechanics','Kinematics','Newton\'s Laws','Work & Energy','Momentum',
    'Gravitation','Waves & Sound','Light & Optics','Thermodynamics','Electricity',
    'Magnetism','Electromagnetic Induction','Modern Physics','Nuclear Physics','Semiconductors'
  ],
  'Chemistry': [
    'Atomic Structure','Periodic Table','Chemical Bonding','States of Matter','Solutions',
    'Thermochemistry','Chemical Kinetics','Electrochemistry','Coordination Compounds','Hydrocarbons',
    'Alcohols & Ethers','Aldehydes & Ketones','Carboxylic Acids','Polymers','Biomolecules'
  ],
  'Biology': [
    'Cell Biology','Genetics','Evolution','Human Physiology','Plant Physiology',
    'Ecology','Reproduction','Biotechnology','Microorganisms','Immune System',
    'Nervous System','Digestive System','Endocrine System','Photosynthesis','Molecular Biology'
  ],
  'Mathematics': [
    'Algebra','Calculus','Trigonometry','Coordinate Geometry','Probability',
    'Statistics','Linear Algebra','Differential Equations','Number Theory','Set Theory',
    'Complex Numbers','Matrices & Determinants','Sequences & Series','Functions','Integration'
  ],
  // Computer Science
  'Computer Science': [
    'Data Structures','Algorithms','Operating Systems','Computer Networks','DBMS',
    'Object-Oriented Programming','Web Development','Software Engineering','Computer Architecture','Cryptography',
    'Machine Learning Basics','Cloud Computing','Compiler Design','Theory of Computation','Discrete Mathematics'
  ],
  'Data Structures': [
    'Arrays','Linked Lists','Stacks','Queues','Trees',
    'Binary Search Trees','Heaps','Graphs','Hash Tables','Sorting Algorithms',
    'Searching Algorithms','Dynamic Programming','Greedy Algorithms','Recursion','Complexity Analysis'
  ],
  'Programming': [
    'Variables & Data Types','Control Structures','Functions','Arrays & Strings','Pointers',
    'OOP Concepts','File Handling','Exception Handling','Recursion','Memory Management',
    'Sorting Techniques','Search Algorithms','Libraries & APIs','Debugging','Design Patterns'
  ],
  'Artificial Intelligence': [
    'Search Algorithms','Knowledge Representation','Machine Learning','Neural Networks','Deep Learning',
    'Natural Language Processing','Computer Vision','Expert Systems','Fuzzy Logic','Genetic Algorithms',
    'Reinforcement Learning','Bayesian Networks','Problem Solving','Planning','Robotics'
  ],
  // Engineering
  'Engineering Mathematics': [
    'Linear Algebra','Calculus','Differential Equations','Complex Analysis','Probability & Statistics',
    'Fourier Series','Laplace Transform','Numerical Methods','Graph Theory','Discrete Mathematics',
    'Vector Calculus','Partial Differential Equations','Z-Transform','Boolean Algebra','Group Theory'
  ],
  'Electronics': [
    'Semiconductor Devices','Diodes','Transistors','Amplifiers','Oscillators',
    'Digital Logic','Combinational Circuits','Sequential Circuits','Operational Amplifiers','Signal Processing',
    'Communication Systems','Microprocessors','Embedded Systems','Control Systems','Power Electronics'
  ],
  'Mechanical Engineering': [
    'Thermodynamics','Fluid Mechanics','Strength of Materials','Machine Design','Manufacturing Processes',
    'Dynamics','Kinematics of Machines','Heat Transfer','Refrigeration','CAD/CAM',
    'Theory of Machines','Industrial Engineering','Metrology','Engineering Materials','Robotics'
  ],
  // Management & Commerce
  'Economics': [
    'Microeconomics','Macroeconomics','Supply & Demand','Market Structures','GDP & National Income',
    'Inflation','Monetary Policy','Fiscal Policy','International Trade','Development Economics',
    'Game Theory','Elasticity','Cost Theory','Factor Markets','Environmental Economics'
  ],
  'Management': [
    'Principles of Management','Organizational Behavior','Marketing Management','Financial Management','HR Management',
    'Operations Management','Strategic Management','Business Ethics','Entrepreneurship','Supply Chain Management',
    'Project Management','Leadership','Motivation Theories','Decision Making','Corporate Governance'
  ],
  'Accounts': [
    'Financial Accounting','Management Accounting','Cost Accounting','Balance Sheet','Income Statement',
    'Journal & Ledger','Depreciation','Inventory Valuation','Ratio Analysis','Cash Flow Statement',
    'Partnership Accounts','Company Accounts','Auditing','Taxation','Banking Transactions'
  ],
  // Humanities
  'History': [
    'Ancient Civilizations','Medieval Period','Industrial Revolution','World War I','World War II',
    'Cold War','Indian Independence','Colonial Era','Renaissance','French Revolution',
    'Russian Revolution','Political History','Economic History','Cultural History','Modern Era'
  ],
  'Geography': [
    'Physical Geography','Human Geography','Climate & Weather','Geomorphology','Oceanography',
    'Population Geography','Urban Geography','Agriculture','Resources','Environmental Geography',
    'Cartography','Indian Geography','World Geography','Economic Geography','Biogeography'
  ],
  'English': [
    'Grammar','Vocabulary','Reading Comprehension','Essay Writing','Poetry Analysis',
    'Novel Study','Short Stories','Literary Devices','Prose Writing','Phonetics',
    'Sentence Structure','Tenses','Parts of Speech','Punctuation','Creative Writing'
  ],
  // Default fallback
  '_default': [
    'Introduction','Fundamentals','Core Concepts','Applications','Problem Solving',
    'Advanced Topics','Case Studies','Analysis','Evaluation','Synthesis',
    'Historical Overview','Comparative Study','Modern Developments','Research Methods','Practical Aspects'
  ]
};

// ===== STATE =====
let questions      = [];
let currentQ       = 0;
let score          = 0;
let answered       = false;
let qTimerInt      = null;
let qTimeLeft      = 30;
let sessionStart   = null;
let wrongTopics    = [];
let quizMeta       = {};
let currentMode    = 'quiz'; // 'quiz' | 'exam'
let selectedTopics = [];     // chip-selected topics
let examDurationMins = 60;
let examTimerInt   = null;
let examTimeLeft   = 3600;   // seconds

const $ = id => document.getElementById(id);

// ============================================================
// INIT
// ============================================================
(function init() {
  loadSubjects();
  $('quizSubject').addEventListener('change', () => {
    loadTopicChips($('quizSubject').value);
  });
  $('examSubject').addEventListener('change', () => {});
})();

// ============================================================
// LOAD SUBJECTS
// ============================================================
function loadSubjects() {
  let user = null;
  try {
    user = JSON.parse(localStorage.getItem('sb_current_user'))
        || JSON.parse(localStorage.getItem('sb_user_profile'))
        || JSON.parse(localStorage.getItem('user'));
  } catch (e) {}

  let subjects = [];
  if (user) {
    if (Array.isArray(user.subjects) && user.subjects.length > 0) {
      subjects = user.subjects;
    } else if (Array.isArray(user.courses) && user.courses.length > 0) {
      subjects = user.courses.map(c => (typeof c === 'string' ? c : c.name));
    }
  }

  // Demo fallback so the UI is always usable
  if (subjects.length === 0) {
    subjects = ['Mathematics', 'Physics', 'Chemistry', 'Computer Science', 'English'];
  }

  const selects = [$('quizSubject'), $('examSubject')];
  selects.forEach(sel => {
    if (!sel) return;
    sel.innerHTML = '';
    subjects.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      sel.appendChild(opt);
    });
  });

  loadTopicChips(subjects[0]);
}

// ============================================================
// LOAD TOPIC CHIPS — fills chip grid for selected subject
// ============================================================
function loadTopicChips(subjectName) {
  selectedTopics = [];
  const container = $('topicChipsContainer');
  if (!container) return;

  // Match subject name (case-insensitive partial match)
  let topics = null;
  const name = (subjectName || '').toLowerCase();

  for (const [key, val] of Object.entries(SUBJECT_TOPICS)) {
    if (key.toLowerCase() === name || name.includes(key.toLowerCase()) || key.toLowerCase().includes(name)) {
      topics = val;
      break;
    }
  }
  if (!topics) topics = SUBJECT_TOPICS['_default'];

  container.innerHTML = topics.map(t => `
    <span class="topic-chip" data-topic="${escapeHtml(t)}" onclick="toggleTopicChip(this)">
      ${escapeHtml(t)}
    </span>
  `).join('');

  updateChipHint();
}

function toggleTopicChip(el) {
  const topic = el.getAttribute('data-topic');
  if (el.classList.contains('selected')) {
    el.classList.remove('selected');
    selectedTopics = selectedTopics.filter(t => t !== topic);
  } else {
    el.classList.add('selected');
    selectedTopics.push(topic);
  }
  updateChipHint();
}

function updateChipHint() {
  const hint = $('chipHint');
  if (!hint) return;
  if (selectedTopics.length === 0) {
    hint.textContent = 'Tip: Select topics to focus your quiz, or leave unselected for a random mix.';
  } else {
    hint.textContent = `✓ ${selectedTopics.length} topic${selectedTopics.length > 1 ? 's' : ''} selected.`;
    hint.style.color = 'var(--primary)';
  }
}

// ============================================================
// MODE SWITCHER
// ============================================================
function switchMode(mode) {
  currentMode = mode;

  ['quiz','exam','recent'].forEach(m => {
    $(`tab-${m}`).classList.toggle('active', m === mode);
    $(`tab-${m}`).setAttribute('aria-selected', m === mode);
  });

  $('quizConfigPanel').classList.toggle('hidden', mode !== 'quiz');
  $('examConfigPanel').classList.toggle('hidden', mode !== 'exam');
  $('recentPanel').classList.toggle('hidden', mode !== 'recent');

  if (mode === 'recent') renderRecentHistory();
}

// ============================================================
// EXAM DURATION SELECTOR
// ============================================================
function selectDuration(btn) {
  document.querySelectorAll('.exam-duration-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  examDurationMins = parseInt(btn.getAttribute('data-mins'));
}

// ============================================================
// SCREENS
// ============================================================
const SCREENS = ['configScreen','loadingScreen','quizScreen','resultsScreen','examResultsScreen'];

function showScreen(id) {
  SCREENS.forEach(s => {
    const el = $(s);
    if (el) el.classList.toggle('hidden', s !== id);
  });
}

// ============================================================
// COUNTDOWN ANIMATION
// ============================================================
function showCountdown(subject, callback) {
  const overlay = $('startOverlay');
  const cd       = $('startCountdown');
  const lbl      = $('startLabel');
  const stag     = $('startSubjectTag');

  overlay.classList.remove('hidden');
  stag.textContent = subject;

  let count = 3;
  cd.textContent = count;
  lbl.textContent = 'Get ready…';

  const iv = setInterval(() => {
    count--;
    if (count > 0) {
      cd.textContent = count;
      cd.style.animation = 'none';
      requestAnimationFrame(() => { cd.style.animation = 'countPop 0.8s ease'; });
    } else {
      clearInterval(iv);
      cd.textContent = '🚀';
      lbl.textContent = "Let's GO!";
      setTimeout(() => {
        overlay.classList.add('hidden');
        callback();
      }, 700);
    }
  }, 900);
}

// ============================================================
// GENERATE QUIZ
// ============================================================
async function generateQuiz() {
  const subjectName = $('quizSubject').value;
  const difficulty  = $('quizDifficulty').value;
  const count       = parseInt($('quizCount').value);
  const timerSecs   = parseInt($('quizTimer').value);

  if (!subjectName || subjectName.includes('⚠')) {
    showError('Please select a valid subject first.');
    return;
  }

  const topicLabel = selectedTopics.length > 0
    ? selectedTopics.join(', ')
    : 'All Topics (Random Mix)';

  quizMeta = { subject: subjectName, difficulty, count, topic: topicLabel, timerSecs, mode: 'quiz' };

  $('errorMsg').style.display = 'none';

  // Update quiz screen meta
  $('qSubjectTag').textContent = subjectName;
  $('qDiffTag').textContent    = capitalise(difficulty);
  $('qTopicTag').textContent   = selectedTopics.length > 0 ? selectedTopics[0] + (selectedTopics.length > 1 ? ` +${selectedTopics.length - 1}` : '') : 'Random';
  $('totalQ').textContent      = count;

  const topicInstruction = selectedTopics.length > 0
    ? `focused on these specific topics: ${selectedTopics.join(', ')}`
    : '(random mix of topics)';

  const prompt = buildPrompt(subjectName, topicInstruction, difficulty, count);

  await fetchAndStartQuiz(prompt, timerSecs, 'quiz', subjectName);
}

// ============================================================
// GENERATE EXAM
// ============================================================
async function generateExam() {
  const subjectName = $('examSubject').value;
  const difficulty  = $('examDifficulty').value;
  const examName    = $('examName').value.trim() || `${subjectName} Exam`;

  if (!subjectName || subjectName.includes('⚠')) {
    $('examErrorMsg').textContent = 'Please select a valid subject.';
    $('examErrorMsg').style.display = 'block';
    return;
  }

  $('examErrorMsg').style.display = 'none';

  quizMeta = {
    subject: subjectName, difficulty, count: 25,
    topic: 'All Topics', timerSecs: 0, mode: 'exam',
    examName, durationMins: examDurationMins
  };

  $('qSubjectTag').textContent = subjectName;
  $('qDiffTag').textContent    = capitalise(difficulty);
  $('qTopicTag').textContent   = 'Full Exam';
  $('totalQ').textContent      = 25;

  const prompt = buildPrompt(subjectName, '(cover all major topics comprehensively)', difficulty, 25);
  await fetchAndStartQuiz(prompt, 0, 'exam', subjectName);
}

function buildPrompt(subject, topicInstruction, difficulty, count) {
  return `You are a university-level quiz generator. Generate exactly ${count} multiple-choice questions for the subject "${subject}" ${topicInstruction} at ${difficulty} difficulty level.

STRICT RULES:
- Return ONLY a valid JSON array. No explanation, no markdown, no extra text.
- Each object must have exactly these keys:
  {
    "question": "Full question text",
    "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
    "correct": <0-based index 0-3>,
    "explanation": "Brief explanation (1-2 sentences)",
    "topic": "Specific sub-topic covered"
  }
- Make questions factually accurate and academically rigorous.
- Vary question types: definition, application, reasoning, problem-solving.
- Distractors must be plausible but clearly wrong.
- Ensure good topic variety across questions.`;
}

// ============================================================
// FETCH AND START
// ============================================================
async function fetchAndStartQuiz(prompt, timerSecs, mode, subjectName) {
  showScreen('loadingScreen');
  $('loadingText').textContent = mode === 'exam'
    ? `Preparing your ${subjectName} exam…`
    : `Cooking up your ${subjectName} quiz…`;
  $('loadingSub').textContent = 'Powered by GROQ AI ✦ Hold tight';

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: 4000,
        temperature: 0.7,
        messages: [
          { role: 'system', content: 'You are a university-level quiz generator. You ONLY output raw valid JSON arrays — no markdown, no backticks, no explanation text whatsoever.' },
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody?.error?.message || `API error: ${res.status}`);
    }

    const data    = await res.json();
    const rawText = data.choices?.[0]?.message?.content || '';
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array in response');

    questions = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(questions) || questions.length === 0) throw new Error('Invalid questions format');

    questions = questions.map((q, i) => ({
      question:    q.question    || `Question ${i + 1}`,
      options:     Array.isArray(q.options) && q.options.length === 4 ? q.options : ['Option A', 'Option B', 'Option C', 'Option D'],
      correct:     typeof q.correct === 'number' && q.correct >= 0 && q.correct <= 3 ? q.correct : 0,
      explanation: q.explanation || '',
      topic:       q.topic       || quizMeta.topic
    }));

    currentQ     = 0;
    score        = 0;
    wrongTopics  = [];
    sessionStart = Date.now();
    answered     = false;

    // Show countdown then start
    showCountdown(subjectName, () => {
      showScreen('quizScreen');

      if (mode === 'exam') {
        // Show exam timer, hide per-question timer
        $('examBigTimer').classList.remove('hidden');
        $('qTimerBadge').style.display = 'none';
        startExamTimer();
      } else {
        $('examBigTimer').classList.add('hidden');
        $('qTimerBadge').style.display = '';
      }

      renderQuestion();
    });

  } catch (err) {
    console.error('Quiz generation failed:', err);
    showScreen('configScreen');
    if (mode === 'exam') {
      $('examErrorMsg').textContent = 'Failed to generate exam. Check connection and try again.';
      $('examErrorMsg').style.display = 'block';
    } else {
      showError('Failed to generate quiz. Check your API key and try again.');
    }
  }
}

// ============================================================
// EXAM TIMER
// ============================================================
function startExamTimer() {
  examTimeLeft = examDurationMins * 60;
  updateExamTimerDisplay();
  examTimerInt = setInterval(() => {
    examTimeLeft--;
    updateExamTimerDisplay();
    if (examTimeLeft <= 0) {
      clearInterval(examTimerInt);
      showExamResults(true); // time expired
    }
  }, 1000);
}

function stopExamTimer() {
  clearInterval(examTimerInt);
  examTimerInt = null;
}

function updateExamTimerDisplay() {
  const el = $('examBigTimer');
  if (!el) return;
  const m = Math.floor(examTimeLeft / 60);
  const s = examTimeLeft % 60;
  el.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

  el.classList.remove('warning','danger');
  if (examTimeLeft <= 300 && examTimeLeft > 60) el.classList.add('warning');
  else if (examTimeLeft <= 60) el.classList.add('danger');
}

// ============================================================
// RENDER QUESTION
// ============================================================
function renderQuestion() {
  if (currentQ >= questions.length) {
    if (quizMeta.mode === 'exam') showExamResults(false);
    else showResults();
    return;
  }

  answered = false;
  const q  = questions[currentQ];

  const progressPct = (currentQ / questions.length) * 100;
  $('qCounter').innerHTML = `Q<span class="hi">${currentQ + 1}</span> of <span class="hi">${questions.length}</span>`;

  const pf = $('progressFill');
  pf.style.width = `${progressPct}%`;
  pf.closest('.progress-track')?.setAttribute('aria-valuenow', Math.round(progressPct));

  $('qTopicTag').textContent = q.topic || quizMeta.topic;
  $('qText').textContent     = q.question;

  const letters = ['A','B','C','D'];
  $('optionsGrid').innerHTML = q.options.map((opt, i) => `
    <button class="option-btn" id="opt-${i}" onclick="selectAnswer(${i})" aria-label="Option ${letters[i]}: ${escapeHtml(opt)}">
      <span class="opt-letter">${letters[i]}</span>
      ${escapeHtml(opt)}
    </button>
  `).join('');

  const fb = $('feedbackPanel');
  fb.className     = 'feedback-panel';
  fb.style.display = 'none';
  fb.innerHTML     = '';

  const nb = $('nextBtn');
  nb.classList.remove('show');
  nb.textContent = currentQ === questions.length - 1 ? 'See Results →' : 'Next Question →';

  $('scoreVal').textContent = score;

  // Start per-question timer only in quiz mode
  if (quizMeta.mode !== 'exam') startQTimer();
}

// ============================================================
// PER-QUESTION TIMER
// ============================================================
function startQTimer() {
  stopQTimer();
  qTimeLeft = quizMeta.timerSecs || 30;
  updateTimerDisplay();
  qTimerInt = setInterval(() => {
    qTimeLeft--;
    updateTimerDisplay();
    if (qTimeLeft <= 0) { stopQTimer(); handleTimeUp(); }
  }, 1000);
}

function stopQTimer() {
  clearInterval(qTimerInt);
  qTimerInt = null;
}

function updateTimerDisplay() {
  const badge = $('qTimerBadge');
  const total = quizMeta.timerSecs || 30;
  const m = Math.floor(qTimeLeft / 60);
  const s = qTimeLeft % 60;
  $('timerText').textContent = `${m}:${String(s).padStart(2,'0')}`;
  badge.classList.remove('warning','danger');
  if (qTimeLeft <= Math.floor(total * 0.33) && qTimeLeft > Math.floor(total * 0.17)) badge.classList.add('warning');
  else if (qTimeLeft <= Math.floor(total * 0.17)) badge.classList.add('danger');
}

// ============================================================
// TIME'S UP
// ============================================================
function handleTimeUp() {
  if (answered) return;
  answered = true;
  const q = questions[currentQ];
  wrongTopics.push(q.topic || quizMeta.topic);

  const card = $('questionCard');
  card.classList.add('shake');
  setTimeout(() => card.classList.remove('shake'), 450);

  disableAllOptions();
  revealAnswer(q.correct, -1);
  showFeedback(false, q, true);
  $('scoreVal').textContent = score;
  $('nextBtn').classList.add('show');
}

// ============================================================
// SELECT ANSWER
// ============================================================
function selectAnswer(idx) {
  if (answered) return;
  answered = true;
  stopQTimer();

  if (navigator.vibrate) navigator.vibrate(40);

  const q       = questions[currentQ];
  const correct = idx === q.correct;

  if (correct) score++;
  else wrongTopics.push(q.topic || quizMeta.topic);

  disableAllOptions();
  revealAnswer(q.correct, idx);

  const card = $('questionCard');
  card.classList.add(correct ? 'correct-flash' : 'wrong-flash');
  setTimeout(() => card.classList.remove('correct-flash','wrong-flash'), 1000);

  showFeedback(correct, q, false);
  $('scoreVal').textContent = score;
  $('nextBtn').classList.add('show');
}

function disableAllOptions() {
  document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
}

function revealAnswer(correctIdx, userIdx) {
  const cb = document.querySelector(`#opt-${correctIdx}`);
  if (cb) cb.classList.add('correct');

  if (userIdx >= 0 && userIdx !== correctIdx) {
    const wb = document.querySelector(`#opt-${userIdx}`);
    if (wb) wb.classList.add('wrong');
  }

  document.querySelectorAll('.option-btn').forEach((b, i) => {
    if (i !== correctIdx && i !== userIdx) b.style.opacity = '0.42';
  });
}

function showFeedback(correct, q, timedOut) {
  const fb = $('feedbackPanel');
  fb.style.display = 'block';
  const letters = ['A','B','C','D'];

  if (timedOut) {
    fb.className = 'feedback-panel wrong';
    fb.innerHTML = `⏰ <strong>Time's up!</strong> Correct: <strong>${letters[q.correct]}. ${escapeHtml(q.options[q.correct])}</strong>${q.explanation ? `<br><span style="opacity:0.8;font-size:0.84em">${escapeHtml(q.explanation)}</span>` : ''}`;
  } else if (correct) {
    fb.className = 'feedback-panel correct';
    fb.innerHTML = `✅ <strong>Correct!</strong>${q.explanation ? ` ${escapeHtml(q.explanation)}` : ''}`;
  } else {
    fb.className = 'feedback-panel wrong';
    fb.innerHTML = `❌ <strong>Wrong.</strong> Correct: <strong>${letters[q.correct]}. ${escapeHtml(q.options[q.correct])}</strong>${q.explanation ? `<br><span style="opacity:0.8;font-size:0.84em">${escapeHtml(q.explanation)}</span>` : ''}`;
  }
}

// ============================================================
// NEXT QUESTION
// ============================================================
function nextQuestion() {
  const card = $('questionCard');
  card.classList.add('fade-out');
  setTimeout(() => {
    currentQ++;
    if (currentQ >= questions.length) {
      if (quizMeta.mode === 'exam') { stopExamTimer(); showExamResults(false); }
      else showResults();
    } else {
      renderQuestion();
      card.classList.remove('fade-out');
      card.classList.add('fade-in');
      setTimeout(() => card.classList.remove('fade-in'), 350);
    }
  }, 250);
}

// ============================================================
// SHOW QUIZ RESULTS
// ============================================================
function showResults() {
  stopQTimer();
  showScreen('resultsScreen');

  const total   = questions.length;
  const pct     = Math.round((score / total) * 100);
  const passed  = pct >= PASS_THRESHOLD;
  const elapsed = Math.round((Date.now() - sessionStart) / 1000);

  const card = $('resultsCard');
  card.classList.toggle('pass', passed);
  card.classList.toggle('fail', !passed);

  $('resultEmoji').textContent     = passed ? (pct === 100 ? '🏆' : '🎉') : '😬';
  const hl = $('resultHeadline');
  hl.textContent = passed ? 'PASSED!' : 'FAILED';
  hl.className   = `result-headline ${passed ? 'pass' : 'fail'}`;

  const bs = $('resultBigScore');
  bs.className = `result-big-score ${passed ? 'pass' : 'fail'}`;
  animateCount('resultBigScore', pct, '%');

  $('resultTagline').textContent   = getTagline(pct);
  $('statCorrect').textContent     = score;
  $('statWrong').textContent       = total - score;
  $('statPct').textContent         = pct + '%';

  const uniqueWeak = [...new Set(wrongTopics)];
  if (uniqueWeak.length > 0) {
    $('weakSection').style.display = 'block';
    $('weakTags').innerHTML = uniqueWeak.map(t => `<span class="weak-tag">📚 ${escapeHtml(t)}</span>`).join('');
  } else {
    $('weakSection').style.display = 'none';
  }

  saveQuizToHistory(pct, passed, elapsed, uniqueWeak, 'quiz');
  updateAnalytics(pct, uniqueWeak);
  if (passed) launchConfetti();
}

// ============================================================
// SHOW EXAM RESULTS
// ============================================================
function showExamResults(timeExpired) {
  stopExamTimer();
  stopQTimer();
  showScreen('examResultsScreen');

  const total    = questions.length;
  const pct      = Math.round((score / total) * 100);
  const elapsed  = quizMeta.durationMins * 60 - examTimeLeft; // seconds used
  const elapsedMins = Math.floor(elapsed / 60);

  $('examNameDisplay').textContent = quizMeta.examName || `${quizMeta.subject} Exam`;

  // Animate big score
  const sd = $('examScoreDisplay');
  sd.textContent = '0%';
  setTimeout(() => animateCount('examScoreDisplay', pct, '%'), 300);

  // Time used
  const mm = Math.floor(elapsed / 60);
  const ss = elapsed % 60;
  $('examTimeUsed').textContent = timeExpired
    ? `⏰ Time expired — ${quizMeta.durationMins} minutes used`
    : `⏱ Completed in ${mm}m ${String(ss).padStart(2,'0')}s`;

  // Prep level bars
  const levels = [
    { label: 'Novice',       min: 0,  max: 20,  color: '#ef4444' },
    { label: 'Beginner',     min: 20, max: 40,  color: '#f59e0b' },
    { label: 'Developing',   min: 40, max: 60,  color: '#eab308' },
    { label: 'Proficient',   min: 60, max: 75,  color: '#06b6d4' },
    { label: 'Advanced',     min: 75, max: 90,  color: '#8b5cf6' },
    { label: 'Expert',       min: 90, max: 101, color: '#10b981' }
  ];

  const track = $('prepLevelsTrack');
  track.innerHTML = levels.map((l, i) => {
    const height = 20 + i * 13;
    const active = pct >= l.min && pct < l.max;
    return `<div class="prep-level-bar${active ? ' active' : ''}"
      data-label="${l.label}"
      style="height:${height}%;background:${active ? l.color : 'var(--border-soft)'};
      ${active ? `box-shadow:0 0 16px ${l.color}66;` : ''}">
    </div>`;
  }).join('');

  const currentLevel = levels.find(l => pct >= l.min && pct < l.max) || levels[levels.length - 1];
  const levelMessages = {
    'Novice':      ['📖 Just Starting', 'Review the basics thoroughly before attempting another exam.'],
    'Beginner':    ['📚 Building Up', 'You understand some concepts. More practice will help solidify them.'],
    'Developing':  ['⚡ Getting There', 'You\'re on the right track. Focus on your weak areas.'],
    'Proficient':  ['✅ Well Prepared', 'Good preparation level. Review weak topics for a better score.'],
    'Advanced':    ['🔥 Strongly Prepared', 'Excellent preparation! A little more polish and you\'re exam-ready.'],
    'Expert':      ['🏆 Exam Ready!', 'Outstanding! You are thoroughly prepared for this exam.']
  };

  const [badge, sub] = levelMessages[currentLevel.label] || ['Good', 'Keep studying!'];
  $('prepLevelBadge').textContent  = badge;
  $('prepLevelBadge').style.color  = currentLevel.color;
  $('prepLevelSub').textContent    = sub;

  setTimeout(() => {
    $('prepBarFill').style.width   = pct + '%';
    $('prepBarPct').textContent    = pct + '%';
  }, 400);

  $('pmCorrect').textContent = score;
  $('pmWrong').textContent   = total - score;
  $('pmTime').textContent    = elapsedMins + 'm';

  const uniqueWeak = [...new Set(wrongTopics)];
  if (uniqueWeak.length > 0) {
    $('examWeakSection').style.display = 'block';
    $('examWeakTags').innerHTML = uniqueWeak.map(t => `<span class="weak-tag">📚 ${escapeHtml(t)}</span>`).join('');
  }

  saveQuizToHistory(pct, pct >= PASS_THRESHOLD, elapsed, uniqueWeak, 'exam');
  updateAnalytics(pct, uniqueWeak);
  if (pct >= 80) launchConfetti();
}

// ============================================================
// SAVE TO HISTORY
// ============================================================
function saveQuizToHistory(pct, passed, elapsed, weakTopics, type) {
  const entry = {
    id:         Date.now(),
    date:       new Date().toISOString(),
    type:       type || 'quiz',
    subject:    quizMeta.subject,
    topic:      quizMeta.topic,
    examName:   quizMeta.examName || null,
    difficulty: quizMeta.difficulty,
    count:      questions.length,
    correct:    score,
    wrong:      questions.length - score,
    score:      pct,
    pct:        pct,
    passed:     passed,
    elapsed:    elapsed,
    weakTopics: weakTopics
  };

  let history = [];
  try { history = JSON.parse(localStorage.getItem('sb_quiz_history')) || []; } catch (e) {}
  history.unshift(entry);
  if (history.length > 100) history = history.slice(0, 100);
  localStorage.setItem('sb_quiz_history', JSON.stringify(history));
  localStorage.setItem('myQuizzes', JSON.stringify(history));
}

// ============================================================
// UPDATE ANALYTICS
// ============================================================
function updateAnalytics(pct, weakTopics) {
  let weakArr = [];
  try { weakArr = JSON.parse(localStorage.getItem('sb_weak_areas')) || []; } catch (e) {}
  weakTopics.forEach(t => {
    const existing = weakArr.find(w => w.topic === t);
    if (existing) existing.count = (existing.count || 0) + 1;
    else weakArr.push({ topic: t, count: 1 });
  });
  weakArr.sort((a, b) => (b.count || 0) - (a.count || 0));
  localStorage.setItem('sb_weak_areas', JSON.stringify(weakArr));

  let subStats = {};
  try { subStats = JSON.parse(localStorage.getItem('sb_subject_stats')) || {}; } catch (e) {}
  const sub = quizMeta.subject;
  if (!subStats[sub]) subStats[sub] = { count: 0, totalScore: 0 };
  subStats[sub].count++;
  subStats[sub].totalScore += pct;
  localStorage.setItem('sb_subject_stats', JSON.stringify(subStats));
}

// ============================================================
// RECENT HISTORY RENDERER
// ============================================================
function renderRecentHistory() {
  const container = $('recentListContainer');
  let history = [];
  try { history = JSON.parse(localStorage.getItem('sb_quiz_history')) || []; } catch (e) {}

  if (history.length === 0) {
    container.innerHTML = `<div class="no-recent">No quizzes attempted yet.<br>Take your first quiz above! 🚀</div>`;
    return;
  }

  const items = history.slice(0, 20).map(item => {
    const date    = new Date(item.date);
    const dateStr = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const mins    = Math.floor((item.elapsed || 0) / 60);
    const secs    = (item.elapsed || 0) % 60;
    const elapsed = mins > 0 ? `${mins}m ${String(secs).padStart(2,'0')}s` : `${secs}s`;
    const pct     = item.pct || item.score || 0;
    const isExam  = item.type === 'exam';
    const scoreClass = isExam ? 'exam' : (item.passed ? 'pass' : 'fail');
    const label   = isExam ? item.examName || `${item.subject} Exam` : item.subject;
    const diff    = capitalise(item.difficulty || 'intermediate');

    return `
      <div class="recent-item">
        <div class="recent-score-circle ${scoreClass}">${pct}%</div>
        <div class="recent-meta">
          <div class="recent-subject">${escapeHtml(label)}</div>
          <div class="recent-detail">${isExam ? 'Exam' : item.subject} · ${item.count || '?'} Qs · ${diff} · ⏱ ${elapsed}</div>
          <div class="recent-detail">${item.correct || 0} correct / ${item.wrong || 0} wrong</div>
        </div>
        <div class="recent-badge">
          <div class="recent-time-tag">${dateStr}<br>${timeStr}</div>
          <span class="recent-type-tag ${isExam ? 'exam-tag' : 'quiz-tag'}">${isExam ? '📝 Exam' : '⚡ Quiz'}</span>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `<div class="recent-list">${items}</div>`;
}

// ============================================================
// RETRY & DASHBOARD
// ============================================================
function retryQuiz() {
  questions   = [];
  currentQ    = 0;
  score       = 0;
  wrongTopics = [];
  answered    = false;
  stopQTimer();
  stopExamTimer();
  $('examBigTimer').classList.add('hidden');
  $('qTimerBadge').style.display = '';
  showScreen('configScreen');
}

function goToDashboard() {
  window.location.href = 'index.html';
}

// ============================================================
// CONFETTI
// ============================================================
function launchConfetti() {
  const canvas = $('confettiCanvas');
  if (!canvas) return;
  canvas.style.display = 'block';
  const ctx = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  const COLORS = ['#8b5cf6','#06b6d4','#ec4899','#10b981','#f59e0b','#f1f5f9'];
  const pieces = Array.from({ length: 150 }, () => ({
    x: Math.random() * canvas.width, y: Math.random() * -canvas.height,
    w: Math.random() * 10 + 5, h: Math.random() * 5 + 3,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    rot: Math.random() * Math.PI * 2,
    vx: (Math.random() - 0.5) * 3, vy: Math.random() * 4 + 2,
    vr: (Math.random() - 0.5) * 0.15
  }));

  let frame, elapsed = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    elapsed++;
    pieces.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      if (p.y > canvas.height) { p.y = -20; p.x = Math.random() * canvas.width; }
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color;
      ctx.globalAlpha = elapsed > 120 ? Math.max(0, 1 - (elapsed - 120) / 60) : 1;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (elapsed < 180) { frame = requestAnimationFrame(draw); }
    else { ctx.clearRect(0, 0, canvas.width, canvas.height); canvas.style.display = 'none'; cancelAnimationFrame(frame); }
  }
  frame = requestAnimationFrame(draw);
}

// ============================================================
// HELPERS
// ============================================================
function animateCount(id, finalVal, suffix = '') {
  let current = 0;
  const el    = $(id);
  const step  = Math.max(1, Math.floor(finalVal / 40));
  const iv    = setInterval(() => {
    current = Math.min(current + step, finalVal);
    el.textContent = current + suffix;
    if (current >= finalVal) clearInterval(iv);
  }, 18);
}

function getTagline(pct) {
  if (pct === 100) return '🏆 Perfect score! Absolutely cooked it. Legendary stuff.';
  if (pct >= 90)   return '🔥 Almost flawless. You clearly did the readings.';
  if (pct >= 75)   return '⚡ Solid performance. Your notes are doing their job.';
  if (pct >= 60)   return '✅ You passed! Room to grow, but you made the cut.';
  if (pct >= 40)   return '📚 Not quite there. Hit those weak topics and try again.';
  return '😬 Rough one. But knowing your gaps is the first step — go review!';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function capitalise(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function showError(msg) {
  const el = $('errorMsg');
  el.textContent   = msg;
  el.style.display = 'block';
}