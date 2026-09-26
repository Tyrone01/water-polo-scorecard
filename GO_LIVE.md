# AJWP scorecard — go-live checklist

POC defaults stay until a real game night. Flip these when you go live. Do not wait until Friday night to remember them.

## Code flags (`src/types.ts`)

- [ ] `TEST_NUKE_GAME` → `false` (or delete the red TEST: nuke game buttons). Wipes a match without Drive save.
- [ ] `PICK_FIXTURES_BY_TODAY` → `true`. Competition listing URLs then auto-pick the most likely round/game for **today**. A pasted `/round/N` URL still honours that round.

## Google / Drive (admin@ajwp.com.au)

- [ ] Attach GCP project `ajwp-scorecard` to the AJWP Workspace organisation so **Internal** is available.
- [ ] Switch the OAuth Web client from External (testing, test user only) to Internal.
- [ ] Add the **stable** production origin (and redirect URI) on client `251564153707-4d57t4mdibcq9ulvehk7k0jrkgovbm3b`. No trailing slash.
- [ ] Confirm Connect Google as `admin@ajwp.com.au` on that host, then a test Drive save into [AJWP POC Scorecards](https://drive.google.com/drive/folders/1zoopKHp_dBAtYVKHSmD-MUjkkZ3cOp8Z). Rename the folder if it should not say POC.

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
2. Connect Google, log a dummy G, End quarter through Q4, confirm two CSVs land in Drive.
3. Open the shareable board URL on a second device.
4. Nuke is gone. Clear for next game still works after a verified save.
