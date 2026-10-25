# AJWP scorecard — go-live checklist

POC defaults stay until a real game night. Flip these when you go live. Do not wait until Friday night to remember them.

## Code flags (`src/types.ts`)

- [ ] `TEST_NUKE_GAME` → `false` (or delete the red TEST: nuke game buttons). Wipes a match without Drive save.
- [ ] `PICK_FIXTURES_BY_TODAY` → `true`. Competition listing URLs then auto-pick the most likely round/game for **today**. A pasted `/round/N` URL still honours that round.

## Google / Drive (tyrone.mcgillick@gmail.com)

Pool path after this build: finish the game, tap **Save to Drive** on the scorecard. Do not send officials through Setup.

Interim until an FNC Google tenant exists. One-tap save lands in Tyrone's personal Drive, in the pool folder under [2026-10-26 Mon night](https://drive.google.com/drive/folders/1ApnMIwIgNVTo_vHmmKm4FmQCzzEAImpF) (parent [FNC Water Polo Scorecards](https://drive.google.com/drive/folders/1PzhpHO6y89W3TdenqrEnL4Wz6mQ9Knok)). Checklist account is `tyrone.mcgillick@gmail.com`.

Save picks the folder from the game venue (`boardVenueId`, then the venue name, then `?venue=`):

- Alstonville → [1RrmsmFxqns-C_9ADhZaYQtUE4ElYiESk](https://drive.google.com/drive/folders/1RrmsmFxqns-C_9ADhZaYQtUE4ElYiESk)
- Ballina → [1bW0_O_64h36zBaEyqkyxAtuasWf2ugqG](https://drive.google.com/drive/folders/1bW0_O_64h36zBaEyqkyxAtuasWf2ugqG)
- Lismore → [1Vc7PAAbOYFa51HPbWmmn5FWbNEiFzHqS](https://drive.google.com/drive/folders/1Vc7PAAbOYFa51HPbWmmn5FWbNEiFzHqS)
- Mullumbimby → [1AKr2CS-t0j7fftQfu6A_4yVMGtjUbkg7](https://drive.google.com/drive/folders/1AKr2CS-t0j7fftQfu6A_4yVMGtjUbkg7)

No venue match uses Alstonville. Files do not go in the parent Scorecards folder or the Mon night folder itself. A custom folder pasted in Setup → Drive folder (admin) wins over this map.

- [ ] On OAuth Web client `251564153707-4d57t4mdibcq9ulvehk7k0jrkgovbm3b`, set authorised JavaScript origins (no trailing slash) to exactly:
  - `http://localhost:5173`
  - `http://127.0.0.1:5173`
  - `https://board.fncwp.com`
  - `https://water-polo-scorecard.tyrone-mcgillick.workers.dev`
- [ ] Do not add each preview hostname. Preview links sign in through `https://board.fncwp.com/drive-oauth` after this build is on that host.
- [ ] Leave the OAuth Web client on External (testing). `tyrone.mcgillick@gmail.com` must be a listed test user. That personal Gmail is the checklist account for now.
- [ ] Confirm that account is an Editor on the four pool folders above. Scope stays `drive.file`. If Drive says the folder is missing, the app cannot see a folder it did not create — paste another folder URL in Setup → Drive folder (admin). Do not invent a folder id in code.
- [ ] Sign in once on `https://board.fncwp.com`, end a dummy game at Alstonville, tap Save to Drive, confirm both CSVs land in the Alstonville pool folder (not the parent Scorecards folder).

## Board writes and Access

The Worker lock and the Access plan are in [docs/ACCESS-AND-WRITE-LOCK.md](docs/ACCESS-AND-WRITE-LOCK.md). Do not turn Access on for `board.fncwp.com` until Monday approval. Preview uses its own `BOARD_WRITE_TOKEN`. Production stays on the current deploy until that lock is deliberately shipped. Pool TV `GET` stays public. `PUT`, `POST`, and `DELETE` need the write token or Tyrone's Access sign-in.

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
2. On https://board.fncwp.com, log a dummy G, end the game, tap Save to Drive, confirm two CSVs land in that venue's Mon night pool folder (Alstonville if the venue did not match).
3. Open the shareable board URL on a second device.
4. Nuke is gone. Clear for next game still works after a verified save.
