// ─── scheduler.js ─────────────────────────────────────────────────────────────
// All scheduling logic: calculating fire times, setting/clearing alarms,
// persisting daily schedule. Imported by background.js.

const ALARM_NAME = "claude-maxer";

function calcFireTime(workStart, hoursEarly, forceTomorrow = false) {
  const [hours, mins] = workStart.split(":").map(Number);
  const fireTime = new Date();
  fireTime.setHours(hours - hoursEarly, mins, 0, 0);
  if (forceTomorrow || fireTime < new Date()) {
    fireTime.setDate(fireTime.getDate() + 1);
  }
  return fireTime.getTime();
}

async function setAlarm(fireAt, daily, workStart, hoursEarly) {
  await chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, { when: fireAt });

  if (daily) {
    await chrome.storage.local.set({
      dailySchedule: { workStart, hoursEarly }
    });
  }

  console.log("[Claude Maxer] Alarm set for:", new Date(fireAt).toLocaleString());
}

async function cancelAlarm() {
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.storage.local.remove(["dailySchedule"]);
  console.log("[Claude Maxer] Alarm cancelled.");
}

async function rescheduleForTomorrow() {
  const data = await chrome.storage.local.get("dailySchedule");
  if (!data.dailySchedule) return;

  const { workStart, hoursEarly } = data.dailySchedule;
  const nextFireAt = calcFireTime(workStart, hoursEarly, true);
  chrome.alarms.create(ALARM_NAME, { when: nextFireAt });
  console.log("[Claude Maxer] Re-scheduled for tomorrow:", new Date(nextFireAt).toLocaleString());
}