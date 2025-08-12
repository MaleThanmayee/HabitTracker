/* app.js - main logic for Habit Tracker PWA */
(() => {
  // DOM refs
  const habitInput = document.getElementById('habit-input');
  const addBtn = document.getElementById('add-btn');
  const habitList = document.getElementById('habit-list');
  const themeSwitcher = document.getElementById('theme-switcher');
  const themeLink = document.getElementById('theme-link');
  const accentPicker = document.getElementById('accent-picker');
  const exportBtn = document.getElementById('export-btn');
  const importFile = document.getElementById('import-file');
  const clearBtn = document.getElementById('clear-btn');
  const quoteEl = document.getElementById('quote');
  const quoteAuthorEl = document.getElementById('quote-author');
  const statusEl = document.getElementById('status');
  const installBtn = document.getElementById('install-btn');

  // state keys
  const STORAGE_KEY = 'ht_habits_v1';
  const THEME_KEY = 'ht_theme';
  const ACCENT_KEY = 'ht_accent';
  const LAST_VISIT_KEY = 'ht_last_visit';
  const QUOTE_KEY = 'ht_quote';

  let habits = [];
  let weeklyChart = null;
  let deferredPrompt = null;

  // Helper: load/save
  function load() {
    habits = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  }
  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(habits));
  }

  // Daily reset: if date changed, reset done flags but keep streaks/history
  function dailyResetIfNeeded() {
    const last = localStorage.getItem(LAST_VISIT_KEY);
    const today = new Date().toISOString().split('T')[0];
    if (last !== today) {
      // reset done flags
      habits.forEach(h => h.done = false);
      save();
      localStorage.setItem(LAST_VISIT_KEY, today);
    }
  }

  // Add habit
  function addHabit(name) {
    const clean = name.trim();
    if (!clean) return;
    habits.push({
      id: Date.now() + Math.random().toString(36).slice(2,7),
      name: clean,
      streak: 0,
      history: [], // array of iso dates when completed
      done: false
    });
    save();
    render();
  }

  // Mark done for today (toggle)
  function toggleDone(id) {
    const today = new Date().toISOString().split('T')[0];
    const h = habits.find(x => x.id === id);
    if (!h) return;
    if (!h.history.includes(today)) {
      // mark done: add today
      h.history.push(today);
      h.streak = computeStreak(h.history);
      h.done = true;
    } else {
      // unmark: remove today, recompute streak
      h.history = h.history.filter(d => d !== today);
      h.streak = computeStreak(h.history);
      h.done = false;
    }
    save();
    render();
    checkAllDoneCelebrate();
  }

  // compute consecutive streak ending today
  function computeStreak(history) {
    if (!history || history.length === 0) return 0;
    // make set of dates
    const set = new Set(history);
    let streak = 0;
    let day = new Date(); // today
    while (true) {
      const iso = day.toISOString().split('T')[0];
      if (set.has(iso)) {
        streak++;
        day.setDate(day.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }

  // Render habit list
  function render() {
    habitList.innerHTML = '';
    if (!habits.length) {
      habitList.innerHTML = `<div class="card" style="text-align:center">No habits yet. Add one to get started!</div>`;
      updateChart();
      return;
    }

    habits.forEach(h => {
      const div = document.createElement('div');
      div.className = `habit card ${h.done ? 'done' : ''}`;
      div.innerHTML = `
        <div class="habit-left">
          <div>
            <div class="habit-title">${escapeHtml(h.name)}</div>
            <div class="habit-meta">Streak: ${h.streak} • Total: ${h.history.length}</div>
          </div>
        </div>
        <div class="habit-actions">
          <button class="btn" data-action="toggle" data-id="${h.id}">${h.done ? 'Undo' : 'Done'}</button>
          <button class="btn" data-action="del" data-id="${h.id}">Delete</button>
        </div>
      `;
      habitList.appendChild(div);
    });

    // attach listeners
    habitList.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', e => {
        const id = e.currentTarget.dataset.id;
        const action = e.currentTarget.dataset.action;
        if (action === 'toggle') toggleDone(id);
        if (action === 'del') {
          if (confirm('Delete this habit?')) {
            habits = habits.filter(h => h.id !== id);
            save();
            render();
          }
        }
      });
    });

    updateChart();
  }

  // Weekly chart: compute completed counts for last 7 days
  function getWeeklyData() {
    const labels = [];
    const counts = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().split('T')[0];
      labels.push(iso.slice(5)); // MM-DD
      // count how many habits completed on this day
      let c = 0;
      habits.forEach(h => {
        if (h.history.includes(iso)) c++;
      });
      counts.push(c);
    }
    return {labels, counts};
  }

  function updateChart() {
    const ctx = document.getElementById('weeklyChart').getContext('2d');
    const data = getWeeklyData();
    if (weeklyChart) {
      weeklyChart.data.labels = data.labels;
      weeklyChart.data.datasets[0].data = data.counts;
      weeklyChart.update();
      return;
    }
    weeklyChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [{
          label: 'Habits Completed',
          data: data.counts,
          backgroundColor: Array(7).fill(getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#4CAF50'),
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { precision:0 } }
        }
      }
    });
  }

  // Export/import
  function exportData() {
    const payload = {
      exportedAt: new Date().toISOString(),
      habits
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `habit-tracker-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importData(file) {
    if (!file) return;
    const fr = new FileReader();
    fr.onload = e => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!parsed.habits) throw new Error('Invalid file');
        habits = parsed.habits;
        save();
        render();
        alert('Import successful');
      } catch (err) {
        alert('Failed to import: ' + err.message);
      }
    };
    fr.readAsText(file);
  }

  // Check if all habits are done today and celebrate
  function checkAllDoneCelebrate() {
    if (!habits.length) return;
    const allDone = habits.every(h => h.done || h.history.includes(new Date().toISOString().split('T')[0]));
    if (allDone) {
      // confetti
      try {
        confetti({
          particleCount: 180,
          spread: 70,
          origin: { y: 0.6 }
        });
      } catch (e) { /* no-op if confetti lib missing */ }
    }
  }

  // Quote of the day: attempt API, fallback to static list and cache
  async function fetchQuoteOfTheDay() {
    const cached = JSON.parse(localStorage.getItem(QUOTE_KEY) || 'null');
    if (cached && cached.date === new Date().toISOString().split('T')[0]) {
      setQuote(cached.text, cached.author);
      return;
    }
    try {
      const res = await fetch('https://api.quotable.io/random?tags=motivational|inspirational');
      if (!res.ok) throw new Error('api fail');
      const j = await res.json();
      setQuote(j.content, j.author || '');
      localStorage.setItem(QUOTE_KEY, JSON.stringify({date: new Date().toISOString().split('T')[0], text: j.content, author: j.author || ''}));
    } catch (err) {
      // fallback local quotes
      const local = [
        ["Small steps every day.", "— Anonymous"],
        ["Consistency beats intensity.", "— Unknown"],
        ["A year from now you'll wish you had started today.", "— Karen Lamb"]
      ];
      const pick = local[Math.floor(Math.random() * local.length)];
      setQuote(pick[0], pick[1]);
    }
  }

  function setQuote(text, author) {
    quoteEl.textContent = `"${text}"`;
    quoteAuthorEl.textContent = author || '';
  }

  // Theme and accent handling
  function initTheme() {
    const stored = localStorage.getItem(THEME_KEY) || 'light';
    themeSwitcher.value = stored;
    themeLink.setAttribute('href', `css/${stored}.css`);
    const accent = localStorage.getItem(ACCENT_KEY) || getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#4CAF50';
    accentPicker.value = toHex(accent.trim());
    applyAccent(accentPicker.value);
  }

  function applyAccent(hex) {
    document.documentElement.style.setProperty('--accent', hex);
    // also update chart bar colors if present
    if (weeklyChart) {
      weeklyChart.data.datasets[0].backgroundColor = Array(7).fill(hex);
      weeklyChart.update();
    }
    // update meta theme-color
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', hex);
    localStorage.setItem(ACCENT_KEY, hex);
  }

  // small helpers
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function toHex(cssColor) {
    // very naive: if already hex return, else return #4CAF50
    if (!cssColor) return '#4CAF50';
    cssColor = cssColor.trim();
    if (cssColor.startsWith('#')) return cssColor;
    return '#4CAF50';
  }

  // Install prompt handling (PWA)
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.hidden = false;
  });
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.hidden = true;
    statusEl.textContent = outcome === 'accepted' ? 'App installed' : 'Prompt dismissed';
  });

  // initial bindings
  addBtn.addEventListener('click', () => { addHabit(habitInput.value); habitInput.value=''; });
  habitInput.addEventListener('keyup', e => { if (e.key === 'Enter') { addHabit(habitInput.value); habitInput.value=''; } });
  themeSwitcher.addEventListener('change', e => {
    const val = e.target.value;
    themeLink.setAttribute('href', `css/${val}.css`);
    localStorage.setItem(THEME_KEY, val);
  });
  accentPicker.addEventListener('input', e => applyAccent(e.target.value));
  exportBtn.addEventListener('click', exportData);
  importFile.addEventListener('change', e => importData(e.target.files[0]));
  clearBtn.addEventListener('click', () => {
    if (confirm('Clear all habits and history?')) {
      habits = [];
      save();
      render();
    }
  });

  // init app
  function init() {
    load();
    initTheme();
    dailyResetIfNeeded();
    // Set done flags based on today's history
    const today = new Date().toISOString().split('T')[0];
    habits.forEach(h => {
      h.done = h.history.includes(today);
    });
    render();
    fetchQuoteOfTheDay();
    localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString().split('T')[0]);
    // refresh quote each day in the background (basic)
    setInterval(() => {
      const todayStr = new Date().toISOString().split('T')[0];
      if (JSON.parse(localStorage.getItem(QUOTE_KEY) || 'null')?.date !== todayStr) {
        fetchQuoteOfTheDay();
      }
    }, 1000 * 60 * 30); // every 30 min
  }

  // status offline/online
  window.addEventListener('online', () => statusEl.textContent = 'Online');
  window.addEventListener('offline', () => statusEl.textContent = 'Offline');
  statusEl.textContent = navigator.onLine ? 'Online' : 'Offline';

  // fire init
  init();

  // expose for debugging
  window.ht = {
    getHabits: () => JSON.parse(JSON.stringify(habits)),
    addHabit,
    toggleDone,
    exportData
  };
})();
