# Southern Cross scoreboard output (design)

Not a go-live blocker. Digit boards and LED screens are different beasts.

## What Southern Cross actually ships

Public pages (sthncross.com.au water polo range, 2026):

- **Digit boards** (`SCWP-SO`, `SCWP-A`, `SCWP-B`, names `-N`, shot clocks `SCWP-SC`): control is a **wireless handheld remote** (~300 m). No published LAN/WiFi API. Shot clocks take a **data cable** from the main board.
- **LED screens** (`SCMAT-P4` / `SCMAT-P7`): come with **Southern Cross Water Polo scoring software** and an **LED control PC** on a local network. This is the path that can take our app as the scoring source.

Until we know which box is on the pool deck, assume we may need both a LAN picker and (for digit boards) a call to sales@sthncross.com.au / 02 4388 5421 for the PC/WiFi protocol.

## “Search local WiFi and pick the scoreboard”

Setup UI (later): **Find scoreboard** → list of boards on this network → select one → remember it in admin settings.

A **browser tab cannot list WiFi SSIDs**. Discovery has to be one of:

1. **Same LAN, IP scan** (preferred if the venue WiFi already reaches the board / control PC): UDP/HTTP/mDNS probe from our Worker-local helper or the scoring computer. UI shows name, IP, model. This is the picker we want.
2. **Board is its own access point**: the OS (or a small dual-NIC box) must join that SSID. We cannot do that from the webpage. A tiny local helper can list SSIDs named like the board, join, and keep a second NIC on the internet.
3. **Manual IP** fallback if scan finds nothing.

## Stay online (RevSport + Drive + board at once)

If the scoring tablet joins the board’s private WiFi, **Google Drive and RevSport die**.

Working layouts:

- Scoring computer has **two links**: Ethernet (or USB-C dongle) to venue internet, WiFi to the scoreboard AP.
- Or everything on **one venue LAN** (board/control PC plugged into the same switch as internet). Then “Find scoreboard” is just a LAN scan. This is the cleanest pool-deck setup.
- Or a **small always-on box** (Pi / mini PC) at the board: it stays on the board network and our tablet talks to it over the venue WiFi. Tablet never leaves the internet.

Do not put the public Cloudflare preview on the board’s isolated AP.

## What we send

Same snapshot as `/board`: White/Blue score, period, game clock, shot clock, possession, BREAK/HALF. Digit boards only get the numbers they have digits for. LED screens can take the spectator page or a dedicated output.

## Next facts we need from the pool

- Exact model (photo of the board or the `SCWP-…` / `SCMAT-…` sticker).
- How it is controlled today (handheld remote vs a PC under the table).
- Whether that PC/board has a WiFi name or a wall Ethernet.

