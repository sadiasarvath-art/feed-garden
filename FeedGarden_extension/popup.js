// popup.js - the small window that opens when you click the Feed Garden icon.
// It only reads and writes chrome.storage; content.js (on the Instagram tab) does the real work.

const $ = (id) => document.getElementById(id);
const defaults = { cueMinutes: 10, speed: 1, closeTab: true, sound: true };
let settings = { ...defaults };

// ---- settings: show them, and save when I change them ----
function showSettings() {
  $("cueMinutes").value = settings.cueMinutes;
  $("speed").value = String(settings.speed);
  $("closeTab").checked = settings.closeTab;
  $("sound").checked = settings.sound;
}

function saveSettings() {
  settings = {
    cueMinutes: Number($("cueMinutes").value) || 10,
    speed: Number($("speed").value),
    closeTab: $("closeTab").checked,
    sound: $("sound").checked,
  };
  chrome.storage.local.set({ settings });
}
for (const id of ["cueMinutes", "speed", "closeTab", "sound"]) $(id).addEventListener("change", saveSettings);

// ---- buttons: send a command to content.js through storage ----
function sendCommand(type, minutes = 0) {
  chrome.storage.local.set({ command: { id: Date.now(), type, minutes } });
}
$("skip").onclick = () => sendCommand("skip", 5);
$("reset").onclick = () => sendCommand("reset");
$("clear").onclick = () => chrome.storage.local.set({ log: [] });

// ---- download the event log as a CSV file ----
$("download").onclick = async () => {
  const { log = [] } = await chrome.storage.local.get("log");
  const quote = (text) => `"${String(text).replace(/"/g, '""')}"`;
  const lines = ["time,event,minutes_scrolled,detail"];
  for (const row of log) lines.push([row.time, row.event, row.minutes, quote(row.detail)].join(","));
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
  link.download = "feed_garden_log.csv";
  link.click();
};

// ---- status and recent events (refreshed every second while the popup is open) ----
async function refresh() {
  const { state, log = [] } = await chrome.storage.local.get(["state", "log"]);
  if (state) {
    const m = Math.floor(state.total), s = Math.floor((state.total % 1) * 60);
    const left = Math.max(0, state.nextCue - state.minutes).toFixed(1);
    $("status").innerHTML =
      `Scrolling time: <b>${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}</b><br>` +
      `Next check-in in: <b>${left} min</b> &nbsp;·&nbsp; Kept scrolling: <b>${state.keepCount}</b>×`;
  }
  if (log.length > 0) {
    $("log").innerHTML = log.slice(-8).reverse().map((r) => {
      const time = new Date(r.time).toLocaleTimeString();
      return `<div>${time} · <b>${r.event}</b> · ${r.minutes} min ${r.detail ? "· " + r.detail : ""}</div>`;
    }).join("");
  } else {
    $("log").textContent = "No events yet.";
  }
}

chrome.storage.local.get("settings", (data) => {
  settings = { ...defaults, ...(data.settings || {}) };
  showSettings();
});
refresh();
setInterval(refresh, 1000);
