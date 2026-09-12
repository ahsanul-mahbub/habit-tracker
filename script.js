/* ==========================================================================
   ALMANAC — script.js
   Vanilla JS, LocalStorage only. No frameworks, no network calls.
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 0. CONSTANTS & STORAGE KEYS
   * ------------------------------------------------------------------ */

  const STORAGE_KEYS = {
    habits: 'almanac.habits',           // array of habit objects
    history: 'almanac.history',         // { 'YYYY-MM-DD': { habitId: true/false } }
    dailyGoal: 'almanac.dailyGoal',      // number (percent)
    theme: 'almanac.theme',             // 'light' | 'dark'
    pomoSettings: 'almanac.pomoSettings',// { focus, short, long, cycle, sound }
    pomoLog: 'almanac.pomoLog',          // array of completed session records
    pomoSelectedHabit: 'almanac.pomoSelectedHabit' // habitId or null
  };

  const EMOJI_OPTIONS = ['📖', '💻', '🏃', '🧘', '📚', '💧', '😴', '☀️', '🕌', '🎯', '✍️', '🎨', '🎵', '🥗', '💪'];
  const COLOR_OPTIONS = ['#A8562F', '#5B7553', '#3E6B8A', '#8A5FA8', '#C08A2E', '#B0553F', '#4A7A6E', '#7A5C3E'];

  const DAY_MS = 24 * 60 * 60 * 1000;

  /* ------------------------------------------------------------------ *
   * 1. STORAGE HELPERS — safe read/write with fallback defaults
   * ------------------------------------------------------------------ */

  function saveToLocalStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error('Almanac: failed to save', key, err);
      showToast("Couldn't save — your browser storage may be full.");
      return false;
    }
  }

  function loadFromLocalStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      const parsed = JSON.parse(raw);
      if (parsed === null || parsed === undefined) return fallback;
      return parsed;
    } catch (err) {
      console.error('Almanac: failed to parse', key, err);
      return fallback;
    }
  }

  /* ------------------------------------------------------------------ *
   * 2. STATE
   * ------------------------------------------------------------------ */

  const state = {
    habits: loadFromLocalStorage(STORAGE_KEYS.habits, []),
    history: loadFromLocalStorage(STORAGE_KEYS.history, {}),
    dailyGoal: loadFromLocalStorage(STORAGE_KEYS.dailyGoal, 80),
    theme: loadFromLocalStorage(STORAGE_KEYS.theme, getPreferredTheme()),
    pomoSettings: loadFromLocalStorage(STORAGE_KEYS.pomoSettings, {
      focus: 25, short: 5, long: 15, cycle: 4, sound: true
    }),
    pomoLog: loadFromLocalStorage(STORAGE_KEYS.pomoLog, []),
    pomoSelectedHabit: loadFromLocalStorage(STORAGE_KEYS.pomoSelectedHabit, null)
  };

  // Defensive normalization in case of corrupted / partial data
  if (!Array.isArray(state.habits)) state.habits = [];
  if (typeof state.history !== 'object' || state.history === null) state.history = {};
  if (typeof state.dailyGoal !== 'number' || isNaN(state.dailyGoal)) state.dailyGoal = 80;
  if (!Array.isArray(state.pomoLog)) state.pomoLog = [];
  if (typeof state.pomoSettings !== 'object' || state.pomoSettings === null) {
    state.pomoSettings = { focus: 25, short: 5, long: 15, cycle: 4, sound: true };
  }
  ['focus', 'short', 'long', 'cycle'].forEach(k => {
    if (typeof state.pomoSettings[k] !== 'number' || isNaN(state.pomoSettings[k]) || state.pomoSettings[k] <= 0) {
      const defaults = { focus: 25, short: 5, long: 15, cycle: 4 };
      state.pomoSettings[k] = defaults[k];
    }
  });
  if (typeof state.pomoSettings.sound !== 'boolean') state.pomoSettings.sound = true;

  function getPreferredTheme() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  /* ------------------------------------------------------------------ *
   * 3. DATE HELPERS
   * ------------------------------------------------------------------ */

  function todayKey() {
    return dateToKey(new Date());
  }

  function dateToKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function keyToDate(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(key, n) {
    const d = keyToDate(key);
    d.setDate(d.getDate() + n);
    return dateToKey(d);
  }

  function isSameOrBefore(keyA, keyB) {
    return keyA <= keyB;
  }

  function formatFullDate(d) {
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  }

  function formatShortDate(d) {
    return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  }

  /* ------------------------------------------------------------------ *
   * 4. HABIT CRUD
   * ------------------------------------------------------------------ */

  function generateId() {
    return 'h_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function addHabit(name, emoji, color) {
    const habit = {
      id: generateId(),
      name: name.trim(),
      emoji: emoji || '🎯',
      color: color || null,
      createdAt: todayKey(),
      bestStreak: 0
    };
    state.habits.push(habit);
    saveToLocalStorage(STORAGE_KEYS.habits, state.habits);
    return habit;
  }

  function editHabit(id, name, emoji, color) {
    const habit = state.habits.find(h => h.id === id);
    if (!habit) return;
    habit.name = name.trim();
    habit.emoji = emoji || habit.emoji;
    habit.color = color || null;
    saveToLocalStorage(STORAGE_KEYS.habits, state.habits);
  }

  function deleteHabit(id) {
    state.habits = state.habits.filter(h => h.id !== id);
    saveToLocalStorage(STORAGE_KEYS.habits, state.habits);

    // Remove this habit's entries from every day in history
    Object.keys(state.history).forEach(dayKey => {
      if (state.history[dayKey] && Object.prototype.hasOwnProperty.call(state.history[dayKey], id)) {
        delete state.history[dayKey][id];
      }
    });
    saveToLocalStorage(STORAGE_KEYS.history, state.history);

    // Remove pomodoro log entries tied to this habit's id (keep the sessions, just detach the habit link)
    state.pomoLog.forEach(entry => {
      if (entry.habitId === id) entry.habitId = null;
    });
    saveToLocalStorage(STORAGE_KEYS.pomoLog, state.pomoLog);

    if (state.pomoSelectedHabit === id) {
      state.pomoSelectedHabit = null;
      saveToLocalStorage(STORAGE_KEYS.pomoSelectedHabit, null);
    }
  }

  function toggleHabit(id, dayKey) {
    dayKey = dayKey || todayKey();
    if (!state.history[dayKey]) state.history[dayKey] = {};
    const current = !!state.history[dayKey][id];
    state.history[dayKey][id] = !current;
    saveToLocalStorage(STORAGE_KEYS.history, state.history);

    // Recalculate & persist best streak for this habit
    const habit = state.habits.find(h => h.id === id);
    if (habit) {
      const { current: cur, best } = calculateStreak(id);
      habit.bestStreak = Math.max(habit.bestStreak || 0, best);
      saveToLocalStorage(STORAGE_KEYS.habits, state.habits);
    }

    return !current;
  }

  function isHabitDoneOn(id, dayKey) {
    return !!(state.history[dayKey] && state.history[dayKey][id]);
  }

  /* ------------------------------------------------------------------ *
   * 5. STREAK CALCULATION
   *    Current streak: consecutive completed days ending today (or
   *    yesterday, if today hasn't been marked yet — so the streak
   *    doesn't visually "break" until the day is actually missed).
   *    Best streak: longest consecutive run in all recorded history.
   * ------------------------------------------------------------------ */

  function calculateStreak(habitId) {
    const habit = state.habits.find(h => h.id === habitId);
    const createdAt = habit ? habit.createdAt : null;

    // Walk backward from today counting consecutive completed days.
    let current = 0;
    const todayDone = isHabitDoneOn(habitId, todayKey());
    let cursor = todayDone ? todayKey() : addDays(todayKey(), -1);

    // If today is not done, current streak is based on the run ending
    // yesterday (today just hasn't been actioned yet).
    while (true) {
      if (createdAt && cursor < createdAt) break;
      if (isHabitDoneOn(habitId, cursor)) {
        current += 1;
        cursor = addDays(cursor, -1);
      } else {
        break;
      }
    }

    // Best streak: scan all history keys for this habit, find longest run.
    const allDayKeys = Object.keys(state.history).sort(); // chronological
    let best = 0;
    let run = 0;
    let prevKey = null;

    allDayKeys.forEach(dayKey => {
      const done = isHabitDoneOn(habitId, dayKey);
      if (done) {
        if (prevKey && addDays(prevKey, 1) === dayKey) {
          run += 1;
        } else {
          run = 1;
        }
        best = Math.max(best, run);
        prevKey = dayKey;
      } else {
        // A missed/false entry breaks continuity tracking, but doesn't
        // reset prevKey unless the day is explicitly recorded — false
        // values ARE explicit (user unchecked, or day passed unmarked
        // once processed), so treat as a break.
        run = 0;
        prevKey = dayKey;
      }
    });

    // Include stored bestStreak so it never decreases even if history
    // was somehow trimmed.
    if (habit && habit.bestStreak) {
      best = Math.max(best, habit.bestStreak);
    }
    best = Math.max(best, current);

    return { current, best };
  }

  /* ------------------------------------------------------------------ *
   * 6. PROGRESS / STATS CALCULATIONS
   * ------------------------------------------------------------------ */

  function getDayCompletion(dayKey) {
    // Only counts habits that existed on/before that day.
    const relevantHabits = state.habits.filter(h => !h.createdAt || h.createdAt <= dayKey);
    if (relevantHabits.length === 0) return null; // no data
    let completed = 0;
    relevantHabits.forEach(h => {
      if (isHabitDoneOn(h.id, dayKey)) completed += 1;
    });
    return { completed, total: relevantHabits.length, percent: Math.round((completed / relevantHabits.length) * 100) };
  }

  function getDayStatus(dayKey) {
    if (dayKey > todayKey()) return 'none'; // future day

    const dayHasAnyEntry = !!state.history[dayKey] && Object.keys(state.history[dayKey]).length > 0;
    if (!dayHasAnyEntry) return 'none';

    const completion = getDayCompletion(dayKey);
    if (!completion) return 'none'; // no habits existed yet on this day

    if (completion.percent === 100) return 'complete';
    if (completion.percent === 0) return 'missed';
    return 'partial';
  }

  function averageCompletionOverRange(startKey, endKey) {
    let sum = 0;
    let count = 0;
    let cursor = startKey;
    while (cursor <= endKey) {
      if (cursor <= todayKey()) {
        const c = getDayCompletion(cursor);
        if (c) {
          sum += c.percent;
          count += 1;
        }
      }
      cursor = addDays(cursor, 1);
    }
    return count === 0 ? 0 : Math.round(sum / count);
  }

  function calculateProgress() {
    const today = todayKey();
    const relevantHabits = state.habits.filter(h => !h.createdAt || h.createdAt <= today);
    const completed = relevantHabits.filter(h => isHabitDoneOn(h.id, today)).length;
    const total = relevantHabits.length;
    const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
    return { completed, total, percent };
  }

  function getTotalCompletedCount() {
    let total = 0;
    Object.values(state.history).forEach(day => {
      Object.values(day).forEach(v => { if (v) total += 1; });
    });
    return total;
  }

  function getBestStreakAcrossAllHabits() {
    let best = 0;
    state.habits.forEach(h => {
      const { best: b } = calculateStreak(h.id);
      best = Math.max(best, b);
    });
    return best;
  }

  /* ------------------------------------------------------------------ *
   * 7. RENDER: DASHBOARD
   * ------------------------------------------------------------------ */

  const el = {}; // populated on DOMContentLoaded

  function renderGreeting() {
    const now = new Date();
    const hour = now.getHours();
    let greeting = 'Good evening';
    if (hour < 12) greeting = 'Good morning';
    else if (hour < 18) greeting = 'Good afternoon';
    el.greeting.textContent = `${greeting}`;
    el.todayDate.textContent = formatFullDate(now);
  }

  function renderProgress() {
    const { completed, total, percent } = calculateProgress();
    el.progressFraction.textContent = `${completed} / ${total}`;
    el.progressPercent.textContent = `${percent}%`;
    el.progressBarFill.style.width = `${percent}%`;

    const goalMet = total > 0 && percent >= state.dailyGoal;
    el.goalCelebrate.hidden = !goalMet;

    el.dailyGoalSelect.value = String(state.dailyGoal);
  }

  function renderFocusSummary() {
    const today = todayKey();
    const todaysSessions = state.pomoLog.filter(s => s.dateKey === today);
    const totalMinutes = todaysSessions.reduce((sum, s) => sum + s.minutes, 0);
    el.focusTodayBig.textContent = formatMinutes(totalMinutes);
    el.focusTodaySessions.textContent = `${todaysSessions.length} session${todaysSessions.length === 1 ? '' : 's'} completed`;
  }

  function formatMinutes(mins) {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return `${h}h ${m}m`;
  }

  function renderHabits() {
    const list = el.habitList;
    list.innerHTML = '';

    if (state.habits.length === 0) {
      el.habitsEmpty.hidden = false;
      el.habitCountMeta.textContent = '';
      return;
    }
    el.habitsEmpty.hidden = true;

    const today = todayKey();
    const doneCount = state.habits.filter(h => isHabitDoneOn(h.id, today)).length;
    el.habitCountMeta.textContent = `${doneCount} of ${state.habits.length} done`;

    state.habits.forEach(habit => {
      const done = isHabitDoneOn(habit.id, today);
      const { current } = calculateStreak(habit.id);

      const li = document.createElement('li');
      li.className = 'habit-card' + (done ? ' is-done' : '');
      li.dataset.id = habit.id;
      if (habit.color) li.style.setProperty('--habit-accent', habit.color);

      li.innerHTML = `
        <button class="habit-check" aria-label="Mark ${escapeHtml(habit.name)} as ${done ? 'not done' : 'done'}" aria-pressed="${done}">
          <svg viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.2 12L13 4" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="habit-icon">${habit.emoji}</div>
        <div class="habit-main">
          <p class="habit-name">${escapeHtml(habit.name)}</p>
          <div class="habit-meta">
            <span class="habit-streak"><span class="habit-streak-flame">🔥</span> ${current} day${current === 1 ? '' : 's'}</span>
          </div>
        </div>
        <div class="habit-actions">
          <button class="habit-action-btn edit-habit-btn" aria-label="Edit ${escapeHtml(habit.name)}" title="Edit">✎</button>
          <button class="habit-action-btn danger delete-habit-btn" aria-label="Delete ${escapeHtml(habit.name)}" title="Delete">🗑</button>
        </div>
      `;

      list.appendChild(li);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function renderDashboard() {
    renderGreeting();
    renderProgress();
    renderFocusSummary();
    renderHabits();
  }

  /* ------------------------------------------------------------------ *
   * 8. RENDER: HISTORY
   * ------------------------------------------------------------------ */

  let selectedHistoryDay = null;

  function renderHistory() {
    const grid = el.historyGrid;
    grid.innerHTML = '';

    const today = todayKey();
    const days = [];
    for (let i = 29; i >= 0; i--) {
      days.push(addDays(today, -i));
    }

    days.forEach(dayKey => {
      const status = getDayStatus(dayKey);
      const d = keyToDate(dayKey);
      const cell = document.createElement('button');
      cell.className = 'history-cell';
      cell.dataset.status = status;
      cell.dataset.day = dayKey;
      cell.textContent = String(d.getDate());
      cell.setAttribute('aria-label', `${formatShortDate(d)}: ${status}`);
      if (dayKey === selectedHistoryDay) cell.classList.add('is-selected');
      grid.appendChild(cell);
    });

    if (selectedHistoryDay) {
      renderDayDetail(selectedHistoryDay);
    }
  }

  function renderDayDetail(dayKey) {
    el.dayDetail.hidden = false;
    const d = keyToDate(dayKey);
    el.dayDetailTitle.textContent = formatShortDate(d);

    const completion = getDayCompletion(dayKey);
    el.dayDetailPct.textContent = completion ? `${completion.percent}% complete` : 'No data';

    const list = el.dayDetailList;
    list.innerHTML = '';

    const relevantHabits = state.habits.filter(h => !h.createdAt || h.createdAt <= dayKey);

    if (relevantHabits.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No habits existed on this day.';
      li.style.color = 'var(--ink-faint)';
      list.appendChild(li);
      return;
    }

    relevantHabits.forEach(h => {
      const done = isHabitDoneOn(h.id, dayKey);
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="di-mark ${done ? 'yes' : 'no'}">${done ? '✓' : '✕'}</span>
        <span>${habit_icon_and_name(h)}</span>
      `;
      list.appendChild(li);
    });
  }

  function habit_icon_and_name(h) {
    return `${h.emoji} ${escapeHtml(h.name)}`;
  }

  /* ------------------------------------------------------------------ *
   * 9. RENDER: STATISTICS
   * ------------------------------------------------------------------ */

  function renderStatistics() {
    const today = todayKey();
    const todayC = getDayCompletion(today);
    el.statToday.textContent = todayC ? `${todayC.percent}%` : '0%';

    const weekStart = addDays(today, -6);
    el.statWeek.textContent = `${averageCompletionOverRange(weekStart, today)}%`;

    const monthStart = addDays(today, -29);
    el.statMonth.textContent = `${averageCompletionOverRange(monthStart, today)}%`;

    el.statBestStreak.innerHTML = `${getBestStreakAcrossAllHabits()} <small>days</small>`;
    el.statTotalCompleted.textContent = String(getTotalCompletedCount());

    // Pomodoro stats
    const todaysSessions = state.pomoLog.filter(s => s.dateKey === today);
    el.pomoStatSessionsToday.textContent = String(todaysSessions.length);
    el.pomoStatTimeToday.textContent = formatMinutes(todaysSessions.reduce((s, x) => s + x.minutes, 0));

    const weekSessions = state.pomoLog.filter(s => s.dateKey >= weekStart && s.dateKey <= today);
    el.pomoStatSessionsWeek.textContent = String(weekSessions.length);
    el.pomoStatTimeWeek.textContent = formatMinutes(weekSessions.reduce((s, x) => s + x.minutes, 0));
  }

  /* ------------------------------------------------------------------ *
   * 10. VIEW SWITCHING & NAVIGATION
   * ------------------------------------------------------------------ */

  function switchView(viewName) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('is-active'));
    const target = document.getElementById('view-' + viewName);
    if (target) target.classList.add('is-active');

    document.querySelectorAll('.rail-link, .tabbar-link').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.view === viewName);
    });

    if (viewName === 'history') renderHistory();
    if (viewName === 'stats') renderStatistics();
    if (viewName === 'pomodoro') renderPomodoroSide();
  }

  function initNavigation() {
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });
  }

  /* ------------------------------------------------------------------ *
   * 11. HABIT MODAL (ADD / EDIT)
   * ------------------------------------------------------------------ */

  let editingHabitId = null;
  let selectedEmoji = EMOJI_OPTIONS[0];
  let selectedColor = null;

  function buildEmojiGrid() {
    el.emojiGrid.innerHTML = '';
    EMOJI_OPTIONS.forEach(em => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'emoji-opt' + (em === selectedEmoji ? ' is-selected' : '');
      btn.textContent = em;
      btn.setAttribute('aria-label', `Icon ${em}`);
      btn.addEventListener('click', () => {
        selectedEmoji = em;
        buildEmojiGrid();
      });
      el.emojiGrid.appendChild(btn);
    });
  }

  function buildColorGrid() {
    el.colorGrid.innerHTML = '';

    // "None" swatch
    const noneBtn = document.createElement('button');
    noneBtn.type = 'button';
    noneBtn.className = 'color-opt' + (selectedColor === null ? ' is-selected' : '');
    noneBtn.style.background = 'var(--line)';
    noneBtn.setAttribute('aria-label', 'No accent colour');
    noneBtn.addEventListener('click', () => { selectedColor = null; buildColorGrid(); });
    el.colorGrid.appendChild(noneBtn);

    COLOR_OPTIONS.forEach(color => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'color-opt' + (selectedColor === color ? ' is-selected' : '');
      btn.style.background = color;
      btn.setAttribute('aria-label', `Colour ${color}`);
      btn.addEventListener('click', () => { selectedColor = color; buildColorGrid(); });
      el.colorGrid.appendChild(btn);
    });
  }

  function openHabitModal(habit) {
    editingHabitId = habit ? habit.id : null;
    document.getElementById('habitModalTitle').textContent = habit ? 'Edit habit' : 'Add habit';
    el.habitNameInput.value = habit ? habit.name : '';
    selectedEmoji = habit ? habit.emoji : EMOJI_OPTIONS[0];
    selectedColor = habit ? habit.color : null;
    buildEmojiGrid();
    buildColorGrid();
    el.habitModalVeil.hidden = false;
    setTimeout(() => el.habitNameInput.focus(), 50);
  }

  function closeHabitModal() {
    el.habitModalVeil.hidden = true;
    editingHabitId = null;
    el.habitForm.reset();
  }

  function handleHabitFormSubmit(e) {
    e.preventDefault();
    const name = el.habitNameInput.value.trim();
    if (!name) return;

    if (editingHabitId) {
      editHabit(editingHabitId, name, selectedEmoji, selectedColor);
      showToast('Habit updated.');
    } else {
      addHabit(name, selectedEmoji, selectedColor);
      showToast('Habit added.');
    }

    closeHabitModal();
    renderDashboard();
  }

  /* ------------------------------------------------------------------ *
   * 12. DELETE CONFIRMATION MODAL
   * ------------------------------------------------------------------ */

  let pendingDeleteId = null;

  function openDeleteModal(habitId) {
    pendingDeleteId = habitId;
    el.deleteModalVeil.hidden = false;
  }

  function closeDeleteModal() {
    el.deleteModalVeil.hidden = true;
    pendingDeleteId = null;
  }

  function confirmHabitDelete() {
    if (pendingDeleteId) {
      deleteHabit(pendingDeleteId);
      showToast('Habit deleted.');
      renderDashboard();
    }
    closeDeleteModal();
  }

  /* ------------------------------------------------------------------ *
   * 13. HABIT LIST EVENT DELEGATION
   * ------------------------------------------------------------------ */

  function initHabitListEvents() {
    el.habitList.addEventListener('click', (e) => {
      const card = e.target.closest('.habit-card');
      if (!card) return;
      const habitId = card.dataset.id;

      if (e.target.closest('.habit-check')) {
        const nowDone = toggleHabit(habitId);
        const checkBtn = e.target.closest('.habit-check');
        checkBtn.classList.add('pulse');
        setTimeout(() => checkBtn.classList.remove('pulse'), 350);
        renderDashboard();
        return;
      }

      if (e.target.closest('.edit-habit-btn')) {
        const habit = state.habits.find(h => h.id === habitId);
        if (habit) openHabitModal(habit);
        return;
      }

      if (e.target.closest('.delete-habit-btn')) {
        openDeleteModal(habitId);
        return;
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * 14. HISTORY GRID EVENTS
   * ------------------------------------------------------------------ */

  function initHistoryEvents() {
    el.historyGrid.addEventListener('click', (e) => {
      const cell = e.target.closest('.history-cell');
      if (!cell) return;
      selectedHistoryDay = cell.dataset.day;
      renderHistory();
      el.dayDetail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  /* ------------------------------------------------------------------ *
   * 15. DAILY GOAL
   * ------------------------------------------------------------------ */

  function initGoalSelect() {
    el.dailyGoalSelect.addEventListener('change', () => {
      state.dailyGoal = Number(el.dailyGoalSelect.value);
      saveToLocalStorage(STORAGE_KEYS.dailyGoal, state.dailyGoal);
      renderProgress();
    });
  }

  /* ------------------------------------------------------------------ *
   * 16. THEME
   * ------------------------------------------------------------------ */

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    el.themeToggleLabel.textContent = state.theme === 'dark' ? 'Midnight' : 'Daylight';
  }

  function initThemeToggle() {
    applyTheme();
    el.themeToggle.addEventListener('click', () => {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      saveToLocalStorage(STORAGE_KEYS.theme, state.theme);
      applyTheme();
    });
  }

  /* ------------------------------------------------------------------ *
   * 17. TOASTS
   *     Both the global toast and the pomodoro-specific one share the
   *     same "show, then auto-hide after N ms" behaviour, so a single
   *     factory produces both instead of duplicating the timer logic.
   * ------------------------------------------------------------------ */

  function makeToastShower(getElement, durationMs) {
    let timerId = null;
    return function (message) {
      const target = getElement();
      target.textContent = message;
      target.hidden = false;
      if (timerId) clearTimeout(timerId);
      timerId = setTimeout(() => { target.hidden = true; }, durationMs);
    };
  }

  const showToast = makeToastShower(() => el.globalToast, 2600);
  const showPomoToast = makeToastShower(() => el.pomoToast, 3200);

  /* ------------------------------------------------------------------ *
   * 18. POMODORO TIMER ENGINE
   * ------------------------------------------------------------------ */

  const POMO_CIRCUMFERENCE = 2 * Math.PI * 100; // r=100 in the SVG

  const pomo = {
    mode: 'focus',              // 'focus' | 'short' | 'long'
    remainingSeconds: 0,
    totalSeconds: 0,
    isRunning: false,
    intervalId: null,
  };

  // Cycle position is derived from the persisted pomoLog (today's
  // completed focus sessions) rather than an in-memory counter, so it
  // survives a page reload mid-cycle instead of silently resetting to 0
  // and mis-timing the next long break.
  function getTodaysFocusSessionCount() {
    const today = todayKey();
    return state.pomoLog.filter(s => s.dateKey === today).length;
  }

  function pomoModeDurationMinutes(mode) {
    if (mode === 'focus') return state.pomoSettings.focus;
    if (mode === 'short') return state.pomoSettings.short;
    return state.pomoSettings.long;
  }

  function pomoModeLabel(mode) {
    if (mode === 'focus') return 'Focus session';
    if (mode === 'short') return 'Short break';
    return 'Long break';
  }

  function setPomoMode(mode, resetTimer) {
    pomo.mode = mode;
    if (resetTimer !== false) {
      pomo.totalSeconds = pomoModeDurationMinutes(mode) * 60;
      pomo.remainingSeconds = pomo.totalSeconds;
    }
    document.querySelectorAll('.pomo-mode').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.mode === mode);
    });
    el.pomoModeLabel.textContent = pomoModeLabel(mode);
    renderPomoFace();
  }

  function renderPomoFace() {
    const mins = Math.floor(pomo.remainingSeconds / 60);
    const secs = pomo.remainingSeconds % 60;
    el.pomoTime.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    const fraction = pomo.totalSeconds > 0 ? pomo.remainingSeconds / pomo.totalSeconds : 0;
    const offset = POMO_CIRCUMFERENCE * (1 - fraction);
    el.pomoRingFill.style.strokeDasharray = String(POMO_CIRCUMFERENCE);
    el.pomoRingFill.style.strokeDashoffset = String(offset);

    el.pomoStart.textContent = pomo.isRunning ? 'Pause' : (pomo.remainingSeconds < pomo.totalSeconds ? 'Resume' : 'Start');
  }

  function startPomodoro() {
    if (pomo.isRunning) return;
    pomo.isRunning = true;
    renderPomoFace();
    pomo.intervalId = setInterval(pomoTick, 1000);
  }

  function pausePomodoro() {
    pomo.isRunning = false;
    if (pomo.intervalId) clearInterval(pomo.intervalId);
    pomo.intervalId = null;
    renderPomoFace();
  }

  function resetPomodoro() {
    pausePomodoro();
    pomo.totalSeconds = pomoModeDurationMinutes(pomo.mode) * 60;
    pomo.remainingSeconds = pomo.totalSeconds;
    renderPomoFace();
  }

  function skipPomodoro() {
    pausePomodoro();
    advancePomodoroMode(false);
  }

  function pomoTick() {
    pomo.remainingSeconds -= 1;
    if (pomo.remainingSeconds <= 0) {
      pomo.remainingSeconds = 0;
      renderPomoFace();
      handlePomodoroComplete();
      return;
    }
    renderPomoFace();
  }

  function handlePomodoroComplete() {
    pausePomodoro();

    if (pomo.mode === 'focus') {
      // Log the completed focus session
      const minutes = pomoModeDurationMinutes('focus');
      const record = {
        id: 'p_' + Date.now().toString(36),
        dateKey: todayKey(),
        minutes: minutes,
        habitId: state.pomoSelectedHabit || null,
        completedAt: Date.now()
      };
      state.pomoLog.push(record);
      saveToLocalStorage(STORAGE_KEYS.pomoLog, state.pomoLog);

      showPomoToast('Focus session completed! 🎉');
    } else {
      showPomoToast(pomo.mode === 'short' ? 'Break finished — ready to focus?' : 'Long break finished — ready to focus?');
    }

    playCompletionSound();
    renderDashboard();
    renderPomodoroSide();

    advancePomodoroMode(true);
  }

  function advancePomodoroMode(autoStart) {
    let nextMode;
    if (pomo.mode === 'focus') {
      // The just-completed session (if any) is already in pomoLog by the
      // time this runs, so this count includes it.
      const cycleLength = state.pomoSettings.cycle;
      const sessionsToday = getTodaysFocusSessionCount();
      if (sessionsToday > 0 && sessionsToday % cycleLength === 0) {
        nextMode = 'long';
      } else {
        nextMode = 'short';
      }
    } else {
      nextMode = 'focus';
    }
    setPomoMode(nextMode, true);

    if (autoStart) {
      // Brief pause before auto-advancing so the toast is readable;
      // timer itself starts paused, ready for the user or auto-continue.
      startPomodoro();
    }
  }

  function playCompletionSound() {
    if (!state.pomoSettings.sound) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 660;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.55);
      // second gentle note
      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      o2.type = 'sine';
      o2.frequency.value = 880;
      g2.gain.setValueAtTime(0.0001, ctx.currentTime + 0.15);
      g2.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.17);
      g2.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
      o2.connect(g2);
      g2.connect(ctx.destination);
      o2.start(ctx.currentTime + 0.15);
      o2.stop(ctx.currentTime + 0.65);
    } catch (err) {
      // Audio not supported/blocked — fail silently, sound is optional.
    }
  }

  function initPomodoroControls() {
    el.pomoStart.addEventListener('click', () => {
      if (pomo.isRunning) pausePomodoro();
      else startPomodoro();
    });
    el.pomoReset.addEventListener('click', resetPomodoro);
    el.pomoSkip.addEventListener('click', skipPomodoro);

    el.pomoModes.querySelectorAll('.pomo-mode').forEach(btn => {
      btn.addEventListener('click', () => {
        pausePomodoro();
        setPomoMode(btn.dataset.mode, true);
      });
    });
  }

  /* ---- Pomodoro side panel: habit picker, session dots, tally ---- */

  function renderPomoSessionDots() {
    const cycleLength = state.pomoSettings.cycle;
    const sessionsToday = getTodaysFocusSessionCount();
    // Position within the current cycle: a multiple of cycleLength means
    // a long break just happened, so show a full ring rather than empty.
    const positionInCycle = (sessionsToday > 0 && sessionsToday % cycleLength === 0)
      ? cycleLength
      : sessionsToday % cycleLength;

    el.pomoSessionDots.innerHTML = '';
    for (let i = 0; i < cycleLength; i++) {
      const dot = document.createElement('span');
      dot.className = 'pomo-dot' + (i < positionInCycle ? ' is-filled' : '');
      el.pomoSessionDots.appendChild(dot);
    }
  }

  function renderPomodoroSide() {
    const today = todayKey();
    const todaysSessions = state.pomoLog.filter(s => s.dateKey === today);
    el.pomoSessionsTodayNum.textContent = String(todaysSessions.length);
    el.pomoFocusTodayNum.textContent = formatMinutes(todaysSessions.reduce((s, x) => s + x.minutes, 0));

    renderPomoSessionDots();

    // Habit picker label
    const selected = state.habits.find(h => h.id === state.pomoSelectedHabit);
    el.pomoHabitPickerLabel.textContent = selected ? `${selected.emoji} ${selected.name}` : 'No habit selected';

    if (selected) {
      const tally = state.pomoLog.filter(s => s.habitId === selected.id).length;
      el.pomoHabitTallyBlock.hidden = false;
      el.pomoHabitTallyNum.textContent = String(tally);
    } else {
      el.pomoHabitTallyBlock.hidden = true;
    }
  }

  function buildPomoHabitMenu() {
    const menu = el.pomoHabitMenu;
    menu.innerHTML = '';

    const noneLi = document.createElement('li');
    const noneBtn = document.createElement('button');
    noneBtn.type = 'button';
    noneBtn.textContent = 'No habit';
    noneBtn.addEventListener('click', () => {
      state.pomoSelectedHabit = null;
      saveToLocalStorage(STORAGE_KEYS.pomoSelectedHabit, null);
      renderPomodoroSide();
      closePomoHabitMenu();
    });
    noneLi.appendChild(noneBtn);
    menu.appendChild(noneLi);

    if (state.habits.length === 0) {
      const emptyLi = document.createElement('li');
      const span = document.createElement('span');
      span.style.cssText = 'padding:9px 10px;display:block;color:var(--ink-faint);font-size:13px;';
      span.textContent = 'Add a habit first.';
      emptyLi.appendChild(span);
      menu.appendChild(emptyLi);
      return;
    }

    state.habits.forEach(h => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.innerHTML = `<span>${h.emoji}</span><span>${escapeHtml(h.name)}</span>`;
      btn.addEventListener('click', () => {
        state.pomoSelectedHabit = h.id;
        saveToLocalStorage(STORAGE_KEYS.pomoSelectedHabit, h.id);
        renderPomodoroSide();
        closePomoHabitMenu();
      });
      li.appendChild(btn);
      menu.appendChild(li);
    });
  }

  function openPomoHabitMenu() {
    buildPomoHabitMenu();
    el.pomoHabitMenu.hidden = false;
  }
  function closePomoHabitMenu() {
    el.pomoHabitMenu.hidden = true;
  }

  function initPomoHabitPicker() {
    el.pomoHabitPicker.addEventListener('click', (e) => {
      e.stopPropagation();
      if (el.pomoHabitMenu.hidden) openPomoHabitMenu();
      else closePomoHabitMenu();
    });
    document.addEventListener('click', (e) => {
      if (!el.pomoHabitMenu.hidden && !e.target.closest('.pomo-side-block')) {
        closePomoHabitMenu();
      }
    });
  }

  /* ---- Pomodoro settings modal ---- */

  function openPomoSettingsModal() {
    document.getElementById('settingFocus').value = state.pomoSettings.focus;
    document.getElementById('settingShort').value = state.pomoSettings.short;
    document.getElementById('settingLong').value = state.pomoSettings.long;
    document.getElementById('settingCycle').value = state.pomoSettings.cycle;
    document.getElementById('settingSound').checked = state.pomoSettings.sound;
    el.pomoSettingsVeil.hidden = false;
  }

  function closePomoSettingsModal() {
    el.pomoSettingsVeil.hidden = true;
  }

  function handlePomoSettingsSubmit(e) {
    e.preventDefault();
    const focus = Math.max(1, parseInt(document.getElementById('settingFocus').value, 10) || 25);
    const short = Math.max(1, parseInt(document.getElementById('settingShort').value, 10) || 5);
    const long = Math.max(1, parseInt(document.getElementById('settingLong').value, 10) || 15);
    const cycle = Math.max(2, parseInt(document.getElementById('settingCycle').value, 10) || 4);
    const sound = document.getElementById('settingSound').checked;

    state.pomoSettings = { focus, short, long, cycle, sound };
    saveToLocalStorage(STORAGE_KEYS.pomoSettings, state.pomoSettings);

    // If the timer isn't currently running, refresh the displayed duration
    // for the active mode to reflect new settings.
    if (!pomo.isRunning) {
      pomo.totalSeconds = pomoModeDurationMinutes(pomo.mode) * 60;
      pomo.remainingSeconds = pomo.totalSeconds;
      renderPomoFace();
    }
    renderPomoSessionDots();

    closePomoSettingsModal();
    showToast('Timer settings saved.');
  }

  /* ------------------------------------------------------------------ *
   * 19. GLOBAL MODAL DISMISS (veil click / escape key) + FOCUS TRAP
   * ------------------------------------------------------------------ */

  function initModalDismissBehavior() {
    [el.habitModalVeil, el.deleteModalVeil, el.pomoSettingsVeil].forEach(veil => {
      veil.addEventListener('click', (e) => {
        if (e.target === veil) {
          if (veil === el.habitModalVeil) closeHabitModal();
          if (veil === el.deleteModalVeil) closeDeleteModal();
          if (veil === el.pomoSettingsVeil) closePomoSettingsModal();
        }
      });
      attachFocusTrap(veil);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!el.habitModalVeil.hidden) closeHabitModal();
        if (!el.deleteModalVeil.hidden) closeDeleteModal();
        if (!el.pomoSettingsVeil.hidden) closePomoSettingsModal();
        if (!el.pomoHabitMenu.hidden) closePomoHabitMenu();
      }
    });
  }

  // Keeps Tab/Shift+Tab cycling within an open modal instead of escaping
  // to controls hidden behind the veil. No-ops whenever the modal is
  // hidden, so it's safe to attach once per veil at init time.
  function attachFocusTrap(veilElement) {
    veilElement.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || veilElement.hidden) return;

      const focusable = veilElement.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * 20. INIT
   * ------------------------------------------------------------------ */

  function cacheElements() {
    const ids = [
      'greeting', 'todayDate', 'openAddHabit', 'emptyAddHabit',
      'progressFraction', 'progressPercent', 'progressBarFill',
      'dailyGoalSelect', 'goalCelebrate',
      'focusTodayBig', 'focusTodaySessions',
      'habitList', 'habitsEmpty', 'habitCountMeta',
      'historyGrid', 'dayDetail', 'dayDetailTitle', 'dayDetailPct', 'dayDetailList',
      'statToday', 'statWeek', 'statMonth', 'statBestStreak', 'statTotalCompleted',
      'pomoStatSessionsToday', 'pomoStatTimeToday', 'pomoStatSessionsWeek', 'pomoStatTimeWeek',
      'themeToggle', 'themeToggleLabel',
      'habitModalVeil', 'habitForm', 'habitNameInput', 'emojiGrid', 'colorGrid',
      'closeHabitModal', 'cancelHabitModal',
      'deleteModalVeil', 'cancelDelete', 'confirmDelete',
      'pomoModes', 'pomoTime', 'pomoModeLabel', 'pomoRingFill',
      'pomoStart', 'pomoReset', 'pomoSkip', 'pomoToast',
      'pomoHabitPicker', 'pomoHabitPickerLabel', 'pomoHabitMenu',
      'pomoSessionDots', 'pomoSessionsTodayNum', 'pomoFocusTodayNum',
      'pomoHabitTallyBlock', 'pomoHabitTallyNum',
      'openPomodoroSettings', 'pomoSettingsVeil', 'closePomoSettings', 'cancelPomoSettings',
      'pomoSettingsForm',
      'globalToast'
    ];
    ids.forEach(id => { el[id] = document.getElementById(id); });
  }

  function initEventListeners() {
    el.openAddHabit.addEventListener('click', () => openHabitModal(null));
    el.emptyAddHabit.addEventListener('click', () => openHabitModal(null));
    el.closeHabitModal.addEventListener('click', closeHabitModal);
    el.cancelHabitModal.addEventListener('click', closeHabitModal);
    el.habitForm.addEventListener('submit', handleHabitFormSubmit);

    el.cancelDelete.addEventListener('click', closeDeleteModal);
    el.confirmDelete.addEventListener('click', confirmHabitDelete);

    el.openPomodoroSettings.addEventListener('click', openPomoSettingsModal);
    el.closePomoSettings.addEventListener('click', closePomoSettingsModal);
    el.cancelPomoSettings.addEventListener('click', closePomoSettingsModal);
    el.pomoSettingsForm.addEventListener('submit', handlePomoSettingsSubmit);

    initHabitListEvents();
    initHistoryEvents();
    initGoalSelect();
    initThemeToggle();
    initPomodoroControls();
    initPomoHabitPicker();
    initModalDismissBehavior();
  }

  function init() {
    cacheElements();
    initNavigation();
    initEventListeners();

    renderDashboard();
    setPomoMode('focus', true);
    renderPomodoroSide();

    // Keep the greeting fresh, and fully re-render if a new calendar day
    // begins while the tab is left open — otherwise "today" would stay
    // frozen at whatever day the page was loaded on, silently going
    // stale for anyone who keeps this tab open overnight.
    let lastKnownDay = todayKey();
    setInterval(() => {
      renderGreeting();
      const currentDay = todayKey();
      if (currentDay !== lastKnownDay) {
        lastKnownDay = currentDay;
        renderDashboard();
        renderPomodoroSide();
      }
    }, 60 * 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();