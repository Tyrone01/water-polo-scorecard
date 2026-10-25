# AJWP scorecard — go-live checklist

POC defaults stay until a real game night. Flip these when you go live. Do not wait until Friday night to remember them.

## Code flags (`src/types.ts`)

- [ ] `TEST_NUKE_GAME` → `false` (or delete the red TEST: nuke game buttons). Wipes a match without Drive save.
- [ ] `PICK_FIXTURES_BY_TODAY` → `true`. Competition listing URLs then auto-pick the most likely round/game for **today**. A pasted `/round/N` URL still honours that round.

## Google / Drive (admin@ajwp.com.au)

Pool path after this build: finish the game, tap **Save to Drive** on the scorecard. Do not send officials through Setup.

- [ ] On OAuth Web client `251564153707-4d57t4mdibcq9ulvehk7k0jrkgovbm3b`, set authorised JavaScript origins (no trailing slash) to exactly:
  - `http://localhost:5173`
  - `http://127.0.0.1:5173`
  - `https://board.fncwp.com`
  - `https://water-polo-scorecard.tyrone-mcgillick.workers.dev`
- [ ] Do not add each preview hostname. Preview links sign in through `https://board.fncwp.com/drive-oauth` after this build is on that host.
- [ ] Attach GCP project `ajwp-scorecard` to the AJWP Workspace organisation so **Internal** is available.
- [ ] Switch the OAuth Web client from External (testing, test user only) to Internal. Until then, only a listed test user can sign in. Use `admin@ajwp.com.au`.
- [ ] Confirm that account is an Editor on [AJWP POC Scorecards](https://drive.google.com/drive/folders/1zoopKHp_dBAtYVKHSmD-MUjkkZ3cOp8Z). Scope stays `drive.file`. If Drive says the folder is missing, the app cannot see a folder it did not create — confirm this folder is the one FNC nights should use, or paste another folder URL in Setup → Drive folder (admin). Do not invent a folder id in code.
- [ ] Sign in once on `https://board.fncwp.com`, end a dummy game, tap Save to Drive, confirm both CSVs land in that folder.

## Host

- [ ] Stop relying on temporary `*.workers.dev` previews (hostname changes; OAuth origins lag).
- [ ] Claim or attach a stable Workers route (and later a club domain if you want e.g. scoreboard.ajwp.com.au).
- [ ] Spectator board: tablet Setup copies `/board/{matchId}` — put that URL on the TV/phone. Confirm it updates live on the production host.

## Repo and ops

- [ ] First push to https://github.com/Tyrone01/water-polo-scorecard (still empty as of POC).
- [ ] Custom club RevSport domains (e.g. `fncwaterpolo.org.au/games/...`) stay allowed — that is not a POC-only switch.
- [ ] Physical scoreboard hardware integration is later, not a go-live blocker.

## Night-before smoke test

1. Fetch the **tonight** fixtures URL (or the round URL) and pick the first game.
2. On https://board.fncwp.com, log a dummy G, end the game, tap Save to Drive, confirm two CSVs land in the club folder.
3. Open the shareable board URL on a second device.
4. Nuke is gone. Clear for next game still works after a verified save.
