// ============================================================
//  StudyBuddy — app.js  (FIXED & CLEANED)
//  Fixes:
//  1. Removed duplicate sendMessage / addMessage / generateAIReply
//  2. Chatbot now reads sb_current_user (matches registration.html)
//  3. Dashboard profile loaded from sb_current_user correctly
//  4. Safe notePad initialisation (only if element exists)
//  5. Single clean chatbot with Groq API + smart fallback
// ============================================================

// ===== THEME (Light/Dark/Auto) + Accent =====
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function normalizeHex(hex) {
  const h = (hex || '').trim().replace('#', '');
  if (/^[0-9a-fA-F]{3}$/.test(h)) return '#' + h.split('').map(c => c + c).join('').toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(h)) return '#' + h.toLowerCase();
  return '';
}
function hexToRgb(hex) {
  const h = normalizeHex(hex).replace('#', '');
  if (!h) return null;
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function rgbToHex(r, g, b) {
  const to = (x) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}
function darkenHex(hex, amount01) {
  const rgb = hexToRgb(hex);
  if (!rgb) return '';
  const a = clamp(amount01, 0, 1);
  return rgbToHex(rgb.r * (1 - a), rgb.g * (1 - a), rgb.b * (1 - a));
}
function setAccent(hex) {
  const v = normalizeHex(hex);
  if (!v) return false;
  localStorage.setItem('accent', v);
  applyAccent();
  return true;
}
function applyAccent() {
  const accent = normalizeHex(localStorage.getItem('accent')) || '#059669';
  document.documentElement.style.setProperty('--primary', accent);
  document.documentElement.style.setProperty('--primary-dark', darkenHex(accent, 0.14) || accent);
  document.documentElement.style.setProperty('--primary-glow', `color-mix(in srgb, ${accent} 18%, transparent)`);
  document.documentElement.style.setProperty('--surface-border', `color-mix(in srgb, var(--text) 8%, transparent)`);
}
function getResolvedThemeFromMode(mode) {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}
function setColorMode(mode) {
  const m = mode === 'dark' || mode === 'auto' ? mode : 'light';
  localStorage.setItem('colorMode', m);
  applyColorMode();
}
function applyColorMode() {
  const mode = localStorage.getItem('colorMode') || 'light';
  const theme = getResolvedThemeFromMode(mode);
  document.documentElement.setAttribute('data-theme', theme);
  const autoBadge = document.getElementById('appearanceAutoBadge');
  if (autoBadge) autoBadge.style.display = mode === 'auto' ? 'inline-flex' : 'none';
}
function initTheme() {
  applyColorMode();
  applyAccent();
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if ((localStorage.getItem('colorMode') || 'light') === 'auto') applyColorMode();
    };
    try { mq.addEventListener('change', onChange); } catch (_) { mq.addListener(onChange); }
  }
}

// ===== CLOCK =====
setInterval(() => {
  const el = document.getElementById('clock');
  if (el) el.textContent = new Date().toLocaleTimeString();
}, 1000);

// ===== NOTES (safe init) =====
const notePad = document.getElementById('notePad');
if (notePad) {
  notePad.value = localStorage.getItem('notes_v2') || '';
  notePad.addEventListener('input', () => localStorage.setItem('notes_v2', notePad.value));
}

// ===== PROFILE — reads from registration data (sb_current_user) =====
function getUser() {
  // Priority: sb_current_user (set by registration) → sb_user → fallback
  return (
    JSON.parse(localStorage.getItem('sb_current_user') || 'null') ||
    JSON.parse(localStorage.getItem('sb_user') || 'null') ||
    { name: 'Student', email: '', roll: '' }
  );
}

function applyProfileData(){
  const user = getUser();
  const name  = user.name  || 'Student';
  const email = user.email || '';
  const roll  = user.roll  || '';

  const initials = name.split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || 'SB';
  const firstName = name.split(' ')[0];

  // Avatar / greeting
  const avatarEl = document.getElementById('profileAvatar');
  if (avatarEl) {
    const photo = user.profilePhoto || '';
    if (photo) {
      avatarEl.textContent = '';
      avatarEl.style.backgroundImage = `url("${photo}")`;
    } else {
      avatarEl.style.backgroundImage = '';
      avatarEl.textContent = initials;
    }
  }

  const shortEl = document.getElementById('profileNameShort');
  if (shortEl) shortEl.textContent = firstName;

  // Profile drawer
  const fullEl = document.getElementById('pdFullName');
  if (fullEl) fullEl.textContent = name;

  const emailEl = document.getElementById('pdEmail');
  if (emailEl) emailEl.textContent = email || roll;

  // Dashboard welcome text
  const welcomeEl = document.getElementById('welcomeName');
  if (welcomeEl) welcomeEl.textContent = firstName;

  // Dynamic hero badge — reads university + year from registration
  const heroBadge = document.getElementById('heroBadge');
  if (heroBadge) {
    const parts = [];
    if (user.university || user.school) parts.push(user.university || user.school);
    if (user.year) parts.push(user.year);
    else if (user.class) parts.push(`Class ${user.class}`);
    heroBadge.textContent = parts.length ? `✦ ${parts.join(' · ')}` : '✦ StudyBuddy';
  }

  // Dynamic profile dropdown role
  const pdRole = document.getElementById('pdRole');
  if (pdRole) {
    const rp = [];
    if (user.specialization || user.degree) rp.push(user.specialization || user.degree);
    if (user.year) rp.push(user.year);
    else if (user.stream) rp.push(user.stream);
    pdRole.textContent = rp.length ? `✦ ${rp.join(' · ')}` : '';
  }

  // Subject chips on dashboard
  const subjectsEl = document.getElementById('dashSubjects');
  if (subjectsEl && user.subjects && user.subjects.length) {
    subjectsEl.textContent = user.subjects.join(' · ');
  }

  // Academic info
  const levelEl = document.getElementById('dashLevel');
  if (levelEl) {
    const levelMap = { school: '🏫 School', ug: '🎓 Undergraduate', pg: '🔬 Postgraduate' };
    levelEl.textContent = levelMap[user.level] || '';
  }

  const uniEl = document.getElementById('dashUniversity');
  if (uniEl) uniEl.textContent = user.university || user.school || '';

  const degreeEl = document.getElementById('dashDegree');
  if (degreeEl) {
    const degText = [user.degree, user.specialization, user.year].filter(Boolean).join(' · ');
    degreeEl.textContent = degText || (user.class ? `Class ${user.class} ${user.stream || ''}` : '');
  }

  // Handle Teacher / Organization Mode
  const overlay = document.getElementById('comingSoonOverlay');
  if (overlay) {
    if (user.role === 'Teacher' || user.role === 'Organisation') {
      overlay.style.display = 'flex';
      document.body.classList.add('coming-soon-active');
      const roleName = document.getElementById('overlayRoleName');
      if(roleName) roleName.textContent = user.role === 'Teacher' ? 'Teachers' : 'Organizations';
    } else {
      overlay.style.display = 'none';
      document.body.classList.remove('coming-soon-active');
    }
  }
}

function seedDemoData() {
  if(!localStorage.getItem('sb_seeded_v2')) {
    const log = [];
    let d = new Date();
    for(let i=0; i<12; i++) {
      const iso = isoDateLocal(d);
      log.push({ date: iso, minutes: 45 + Math.floor(Math.random()*60) });
      d.setDate(d.getDate()-1);
    }
    localStorage.setItem('sb_study_log', JSON.stringify(log));
    localStorage.setItem('sb_seeded_v2', '1');
  }
}

function animateMetrics() {
  const animateValue = (id, start, end, duration) => {
    const obj = document.getElementById(id);
    if (!obj) return;
    let startTimestamp = null;
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = Math.floor(ease * (end - start) + start);
      obj.innerHTML = current.toLocaleString();
      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        obj.innerHTML = end.toLocaleString() + '+';
      }
    };
    window.requestAnimationFrame(step);
  };
  
  setTimeout(() => {
    animateValue('metricInstitutions', 0, 124, 2000);
    animateValue('metricStudents', 0, 50421, 2500);
    animateValue('metricReviews', 0, 10289, 2200);
  }, 500);
}

// ============================================================
//  QUIZ HISTORY RENDERING
//  Reads from 'sb_quiz_history' — written by both quiz.js and app.js showResults()
//  Looks for these IDs in dashboard.html:
//    #recentQuizzesContainer  → last 5 quizzes (dashboard "Recent" widget)
//    #myQuizzesContainer      → full history list (My Quizzes section)
//    #quizCountStat           → total quizzes done (hero stat)
//    #quizAvgStat             → average score (hero stat)
// ============================================================

function _fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
  } catch (_) { return ''; }
}

function _diffBadge(d) {
  const map = { beginner: '🌱 Beginner', intermediate: '⚡ Intermediate', advanced: '🔥 Advanced' };
  return map[d] || d || '';
}

function _scoreColor(pct) {
  if (pct >= 75) return '#059669';
  if (pct >= 50) return '#f59e0b';
  return '#f43f5e';
}

/**
 * Renders the last `limit` quizzes into #recentQuizzesContainer
 * (called on dashboard load and after every quiz attempt)
 */
function renderRecentQuizzes(limit = 5) {
  const container = document.getElementById('recentQuizzesContainer');
  if (!container) return;

  let history = [];
  try { history = JSON.parse(localStorage.getItem('sb_quiz_history') || '[]'); } catch (_) {}

  if (!history.length) {
    container.innerHTML = `
      <div style="text-align:center;padding:24px 0;color:var(--text-muted,#64748b)">
        <div style="font-size:2rem;margin-bottom:8px">🎯</div>
        <div style="font-size:.88rem">No quizzes yet — take your first one!</div>
      </div>`;
    return;
  }

  container.innerHTML = history.slice(0, limit).map(q => {
    const color  = _scoreColor(q.pct ?? q.score ?? 0);
    const passed = q.passed ?? ((q.pct ?? q.score ?? 0) >= 60);
    const badge  = passed
      ? `<span style="color:#059669;background:rgba(5,150,105,.1);padding:2px 8px;border-radius:20px;font-size:.72rem;font-weight:700;">✓ Passed</span>`
      : `<span style="color:#f43f5e;background:rgba(244,63,94,.1);padding:2px 8px;border-radius:20px;font-size:.72rem;font-weight:700;">✗ Failed</span>`;
    const weakHtml = (q.weakTopics || []).slice(0, 3).map(t =>
      `<span style="font-size:.7rem;background:rgba(245,158,11,.12);color:#92400e;padding:2px 7px;border-radius:10px;">${t}</span>`
    ).join('');
    return `
      <div style="display:flex;align-items:center;gap:14px;padding:12px 16px;border-radius:14px;background:var(--surface2,#f8fafc);border:1px solid var(--border,rgba(0,0,0,.07));margin-bottom:9px;transition:box-shadow .2s;">
        <div style="width:46px;height:46px;border-radius:12px;background:${color}22;display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-weight:800;font-size:1rem;color:${color};">${q.pct ?? q.score ?? 0}%</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:.88rem;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${q.subject || 'Quiz'}</div>
          <div style="font-size:.75rem;color:var(--muted,#64748b);margin-top:2px;">${_diffBadge(q.difficulty)} · ${_fmtDate(q.date)} ${badge}</div>
          ${weakHtml ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:5px;">${weakHtml}</div>` : ''}
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:.78rem;color:var(--muted,#64748b);">${q.correct ?? '—'}/${q.count ?? '—'}</div>
          <div style="font-size:.7rem;color:var(--muted,#64748b);">correct</div>
        </div>
      </div>`;
  }).join('');
}

/**
 * Renders ALL quiz history into #myQuizzesContainer with summary stats
 */
function renderMyQuizzes() {
  const container = document.getElementById('myQuizzesContainer');
  if (!container) return;

  let history = [];
  try { history = JSON.parse(localStorage.getItem('sb_quiz_history') || '[]'); } catch (_) {}

  // Update hero stat elements if they exist
  const countEl = document.getElementById('quizCountStat');
  const avgEl   = document.getElementById('quizAvgStat');
  if (countEl) countEl.textContent = history.length;
  if (avgEl && history.length) {
    const avg = Math.round(history.reduce((a, b) => a + (b.pct ?? b.score ?? 0), 0) / history.length);
    avgEl.textContent = avg + '%';
  } else if (avgEl) {
    avgEl.textContent = '—';
  }

  if (!history.length) {
    container.innerHTML = `
      <div style="text-align:center;padding:36px 0;color:var(--text-muted,#64748b)">
        <div style="font-size:2.5rem;margin-bottom:12px">📝</div>
        <div style="font-size:.95rem;font-weight:600;">No quizzes yet</div>
        <div style="font-size:.83rem;margin-top:6px;">Head to the Quiz section to test yourself!</div>
      </div>`;
    return;
  }

  // Group by subject for summary
  const subjectMap = {};
  history.forEach(q => {
    const s = q.subject || 'Other';
    if (!subjectMap[s]) subjectMap[s] = { count: 0, total: 0 };
    subjectMap[s].count++;
    subjectMap[s].total += (q.pct ?? q.score ?? 0);
  });

  const summaryHtml = Object.entries(subjectMap).map(([sub, { count, total }]) => {
    const avg   = Math.round(total / count);
    const color = _scoreColor(avg);
    return `
      <div style="display:inline-flex;align-items:center;gap:8px;padding:7px 14px;border-radius:20px;background:${color}18;border:1px solid ${color}30;margin:4px;">
        <span style="font-weight:700;font-size:.83rem;color:${color};">${sub}</span>
        <span style="font-size:.75rem;color:var(--muted,#64748b);">${count} quiz${count>1?'zes':''} · avg ${avg}%</span>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div style="margin-bottom:16px;padding:14px 16px;border-radius:14px;background:var(--primary-light,#d1fae5);border:1px solid var(--border,rgba(5,150,105,.15))">
      <div style="font-size:.78rem;font-weight:700;color:var(--primary-dark,#047857);margin-bottom:8px;letter-spacing:.04em;">📊 BY SUBJECT</div>
      <div>${summaryHtml}</div>
    </div>
    ${history.map((q, idx) => {
      const pct    = q.pct ?? q.score ?? 0;
      const color  = _scoreColor(pct);
      const passed = q.passed ?? (pct >= 60);
      const weakHtml = (q.weakTopics || []).slice(0, 4).map(t =>
        `<span style="font-size:.7rem;background:rgba(245,158,11,.12);color:#92400e;padding:2px 7px;border-radius:10px;margin:2px 2px 0 0;display:inline-block;">${t}</span>`
      ).join('');
      return `
        <div style="display:flex;align-items:flex-start;gap:14px;padding:13px 16px;border-radius:14px;background:var(--surface,#fff);border:1px solid var(--border,rgba(0,0,0,.07));margin-bottom:8px;">
          <div style="width:50px;height:50px;border-radius:13px;background:${color}18;display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-weight:800;font-size:1.05rem;color:${color};flex-shrink:0">${pct}%</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="font-weight:700;font-size:.9rem;color:var(--text)">${q.subject || 'Quiz'}</span>
              <span style="${passed?'color:#059669;background:rgba(5,150,105,.1)':'color:#f43f5e;background:rgba(244,63,94,.1)'};padding:2px 8px;border-radius:20px;font-size:.7rem;font-weight:700;">${passed?'✓ Passed':'✗ Failed'}</span>
              <span style="font-size:.72rem;color:var(--muted,#64748b);margin-left:auto">#${history.length - idx}</span>
            </div>
            <div style="font-size:.75rem;color:var(--muted,#64748b);margin-top:3px">${_diffBadge(q.difficulty)} · ${q.topic || 'All Topics'} · ${_fmtDate(q.date)}</div>
            <div style="font-size:.75rem;color:var(--muted,#64748b);margin-top:2px">${q.correct ?? '?'}/${q.count ?? '?'} correct · ${q.elapsed ? Math.round(q.elapsed/60)+'m '+q.elapsed%60+'s' : ''}</div>
            ${weakHtml ? `<div style="margin-top:6px">${weakHtml}</div>` : ''}
          </div>
        </div>`;
    }).join('')}`;
}

function initApp() {
  initTheme();
  seedDemoData();
  applyProfileData();
  animateMetrics();
  if(typeof renderTasks === 'function') renderTasks();
  renderStreakUI();
  renderRecentQuizzes();   // ← populate recent quizzes on dashboard load
  renderMyQuizzes();       // ← populate my quizzes section on dashboard load
}
document.addEventListener('DOMContentLoaded', initApp);

// ===== PROFILE DRAWER =====
function toggleProfile() {
  const wrap = document.getElementById('profileWrap');
  if (wrap) wrap.classList.toggle('open');
}
function closeProfile() {
  const wrap = document.getElementById('profileWrap');
  if (wrap) wrap.classList.remove('open');
}
document.addEventListener('click', function (e) {
  const wrap = document.getElementById('profileWrap');
  if (wrap && !wrap.contains(e.target)) closeProfile();
});
function handleLogout() {
  closeProfile();
  if (confirm('Log out of StudyBuddy?')) {
    localStorage.clear();
    window.location.href = 'login.html';
  }
}

// ===== SETTINGS =====
function openSettings() {
  closeProfile();
  const user = getUser();
  const setVal = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.value = v || '';
  };
  setVal('settingsName', user.name);
  setVal('settingsEmail', user.email);

  // Photo preview
  syncSettingsAvatarPreview(user.profilePhoto || '');

  // Appearance UI
  const accent = normalizeHex(localStorage.getItem('accent')) || '#059669';
  setVal('accentHex', accent);
  syncAppearanceUI();

  // Productivity prefs
  setVal('settingsDailyGoal', localStorage.getItem('sb_daily_goal_min') || '60');
  setVal('settingsExamDate', localStorage.getItem('sb_exam_target') || '');
  const rem = localStorage.getItem('sb_reminders') === '1';
  const tog = document.getElementById('settingsReminders');
  if (tog) tog.setAttribute('aria-pressed', rem ? 'true' : 'false');

  // Hook file input for live preview
  const photoInp = document.getElementById('settingsPhoto');
  if (photoInp && !photoInp.dataset.bound) {
    photoInp.dataset.bound = '1';
    photoInp.addEventListener('change', () => handleSettingsPhotoChange(photoInp));
  }

  // default tab
  if (typeof openSettingsTab === 'function') openSettingsTab('profile');
  const modal = document.getElementById('settingsModal');
  if (modal) modal.classList.add('open');
}
function closeSettings() {
  const modal = document.getElementById('settingsModal');
  if (modal) modal.classList.remove('open');
}
function saveSettings() {
  const statusEl = document.getElementById('settingsStatus');
  const setStatus = (msg, ok) => {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className = 'settings-status ' + (ok ? 'ok' : 'err');
  };

  const getVal = (id) => (document.getElementById(id)?.value || '').trim();

  const name = getVal('settingsName') || 'Student';
  const email = getVal('settingsEmail');

  // Appearance
  const hex = getVal('accentHex');
  if (hex && !setAccent(hex)) {
    setStatus('Accent must be a valid HEX like #12ab34', false);
    return;
  }

  // Productivity
  const daily = parseInt(getVal('settingsDailyGoal') || '0', 10);
  if (!Number.isFinite(daily) || daily < 0 || daily > 1440) {
    setStatus('Daily goal must be between 0 and 1440 minutes.', false);
    return;
  }
  localStorage.setItem('sb_daily_goal_min', String(daily));
  localStorage.setItem('sb_exam_target', getVal('settingsExamDate'));
  const rem = document.getElementById('settingsReminders')?.getAttribute('aria-pressed') === 'true';
  localStorage.setItem('sb_reminders', rem ? '1' : '0');

  // Merge into current user
  const user = getUser();
  const updated = {
    ...user,
    name,
    email
  };

  // profile photo (set by handleSettingsPhotoChange / clearProfilePhoto)
  const photo = localStorage.getItem('sb_pending_profile_photo') || '';
  if (photo) {
    updated.profilePhoto = photo;
    localStorage.removeItem('sb_pending_profile_photo');
  }

  // Persist to sb_users (so login.html works) and sb_current_user
  const users = JSON.parse(localStorage.getItem('sb_users') || '[]');
  const oldEmail = (user.email || '').trim();
  const newEmail = (updated.email || '').trim();
  let idx = -1;
  if (oldEmail) idx = users.findIndex(u => (u.email || '').trim() === oldEmail);
  if (idx < 0 && newEmail) idx = users.findIndex(u => (u.email || '').trim() === newEmail);

  if (idx >= 0) users[idx] = { ...users[idx], ...updated };
  else if (newEmail) users.push(updated);

  // If email changed, remove stale entry for the old email (avoid duplicate accounts)
  if (oldEmail && newEmail && oldEmail !== newEmail) {
    const filtered = users.filter((u, i) => i === idx || (u.email || '').trim() !== oldEmail);
    localStorage.setItem('sb_users', JSON.stringify(filtered));
  } else {
    localStorage.setItem('sb_users', JSON.stringify(users));
  }
  localStorage.setItem('sb_current_user', JSON.stringify(updated));

  applyProfileData();
  setStatus('Saved successfully ✓', true);
  setTimeout(() => closeSettings(), 650);
}

// Settings tabs (used by dashboard.html)
function openSettingsTab(key) {
  const keys = ['profile', 'appearance', 'productivity', 'timetable', 'system'];
  keys.forEach(k => {
    const tab = document.getElementById('tab_' + k);
    const panel = document.getElementById('panel_' + k);
    if (tab) {
      const active = k === key;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    }
    if (panel) {
      const active = k === key;
      panel.classList.toggle('active', active);
      // Only animate on tab switch, not on content change
      if (active) {
        panel.classList.remove('tab-switch');
        void panel.offsetWidth; // force reflow
        panel.classList.add('tab-switch');
      }
    }
  });
  const statusEl = document.getElementById('settingsStatus');
  if (statusEl) {
    statusEl.textContent = '';
    statusEl.className = 'settings-status';
  }
  syncAppearanceUI();
}

function syncSettingsAvatarPreview(photo) {
  const el = document.getElementById('settingsAvatarPreview');
  if (!el) return;
  if (photo) el.style.backgroundImage = `url("${photo}")`;
  else el.style.backgroundImage = '';
}

function handleSettingsPhotoChange(inputEl) {
  const file = inputEl.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) return;
  if (file.size > 2.5 * 1024 * 1024) {
    const statusEl = document.getElementById('settingsStatus');
    if (statusEl) {
      statusEl.textContent = 'Image too large (max 2.5MB).';
      statusEl.className = 'settings-status err';
    }
    inputEl.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const data = String(reader.result || '');
    localStorage.setItem('sb_pending_profile_photo', data);
    syncSettingsAvatarPreview(data);
  };
  reader.readAsDataURL(file);
}

function clearProfilePhoto() {
  localStorage.setItem('sb_pending_profile_photo', '');
  syncSettingsAvatarPreview('');
  const photoInp = document.getElementById('settingsPhoto');
  if (photoInp) photoInp.value = '';

  // Also clear from current user immediately (so navbar updates)
  const user = getUser();
  const updated = { ...user, profilePhoto: '' };
  localStorage.setItem('sb_current_user', JSON.stringify(updated));
  const users = JSON.parse(localStorage.getItem('sb_users') || '[]');
  const idx = users.findIndex(u => (u.email || '').trim() === (user.email || '').trim());
  if (idx >= 0) users[idx] = { ...users[idx], profilePhoto: '' };
  localStorage.setItem('sb_users', JSON.stringify(users));
  applyProfileData();
}

function syncAppearanceUI() {
  const mode = localStorage.getItem('colorMode') || 'light';
  ['light', 'dark', 'auto'].forEach(k => {
    const el = document.getElementById('modeBtn_' + k);
    if (el) el.classList.toggle('active', k === mode);
  });
  applyColorMode();
  const accent = normalizeHex(localStorage.getItem('accent')) || '#059669';
  const hexInp = document.getElementById('accentHex');
  if (hexInp && !hexInp.value) hexInp.value = accent;
}

function applyAccentFromUI() {
  const v = (document.getElementById('accentHex')?.value || '').trim();
  const ok = setAccent(v);
  const statusEl = document.getElementById('settingsStatus');
  if (statusEl) {
    statusEl.textContent = ok ? 'Accent applied ✓' : 'Invalid HEX color';
    statusEl.className = 'settings-status ' + (ok ? 'ok' : 'err');
  }
}

function quickAccent(hex) {
  const ok = setAccent(hex);
  const hexInp = document.getElementById('accentHex');
  if (hexInp) hexInp.value = normalizeHex(hex) || hex;
  const statusEl = document.getElementById('settingsStatus');
  if (statusEl) {
    statusEl.textContent = ok ? 'Accent applied ✓' : '';
    statusEl.className = 'settings-status ' + (ok ? 'ok' : '');
  }
}

function toggleReminders() {
  const t = document.getElementById('settingsReminders');
  if (!t) return;
  const cur = t.getAttribute('aria-pressed') === 'true';
  t.setAttribute('aria-pressed', cur ? 'false' : 'true');
}

function resetAllData() {
  if (!confirm('Reset ALL StudyBuddy data on this browser?')) return;
  localStorage.clear();
  window.location.href = 'login.html';
}

// ============================================================
//  AI CHATBOT — Single clean implementation
//  Uses Groq API (llama-3.1-8b-instant) with smart fallback
// ============================================================

// ⚠️  IMPORTANT: Replace this with your actual Groq API key.
//  Get one free at https://console.groq.com
//  NOTE: For production, use a backend proxy — never expose API keys in frontend JS.
const GROQ_API_KEY = "YOUR_API_KEY";

let activeChatId = localStorage.getItem('sb_active_chat_id') || Date.now().toString();
let chatHistory = JSON.parse(localStorage.getItem('sb_chat_' + activeChatId) || '[]');
let allChats = JSON.parse(localStorage.getItem('sb_all_chats') || '[]');

if(!allChats.find(c => c.id === activeChatId)) {
  allChats.unshift({ id: activeChatId, title: 'New Chat', time: Date.now() });
  localStorage.setItem('sb_all_chats', JSON.stringify(allChats));
  localStorage.setItem('sb_active_chat_id', activeChatId);
}

function saveCurrentChat() {
  localStorage.setItem('sb_chat_' + activeChatId, JSON.stringify(chatHistory));
  if(chatHistory.length > 0 && chatHistory[0].role === 'user') {
    let chat = allChats.find(c => c.id === activeChatId);
    if(chat && chat.title === 'New Chat') {
      chat.title = chatHistory[0].content.slice(0, 20) + '...';
      localStorage.setItem('sb_all_chats', JSON.stringify(allChats));
    }
  }
}

function startNewChat() {
  activeChatId = Date.now().toString();
  chatHistory = [];
  allChats.unshift({ id: activeChatId, title: 'New Chat', time: Date.now() });
  localStorage.setItem('sb_all_chats', JSON.stringify(allChats));
  localStorage.setItem('sb_active_chat_id', activeChatId);
  localStorage.setItem('sb_chat_' + activeChatId, JSON.stringify(chatHistory));
  loadChatHistory();
  const menu = document.getElementById('chatHistoryMenu');
  if(menu) menu.style.display = 'none';
}

function loadSpecificChat(id) {
  activeChatId = id;
  chatHistory = JSON.parse(localStorage.getItem('sb_chat_' + id) || '[]');
  localStorage.setItem('sb_active_chat_id', id);
  loadChatHistory();
  const menu = document.getElementById('chatHistoryMenu');
  if(menu) menu.style.display = 'none';
}

function toggleChatHistoryMenu() {
  const menu = document.getElementById('chatHistoryMenu');
  if(!menu) return;
  if(menu.style.display === 'block') {
    menu.style.display = 'none';
  } else {
    menu.style.display = 'block';
    const list = document.getElementById('chatHistoryList');
    if(list) {
      list.innerHTML = allChats.map(c => `
        <button style="text-align:left; padding:8px 10px; background:${c.id === activeChatId ? 'var(--primary-light)' : 'transparent'}; border:none; border-radius:8px; color:var(--text); font-size:0.8rem; cursor:pointer; font-family:'DM Sans',sans-serif; transition:background 0.2s; border:1px solid ${c.id === activeChatId ? 'var(--primary)' : 'transparent'};" onmouseover="this.style.background='var(--primary-glow)'" onmouseout="this.style.background='${c.id === activeChatId ? 'var(--primary-light)' : 'transparent'}'" onclick="loadSpecificChat('${c.id}')">
          <div style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${c.title}</div>
          <div style="font-size:0.65rem; color:var(--text-muted); margin-top:2px;">${new Date(c.time).toLocaleDateString()}</div>
        </button>
      `).join('');
      if(allChats.length === 0) list.innerHTML = '<div style="font-size:0.8rem; color:var(--text-muted);">No recent chats.</div>';
    }
  }
}

function loadChatHistory() {
  const chat = document.getElementById('chatMessages');
  if (!chat) return;
  chat.innerHTML = '<div class="bot-msg">👋 Hi! I\'m your AI Buddy. Ask me anything!</div>';
  chatHistory.forEach(msg => {
    const div = document.createElement('div');
    div.className = msg.role === 'user' ? 'user-msg' : 'bot-msg';
    div.textContent = msg.content;
    chat.appendChild(div);
  });
  chat.scrollTop = chat.scrollHeight;
}

function toggleChatbot() {
  const box = document.getElementById('chatbotBox');
  if (!box) return;
  const isOpen = box.style.display === 'flex';
  box.style.display = isOpen ? 'none' : 'flex';
  if (!isOpen) {
    loadChatHistory();
    const inp = document.getElementById('chatInput');
    if (inp) inp.focus();
  } else {
    box.classList.remove('fullscreen');
    const overlay = document.getElementById('chatOverlay');
    if(overlay) overlay.classList.remove('active');
  }
}

function toggleChatbotFullscreen() {
  const box = document.getElementById('chatbotBox');
  const overlay = document.getElementById('chatOverlay');
  if (!box) return;
  box.classList.toggle('fullscreen');
  if (overlay) overlay.classList.toggle('active');
}

function insertChat(text, send = false) {
  const input = document.getElementById('chatInput');
  if (!input) return;
  input.value = text;
  if(send) sendMessage();
  else input.focus();
}

function addChatMessage(text, type, save = true) {
  const chat = document.getElementById('chatMessages');
  if (!chat) return null;
  const div = document.createElement('div');
  div.className = type === 'user' ? 'user-msg' : 'bot-msg';
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  if (save) {
    chatHistory.push({ role: type, content: text });
    saveCurrentChat();
  }
  return div;
}

async function sendMessage() {
  const input = document.getElementById('chatInput');
  if (!input) return;
  const msg = input.value.trim();
  if (!msg) return;

  addChatMessage(msg, 'user', true);
  input.value = '';

  const typingEl = addChatMessage('🤖 Thinking...', 'bot', false);

  try {
    const reply = await callGroqAPI(msg);
    if (typingEl) typingEl.textContent = reply;
    chatHistory.push({ role: 'bot', content: reply });
    saveCurrentChat();
  } catch (err) {
    const fallback = smartFallback(msg);
    if (typingEl) typingEl.textContent = fallback;
    chatHistory.push({ role: 'bot', content: fallback });
    saveCurrentChat();
  }
}

async function callGroqAPI(msg) {
  if (!GROQ_API_KEY || GROQ_API_KEY === 'YOUR_GROQ_API_KEY') {
    return smartFallback(msg);
  }

  const user = getUser();
  const history = JSON.parse(localStorage.getItem('sb_quiz_history') || '[]');
  const weak    = JSON.parse(localStorage.getItem('sb_weak_areas')   || '[]');
  const avgScore = history.length
    ? Math.round(history.reduce((a, b) => a + b.score, 0) / history.length)
    : null;

  const systemPrompt = `You are StudyBuddy AI — a friendly, concise study assistant.
Student: ${user.name || 'Student'}
Subjects: ${(user.subjects || []).join(', ') || 'Not set'}
Level: ${user.level || 'Not set'}
${avgScore !== null ? `Average quiz score: ${avgScore}%` : ''}
${weak.length ? `Weak areas: ${weak.slice(0, 3).map(w => w.topic).join(', ')}` : ''}

Rules:
- Keep answers SHORT (2-4 sentences max)
- Be encouraging and practical
- If asked about performance, use the data above
- If asked for motivation, be energetic`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: msg }
      ],
      temperature: 0.7,
      max_tokens: 200
    })
  });

  clearTimeout(timeout);

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content?.trim() || smartFallback(msg);
}

function smartFallback(msg) {
  const m = msg.toLowerCase();
  const user = getUser();
  const history = JSON.parse(localStorage.getItem('sb_quiz_history') || '[]');
  const weak    = JSON.parse(localStorage.getItem('sb_weak_areas')   || '[]');

  if (m.includes('hello') || m.includes('hi') || m.includes('hey'))
    return `Hey ${user.name?.split(' ')[0] || 'there'} 👋 I'm your StudyBuddy AI. Ask me anything about your studies!`;

  if (m.includes('score') || m.includes('performance') || m.includes('result')) {
    if (!history.length) return "No quiz data yet! Take a quiz first 📝";
    const avg = Math.round(history.reduce((a, b) => a + b.score, 0) / history.length);
    return `Your average score is ${avg}%. ${avg >= 75 ? 'Great job! 🔥 Keep it up!' : 'Keep practicing — you\'re improving! 💪'}`;
  }

  if (m.includes('weak') || m.includes('improve'))
    return weak.length
      ? `Focus on "${weak[0].topic}" — it's your biggest weak area. Spend 30 mins on it today! 📖`
      : "You're doing great — no major weak areas detected! 🚀";

  if (m.includes('subject'))
    return user.subjects?.length
      ? `Your subjects: ${user.subjects.join(', ')} 📚`
      : 'No subjects added yet. Go to your profile to add them!';

  if (m.includes('study') || m.includes('tip'))
    return 'Try the Pomodoro technique: 25 min focused study → 5 min break. Repeat 4x, then take a longer break. 🍅';

  if (m.includes('motivat') || m.includes('tired') || m.includes('stressed'))
    return 'Every expert was once a beginner. One small step today compounds into big results. You\'ve got this! 💪';

  if (m.includes('quiz'))
    return 'Go to the Quiz section to test yourself! AI-generated questions adapt to your level. 🎯';

  if (m.includes('time') || m.includes('schedule'))
    return 'Check the class ticker at the top of your dashboard for today\'s schedule! ⏰';

  return "I'm here to help! Ask me about your scores, subjects, study tips, or motivation 🎓";
}

// Allow pressing Enter to send chat
const chatInputEl = document.getElementById('chatInput');
if (chatInputEl) {
  chatInputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') sendMessage();
  });
}

// ===== SUBSCRIBE =====
function subscribe() {
  const emailEl = document.getElementById('subEmail');
  const msg     = document.getElementById('subMsg');
  if (!emailEl || !msg) return;
  const email = emailEl.value.trim();
  if (!email.includes('@')) {
    msg.textContent = '❌ Enter a valid email';
    msg.style.color = 'red';
    return;
  }
  let subs = JSON.parse(localStorage.getItem('sb_subscribers') || '[]');
  if (subs.includes(email)) {
    msg.textContent = '⚠️ Already subscribed';
    msg.style.color = 'orange';
    return;
  }
  subs.push(email);
  localStorage.setItem('sb_subscribers', JSON.stringify(subs));
  msg.textContent = '✅ Subscribed successfully!';
  msg.style.color = '#34d399';
  emailEl.value = '';
}

// ===== TIMER =====
let tVal = 1500, tInt = null, sessions = 0, running = false, modeMins = 25;
function setMode(mins, lbl, btn) {
  resetTimer(); modeMins = mins; tVal = mins * 60; updateDisp();
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}
function updateDisp() {
  const m = Math.floor(tVal / 60), s = tVal % 60;
  const el = document.getElementById('display');
  if (el) el.textContent = `${m}:${s < 10 ? '0' + s : s}`;
}
function startTimer() {
  if (running) return; running = true;
  const btn = document.getElementById('startBtn');
  if (btn) { btn.textContent = '⏸ Pause'; btn.onclick = pauseTimer; }
  tInt = setInterval(() => {
    if (tVal <= 0) {
      clearInterval(tInt); running = false;
      if (modeMins === 25) {
        sessions++;
        const sc = document.getElementById('sessCount');
        if (sc) sc.textContent = sessions + ' session' + (sessions !== 1 ? 's' : '');
        logStudyMinutes(modeMins);
      }
      
      const pastSessions = JSON.parse(localStorage.getItem('sb_past_sessions') || '[]');
      const d = new Date();
      pastSessions.push({
        title: modeMins === 25 ? 'Focus Session' : (modeMins === 5 ? 'Short Break' : 'Long Break'),
        date: `${d.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]}`,
        time: `${d.getHours()}:${d.getMinutes().toString().padStart(2,'0')}`,
        duration: modeMins
      });
      localStorage.setItem('sb_past_sessions', JSON.stringify(pastSessions));
      if(typeof renderPastSessions === 'function') renderPastSessions();

      if (btn) { btn.textContent = '▶ Start'; btn.onclick = startTimer; }
      return;
    }
    tVal--; updateDisp();
  }, 1000);
}

// ===== STREAKS / STUDY LOG =====
function pad2(n){ return String(n).padStart(2,'0'); }
function isoDateLocal(d=new Date()){
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function startOfWeekMonday(d=new Date()){
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // 0=Mon..6=Sun
  x.setHours(0,0,0,0);
  x.setDate(x.getDate() - day);
  return x;
}
function readStudyLog(){
  const raw = localStorage.getItem('sb_study_log');
  const arr = JSON.parse(raw || '[]');
  return Array.isArray(arr) ? arr : [];
}
function writeStudyLog(arr){
  localStorage.setItem('sb_study_log', JSON.stringify(arr));
}
function upsertStudyMinutes(dateISO, addMin){
  const log = readStudyLog();
  const i = log.findIndex(x => x?.date === dateISO);
  if (i >= 0) log[i].minutes = Math.max(0, (parseInt(log[i].minutes,10)||0) + addMin);
  else log.push({ date: dateISO, minutes: Math.max(0, addMin) });
  // keep sorted
  log.sort((a,b)=> String(a.date).localeCompare(String(b.date)));
  writeStudyLog(log);
  return log;
}
function getMinutesFor(dateISO){
  const log = readStudyLog();
  const it = log.find(x => x?.date === dateISO);
  return it ? (parseInt(it.minutes,10)||0) : 0;
}
function computeStreakDays(todayISO){
  const log = readStudyLog();
  const map = new Map(log.map(x => [x.date, parseInt(x.minutes,10)||0]));
  let days = 0;
  let d = new Date(todayISO + 'T00:00:00');
  for(;;){
    const key = isoDateLocal(d);
    const mins = map.get(key) || 0;
    if (mins <= 0) break;
    days++;
    d.setDate(d.getDate()-1);
  }
  return days;
}
function buildWeekSeries(){
  const start = startOfWeekMonday(new Date());
  const days = [];
  for(let i=0;i<7;i++){
    const d = new Date(start);
    d.setDate(start.getDate()+i);
    const iso = isoDateLocal(d);
    days.push({ iso, label: ['M','T','W','T','F','S','S'][i], minutes: getMinutesFor(iso) });
  }
  return days;
}
function renderStreakUI(){
  const card = document.getElementById('streakCard');
  if (!card) return; // other pages

  const today = isoDateLocal();
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate()-1);
  const yesterday = isoDateLocal(yesterdayDate);

  const todayMin = getMinutesFor(today);
  const yMin = getMinutesFor(yesterday);
  const streak = computeStreakDays(today);

  const daysEl = document.getElementById('streakDays');
  if (daysEl) daysEl.textContent = String(streak);
  const tEl = document.getElementById('todayMinutes');
  if (tEl) tEl.textContent = String(todayMin);

  const dailyGoal = parseInt(localStorage.getItem('sb_daily_goal_min') || '60', 10) || 60;
  const weeklyGoal = dailyGoal * 7;
  const week = buildWeekSeries();
  const weeklyMin = week.reduce((a,b)=>a+(b.minutes||0),0);

  const wEl = document.getElementById('weeklyMinutes');
  if (wEl) wEl.textContent = String(weeklyMin);
  const wgEl = document.getElementById('weeklyGoal');
  if (wgEl) wgEl.textContent = String(weeklyGoal);

  const pct = weeklyGoal > 0 ? Math.round((weeklyMin / weeklyGoal) * 100) : 0;
  const fill = document.getElementById('weeklyFill');
  if (fill) fill.style.width = `${Math.min(100,pct)}%`;
  const pEl = document.getElementById('weeklyPct');
  if (pEl) pEl.textContent = `${Math.min(999,pct)}%`;

  const msg = document.getElementById('streakMsg');
  if (msg) {
    if (todayMin <= 0) msg.textContent = `Do 1 focus session today to keep your streak alive.`;
    else if (todayMin < dailyGoal) msg.textContent = `Nice. You're ${Math.max(0,dailyGoal - todayMin)} min away from today’s goal.`;
    else msg.textContent = `Goal crushed. Keep the chain going.`;
  }

  const warn = document.getElementById('streakWarn');
  if (warn) warn.style.display = (todayMin <= 0 && yMin > 0) ? 'block' : 'none';

  const track = document.getElementById('weekTrack');
  if (track) {
    const max = Math.max(1, ...week.map(d => d.minutes));
    track.innerHTML = week.map(d => {
      const ratio = Math.min(1, (d.minutes||0) / max) * 100;
      const active = d.minutes > 0;
      const displayHeight = ratio < 5 && active ? 10 : ratio; // minimum 10% height to show a small dot
      return `
        <div class="day-bar ${active ? 'active' : ''}" title="${d.iso}: ${d.minutes} min">
          <div class="bar-bg">
            <div class="fill" style="height: ${active ? displayHeight : 8}%;"></div>
          </div>
          <div class="lbl">${d.label}</div>
        </div>
      `;
    }).join('');
  }
}

function logStudyMinutes(mins){
  const m = parseInt(mins,10) || 0;
  if (m <= 0) return;
  upsertStudyMinutes(isoDateLocal(), m);
  renderStreakUI();
}
function pauseTimer() {
  clearInterval(tInt); running = false;
  const btn = document.getElementById('startBtn');
  if (btn) { btn.textContent = '▶ Resume'; btn.onclick = startTimer; }
}
function resetTimer() {
  clearInterval(tInt); running = false; tVal = modeMins * 60; updateDisp();
  const btn = document.getElementById('startBtn');
  if (btn) { btn.textContent = '▶ Start'; btn.onclick = startTimer; }
}
function adjustTimer(amount) {
  if (modeMins + amount < 1) return;
  modeMins += amount;
  if (!running) { tVal = modeMins * 60; }
  else { tVal += amount * 60; if (tVal < 0) tVal = 0; }
  updateDisp();
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
}

// ===== SMART PLANNER & TIMER EXTRAS =====
let pastSessions = JSON.parse(localStorage.getItem('sb_past_sessions') || '[]');
function renderPastSessions() {
  const log = document.getElementById('sessionHistoryLog');
  if (!log) return;
  const sessions = JSON.parse(localStorage.getItem('sb_past_sessions') || '[]');
  if (!sessions.length) {
    log.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem; text-align:center; margin-top:20px;">No sessions completed yet.</div>';
    return;
  }
  log.innerHTML = sessions.slice().reverse().map(s => `
    <div class="session-log-item">
      <div style="display:flex; flex-direction:column; gap:4px;">
        <span class="session-log-title">${s.title}</span>
        <span class="session-log-time">${s.date} • ${s.time}</span>
      </div>
      <span class="session-log-badge">${s.duration}m</span>
    </div>
  `).join('');
}
function togglePlannerFullscreen() {
  const card = document.getElementById('plannerCard');
  if(card) {
    card.classList.toggle('fullscreen');
    document.body.style.overflow = card.classList.contains('fullscreen') ? 'hidden' : 'auto';
  }
}

// ===== SMART PLANNER (Drag & Drop) =====
let tasks = JSON.parse(localStorage.getItem('sb_planner_tasks') || '[]');
if (!tasks.length) {
  const old = JSON.parse(localStorage.getItem('tasks_v2') || '[]');
  if (old.length) {
    tasks = old.map((t,i) => ({ id: 't'+i, t: t.t, day: 0, done: t.done, cat: 'study' }));
  } else {
    tasks = [
      { id: 't1', t: 'Submit Lab 4', day: 0, done: false, cat: 'study' },
      { id: 't2', t: 'Review Neural Networks', day: 1, done: false, cat: 'revision' },
      { id: 't3', t: 'Practice pointer programs', day: 2, done: false, cat: 'study' },
      { id: 't4', t: 'Mid-term Exam Prep', day: 4, done: false, cat: 'exam' }
    ];
  }
}
function saveTasks() { localStorage.setItem('sb_planner_tasks', JSON.stringify(tasks)); }

function renderTasks() {
  const grid = document.getElementById('plannerGrid');
  if (!grid) return;
  const pending = tasks.filter(t => !t.done).length;
  const countEl = document.getElementById('taskCount');
  if (countEl) countEl.textContent = pending + ' pending this week';

  const start = startOfWeekMonday(new Date());
  const formattedDays = [];
  for(let i=0; i<7; i++){
    const d = new Date(start);
    d.setDate(start.getDate()+i);
    const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
    const month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
    formattedDays.push(`${dayName}, ${month} ${d.getDate()}`);
  }

  grid.innerHTML = formattedDays.map((dateStr, i) => `
    <div class="planner-col" data-day="${i}" ondragover="allowDrop(event)" ondrop="handleDrop(event)" ondragenter="dragEnter(event)" ondragleave="dragLeave(event)">
      <div class="planner-col-header">${dateStr}</div>
      <div class="planner-col-body" style="display:flex;flex-direction:column;gap:10px;">
        ${tasks.filter(t => t.day === i).map(t => `
          <div class="planner-task ${t.done ? 'done' : ''}" id="${t.id}" draggable="true" ondragstart="dragStart(event)" ondragend="dragEnd(event)">
            <div class="planner-task-top">
              <span class="planner-task-cat cat-${t.cat}">${t.cat}</span>
              <div class="task-actions">
                <span onclick="toggleTask('${t.id}')">${t.done ? '✅' : '⬜'}</span>
                <span onclick="delTask('${t.id}')">🗑️</span>
              </div>
            </div>
            <div style="margin-top:4px; line-height:1.4;">${t.t}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

let draggedTaskId = null;
function dragStart(e) {
  draggedTaskId = e.target.id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggedTaskId);
  setTimeout(() => e.target.classList.add('dragging'), 0);
}
function dragEnd(e) {
  e.target.classList.remove('dragging');
  document.querySelectorAll('.planner-col').forEach(c => c.classList.remove('drag-over'));
}
function allowDrop(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
function dragEnter(e) {
  e.preventDefault();
  const col = e.target.closest('.planner-col');
  if(col) col.classList.add('drag-over');
}
function dragLeave(e) {
  const col = e.target.closest('.planner-col');
  if(col && !e.relatedTarget?.closest('.planner-col[data-day="'+col.dataset.day+'"]')) {
    col.classList.remove('drag-over');
  }
}
function handleDrop(e) {
  e.preventDefault();
  const col = e.target.closest('.planner-col');
  if(col) col.classList.remove('drag-over');
  const dayIndex = parseInt(col?.dataset.day, 10);
  const task = tasks.find(t => t.id === draggedTaskId);
  if(task && !isNaN(dayIndex)) {
    task.day = dayIndex;
    saveTasks();
    renderTasks();
  }
}

function addTaskPrompt() {
  const t = prompt('Enter novel task description:');
  if (!t) return;
  const catInt = prompt('Category? (1: Study, 2: Revision, 3: Exam)', '1');
  let selectedCat = 'study';
  if(catInt === '2') selectedCat = 'revision';
  else if(catInt === '3') selectedCat = 'exam';
  
  tasks.push({
    id: 't' + Date.now(),
    t: t,
    day: 0,
    done: false,
    cat: selectedCat
  });
  saveTasks();
  renderTasks();
}

function toggleTask(id) {
  const t = tasks.find(x => x.id === id);
  if(t) { t.done = !t.done; saveTasks(); renderTasks(); }
}
function delTask(id) {
  tasks = tasks.filter(x => x.id !== id);
  saveTasks();
  renderTasks();
}
// Render after DOM is ready (initApp)

// ===== RESOURCE HUB =====
const courseData = {
  c: { title: "Fundamentals of C", vids: [{ t: "Pointers deep dive", d: "1 hour masterclass" }, { t: "Memory Allocation", d: "malloc, calloc, realloc" }], pdfs: [{ t: "Syllabus & Course Plan", d: "Official PDF" }, { t: "Unit 2 Notes", d: "Control Flow" }], notes: [{ t: "Quick Ref", d: "My personal scratchpad" }] },
  ai: { title: "Foundations of AI", vids: [{ t: "Neural Nets intro", d: "Andrew Ng basics" }], pdfs: [{ t: "Fuzzy Logic Slides", d: "Lecture 4" }], notes: [] },
  fe: { title: "Front End Engg", vids: [{ t: "CSS Grid", d: "Layouts" }], pdfs: [{ t: "DOM API", d: "Cheat sheet" }], notes: [] },
  os: { title: "OS & Linux", vids: [{ t: "Deadlocks", d: "Banker algorithm" }], pdfs: [{ t: "Linux commands", d: "100 commands" }], notes: [] }
};

function openLib(id) {
  const modal = document.getElementById('libModal');
  const cnt = document.getElementById('modalContent');
  if (!modal || !cnt) return;
  const data = courseData[id];
  if (!data) return;

  const renderCards = (items, btnLabel) => items.map(item => `
    <div class="lib-card">
      <div class="lib-card-title">${item.t}</div>
      <div class="lib-card-desc">${item.d}</div>
      <button class="lib-card-btn">${btnLabel}</button>
    </div>
  `).join('') || '<div class="lib-card-desc" style="padding:10px 0;">No resources uploaded yet.</div>';

  cnt.innerHTML = `
    <h2 style="font-family:'Syne',sans-serif; margin-bottom:20px; font-weight:800; font-size:1.6rem; color:var(--text);">${data.title}</h2>
    <div class="lib-tabs">
      <button class="lib-tab active" onclick="switchLibTab(this, 'vids')">🎥 Videos</button>
      <button class="lib-tab" onclick="switchLibTab(this, 'pdfs')">📄 PDFs</button>
      <button class="lib-tab" onclick="switchLibTab(this, 'notes')">📝 Notes</button>
    </div>
    <div class="lib-panel active" id="lib-vids">${renderCards(data.vids, 'Watch Now ▶')}</div>
    <div class="lib-panel" id="lib-pdfs">${renderCards(data.pdfs, 'Download ⬇')}</div>
    <div class="lib-panel" id="lib-notes">${renderCards(data.notes, 'View Note ↗')}</div>
  `;
  modal.classList.add('open');
}

function switchLibTab(btn, panelId) {
  if(!btn || !btn.parentElement) return;
  const tabs = btn.parentElement.querySelectorAll('.lib-tab');
  tabs.forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  const panels = document.querySelectorAll('.lib-panel');
  panels.forEach(p => p.classList.remove('active'));
  const target = document.getElementById('lib-' + panelId);
  if(target) target.classList.add('active');
}

function closeModal() {
  const modal = document.getElementById('libModal');
  if (modal) modal.classList.remove('open');
}

// ===== NOTES =====
function saveNote() {
  const title   = document.getElementById('noteTitle');
  const content = document.getElementById('notePad');
  if (!title || !content) return;
  if (!title.value || !content.value) { alert('Please fill both fields'); return; }
  const notes = JSON.parse(localStorage.getItem('notes') || '[]');
  notes.unshift({ title: title.value, content: content.value, date: new Date().toLocaleString() });
  localStorage.setItem('notes', JSON.stringify(notes));
  alert('Saved successfully ✅');
  title.value = ''; content.value = '';
}

// ===== GPA =====
function calcGPA() {
  const grades = [...document.querySelectorAll('.grade')].map(g => parseFloat(g.value) || 0);
  const avg = (grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(1);
  const letter = avg >= 90 ? 'A+' : avg >= 80 ? 'A' : avg >= 70 ? 'B+' : avg >= 60 ? 'B' : 'C';
  const el = document.getElementById('gpaResult');
  if (el) {
    el.style.display = 'block';
    el.innerHTML = `<div class="gpa-big">${avg}%</div><div style="color:var(--text-muted);font-size:0.85rem;margin-top:4px;">Grade: <strong style="color:var(--primary)">${letter}</strong> · ${avg >= 75 ? 'On Track 🎯' : 'Needs Attention 📚'}</div>`;
  }
}
function addGPARow() {
  const row = document.createElement('div'); row.className = 'gpa-row';
  row.innerHTML = `<input class="input-field" placeholder="Subject"><input type="number" class="input-field grade" placeholder="Grade (0-100)">`;
  const inp = document.getElementById('gpa-inputs');
  if (inp) inp.appendChild(row);
}
function toggleMaximize() {
  const chat = document.getElementById("chatbot");
  const overlay = document.getElementById("chatOverlay");

  chat.classList.toggle("fullscreen");
  overlay.classList.toggle("active");
}
function getSmartSuggestion() {
  const hour = new Date().getHours();

  if (hour < 12) return "Start your day with a 25 min focus session?";
  if (hour < 18) return "Try a quick quiz to test yourself!";
  return "Revise weak topics before sleep 📘";
}
function minimizeChat() {
  const chat = document.getElementById("chatbot");
  const overlay = document.getElementById("chatOverlay");

  chat.classList.remove("fullscreen");
  overlay.classList.remove("active");
}
// ===== SYLLABUS TABS =====
function switchTab(key, btn) {
  document.querySelectorAll('.syl-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.syl-tab').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('syl-' + key);
  if (panel) panel.classList.add('active');
  if (btn) btn.classList.add('active');
}

// ===== API KEY MANAGEMENT =====
function getApiKey() {
  return localStorage.getItem('sb_api_key') || '';
}
function showKeyStatus(msg, ok) {
  const el = document.getElementById('keyStatus');
  if (el) { el.textContent = msg; el.style.color = ok ? '#059669' : '#ef4444'; }
}
function saveApiKey() {
  const inp = document.getElementById('apiKeyInput');
  if (!inp) return;
  const key = inp.value.trim();
  if (!key) { showKeyStatus('Enter a key first', false); return; }
  localStorage.setItem('sb_api_key', key);
  showKeyStatus('✅ Key saved!', true);
  inp.value = '';
}
function clearApiKey() {
  localStorage.removeItem('sb_api_key');
  showKeyStatus('Key cleared', false);
}
// Show saved key status on load
(function () {
  const k = getApiKey();
  showKeyStatus(k ? '✅ API key active' : 'No key — using built-in bank', !!k);
})();

// ===== COURSE MODAL DATA =====
const libData = {
  c: {
    name: "Fundamentals of C Programming", icon: "💻", chip: "24CSE0107", coord: "Mr. Yogesh Bajpai",
    syllabus: ["C Syntax & Preprocessors", "Pointers & Memory", "File Handling & Structures"],
    resources: [
      { name: "Unit 1: Introduction to C", url: "docs/c/unit1_basics.pdf", type: "pdf" },
      { name: "Advanced C Problems", url: "docs/c/p.pdf", type: "pdf" },
      { name: "C Programming Reference", url: "https://www.geeksforgeeks.org/c/c-programming-language/", type: "link" }
    ]
  },
  ai: {
    name: "Foundations of AI Algorithms", icon: "🤖", chip: "25CAI0102", coord: "Mr. Prabhjot Manocha",
    syllabus: ["Fuzzy Logic Systems", "Neural Networks & Backpropagation", "Genetic Algorithms"],
    resources: [
      { name: "Neural Networks Handouts", url: "docs/ai/nn_basics.pdf", type: "pdf" },
      { name: "Fuzzy Logic Notes", url: "docs/ai/fuzzy_logic.pdf", type: "pdf" },
      { name: "Azure Prep Portal", url: "https://learn.microsoft.com/en-us/credentials/certifications/azure-fundamentals/", type: "link" }
    ]
  },
  fe: {
    name: "Front End Engineering – 1", icon: "🌐", chip: "25CSE0105", coord: "Mr. Sourabh Batra",
    syllabus: ["ES6+ & Modern JS", "DOM & Async Programming", "Version Control (Git)"],
    resources: [
      { name: "JS ES6+ Cheat Sheet", url: "docs/fe/js_cheatsheet.pdf", type: "pdf" },
      { name: "Project Guidelines", url: "docs/fe/project_viva.pdf", type: "pdf" },
      { name: "MDN Web Documentation", url: "https://developer.mozilla.org/", type: "link" }
    ]
  },
  os: {
    name: "Operating System & Linux", icon: "🐧", chip: "25CSE0104", coord: "Mr. Rahul Trivedi",
    syllabus: ["CPU Scheduling Algorithms", "Deadlocks & Synchronization", "Memory Paging & Virtual Memory"],
    resources: [
      { name: "Linux Commands Manual", url: "docs/os/linux_lab.pdf", type: "pdf" },
      { name: "CPU Scheduling Algos", url: "docs/os/scheduling_notes.pdf", type: "pdf" },
      { name: "OS Concepts Reference", url: "https://www.os-book.com/", type: "link" }
    ]
  }
};

function openLib(key) {
  const d = libData[key];
  if (!d) return;
  const mc = document.getElementById('modalContent');
  if (!mc) return;
  mc.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;">
      <div style="font-size:3rem;">${d.icon}</div>
      <div>
        <span style="font-size:0.7rem;color:var(--primary);font-weight:800;text-transform:uppercase;letter-spacing:1px;">${d.chip}</span>
        <h2 style="font-family:'Syne',sans-serif;font-size:1.8rem;margin:0;color:var(--text);">${d.name}</h2>
        <div style="font-size:0.85rem;color:var(--text-muted);">Coordinator: ${d.coord}</div>
      </div>
    </div>
    <div class="modal-grid">
      <div>
        <h3 style="font-size:1rem;margin-bottom:15px;">📝 Core Syllabus</h3>
        ${d.syllabus.map(item => `<div class="syl-item" style="background:var(--bg);padding:8px 12px;border-radius:8px;border-left:3px solid var(--primary);font-size:0.85rem;margin-bottom:6px;">${item}</div>`).join('')}
      </div>
      <div>
        <h3 style="font-size:1rem;margin-bottom:15px;">📂 Resource Hub</h3>
        ${d.resources.map(res => `<a href="${res.url}" target="_blank" class="resource-btn" style="margin-bottom:8px;display:flex;">
          <span class="res-type-icon">${res.type === 'pdf' ? '📄' : '🔗'}</span>
          <div style="flex:1;margin-left:10px;">
            <div style="font-size:0.85rem;font-weight:700;color:var(--text);">${res.name}</div>
          </div>
        </a>`).join('')}
      </div>
    </div>`;
  const modal = document.getElementById('courseModal');
  if (modal) modal.classList.add('open');
}
function closeModal() {
  const modal = document.getElementById('courseModal');
  if (modal) modal.classList.remove('open');
}

// ===== LOCAL QUESTION BANK =====
const LOCAL_BANK = {
  c: [
    {q:"What is a pointer in C?",options:["A variable that stores an address","A function parameter","A data type","An array index"],correct:0,explanation:"A pointer is a variable that holds the memory address of another variable. It's declared using * and dereferenced to access the value at that address."},
    {q:"Which operator is used to access structure members via a pointer?",options:[".","->","*","&"],correct:1,explanation:"The arrow operator (->) is used to access members of a structure through a pointer: ptr->member is equivalent to (*ptr).member."},
    {q:"What does `malloc()` return if memory allocation fails?",options:["0","-1","NULL","Garbage value"],correct:2,explanation:"malloc() returns NULL when it cannot allocate the requested memory. Always check the return value before using the pointer."},
    {q:"What is the output of `printf(\"%d\", sizeof(int))` on a 64-bit system?",options:["2","4","8","Platform-dependent"],correct:3,explanation:"sizeof(int) is platform and compiler dependent. It's 4 bytes on most 32-bit and 64-bit systems using GCC, but not guaranteed — always use sizeof for portability."},
    {q:"Which storage class makes a variable retain its value between function calls?",options:["auto","register","static","extern"],correct:2,explanation:"A static local variable is initialized once and retains its value between function calls. Its lifetime is the entire program execution."}
  ],
  ai: [
    {q:"What is fuzzification?",options:["Converting fuzzy output to crisp value","Converting crisp input to fuzzy membership degrees","Training a neural network","Selecting parents in a GA"],correct:1,explanation:"Fuzzification converts crisp (precise) input values into fuzzy membership degrees using the defined membership functions."},
    {q:"In backpropagation, the gradient is propagated:",options:["Forward through the network","Backward from output to input layers","Randomly","Only through hidden layers"],correct:1,explanation:"Backpropagation computes gradients of the loss with respect to weights by propagating the error signal backward from output layer to input layer using the chain rule."},
    {q:"What does the fitness function in a Genetic Algorithm measure?",options:["The size of the chromosome","How well a solution solves the problem","The mutation rate","The crossover probability"],correct:1,explanation:"The fitness function evaluates how good each candidate solution (chromosome) is — higher fitness means better solutions."},
    {q:"What is a Perceptron?",options:["A multi-layer neural network","A single-layer linear classifier using a step function","A fuzzy inference system","A genetic encoding scheme"],correct:1,explanation:"A Perceptron is a single-layer binary classifier that learns a linear decision boundary using a step activation function."},
    {q:"In a Genetic Algorithm, 'mutation' is used to:",options:["Speed up convergence","Maintain genetic diversity and avoid local optima","Select the best parents","Combine two chromosomes"],correct:1,explanation:"Mutation randomly alters genes, introducing new genetic material that maintains diversity and helps escape local optima."}
  ],
  fe: [
    {q:"What is the difference between `let` and `var`?",options:["No difference","let is block-scoped; var is function-scoped","var is block-scoped; let is function-scoped","let cannot be reassigned"],correct:1,explanation:"var is function-scoped and hoisted. let is block-scoped and not accessible before its declaration (temporal dead zone)."},
    {q:"What does `Array.prototype.map()` return?",options:["The original array modified","A new array with transformed elements","undefined","A boolean"],correct:1,explanation:"map() creates and returns a NEW array with results of the callback on each element. The original array is never mutated."},
    {q:"What is a closure?",options:["A way to close the browser","A function that remembers variables from its outer scope","An IIFE","A promise handler"],correct:1,explanation:"A closure is a function that retains access to variables in its lexical scope even after the outer function has returned."},
    {q:"What does `event.preventDefault()` do?",options:["Stops event bubbling","Prevents the default browser action","Removes the event listener","Stops all JS execution"],correct:1,explanation:"preventDefault() cancels the default browser action (like form submission) while still allowing the event to propagate."},
    {q:"What is the event loop?",options:["A for loop inside an event handler","The mechanism that handles async callbacks after the call stack empties","A loop that listens for DOM events","Garbage collection"],correct:1,explanation:"The event loop checks if the call stack is empty, then moves tasks from the callback queue into the stack, enabling non-blocking async."}
  ],
  os: [
    {q:"What is the purpose of the Process Control Block (PCB)?",options:["To store user data","To hold all process info needed by the OS","To manage file descriptors","To handle memory paging"],correct:1,explanation:"The PCB stores everything the OS needs to manage a process: PID, state, registers, program counter, memory maps, open files."},
    {q:"In Round Robin scheduling, what is a 'time quantum'?",options:["Total CPU time given to a process","The fixed time slice each process gets per turn","Time for a context switch","Idle time between processes"],correct:1,explanation:"A time quantum is the maximum CPU time a process runs before being preempted and placed at the back of the ready queue."},
    {q:"Banker's Algorithm is used to:",options:["Detect deadlocks after they occur","Avoid deadlocks by checking if allocation leads to safe state","Prevent deadlocks by denying all requests","Handle page replacement"],correct:1,explanation:"Banker's Algorithm is a deadlock AVOIDANCE algorithm that simulates allocation to check if the system remains in a safe state."},
    {q:"What is virtual memory?",options:["RAM on the GPU","Technique allowing processes to use more memory than physically available","Encrypted memory","Memory shared between all processes"],correct:1,explanation:"Virtual memory gives each process a large contiguous address space. Pages not in RAM are stored on disk and loaded on demand."},
    {q:"What is thrashing?",options:["CPU overheating","Excessive paging where the OS spends more time swapping than executing","Disk fragmentation","High CPU utilization"],correct:1,explanation:"Thrashing occurs when processes have insufficient frames, causing constant page faults. The CPU spends most time handling page faults."}
  ]
};

// ===== QUIZ ENGINE =====
let quizQuestions = [], currentQ = 0, score = 0, answered = false;

function getLocalQuestions(subjectKey, count, difficulty, topic) {
  let pool = (LOCAL_BANK[subjectKey] || LOCAL_BANK.c).slice();
  if (topic) {
    const kw = topic.toLowerCase();
    const filtered = pool.filter(q =>
      q.q.toLowerCase().includes(kw) ||
      q.explanation.toLowerCase().includes(kw) ||
      q.options.some(o => o.toLowerCase().includes(kw))
    );
    if (filtered.length >= 3) pool = filtered;
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(count, pool.length));
}

async function generateQuiz() {
  const subjectKey  = document.getElementById('quizSubject')?.value;
  const difficulty  = document.getElementById('quizDifficulty')?.value;
  const count       = parseInt(document.getElementById('quizCount')?.value || 5);
  const topic       = document.getElementById('quizTopic')?.value || '';
  const apiKey      = getApiKey();

  const subjectNames = {
    c:  'Fundamentals of C Programming',
    ai: 'Foundations of AI Algorithms (Fuzzy Logic, Neural Networks, Genetic Algorithms)',
    fe: 'Front End Engineering (JavaScript, DOM, Async, Git)',
    os: 'Operating Systems and Linux Fundamentals'
  };
  const subjectLabel = subjectNames[subjectKey] || 'General';

  const qConfig   = document.getElementById('quizConfig');
  const qLoading  = document.getElementById('quizLoading');
  const qPanel    = document.getElementById('quizPanel');
  const qResults  = document.getElementById('resultsPanel');
  if (qConfig)  qConfig.style.display  = 'none';
  if (qLoading) qLoading.style.display = 'flex';
  if (qPanel)   qPanel.style.display   = 'none';
  if (qResults) qResults.style.display = 'none';

  if (apiKey) {
    const topicStr = topic ? ` focusing on ${topic}` : '';
    const prompt = `Generate exactly ${count} MCQ questions about "${subjectLabel}"${topicStr} at ${difficulty} difficulty.\n\nReturn ONLY a raw JSON array — no markdown, no backticks.\n\nFormat:\n[{"q":"Question?","options":["A","B","C","D"],"correct":0,"explanation":"Why correct."}]\n\n- "correct" is 0-based index\n- Exactly 4 options per question\n- Explanations: 1-2 educational sentences\n- Factually accurate and at ${difficulty} level`;
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-opus-4-5',
          max_tokens: 2500,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      let text = (data.content || []).map(c => c.text || '').join('');
      text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const si = text.indexOf('['), ei = text.lastIndexOf(']');
      if (si === -1 || ei === -1) throw new Error('No JSON array');
      quizQuestions = JSON.parse(text.substring(si, ei + 1));
      if (!Array.isArray(quizQuestions) || !quizQuestions.length) throw new Error('Empty quiz');
      startQuiz();
      return;
    } catch (err) {
      console.warn('AI quiz failed, falling back:', err.message);
      const ltEl = document.querySelector('.loading-txt');
      if (ltEl) ltEl.textContent = 'AI unavailable — loading local questions...';
      await new Promise(r => setTimeout(r, 800));
      showKeyStatus('⚠ AI call failed: ' + err.message + '. Using built-in bank.', false);
    }
  }

  quizQuestions = getLocalQuestions(subjectKey, count, difficulty, topic);
  if (!quizQuestions.length) {
    if (qLoading) qLoading.style.display = 'none';
    if (qConfig)  qConfig.style.display  = 'block';
    alert('No questions found. Please try a different topic filter.');
    return;
  }
  startQuiz();
}

function startQuiz() {
  currentQ = 0; score = 0;
  const qLoading = document.getElementById('quizLoading');
  const qPanel   = document.getElementById('quizPanel');
  if (qLoading) qLoading.style.display = 'none';
  if (qPanel)   qPanel.style.display   = 'block';
  renderQuestion();
}

function renderQuestion() {
  if (currentQ >= quizQuestions.length) { showResults(); return; }
  const q = quizQuestions[currentQ];
  answered = false;
  const pLabel = document.getElementById('qProgressLabel');
  const pFill  = document.getElementById('progressFill');
  const cScore = document.getElementById('currentScore');
  const nextBtn = document.getElementById('nextBtn');
  if (pLabel) pLabel.textContent = `Question ${currentQ + 1} of ${quizQuestions.length}`;
  if (pFill)  pFill.style.width  = `${(currentQ / quizQuestions.length) * 100}%`;
  if (cScore) cScore.textContent = score;
  if (nextBtn) nextBtn.style.display = 'none';
  const letters = ['A', 'B', 'C', 'D'];
  const safeQ = (q.q || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const qContainer = document.getElementById('questionContainer');
  if (qContainer) qContainer.innerHTML = `
    <div class="q-card">
      <div class="q-num">Question ${currentQ + 1}</div>
      <div class="q-text">${safeQ}</div>
      <div class="q-options">
        ${(q.options || []).map((opt, i) => `
          <button class="q-option" onclick="answerQ(${i})" id="opt_${i}">
            <span class="opt-letter">${letters[i]}</span>
            ${(opt || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
          </button>`).join('')}
      </div>
      <div class="feedback-box" id="feedbackBox"></div>
    </div>`;
}

function answerQ(selected) {
  if (answered) return;
  answered = true;
  const q = quizQuestions[currentQ];
  const correct = q.correct;
  const isCorrect = selected === correct;
  if (isCorrect) score++;
  // Store user's choice so showResults() can identify wrong topics
  q._userAnswer = selected;
  document.querySelectorAll('.q-option').forEach((btn, i) => {
    btn.disabled = true;
    if (i === correct) btn.classList.add('correct');
    else if (i === selected && !isCorrect) btn.classList.add('wrong');
  });
  const fb = document.getElementById('feedbackBox');
  if (fb) {
    fb.className = 'feedback-box ' + (isCorrect ? 'correct' : 'wrong');
    fb.style.display = 'block';
    fb.innerHTML = `<strong>${isCorrect ? '✓ Correct!' : '✗ Incorrect'}</strong> ${q.explanation || ''}`;
  }
  const cScore = document.getElementById('currentScore');
  if (cScore) cScore.textContent = score;
  const nextBtn = document.getElementById('nextBtn');
  if (nextBtn) {
    nextBtn.style.display = 'block';
    nextBtn.textContent = currentQ + 1 >= quizQuestions.length ? 'See Results →' : 'Next →';
  }
}

function nextQuestion() { currentQ++; renderQuestion(); }

function showResults() {
  const qPanel   = document.getElementById('quizPanel');
  const qResults = document.getElementById('resultsPanel');
  if (qPanel)   qPanel.style.display   = 'none';
  if (qResults) qResults.style.display = 'block';
  const total = quizQuestions.length;
  const pct   = Math.round((score / total) * 100);

  const setPct  = document.getElementById('resultPct');
  const setCorr = document.getElementById('rbCorrect');
  const setWrng = document.getElementById('rbWrong');
  const setTot  = document.getElementById('rbTotal');
  const setFill = document.getElementById('progressFill');
  if (setPct)  setPct.textContent  = pct + '%';
  if (setCorr) setCorr.textContent = score;
  if (setWrng) setWrng.textContent = total - score;
  if (setTot)  setTot.textContent  = total;
  if (setFill) setFill.style.width = '100%';

  const msgs = [
    [0, 49, "Keep practicing! 📚", "Review the material and try again — you've got this."],
    [50, 69, "Good effort! 🎯", "You're getting there! Go over the topics you missed."],
    [70, 84, "Great work! ⚡", "Solid understanding — a little more practice and you'll ace it."],
    [85, 100, "Outstanding! 🏆", "Excellent mastery of the material!"]
  ];
  const m = msgs.find(([lo, hi]) => pct >= lo && pct <= hi) || msgs[3];
  const titleEl = document.getElementById('resultTitle');
  const subEl   = document.getElementById('resultSub');
  if (titleEl) titleEl.textContent = m[2];
  if (subEl)   subEl.textContent   = m[3];

  // ── Collect wrong topics for analytics ──
  const wrongTopics = [];
  quizQuestions.forEach((q, i) => {
    if (q._userAnswer !== undefined && q._userAnswer !== q.correct) {
      wrongTopics.push(q.topic || 'General');
    }
  });

  const subject    = document.getElementById('quizSubject')?.value || 'Unknown';
  const difficulty = document.getElementById('quizDifficulty')?.value || 'intermediate';
  const topicSel   = document.getElementById('quizTopic')?.value || 'all';
  const topicLabel = topicSel === 'all' ? 'All Topics' : topicSel;

  // ── Build rich history entry ──
  const entry = {
    id:         Date.now(),
    date:       new Date().toISOString(),
    subject,
    topic:      topicLabel,
    difficulty,
    count:      total,
    correct:    score,
    wrong:      total - score,
    score:      pct,        // analytics reads q.score as pct
    pct,
    passed:     pct >= 60,
    weakTopics: wrongTopics
  };

  // ── Save to sb_quiz_history (primary key used by Analytics.html & quiz.js) ──
  const history = JSON.parse(localStorage.getItem('sb_quiz_history') || '[]');
  history.unshift(entry);
  if (history.length > 50) history.length = 50;
  localStorage.setItem('sb_quiz_history', JSON.stringify(history));
  localStorage.setItem('myQuizzes', JSON.stringify(history)); // legacy compat

  // ── Update sb_weak_areas (array of {topic, count}) ──
  let weakArr = [];
  try { weakArr = JSON.parse(localStorage.getItem('sb_weak_areas')) || []; } catch (_) {}
  wrongTopics.forEach(t => {
    const w = weakArr.find(x => x.topic === t);
    if (w) w.count = (w.count || 0) + 1;
    else weakArr.push({ topic: t, count: 1 });
  });
  weakArr.sort((a, b) => b.count - a.count);
  localStorage.setItem('sb_weak_areas', JSON.stringify(weakArr));

  // ── Re-render dashboard quiz sections if they exist ──
  renderRecentQuizzes();
  renderMyQuizzes();
}

function resetQuiz() {
  quizQuestions = []; currentQ = 0; score = 0;
  const qResults = document.getElementById('resultsPanel');
  const qPanel   = document.getElementById('quizPanel');
  const qConfig  = document.getElementById('quizConfig');
  const pFill    = document.getElementById('progressFill');
  const ltEl     = document.querySelector('.loading-txt');
  if (qResults) qResults.style.display = 'none';
  if (qPanel)   qPanel.style.display   = 'none';
  if (qConfig)  qConfig.style.display  = 'block';
  if (pFill)    pFill.style.width      = '0%';
  if (ltEl)     ltEl.textContent       = 'Generating your quiz, please wait...';
}

// ===== SMART TICKER =====
const dailySchedule = {
  "Monday":    [{ label:"OS & Linux",teacher:"Mr. Rahul",start:"16:10",end:"17:00",room:"MB-505"},{ label:"DM",teacher:"KD Sharma",start:"17:50",end:"18:40",room:"MB-505"},{ label:"FCP",teacher:"Mr. Yogesh",start:"19:50",end:"21:20",room:"MB-505"}],
  "Tuesday":   [{ label:"FAA",teacher:"Mr. Prabhjot",start:"16:10",end:"17:50",room:"MB-505"},{ label:"DM",teacher:"KD Sharma",start:"17:50",end:"19:30",room:"MB-505"},{ label:"FCP",teacher:"Mr. Yogesh",start:"19:50",end:"21:20",room:"MB-505"}],
  "Wednesday": [{ label:"FAA",teacher:"Mr. Prabhjot",start:"16:10",end:"17:50",room:"MB-505"},{ label:"FEE",teacher:"Mr. Sourabh",start:"17:50",end:"19:30",room:"MB-505"},{ label:"FCP",teacher:"Mr. Yogesh",start:"19:50",end:"21:20",room:"MB-505"}],
  "Thursday":  [{ label:"FEE",teacher:"Mr. Sourabh",start:"16:10",end:"17:50",room:"MB-505"},{ label:"OS & Linux",teacher:"Mr. Rahul",start:"17:50",end:"19:30",room:"MB-505"},{ label:"FCP",teacher:"Mr. Yogesh",start:"19:50",end:"21:20",room:"MB-505"}],
  "Friday":    [{ label:"FCP",teacher:"Mr. Yogesh",start:"16:10",end:"17:50",room:"MB-505"},{ label:"FEE",teacher:"Mr. Sourabh",start:"17:50",end:"19:30",room:"MB-505"},{ label:"OS & Linux",teacher:"Mr. Rahul",start:"19:50",end:"21:20",room:"MB-505"}],
  "Saturday":  [{ label:"Azure Self-Study",teacher:"Self-paced",start:"10:00",end:"12:00",room:"Home"}],
  "Sunday":    [{ label:"Campus Holiday",teacher:"Offline",start:"00:00",end:"23:59",room:"—"}]
};
const subjectNames = { "FCP":"Fundamentals of C","FAA":"AI Algorithms","FEE":"Front End Engg","OS & Linux":"OS & Linux","DM":"Discrete Maths","Azure Self-Study":"Azure Prep","Campus Holiday":"Holiday 🎉" };

function parseTime(t) { const [h,m]=t.split(':').map(Number); return h*60+m; }
function getClassStatus(s,e) {
  const now=new Date(), cur=now.getHours()*60+now.getMinutes(), st=parseTime(s), en=parseTime(e);
  if(cur>=st&&cur<en) return 'live';
  if(cur>=st-30&&cur<st) return 'upcoming';
  if(cur>=en) return 'done';
  return 'upcoming';
}
function formatTime12(t) { const [h,m]=t.split(':').map(Number); return `${h%12||12}:${m<10?'0'+m:m} ${h>=12?'PM':'AM'}`; }

function buildTickerHTML(classes) {
  return classes.map(cls => {
    const status=getClassStatus(cls.start,cls.end);
    const full=subjectNames[cls.label]||cls.label;
    const badge={live:`<span class="t-badge live">● LIVE NOW</span>`,upcoming:`<span class="t-badge upcoming">↑ UPCOMING</span>`,done:`<span class="t-badge done">✓ DONE</span>`};
    return `<span class="ticker-item"><span class="t-sep">◆</span>${badge[status]}<span class="t-subject-label">${full}</span><span style="color:rgba(226,232,240,0.5);font-size:0.72rem;">${cls.teacher}</span><span style="color:rgba(226,232,240,0.45);font-size:0.72rem;">${formatTime12(cls.start)}–${formatTime12(cls.end)}</span><span class="t-loc">${cls.room}</span></span>`;
  }).join('');
}

function getDailySchedule() {
  try { const s=localStorage.getItem('sb_timetable'); if(s) return JSON.parse(s); } catch(e) {}
  return dailySchedule;
}
function updateTicker() {
  const day=new Intl.DateTimeFormat('en-US',{weekday:'long'}).format(new Date());
  const classes=getDailySchedule()[day]||[];
  const inner=document.getElementById('tickerInner');
  if(!inner) return;
  if(!classes.length){ inner.innerHTML=`<span class="ticker-item"><span class="t-sep">◆</span> No classes scheduled today — Rest up! 💤</span>`.repeat(4); return; }
  inner.innerHTML=buildTickerHTML(classes).repeat(3);
  const liveCount=classes.filter(c=>getClassStatus(c.start,c.end)==='live').length;
  const titleEl=document.querySelector('.ticker-title');
  if(titleEl) titleEl.innerHTML=liveCount>0?`<span style="animation:pulse 1s infinite;display:inline-block;width:7px;height:7px;border-radius:50%;background:#f87171;margin-right:7px;"></span> LIVE`:`📅 Today`;
}
updateTicker();
setInterval(updateTicker, 60000);
if(typeof renderPastSessions === 'function') renderPastSessions();

document.addEventListener('DOMContentLoaded', () => {
  const cy = document.getElementById('currentYear');
  if(cy) cy.textContent = new Date().getFullYear();
});

// ===== TIMETABLE UPLOAD & AI PARSING =====
let _ttParsedSchedule=null, _ttFileBase64=null, _ttFileType=null;

function handleTtDrop(e) {
  e.preventDefault();
  const area=document.getElementById('ttUploadArea');
  if(area) area.style.borderColor='var(--surface-border)';
  const file=e.dataTransfer.files[0];
  if(file) handleTtUpload(file);
}

function handleTtUpload(file) {
  if(!file) return;
  if(file.size>10*1024*1024){ ttSetStatus('err','⚠️ File too large. Max 10 MB.'); return; }
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){ ttSetStatus('err','⚠️ Please upload JPG, PNG or WebP.'); return; }
  _ttFileType=file.type;
  const fn=document.getElementById('ttFileName'); if(fn) fn.textContent=file.name;
  const st=document.getElementById('ttStatus'); if(st) st.style.display='none';
  const sp=document.getElementById('ttSchedulePreview'); if(sp) sp.style.display='none';
  const sb=document.getElementById('ttSaveBtn'); if(sb) sb.style.display='none';
  const reader=new FileReader();
  reader.onload=function(ev){
    const dataUrl=ev.target.result;
    _ttFileBase64=dataUrl.split(',')[1];
    const pw=document.getElementById('ttPreviewWrap');
    const pi=document.getElementById('ttPreviewImg');
    if(pi) pi.src=dataUrl;
    if(pw) pw.style.display='block';
    const pb=document.getElementById('ttParseBtn'); if(pb) pb.style.display='inline-flex';
    ttSetStatus('info','📂 Image loaded. Click "Extract with AI" to parse your timetable.');
  };
  reader.readAsDataURL(file);
}

async function parseTimetableWithAI() {
  if(!_ttFileBase64){ ttSetStatus('err','⚠️ Please upload an image first.'); return; }
  const btn=document.getElementById('ttParseBtn');
  if(btn){ btn.disabled=true; btn.textContent='⏳ Analysing…'; }
  ttSetStatus('info','🤖 AI is reading your timetable, please wait…');

  const mime=_ttFileType||'image/jpeg';
  const imageDataUrl=`data:${mime};base64,${_ttFileBase64}`;
  const promptText=`You are a timetable parser. Look at this weekly class schedule image carefully and extract ALL classes.\n\nReturn ONLY a valid JSON object — no markdown, no explanation:\n{\n  "Monday":    [{"label":"Subject","teacher":"Teacher","start":"HH:MM","end":"HH:MM","room":"Room"}],\n  "Tuesday":   [],\n  "Wednesday": [],\n  "Thursday":  [],\n  "Friday":    [],\n  "Saturday":  [],\n  "Sunday":    []\n}\n\nRules:\n- 24-hour time (09:00, 14:30)\n- If end not visible, add 1hr to start\n- Empty day = []\n- Missing teacher/room = ""\n- Include ALL 7 days`;

  let parsed=null, lastError='';

  // Try 1: Groq vision
  try {
    const res=await fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${GROQ_API_KEY}`},
      body:JSON.stringify({
        model:'meta-llama/llama-4-scout-17b-16e-instruct',
        max_tokens:2000, temperature:0.1,
        messages:[{role:'user',content:[
          {type:'image_url',image_url:{url:imageDataUrl}},
          {type:'text',text:promptText}
        ]}]
      })
    });
    if(!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
    const json=await res.json();
    const text=(json.choices?.[0]?.message?.content||'').replace(/```json|```/g,'').trim();
    const match=text.match(/\{[\s\S]*\}/);
    if(!match) throw new Error('No JSON in Groq response');
    parsed=JSON.parse(match[0]);
  } catch(e){ lastError=e.message; console.warn('Groq vision failed:',e.message);
    // Try 2: Anthropic fallback
    const anthropicKey=getApiKey();
    if(anthropicKey){
      try{
        const res2=await fetch('https://api.anthropic.com/v1/messages',{
          method:'POST',
          headers:{'Content-Type':'application/json','x-api-key':anthropicKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
          body:JSON.stringify({model:'claude-opus-4-5',max_tokens:2000,messages:[{role:'user',content:[
            {type:'image',source:{type:'base64',media_type:mime,data:_ttFileBase64}},
            {type:'text',text:promptText}
          ]}]})
        });
        if(!res2.ok) throw new Error(`Anthropic ${res2.status}`);
        const json2=await res2.json();
        const text2=(json2.content||[]).map(b=>b.text||'').join('').replace(/```json|```/g,'').trim();
        const match2=text2.match(/\{[\s\S]*\}/);
        if(!match2) throw new Error('No JSON in Anthropic response');
        parsed=JSON.parse(match2[0]);
      } catch(e2){ lastError=e2.message; console.warn('Anthropic failed:',e2.message); }
    }
  }

  if(btn){ btn.disabled=false; btn.textContent='🤖 Extract with AI'; }
  if(!parsed){ ttSetStatus('err',`❌ Could not read timetable: ${lastError}`); return; }
  const total=Object.values(parsed).reduce((s,arr)=>s+(Array.isArray(arr)?arr.length:0),0);
  if(total===0){ ttSetStatus('err','⚠️ No classes found. Try a clearer, well-lit photo.'); return; }
  _ttParsedSchedule=parsed;
  renderTtPreview(parsed);
  const sb2=document.getElementById('ttSaveBtn'); if(sb2) sb2.style.display='inline-flex';
  ttSetStatus('ok',`✅ Found ${total} classes! Review below, then click "Save & Apply".`);
}

function renderTtPreview(schedule) {
  const days=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const list=document.getElementById('ttDayList'); if(!list) return;
  list.innerHTML=days.map(day=>{
    const cls=schedule[day]||[];
    if(!cls.length) return `<div style="padding:6px 10px;font-size:.82rem;color:var(--text-muted);"><b>${day}:</b> No classes</div>`;
    return `<div style="background:var(--surface);border:1px solid var(--surface-border);border-radius:10px;padding:10px 14px;margin-bottom:4px;">
      <div style="font-weight:700;font-size:.82rem;color:var(--primary);margin-bottom:6px;">${day}</div>
      ${cls.map(c=>`<div style="font-size:.8rem;color:var(--text);margin-bottom:3px;">⏰ ${formatTime12(c.start)}${c.end?' – '+formatTime12(c.end):''} &nbsp;·&nbsp; <b>${c.label}</b>${c.teacher?' · '+c.teacher:''}${c.room?' · <span style="color:var(--text-muted)">'+c.room+'</span>':''}</div>`).join('')}
    </div>`;
  }).join('');
  const sp=document.getElementById('ttSchedulePreview'); if(sp) sp.style.display='block';
}

function saveTimetable(){
  if(!_ttParsedSchedule){ ttSetStatus('err','⚠️ Nothing to save. Parse first.'); return; }
  localStorage.setItem('sb_timetable',JSON.stringify(_ttParsedSchedule));
  updateTicker();
  ttSetStatus('ok','✅ Saved! Your class ticker is now live.');
  const sb=document.getElementById('ttSaveBtn'); if(sb) sb.style.display='none';
}

function clearTimetable(){
  if(!confirm('Clear saved timetable and revert to default?')) return;
  localStorage.removeItem('sb_timetable');
  _ttParsedSchedule=null; _ttFileBase64=null;
  ['ttPreviewWrap','ttSchedulePreview'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';});
  ['ttParseBtn','ttSaveBtn'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';});
  const fn=document.getElementById('ttFileName'); if(fn) fn.textContent='';
  const fi=document.getElementById('ttFileInput'); if(fi) fi.value='';
  updateTicker();
  ttSetStatus('info','🗑 Cleared. Using default schedule.');
}

function ttSetStatus(type,msg){
  const el=document.getElementById('ttStatus'); if(!el) return;
  el.style.display='block';
  el.textContent=msg;
  el.style.cssText+=`;background:${type==='ok'?'color-mix(in srgb,#059669 15%,var(--surface))':type==='err'?'color-mix(in srgb,#ef4444 15%,var(--surface))':'var(--surface)'};color:${type==='ok'?'#059669':type==='err'?'#ef4444':'var(--text-muted)'};border:1px solid ${type==='ok'?'#059669':type==='err'?'#ef4444':'var(--surface-border)'};border-radius:12px;padding:12px 16px;font-weight:600;font-size:.85rem;margin-top:14px;`;
}

// ===== ABOUT SECTION LOGIC =====
window.addEventListener('scroll', () => {
  const aboutSec = document.getElementById('about');
  const navAbout = document.querySelector('.nav-about');
  if (!aboutSec || !navAbout) return;
  
  const rect = aboutSec.getBoundingClientRect();
  if (rect.top <= window.innerHeight / 2 && rect.bottom >= window.innerHeight / 2) {
    navAbout.classList.add('active');
  } else {
    navAbout.classList.remove('active');
  }
});

document.querySelectorAll('.nav-about').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    e.preventDefault();
    const target = document.getElementById('about');
    if (target) target.scrollIntoView({ behavior: 'smooth' });
  });
});