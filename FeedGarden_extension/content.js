/*
 FEED GARDEN - Chrome extension for Instagram (content.js)
 Sadiyah Sarvath | Creative & Applied Computation | Task 2

 IDEA
   While Instagram is open and active, count the minutes. The longer I scroll, the more the
   screen "decays" (colour drains, fog, blur, grain, falling petals, the garden flower wilts)
   and the sound gets rougher. After 10 minutes a calm cue asks me to choose:
      LEAVE INSTAGRAM  -> the garden regrows, then the tab closes
      KEEP SCROLLING   -> I must type what I'm here for (the "friction")
   Each time I keep scrolling, the next cue comes sooner: 8, 6, then 4 minutes.
   Nothing is blocked: I can still scroll and click Instagram while the cue is open.

 HOW THIS FILE IS ORGANISED
   1. Settings            - numbers you can change
   2. Data                - reads my usage log (CSV)
   3. Saving & logging    - remembers time between page loads, records events
   4. Decay maths         - minutes -> one number "d" from 0 (fresh) to 1 (decayed)
   5. Building the page   - adds the garden layers on top of Instagram
   6. Drawing             - the wilting flower and falling petals
   7. Sound               - the ambient soundscape (Web Audio)
   8. The cue panel       - Leave / Keep scrolling / typing
   9. The clock           - runs every second, ties everything together
*/

// =====================================================================
// 1. SETTINGS
// =====================================================================
const DECAY_START = 3;        // decay begins after 3 minutes of scrolling...
const DECAY_FULL = 25;        // ...and is complete at 25 minutes
const FIRST_GRACE = 10;       // grace after a "keep scrolling" starts at 10 and shrinks by 2
const GRACE_STEP = 2;         // 1st keep -> 8 min, 2nd -> 6 min, 3rd and later -> 4 min
const MIN_GRACE = 4;
const MIN_CHARS = 4;          // how many characters I must type to keep scrolling
const REGROW_SECONDS = 6;     // how long the garden takes to grow back
const AWAY_MINUTES = 10;      // away from Instagram this long = a brand-new session

// these can be changed from the extension's popup
let settings = { cueMinutes: 10, speed: 1, closeTab: true, sound: true };

// everything that describes "where I am" in the current session
let state = {
  minutes: 0,      // minutes scrolled since the last reset (drives the decay)
  total: 0,        // minutes since this session began
  nextCue: 10,     // when the next stopping cue appears
  keepCount: 0,    // how many times I chose "keep scrolling"
  phase: "BROWSING", // BROWSING, CUE or TYPING
  lastSeen: Date.now(),
};

let regrow = null;          // null normally; 0 -> 1 while the garden grows back
let decayAtLeave = 0;
let loggedAverage = 64;     // average minutes of my logged Instagram sessions (from the CSV)
let loggedSessions = [];
let typed = "";             // not saved: what I'm typing right now


// =====================================================================
// 2. DATA: read my usage log (data/screen_time_log.csv)
// =====================================================================
async function loadUsageLog() {
  try {
    const url = chrome.runtime.getURL("data/screen_time_log.csv");
    const text = await (await fetch(url)).text();
    const rows = text.trim().split("\n").slice(1);            // skip the header line
    loggedSessions = rows
      .map((line) => line.split(","))                          // [time, app, minutes, trigger]
      .filter((cols) => cols[1] === "Instagram")
      .map((cols) => parseFloat(cols[2]));
    if (loggedSessions.length > 0) {
      loggedAverage = loggedSessions.reduce((a, b) => a + b, 0) / loggedSessions.length;
    }
  } catch (error) {
    console.log("Feed Garden: could not read the log, using defaults", error);
  }
}


// =====================================================================
// 3. SAVING AND LOGGING  (chrome.storage keeps data between page loads)
// =====================================================================
function saveState() {
  state.lastSeen = Date.now();
  try { chrome.storage.local.set({ state }); } catch (e) { /* extension was reloaded */ }
}

// add one line to my event log (shown and downloadable in the popup)
function logEvent(event, detail = "") {
  const minutes = +state.total.toFixed(1);       // note the minutes NOW (state may be reset a moment later)
  try {
    chrome.storage.local.get("log", (data) => {
      const log = data.log || [];
      log.push({ time: new Date().toISOString(), event, minutes, detail });
      chrome.storage.local.set({ log: log.slice(-500) });
    });
  } catch (e) { /* extension was reloaded */ }
}

function freshSession() {
  state = { minutes: 0, total: 0, nextCue: settings.cueMinutes, keepCount: 0,
            phase: "BROWSING", lastSeen: Date.now() };
}


// =====================================================================
// 4. DECAY MATHS
// =====================================================================
function ease(x) {                       // smooth S-curve: starts and ends gently
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
}

// THE KEY IDEA: minutes scrolled -> a number from 0 (fresh) to 1 (decayed)
function decayAmount(minutes) {
  return ease((minutes - DECAY_START) / (DECAY_FULL - DECAY_START));
}

// the decay actually shown (it eases back to 0 while the garden regrows)
function currentDecay() {
  if (regrow !== null) return decayAtLeave * (1 - ease(regrow));
  return decayAmount(state.minutes);
}


// =====================================================================
// 5. BUILDING THE PAGE  (adds our layers on top of Instagram)
// =====================================================================
let fog, grain, petalCanvas, flowerCanvas, timeLabel, nextLabel, muteButton, panel, toast;

function buildPage() {
  const root = document.createElement("div");
  root.id = "fg-root";
  root.innerHTML = `
    <div id="fg-fog"></div>
    <div id="fg-grain"></div>
    <canvas id="fg-petals"></canvas>
    <div id="fg-widget">
      <canvas id="fg-flower" width="260" height="260"></canvas>
      <div id="fg-time">00:00</div>
      <div id="fg-next"></div>
      <button id="fg-mute">sound on</button>
    </div>
    <div id="fg-panel" class="fg-hidden"></div>
    <div id="fg-toast"></div>`;
  document.documentElement.appendChild(root);

  fog = document.getElementById("fg-fog");
  grain = document.getElementById("fg-grain");
  petalCanvas = document.getElementById("fg-petals");
  flowerCanvas = document.getElementById("fg-flower");
  timeLabel = document.getElementById("fg-time");
  nextLabel = document.getElementById("fg-next");
  muteButton = document.getElementById("fg-mute");
  panel = document.getElementById("fg-panel");
  toast = document.getElementById("fg-toast");

  muteButton.addEventListener("click", () => {
    settings.sound = !settings.sound;
    chrome.storage.local.set({ settings });
    updateMuteLabel();
  });
  resizePetalCanvas();
  window.addEventListener("resize", resizePetalCanvas);
  updateMuteLabel();
}

function resizePetalCanvas() {
  petalCanvas.width = window.innerWidth;
  petalCanvas.height = window.innerHeight;
}

function updateMuteLabel() {
  // before my first click the browser keeps sound locked, so say so
  muteButton.textContent = !settings.sound ? "sound off" : audio ? "sound on" : "click page for sound";
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("fg-show");
  setTimeout(() => toast.classList.remove("fg-show"), 3500);
}

// apply the decay to the screen: one number d changes every layer
function applyDecay(d) {
  fog.style.backdropFilter = `grayscale(${Math.min(1, d * 1.15)}) blur(${(d * 2.2).toFixed(2)}px)`;
  fog.style.backgroundColor = `rgba(196, 198, 204, ${(0.3 * d).toFixed(3)})`;   // pale haze
  grain.style.opacity = (0.55 * d * d).toFixed(3);                              // grain arrives late
  timeLabel.textContent = formatTime(state.total);
  nextLabel.textContent = state.phase === "BROWSING" && regrow === null
    ? `next check-in in ${Math.max(0, state.nextCue - state.minutes).toFixed(1)} min` : "";
}

function formatTime(minutes) {
  const m = Math.floor(minutes);
  const s = Math.floor((minutes % 1) * 60);
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}


// =====================================================================
// 6. DRAWING: the wilting flower and the falling petals
// =====================================================================
let fallingPetals = [];

function drawFlower(d, time) {
  const ctx = flowerCanvas.getContext("2d");
  ctx.clearRect(0, 0, 260, 260);
  ctx.save();
  ctx.scale(2, 2);                                   // canvas is 260px but drawn at 130px (sharp)

  const sway = Math.sin(time / 1500) * 0.05;         // gentle movement
  const bend = d * 0.9 + sway;                       // the flower droops as d grows
  const headX = 65 + Math.sin(bend) * 38;
  const headY = 50 + (1 - Math.cos(bend)) * 40 + d * 14;

  // stem
  ctx.strokeStyle = `hsl(130, ${60 * (1 - d) + 10}%, ${35 + 10 * d}%)`;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(65, 125);
  ctx.quadraticCurveTo(65, 90, headX, headY);
  ctx.stroke();

  // petals: fewer and paler as d grows
  const petalCount = Math.round(9 * (1 - d * 0.85));
  for (let i = 0; i < petalCount; i++) {
    const angle = (i / 9) * Math.PI * 2 + sway;
    ctx.save();
    ctx.translate(headX, headY);
    ctx.rotate(angle);
    ctx.fillStyle = `hsl(335, ${75 * (1 - d)}%, ${68 + 8 * d}%)`;
    ctx.beginPath();
    ctx.ellipse(18, 0, 16, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // centre
  ctx.fillStyle = `hsl(45, ${90 * (1 - d) + 5}%, ${60 - 15 * d}%)`;
  ctx.beginPath();
  ctx.arc(headX, headY, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPetals(d, dt) {
  const ctx = petalCanvas.getContext("2d");
  ctx.clearRect(0, 0, petalCanvas.width, petalCanvas.height);
  // more petals fall the more decayed it is
  if (Math.random() < 7 * Math.pow(d, 1.3) * dt) {
    fallingPetals.push({ x: Math.random() * petalCanvas.width, y: -10,
                         speed: 40 + Math.random() * 50, wobble: Math.random() * 6 });
  }
  for (const p of fallingPetals) {
    p.y += p.speed * dt;
    p.x += Math.sin(p.y * 0.02 + p.wobble) * 18 * dt;
    ctx.fillStyle = "rgba(235, 190, 200, 0.8)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 8, 4, p.wobble, 0, Math.PI * 2);
    ctx.fill();
  }
  fallingPetals = fallingPetals.filter((p) => p.y < petalCanvas.height + 20);
}

// animation loop: runs about 30 times a second, only for drawing
let lastFrame = performance.now();
function animate(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.1);
  if (dt > 0.033) {                                  // limit to ~30 fps to stay light
    lastFrame = now;
    const d = currentDecay();
    drawFlower(d, now);
    drawPetals(d, dt);
  }
  requestAnimationFrame(animate);
}


// =====================================================================
// 7. SOUND  (built from sine waves with the Web Audio API - no audio files)
//    As the decay d grows, THREE things change so you can really hear it:
//      1. the warm chord gets quieter and slightly out of tune (goes flat)
//      2. a clashing chord (one semitone higher) and soft hiss fade in
//      3. everything gets muffled (a low-pass filter closes, like a hand over a speaker)
// =====================================================================
let audio = null;       // created after my first click (browsers require a click before sound)

function startAudio() {
  if (audio || !settings.sound) return;
  try {
    audio = buildAudio(new AudioContext());
    updateMuteLabel();
  } catch (error) {
    console.log("Feed Garden: no audio", error);
  }
}

// build the sound machine: chords + hiss -> master volume -> muffler -> speakers
function buildAudio(ctx) {
  const muffler = ctx.createBiquadFilter();           // low-pass filter = the "muffler"
  muffler.type = "lowpass";
  muffler.frequency.value = 6000;
  muffler.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = 0.3;
  master.connect(muffler);

  // a chord = several sine waves played together through one volume control
  const makeChord = (notes) => {
    const volume = ctx.createGain();
    volume.gain.value = 0;
    volume.connect(master);
    const oscillators = [];
    for (const frequency of notes) {
      const osc = ctx.createOscillator();
      osc.frequency.value = frequency;
      const part = ctx.createGain();
      part.gain.value = 1 / notes.length;
      osc.connect(part);
      part.connect(volume);
      osc.start();
      oscillators.push(osc);
    }
    return { volume, oscillators };
  };
  const pad = makeChord([220, 277.2, 329.6, 440]);        // warm A-major chord
  const tension = makeChord([233.1, 293.7, 349.2, 466.2]); // the same chord a semitone higher: it clashes

  // soft hiss: random numbers, smoothed, looped
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let x = 0;
  for (let i = 0; i < data.length; i++) {
    x = x * 0.9 + (Math.random() * 2 - 1) * 0.1;
    data[i] = Math.max(-1, Math.min(1, x * 5));
  }
  const hiss = ctx.createBufferSource();
  hiss.buffer = buffer;
  hiss.loop = true;
  const noise = ctx.createGain();
  noise.gain.value = 0;
  hiss.connect(noise);
  noise.connect(master);
  hiss.start();

  return { ctx, master, muffler, pad, tension, noise };
}

// called every second: the sound follows the decay d (0 = fresh, 1 = fully decayed)
function updateAudio(d) {
  if (!audio) return;
  const on = settings.sound ? 1 : 0;
  const t = audio.ctx.currentTime;
  audio.pad.volume.gain.setTargetAtTime((1 - 0.7 * d) * on, t, 0.8);               // warm chord: quieter
  audio.tension.volume.gain.setTargetAtTime(0.55 * Math.pow(d, 1.2) * on, t, 0.8); // clash: louder
  audio.noise.gain.setTargetAtTime(0.55 * Math.pow(d, 1.5) * on, t, 0.8);          // hiss: louder
  audio.muffler.frequency.setTargetAtTime(6000 - 5100 * d, t, 0.8);                // muffled: 6000 -> 900 Hz
  for (const osc of audio.pad.oscillators) {
    osc.detune.setTargetAtTime(-60 * d, t, 0.8);                                   // goes flat (up to 0.6 semitone)
  }
}

// short soft bell (used when the cue appears and when the garden regrows)
function playBell(freq) {
  if (!audio || !settings.sound) return;
  const ctx = audio.ctx;
  const osc = ctx.createOscillator();
  const volume = ctx.createGain();
  osc.frequency.value = freq;
  volume.gain.setValueAtTime(0.0001, ctx.currentTime);
  volume.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.03);
  volume.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 2.5);
  osc.connect(volume);
  volume.connect(audio.master);
  osc.start();
  osc.stop(ctx.currentTime + 2.6);
}

// browsers only allow sound after the person has clicked or pressed a key
for (const type of ["click", "keydown", "touchstart"]) {
  window.addEventListener(type, () => { startAudio(); if (audio) audio.ctx.resume(); }, { passive: true });
}


// =====================================================================
// 8. THE CUE PANEL: Leave / Keep scrolling / typing
// =====================================================================
function showPanel() {
  if (state.phase === "CUE") {
    panel.innerHTML = `
      <div id="fg-ring"></div>
      <h2>You've been scrolling for ${Math.floor(state.minutes)} min.</h2>
      <p>In my log, an Instagram session lasts about ${Math.round(loggedAverage)} min.
         Nothing is blocked. It's your call.</p>
      <div class="fg-buttons">
        <button id="fg-leave">Leave Instagram</button>
        <button id="fg-keep">Keep scrolling…</button>
      </div>`;
    document.getElementById("fg-leave").onclick = leave;
    document.getElementById("fg-keep").onclick = startTyping;
  } else if (state.phase === "TYPING") {
    panel.innerHTML = `
      <h2>What are you here for?</h2>
      <p>Type a few words to keep scrolling.</p>
      <input id="fg-input" type="text" maxlength="60" autocomplete="off"
             placeholder="e.g. looking for design inspiration">
      <p id="fg-hint"></p>`;
    const input = document.getElementById("fg-input");
    input.value = typed;
    input.focus();
    updateHint();
    // Instagram must not see these keys, so we stop them here
    for (const type of ["keydown", "keyup", "keypress"]) {
      input.addEventListener(type, (e) => e.stopPropagation());
    }
    input.addEventListener("input", () => { typed = input.value; updateHint(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") keepScrolling();
      if (e.key === "Escape") { state.phase = "CUE"; showPanel(); }
    });
  } else if (regrow !== null) {
    const saved = Math.max(0, loggedAverage - leaveSpent);
    panel.innerHTML = `
      <h2>Garden restored.</h2>
      <p>You scrolled ${leaveSpent.toFixed(0)} min. A typical logged session is
         ${Math.round(loggedAverage)} min, so about ${saved.toFixed(0)} min not spent.
         ${settings.closeTab ? "Closing this tab…" : ""}</p>`;
  }
  panel.classList.remove("fg-hidden");
}

function hidePanel() {
  panel.classList.add("fg-hidden");
}

function updateHint() {
  const missing = Math.max(0, MIN_CHARS - typed.trim().length);
  document.getElementById("fg-hint").textContent =
    missing > 0 ? `${missing} more character(s)…` : "Press Enter to continue  ·  Esc to go back";
}

function startTyping() {
  typed = "";
  state.phase = "TYPING";
  saveState();
  showPanel();
}

// CONTINUING needs effort: I must type what I'm here for
function keepScrolling() {
  if (typed.trim().length < MIN_CHARS) return;
  state.keepCount += 1;
  const grace = Math.max(MIN_GRACE, FIRST_GRACE - GRACE_STEP * state.keepCount);   // 8, 6, 4, 4...
  state.nextCue = state.minutes + grace;
  state.phase = "BROWSING";
  logEvent("kept_scrolling", `intent="${typed.trim()}"; next cue in ${grace} min`);
  saveState();
  hidePanel();
  showToast(`Okay. Next check-in in ${grace} min.`);
}

// LEAVING is always one click
let leaveSpent = 0;
function leave() {
  leaveSpent = state.total;
  decayAtLeave = decayAmount(state.minutes);
  logEvent("left", `scrolled ${leaveSpent.toFixed(0)} min; typical logged session ${Math.round(loggedAverage)} min`);
  playBell(523.25);
  regrow = 0;
  freshSession();                                    // the next visit starts a new session
  saveState();
  showPanel();
}

function cueAppears() {
  state.phase = "CUE";
  logEvent("cue_shown", `after ${state.minutes.toFixed(1)} min`);
  saveState();
  playBell(659.25);
  showPanel();
}


// =====================================================================
// 9. THE CLOCK: runs every second and ties everything together
// =====================================================================
let lastTick = Date.now();

function isActive() {                      // only count time while I'm really here
  return document.visibilityState === "visible" && document.hasFocus();
}

function tick() {
  const now = Date.now();
  const seconds = Math.min((now - lastTick) / 1000, 2);   // never jump more than 2 s
  lastTick = now;

  if (regrow !== null) {                                   // garden growing back
    regrow += seconds / REGROW_SECONDS;
    if (regrow >= 1) {
      regrow = null;
      if (settings.closeTab) {
        setTimeout(() => chrome.runtime.sendMessage({ type: "closeTab" }), 1500);
      } else {
        setTimeout(hidePanel, 2500);
      }
    }
  } else if (isActive()) {
    // simulated minutes = real seconds x speed / 60  (speed 1 = real time)
    const dm = (seconds * settings.speed) / 60;
    state.minutes += dm;
    state.total += dm;
    if (state.phase === "BROWSING" && state.minutes >= state.nextCue) cueAppears();
  }

  const d = currentDecay();
  applyDecay(d);
  updateAudio(d);
  if (Math.round(now / 1000) % 3 === 0) saveState();       // save every ~3 seconds
}

// commands from the popup (skip ahead, reset) and changed settings
let lastCommand = 0;
chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings) {
    settings = { ...settings, ...changes.settings.newValue };
    if (state.keepCount === 0 && state.phase === "BROWSING") state.nextCue = settings.cueMinutes;
    updateMuteLabel();
  }
  if (changes.command && changes.command.newValue) {
    const cmd = changes.command.newValue;
    if (cmd.id === lastCommand) return;
    lastCommand = cmd.id;
    if (cmd.type === "skip") {
      state.minutes += cmd.minutes;
      state.total += cmd.minutes;
    }
    if (cmd.type === "reset") { freshSession(); regrow = null; hidePanel(); logEvent("reset"); }
  }
});

// START
async function start() {
  await loadUsageLog();
  const stored = await chrome.storage.local.get(["state", "settings"]);
  settings = { ...settings, ...(stored.settings || {}) };
  const away = stored.state ? (Date.now() - stored.state.lastSeen) / 60000 : Infinity;
  if (stored.state && away < AWAY_MINUTES) {
    state = stored.state;                                  // carry on where I left off
  } else {
    freshSession();                                        // new session
    logEvent("session_started", "new Instagram session");
  }
  buildPage();
  if (state.phase !== "BROWSING") showPanel();             // page was reloaded during a cue
  setInterval(tick, 1000);
  requestAnimationFrame(animate);
}

start();
