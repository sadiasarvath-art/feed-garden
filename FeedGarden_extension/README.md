# Feed Garden – a Chrome extension: a stopping cue for Instagram's infinite scroll
Creative & Applied Computation · Task 2 · Sadiyah Sarvath

## Use
- Scroll Instagram normally. Time counts only while the tab is open AND focused.
- After 10 minutes a cue appears: Leave Instagram (garden regrows, tab closes) or Keep scrolling… (type what you're here for, Enter).
- Next cues come after 8, then 6, then 4 minutes. The popup shows every event and downloads a CSV log.
- For a demo: click the extension icon → Speed → "1 min per second (demo)" (or "1 min per 2 seconds" for a slower one), then use "Skip +5 min".
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


