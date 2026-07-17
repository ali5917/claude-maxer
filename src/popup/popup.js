// popup.js
const toggleAuto     = document.getElementById('toggleAuto');
const toggleSchedule = document.getElementById('toggleSchedule');
const scheduleBody   = document.getElementById('scheduleBody');
const triggerTimeEl  = document.getElementById('triggerTime');
const sectionAuto    = document.getElementById('sectionAuto');
const sectionSched   = document.getElementById('sectionSchedule');
const btnSave        = document.getElementById('btnSave');
const btnCancel      = document.getElementById('btnCancel');
const btnTestNow     = document.getElementById('btnTestNow');
const statusEl       = document.getElementById('status');
const statusDot      = document.getElementById('statusDot');
const lastTriggeredEl = document.getElementById('lastTriggered');

// day picker 
const dayBtns = document.querySelectorAll('.day-btn');
dayBtns.forEach(btn => {
  btn.addEventListener('click', () => btn.classList.toggle('selected'));
});

function getSelectedDays() {
  return Array.from(dayBtns)
    .filter(b => b.classList.contains('selected'))
    .map(b => parseInt(b.dataset.day));
}

function setSelectedDays(days) {
  dayBtns.forEach(btn => {
    btn.classList.toggle('selected', days.includes(parseInt(btn.dataset.day)));
  });
}

// toggle visibility 
toggleSchedule.addEventListener('change', () => {
  scheduleBody.classList.toggle('visible', toggleSchedule.checked);
  sectionSched.classList.toggle('enabled', toggleSchedule.checked);
});

toggleAuto.addEventListener('change', () => {
  sectionAuto.classList.toggle('enabled', toggleAuto.checked);
});

// helpers 
function calcNextFireTime(timeStr, selectedDays) {
  const [hours, mins] = timeStr.split(':').map(Number);
  const now = new Date();
  const today = now.getDay(); // 0=Sun, 1=Mon...

  // Find the next selected day including today
  for (let i = 0; i < 7; i++) {
    const day = (today + i) % 7;
    if (!selectedDays.includes(day)) continue;

    const candidate = new Date();
    candidate.setDate(now.getDate() + i);
    candidate.setHours(hours, mins, 0, 0);

    // If it's today but time already passed, skip
    if (i === 0 && candidate <= now) continue;

    return candidate.getTime();
  }
  return null;
}

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.className = isError ? 'error' : '';
}

function updateDot() {
  const active = toggleAuto.checked || toggleSchedule.checked;
  statusDot.classList.toggle('active', active);
}

// load saved state
chrome.storage.local.get(['autoReset', 'scheduledTrigger', 'lastTriggeredAt'], (data) => {
  if (data.autoReset?.enabled) {
    toggleAuto.checked = true;
    sectionAuto.classList.add('enabled');
  }

  if (data.scheduledTrigger?.enabled) {
    toggleSchedule.checked = true;
    scheduleBody.classList.add('visible');
    sectionSched.classList.add('enabled');
    if (data.scheduledTrigger.time) triggerTimeEl.value = data.scheduledTrigger.time;
    if (data.scheduledTrigger.days) setSelectedDays(data.scheduledTrigger.days);
  }

  if (data.lastTriggeredAt) {
    const d = new Date(data.lastTriggeredAt);
    lastTriggeredEl.textContent = `Last triggered: ${d.toLocaleString()}`;
  }

  updateDot();
});

// save 
btnSave.addEventListener('click', () => {
  const autoEnabled     = toggleAuto.checked;
  const schedEnabled    = toggleSchedule.checked;
  const timeStr         = triggerTimeEl.value;
  const days            = getSelectedDays();

  if (schedEnabled && (!timeStr || days.length === 0)) {
    setStatus('Pick a time and at least one day.', true);
    return;
  }

  // save auto-reset preference
  chrome.storage.local.set({ autoReset: { enabled: autoEnabled } });

  // handle scheduled alarm
  if (schedEnabled) {
    const fireAt = calcNextFireTime(timeStr, days);
    if (!fireAt) {
      setStatus('No upcoming day matches your selection.', true);
      return;
    }
    chrome.runtime.sendMessage({
      type: 'SET_ALARM',
      fireAt,
      daily: true,
      time: timeStr,
      days
    }, () => {
      const d = new Date(fireAt);
      const timeDisplay = d.toLocaleString([], {
        weekday: 'short', hour: '2-digit', minute: '2-digit'
      });
      setStatus(`Saved — next trigger ${timeDisplay}`);
    });
  } else {
    chrome.runtime.sendMessage({ type: 'CANCEL_ALARM' }, () => {});
    setStatus('Saved!');
  }

  updateDot();
});

// cancel
btnCancel.addEventListener('click', () => {
  toggleAuto.checked     = false;
  toggleSchedule.checked = false;
  scheduleBody.classList.remove('visible');
  sectionAuto.classList.remove('enabled');
  sectionSched.classList.remove('enabled');

  chrome.storage.local.set({ autoReset: { enabled: false } });
  chrome.runtime.sendMessage({ type: 'CANCEL_ALARM' }, () => {});
  setStatus('Cancelled.', true);
  updateDot();
});

// test Now 
// btnTestNow.addEventListener('click', async () => {
//   setStatus('Opening Claude...');
//   btnTestNow.disabled = true;
//   try {
//     await chrome.tabs.create({
//       url: 'https://claude.ai/new?incognito=1&autostart=1',
//       active: true
//     });
//     setStatus('⚡ Check the Claude tab!');
//   } catch (e) {
//     setStatus('Failed to open tab.', true);
//   }
//   btnTestNow.disabled = false;
// });