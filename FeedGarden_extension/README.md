# Feed Garden – a Chrome extension: a stopping cue for Instagram's infinite scroll
Creative & Applied Computation · Task 2 · Sadiyah Sarvath

## Install (no Python, nothing to build)
1. Unzip `Sadiyah_Sarvath_codebase.zip`. You get a folder called `FeedGarden_extension`.
2. In Chrome, type `chrome://extensions` in the address bar and press Enter.
3. Switch on **Developer mode** (top-right).
4. Click **Load unpacked** and choose the `FeedGarden_extension` folder (the one that contains `manifest.json`).
5. Click the puzzle-piece icon in Chrome's toolbar and **pin** Feed Garden.
6. Open https://www.instagram.com. A small garden widget appears in the top-right corner.
7. **Click anywhere on the page once.** Browsers keep sound locked until you click. The widget then says "sound on".

## Use
- Scroll Instagram normally. Time counts only while the tab is open AND focused.
- After 10 minutes a cue appears: **Leave Instagram** (garden regrows, tab closes) or **Keep scrolling…** (type what you're here for, Enter).
- Next cues come after 8, then 6, then 4 minutes. The popup shows every event and downloads a CSV log.
- **For a demo:** click the extension icon → Speed → "1 min per second (demo)" (or "1 min per 2 seconds" for a slower one), then use "Skip +5 min".
- **For the real 30-minute test:** leave Speed on "Real time".
- After changing the code, press the refresh arrow on the extension's card in `chrome://extensions`, then reload Instagram.

## Files
| File | What it does |
|---|---|
| `manifest.json` | Tells Chrome what the extension is, and to run `content.js` on instagram.com |
| `content.js` | The whole idea: clock, decay maths, garden layers, sound, cue panel, typing friction, logging |
| `content.css` | How the layers, flower widget and cue panel look |
| `background.js` | Closes the tab when I choose Leave (pages can't close their own tab) |
| `popup.html` / `popup.js` | The small settings window: first cue, speed, skip, reset, event log, CSV download |
| `data/screen_time_log.csv` | My 30 Oct 2026 usage log. Read by `content.js` to get my average logged Instagram session |
| `Sadiyah_Sarvath_writeup.pdf` | Technical write-up |

## How content.js is organised
1. Settings · 2. Data (reads the CSV) · 3. Saving & logging · 4. Decay maths · 5. Building the page · 6. Drawing (flower, petals) · 7. Sound · 8. The cue panel · 9. The clock

## Viva cheat sheet – "explain this"
- **One number drives everything:** `d = decayAmount(minutes)`, from 0 (fresh) to 1 (decayed), on an S-curve between minute 3 and minute 25. Greyscale, blur, fog, grain, falling petals, the wilting flower and the sound are all computed from `d`.
- **Why an S-curve (`ease`)?** The decay starts and ends gently, so it feels calm instead of glitchy.
- **Where is the friction?** Leaving is one click. Continuing needs typing at least 4 characters (`MIN_CHARS`), and each "keep" shortens the next wait (8, 6, 4 min).
- **Why doesn't it block Instagram?** The decay layers ignore the mouse (`pointer-events: none`). Only the cue card takes clicks.
- **How is "active time" measured?** Every second: if the tab is visible and focused, add `seconds × speed / 60` minutes.
- **What does the CSV do?** `loadUsageLog()` reads my logged Instagram sessions (75, 55, 60, 50, 81 min), averages them (about 64 min), and the cue and leave messages compare my session with that baseline.
- **How does the sound change?** Made from sine waves with the Web Audio API. As `d` grows: (1) the warm chord gets quieter and slightly flat, (2) the same chord one semitone higher (it clashes) and a soft hiss fade in, (3) a low-pass filter closes from 6000 Hz to 900 Hz so everything sounds muffled. Browsers only start sound after a click.
- **Memory:** `chrome.storage.local` keeps the timer between page reloads and stores the event log.
