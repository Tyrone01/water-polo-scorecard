# AJWP POC scoreboard

Tablet score sheet. Load the 16&U BMJC demo to start.


v1: live scoring and Revolutionise Sport roster import.
Physical scoreboards are not wired up (TODO in src/engine.ts).

## Run
Install packages, then start the Vite dev script. Other scripts: build, preview, test.
Scoring works offline after first load (PWA). Import needs network or Paste HTML.
State persists in localStorage.

## Score a match
Setup, or load the 16&U BMJC demo.
Fill event, stage, venue, grade, date, time, officials.
Age group sets running-time periods: U12 4x6, U13-U14 4x7, U15-U18 4x8.
Mode ROUND (BMJC rounds) or MEDAL/FINALS.
Max 10 on the card, max 3 fill-ins. Caps as printed; names editable.
White left, Blue right. Flow: team then cap then code.

Time auto-stamps remaining period (editable).
Centre log: Time, Cap, W/B, code, Score. Score only on goals, always White-Blue.
Undo last event. Edit or delete a log row to fully recalc.
End quarter reconciles. Strike off a player not present by Q3.
Export two CSVs: event log, player summary.
When the match ends, the sheet auto-saves those same CSVs to the club Google Drive folder and verifies both files before **Clear for next game** unlocks. Wipe returns to Setup and keeps admin Drive / clock settings.


## Legend
G Goal, P Penalty foul, PG Penalty Goal, E Exclusion Foul, EG Exclusion Goal, S Suspension, TO Time Out.
Only referee-signalled events. Never record minor fouls.

## Rules
WPA table-officials plus World Aquatics July 2025 (18s exclusion, not 20s) plus BMJC 2026/27 QLD juniors overlay.
G even strength. EG extra-man (warn if no live exclusion on defence). PG after a P.
E exclusion, personal foul, 18s actual play. P penalty foul, player stays; then PG if scored.
S suspension, out for remainder, fill remaining foul boxes.
3 personal fouls (E or P) = out. Fourth blocked (red flag). If 3rd is a penalty, substitute immediate.
ROUND timeouts: 0 (BMJC rounds). FINALS: 2 per team, 1 minute, possession team only.
PSO log only in FINALS. Dual-write log + player stats must reconcile.

## RevSport import
Paste a full revolutionise.com.au game URL or team-stats URL on the setup screen.
Match card example: club slug wptas, game 2621794 (both teams; Name, Goals, Major Fouls).
Team-stats example: club slug wpact, team-stats 25376/402491 (one team; #, Name, Attended).
Caps from Name (#4); otherwise sequential caps are assigned and flagged.
Players beyond 10 go to the bench for the secretary to tick on.
Paste HTML / table fallback if the page cannot be loaded.
Parser uses table markup; it does not invent players. Fixtures in fixtures/ are covered by tests.

## CORS
Browsers block revolutionise.com.au. v1 uses a Vite plugin helper named /api/revsport.
Only https URLs on www.revolutionise.com.au are allowed.
The working import path for v1 is the Vite dev (or preview) script.
Production: same allow-list as a Cloudflare Worker, or a tiny Node helper. Do not ship an open helper.
Until then, use Paste HTML.

## Club Drive
Setup → **Club Drive (admin)**. Default folder is [AJWP POC Scorecards](https://drive.google.com/drive/folders/1zoopKHp_dBAtYVKHSmD-MUjkkZ3cOp8Z).
Connect Google uses a Google Cloud OAuth **Web** client ID (JS origins: `http://localhost:5173` and the current preview origin). Scope: `drive.file`. The page POSTs CSVs through `/api/drive/upload`; files stay `text/csv`.

## Tests
The test script covers engine rules and the parser against real WPTAS/WPACT HTML fixtures.