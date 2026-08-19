# TEMPLAR SOC — Front-End (ANIMUS 1.0)

The immersive presentation layer for the **captured Templar Security Operations
Center**. A standalone React application that transforms Splunk into the classified
command center of the Templar Order. Splunk remains the investigation engine; this
is the skin the Assassins operate it through.

> This phase is **UI/UX only**. All data is mock. The app is architected so the
> mock service can be swapped for a real Splunk backend with no screen changes.

---

## Run it

```bash
cd templar-soc-frontend
npm install
npm run dev        # → http://localhost:5173
```

Production build:

```bash
npm run build      # outputs ./dist (static, relative paths)
npm run preview
```

The demo opens on the **login threshold**. Enter (any credentials) → `INITIATE SYNC`
drops you into the Investigation Console. Use the **VIEW:** toggle at the bottom of
the sidebar to reveal **Mission Control** (organizer view) — players never see it.

---

## The three player surfaces + admin

| Route | Surface | Role |
|---|---|---|
| `/console` | **Investigation Console** — SPL editor, analyst toolbox, timeline, event grid, Events/Patterns/Statistics/Visualization. *The heart of the experience.* | Player |
| `/alerts` | **Operational Alerts** — organizer-published detections + emergency broadcast banner | Player |
| `/intel` | **Threat Intelligence** — classified analyst briefings with IOC blocks | Player |
| `/mission-control` | **Mission Control** — publish alerts / intel / emergency broadcasts to all sessions | Organizer only |

A **live notification poller** (`SocContext`) raises a themed in-app alert whenever
Mission Control publishes something — mirroring the production notification mechanic.

---

## Architecture — the Splunk integration seam

The entire UI depends only on the `SplunkService` **contract**
(`src/services/splunkService.js`). Today it is backed by `MockSplunkService`.
To go live, implement the same methods against Splunk's REST API and change **one
line** in `src/services/index.js`:

```js
// export const service = new MockSplunkService();
export const service = new RealSplunkService({ baseUrl, token });
```

Documented mappings (see `splunkService.js`):

| UI method | Splunk endpoint |
|---|---|
| `search(spl, range)` | `POST /services/search/v2/jobs` → `GET .../results` |
| `getAlerts()` | `GET .../storage/collections/data/templar_alerts` |
| `getThreatIntel()` | `GET .../storage/collections/data/templar_threat_intel` |
| `publishAlert()` / `publishIntel()` | `POST .../storage/collections/data/<coll>` *(admin only)* |
| `pollLatest()` | `GET .../data/<coll>?sort=-timestamp&limit=1` |
| `getSession()` | `GET /services/authentication/current-context` |

RBAC (player = read-only, organizer = publish) is enforced **server-side by Splunk**,
not by hiding UI — the route gate here is only a demo convenience.

---

## Project layout

```
src/
  main.jsx / App.jsx            entry + router (HashRouter)
  styles/                       tokens.css (design system) + global.css
  services/                     SplunkService contract, MockSplunkService, mock data
  context/SocContext.jsx        session, role, live notification poller
  components/
    atmosphere/                 particles + grid + scanlines + breathing glow
    brand/TemplarCross.jsx      the Order's mark (original geometry)
    layout/                     AppShell, Sidebar, TopBar, shell.css
    console/                    Spl editor, Timeline, EventRow (Console building blocks)
    notifications/              live in-app notification
  pages/                        Login, InvestigationConsole, Alerts, ThreatIntel, MissionControl
```

## Design language

Black / deep charcoal surfaces, restrained **crimson** (operational activity),
sparing **gold** (the Templar Order). Monospace, `SNAKE_CASE` labels, sharp 1px
edges. Motion is *cinematic but restrained* — ambient life, never a gaming HUD —
and fully respects `prefers-reduced-motion`. All colors/fonts are tokens in
`src/styles/tokens.css`; change the theme there.
