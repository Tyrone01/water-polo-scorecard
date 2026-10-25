# Board write lock and Cloudflare Access

Pool TVs keep reading the board with no login. Changing a board (publish or clear) needs a write token or Tyrone's Access sign-in. This pull request adds the lock in the Worker and the plan for Access. It does not turn Access on for `board.fncwp.com`, and it does not deploy production.

## What the Worker does

`PUT`, `POST`, and `DELETE` on `/api/board/:id` are refused unless one of these is true:

1. `Authorization: Bearer <token>` matches the Worker secret `BOARD_WRITE_TOKEN`, or
2. `Cf-Access-Jwt-Assertion` is a real Cloudflare Access JWT for this app, and the `email` claim is exactly `tyrone.mcgillick@gmail.com`.

Either one is enough. A wrong bearer token does not block a good Access login, and a good bearer token does not need Access.

`GET /api/board/:id` stays public, including from the pool TVs. `OPTIONS` stays public so the browser can ask to send the token.

If `BOARD_WRITE_TOKEN` is empty and the Access settings are empty, mutations are refused with 403. The response says the board is locked and that a write token or Access sign-in has to be set on the server. Once a token or Access is configured, a missing or wrong token gets 401, and a sign-in for someone else gets 403. The words are plain English. Nothing in the response includes the token or the JWT.

Access is only treated as configured when both `ACCESS_AUD` and `ACCESS_TEAM_DOMAIN` are set. One of them on its own does not open writes.

`BOARD_WRITE_OPEN=1` skips the check only when the request host is `localhost`, `127.0.0.1`, `[::1]`, or `vite.local` (the host the Vite dev server uses). The same variable on `board.fncwp.com` or a `workers.dev` host does nothing. Do not set it on a deployed Worker.

## Environment variables

| Name | Where | What it is |
| --- | --- | --- |
| `BOARD_WRITE_TOKEN` | Worker secret | The publish password. Preview and production each have their own. Never commit it. |
| `VITE_BOARD_WRITE_TOKEN` | Scorer build | Same value, baked into the tablet JavaScript so a page on `workers.dev` can send `Authorization: Bearer` to `board.fncwp.com`. Empty means the page sends no token. |
| `ACCESS_AUD` | Worker var or secret | Audience tag of the Access application. Leave unset until Access is approved. |
| `ACCESS_TEAM_DOMAIN` | Worker var or secret | Access team issuer, `https://<team>.cloudflareaccess.com`. A bare host is accepted. Leave unset until Access is approved. |
| `BOARD_WRITE_OPEN` | Local shell only | Set to `1` to allow writes from Vite with no token. Ignored on any public host. |

The Worker checks the Access JWT with `jose`. Keys come from `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, not from a generic `/.well-known` URL. The issuer and audience must match. An expired or edited token is refused.

`VITE_BOARD_WRITE_TOKEN` is visible to anyone who can load the scorer page. It is a shared tablet token, not a personal password. The Worker secret is still what decides. Do not reuse the production token in a preview build.

## Local Vite

```sh
BOARD_WRITE_OPEN=1 npm run dev
```

Or put a token in the environment and in the client:

```sh
BOARD_WRITE_TOKEN='…' VITE_BOARD_WRITE_TOKEN='…' npm run dev
```

Without one of those, a local publish or clear to the Vite server is refused. `GET` still works. The usual tablet path posts to `https://board.fncwp.com` first (see `VITE_PUBLIC_BOARD_ORIGIN`). That host is unchanged until a production deploy of this lock.

## Client and CORS

`publishBoard` and `clearBoard` (Setup and the scorecard) send `Authorization: Bearer <VITE_BOARD_WRITE_TOKEN>` when that variable is set. They do not rely on Access cookies. A page on `workers.dev` is a different site from `board.fncwp.com`, so the browser will not attach the Access cookie on that post.

Responses still use `Access-Control-Allow-Origin: *` so a TV can `GET` the board. Mutating requests may send `Authorization` and `Cf-Access-Jwt-Assertion`. Allowing those headers does not skip the lock. Cookies are not required, and the Worker does not use credentialed CORS.

## Cloudflare Access plan for board.fncwp.com

Do not create this application from this pull request. Production Access waits for Tyrone's approval on Monday morning. Screenshots of the Access UI are not part of this change because the app is not turned on here.

When it is approved, add a self-hosted Access application for `board.fncwp.com`.

- Identity provider: Google only.
- Allow policy: selector Email, value exactly `tyrone.mcgillick@gmail.com`. No other emails. No "everyone".
- Bypass policies (action Bypass, include Everyone), one policy or one path application per public path:
  - `/alstonville`
  - `/ballina`
  - `/lismore`
  - `/byron`
  - `/murwillumbah`
  - `/board` and `/board/*`
  - `/assets/*`
  - `/sw.js`
  - Favicon and icons the page actually loads: `/logo-fnc.jpg`, `/icon.svg`
- Also bypass these, or the current site breaks even though they were not in the first list:
  - `/mullumbimby` (the scorecard's fourth pool TV today; Byron and Murwillumbah are on the list above for the Access plan, and are not fixed TV ids in the app yet)
  - `/` (the pool picker on this host)
  - `/manifest.webmanifest`
  - `/drive-oauth` (the Google popup previews use for Save to Drive; blocking it breaks sign-in)

Do not add a Bypass policy for `/api/board` or `/api/board/*`.

Access runs before the Worker and cannot allow `GET` while blocking `PUT` on the same path. The Worker is the layer that does that. Leave `/api/board/*` out of every Access application, and do not add a Bypass for it. Then:

- A pool TV's `GET /api/board/alstonville` reaches the Worker with no Google login. `GET` stays public.
- `PUT`, `POST`, and `DELETE` reach the same Worker and are refused without the write token or a verified Access JWT.

A Bypass on `/api/board/*` would mark anonymous writes as intentional at the edge. The Worker would still refuse them today. If the lock were later removed, those writes would be public again. That is why the Bypass is not used.

Putting the API on the Allow policy instead would send the TV poll to a Google login page. The board would stay blank. Do not do that either.

Same-origin Access cookies are not how the tablet on `workers.dev` publishes. That path uses the bearer token. The JWT check is there so a real Access assertion cannot be forged if a later setup forwards `Cf-Access-Jwt-Assertion` to the Worker.

## Preview and production

This branch is preview only.

- Do not merge to `main`.
- Do not `wrangler deploy` this Worker onto production.
- Do not run `wrangler secret put BOARD_WRITE_TOKEN` against the production Worker. That command publishes a new production version.
- Do not enable Access on `board.fncwp.com`.
- `https://board.fncwp.com` keeps serving the build that is already there. Pool TVs are unchanged by opening this pull request.

Preview uses its own `BOARD_WRITE_TOKEN`. Production will get a different one when that deploy is approved. Build the preview scorer with the preview token (`VITE_BOARD_WRITE_TOKEN`) or the preview page will publish with no header and the lock will refuse it.

Previews do not inherit the production KV binding. The live namespace id in `wrangler.jsonc` is `26e057bda256408d824a5d1d9dca92a2`. Do not bind that id on a preview. A preview with no `SCOREBOARD` binding stores a successful write in the isolate only. It does not update the pool TVs. A preview that reuses the live id would overwrite Alstonville, Ballina, Lismore, or Mullumbimby. Bind a separate namespace before a preview needs a durable board.

Preview URLs are public until Access is added for them. The write lock is what stops a stranger changing the preview's board data. Do not put Access on the production hostname to lock a preview.

## Rollback

1. Remove the Access application for `board.fncwp.com` if it was created. That is a dashboard change, not a code revert.
2. To stop requiring the token, deploy a Worker build from before this lock. Unset `BOARD_WRITE_TOKEN` on that Worker only if you also want the secret gone. Unsetting the secret on a build that still has the lock does not reopen writes. It keeps them refused.
3. Do not "roll back" by adding a Bypass on `/api/board/*` while this lock is deployed and then deleting the lock later. Remove the Access app and deploy the old Worker together if the goal is the old open board.

## Handover for Monkey

Production `board.fncwp.com` is not part of this check. Use the preview URL for this branch (Workers Builds, or the URL printed by `npx wrangler preview` on this branch). Wrangler 4.135.0 or later is what Cloudflare's current Preview commands expect. This repo does not pin Wrangler.

1. Make a token and do not paste it into git, the pull request, or chat:

   ```sh
   openssl rand -base64 32
   ```

2. Put it on this preview only. From the repo, on this branch:

   ```sh
   npx wrangler preview secret put BOARD_WRITE_TOKEN --name <preview-name>
   ```

   The name defaults to the current git branch. This is not `wrangler secret put`, which would touch production. Leave `ACCESS_AUD` and `ACCESS_TEAM_DOMAIN` unset. Do not enable Access on `board.fncwp.com`.

3. Build or redeploy that preview with the same value in `VITE_BOARD_WRITE_TOKEN` if you need the tablet UI on the preview host to publish. Curl checks below do not need the client build.

4. Confirm the preview is not bound to KV `26e057bda256408d824a5d1d9dca92a2`. Use a throwaway id such as `writetest`, not `alstonville`.

5. From a machine that can reach the preview URL:

   ```sh
   PREVIEW='https://<preview-host>'
   # Public read. 200 if a board is stored, 404 if not. Not a login page.
   curl -sS -D- "$PREVIEW/api/board/writetest"

   # Locked write. 403 while the secret is missing, 401 once the secret is set.
   # Body is a short sentence about the board being locked.
   curl -sS -D- -X PUT "$PREVIEW/api/board/writetest" \
     -H 'content-type: application/json' \
     -d '{"v":1,"updatedAt":1}'

   # Same with the wrong token. 401, and GET still shows no new board.
   curl -sS -D- -X PUT "$PREVIEW/api/board/writetest" \
     -H 'content-type: application/json' \
     -H 'authorization: Bearer wrong-token' \
     -d '{"v":1,"updatedAt":1}'

   # Right token. 200 and {"ok":true}. Then GET returns that JSON.
   curl -sS -D- -X PUT "$PREVIEW/api/board/writetest" \
     -H 'content-type: application/json' \
     -H "authorization: Bearer $BOARD_WRITE_TOKEN" \
     -d '{"v":1,"updatedAt":1,"white":1}'
   curl -sS "$PREVIEW/api/board/writetest"

   # Clear. 401 without the token, 200 with it. GET is 404 again after the clear.
   curl -sS -D- -X DELETE "$PREVIEW/api/board/writetest"
   curl -sS -D- -X DELETE "$PREVIEW/api/board/writetest" \
     -H "authorization: Bearer $BOARD_WRITE_TOKEN"
   ```

6. Open `https://board.fncwp.com/alstonville` and confirm it is still the live board, with no Google Access wall. This pull request must not have changed that host.

7. A preview `PUT` that returns 200 does not mean the pool TV changed. If the preview has no KV binding, the write lives only in that isolate. If someone bound the live namespace, stop and remove that binding before any more writes.

Local escape, if you need the Vite server to accept a publish with no token: `BOARD_WRITE_OPEN=1 npm run dev`. That does not unlock the preview or `board.fncwp.com`.
