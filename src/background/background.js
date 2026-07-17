// background.js
// Handles alarms, opens Claude tab, routes messages, manages auto-reset.

importScripts('../utils/scheduler.js', '../utils/notifications.js');

const CLAUDE_URL = 'https://claude.ai/new?incognito=1&autostart=1';

// ── Alarm fired ───────────────────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;

  console.log('[Claude Maxer] Alarm fired');

  try {
    const tab = await chrome.tabs.create({ url: CLAUDE_URL, active: false });
    await chrome.storage.local.set({
      activeTabId: tab.id,
      lastTriggeredAt: Date.now()
    });
  } catch (err) {
    console.error('[Claude Maxer] Failed to open tab:', err);
    notifyFailed('Could not open Claude tab.');
    return;
  }

  // Reschedule for next matching day
  const data = await chrome.storage.local.get('scheduledTrigger');
  if (data.scheduledTrigger?.enabled) {
    const { time, days } = data.scheduledTrigger;
    const nextFireAt = calcNextFireTimeFromSchedule(time, days);
    if (nextFireAt) chrome.alarms.create(ALARM_NAME, { when: nextFireAt });
  }
});

// ── Messages ──────────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === 'SET_ALARM') {
    chrome.alarms.clear(ALARM_NAME, () => {
      chrome.alarms.create(ALARM_NAME, { when: msg.fireAt });
      chrome.storage.local.set({
        scheduledTrigger: {
          enabled: true,
          time: msg.time,
          days: msg.days
        }
      });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'CANCEL_ALARM') {
    chrome.alarms.clear(ALARM_NAME, () => {
      chrome.storage.local.remove('scheduledTrigger');
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'USAGE_UPDATE') {
    chrome.storage.local.set({ usageData: msg.payload, usageUpdatedAt: Date.now() });

    // Check auto-reset: if window is about to end, schedule a trigger
    handleAutoReset(msg.payload);
  }

  if (msg.type === 'CLOSE_TAB') {
    notifyTriggered();
    setTimeout(() => chrome.tabs.remove(sender.tab.id), 8000);
  }

  if (msg.type === 'SEND_FAILED') {
    notifyFailed(msg.reason);
    setTimeout(() => chrome.tabs.remove(sender.tab.id), 2000);
  }
});

// ── Auto-reset logic ──────────────────────────────────────────────────────────
// When content.js reports usage, check if auto-reset is on and window is ending.
// We schedule a one-shot alarm to fire right at resets_at.
let autoResetScheduledFor = null; // track what we already scheduled to avoid dupes

async function handleAutoReset(payload) {
  const data = await chrome.storage.local.get('autoReset');
  if (!data.autoReset?.enabled) return;

  // Parse resets_at from SSE payload (Unix timestamp in seconds)
  const fiveHourWindow = payload?.windows?.['5h'];
  if (!fiveHourWindow?.resets_at) return;

  const resetsAtMs = fiveHourWindow.resets_at * 1000;

  // Don't reschedule if we already have this reset time queued
  if (autoResetScheduledFor === resetsAtMs) return;
  autoResetScheduledFor = resetsAtMs;

  // Fire 10 seconds after the window resets
  const fireAt = resetsAtMs + 10000;
  if (fireAt <= Date.now()) return; // already passed

  // Use a separate alarm name so it doesn't conflict with scheduled trigger
  chrome.alarms.create('claude-maxer-autoreset', { when: fireAt });
  console.log('[Claude Maxer] Auto-reset scheduled for:', new Date(fireAt).toLocaleString());
}

// Handle the auto-reset alarm separately
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'claude-maxer-autoreset') return;

  const data = await chrome.storage.local.get('autoReset');
  if (!data.autoReset?.enabled) return;

  console.log('[Claude Maxer] Auto-reset firing!');
  try {
    const tab = await chrome.tabs.create({ url: CLAUDE_URL, active: false });
    await chrome.storage.local.set({
      activeTabId: tab.id,
      lastTriggeredAt: Date.now()
    });
  } catch (err) {
    notifyFailed('Auto-reset failed to open Claude tab.');
  }
});

// ── Helper: calc next fire time from schedule ─────────────────────────────────
function calcNextFireTimeFromSchedule(timeStr, days) {
  if (!timeStr || !days?.length) return null;
  const [hours, mins] = timeStr.split(':').map(Number);
  const now = new Date();
  const today = now.getDay();

  for (let i = 1; i <= 7; i++) {
    const day = (today + i) % 7;
    if (!days.includes(day)) continue;
    const candidate = new Date();
    candidate.setDate(now.getDate() + i);
    candidate.setHours(hours, mins, 0, 0);
    return candidate.getTime();
  }
  return null;
}