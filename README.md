# ANIMUS 1.0 — TEMPLAR SOC

A custom-built, Splunk-native Security Operations Center used as a live CTF /
immersive investigation challenge. Players log into a themed SOC console, write
real SPL against a real Splunk Enterprise index, and hunt a hidden APT campaign
buried under eight days of synthetic enterprise noise. Organizers drive the
narrative in real time from a separate Mission Control surface — publishing
alerts, threat-intel briefings, emergency broadcasts, and audio cues that reach
every connected player instantly.

This repository is the complete, reusable build: application source, the
telemetry generator that seeds the dataset, and the full production
infrastructure configuration lifted from the deployed VM.

> **Running your own event?** The engine is generic — only the theme, the names
> and the dataset are ANIMUS-specific. **[`REUSE.md`](REUSE.md)** is the guide to
> adapting it for a different CTF: what to re-skin, what to rename, how to write
> your own storyline into the generator, and what must not be touched.

---

## Architecture

```
                    ┌──────────────────────┐      ┌──────────────────────┐
   players  ──443──▶│  soc.templarhq.xyz   │      │ animus.templarhq.xyz │◀──443──  organizers
                    │  nginx (player vhost)│      │  nginx (admin vhost) │
                    │  API allowlist       │      │  full /api/ surface  │
                    └──────────┬───────────┘      └───────────┬──────────┘
                               │                              │
                               └──────────────┬───────────────┘
                                              ▼
                                  ┌────────────────────────┐
                                  │  templar-relay (node)  │  127.0.0.1:8787
                                  │  • WS broadcast fan-out│
                                  │  • organizer/player authn
                                  │  • SPL guardrails      │
                                  │  • sound library       │
                                  │  • activity/audit log  │
                                  └───────────┬────────────┘
                                              │ REST, mgmt API 8089
                                              ▼
                                  ┌────────────────────────┐
                                  │  Splunk Enterprise 10  │
                                  │  index: templar_       │
                                  │         investigation  │
                                  │  HEC :8088 ingest      │
                                  └────────────────────────┘
```

Both browser surfaces are static Vite builds of the **same** React codebase,
compiled twice in different modes (`player` / `admin`) so each domain ships only
its own entry point. The relay is the single origin server behind both vhosts;
nginx decides which API paths each domain may reach. Players never receive Splunk
credentials — every search is proxied through the relay, which authenticates as a
read-only, index-scoped Splunk service account (`templar_relay`) and applies SPL
guardrails before dispatching the job.

---

## Repository layout

| Path | What it is |
|---|---|
| `templar-soc-frontend/` | React + Vite SPA. Player console (SPL editor, timeline, event grid, alerts, threat intel) and the organizer Mission Control admin app. |
| `realtime-server/` | Node relay: Express + `ws`, SQLite via `better-sqlite3`. Auth, WebSocket fan-out, Splunk search proxy, sound uploads, audit log. |
| `deploy/` | Production infrastructure, pulled from the live VM — nginx vhosts + security snippets, systemd unit, Splunk `.conf` files, env templates. |
| `tools/animus_gen3.py` | Deterministic telemetry generator. Emits the entire 8-day dataset to Splunk over HEC. |
| `CTF-logs/` | Standalone raw log samples (DNS, web access, network, Windows events). |
| `voices/` | Narrative audio cues played through the organizer's audio console. |
| `REUSE.md` | Guide to adapting this platform for a different CTF. |
| `ANIMUS-SOC-Splunk-Implementation-Doc.md` | Full implementation write-up. |
| `story.txt`, `event-flow.txt`, `product-vision.txt` | Narrative design and run-of-show notes. |

### Relay modules

| File | Responsibility |
|---|---|
| `server.js` | HTTP + WebSocket server, all `/api/*` routes. |
| `auth.js` | Organizer and player credential flows, JWT access tokens, refresh handling. |
| `db.js` | SQLite schema and queries (credentials, broadcasts, sounds, activity log). |
| `splunk.js` | Splunk management-API client — dispatches search jobs, polls, collects results. |
| `searchGuard.js` | SPL guardrails applied before any player query reaches Splunk. |
| `scripts/set-*-credentials.js` | Rotate organizer / player credentials from the CLI. |

---

## The dataset

`tools/animus_gen3.py` generates a large, internally consistent enterprise
dataset spanning **four simultaneous storylines** over an 8-day window:

1. **Normal enterprise activity** — HR, Finance, Legal, Dev, Executive, IT.
2. **"Good Assassin" campaign** — loud, fully ticketed, contained and closed.
3. **Templar SOC defensive activity** — case lifecycle, containment, remediation.
4. **"Rogue Assassin" APT** — the real target, hidden under the noise.

The intended solve is a **cross-source correlation**, not a single-IOC filter:
every legitimate privileged action ties to a verifiable IT change ticket, and the
Rogue Assassin campaign is the only activity in the dataset with no matching
ticket. Deliberate near-miss decoys sit at each stage so players must eliminate
candidates by correlating tickets, accounts and paths.

The generator is seeded (`random.seed(20260622)`), so every run produces an
identical dataset and the answer key stays exact.

```bash
export HEC_TOKEN=<your-token>
DRYRUN=1 python3 tools/animus_gen3.py     # print counts + summary, send nothing
python3 tools/animus_gen3.py              # ingest into Splunk over HEC
```

---

## Standing it up

Full step-by-step instructions — Splunk config, index and role creation, HEC
setup, both frontend builds, the systemd unit, nginx vhosts and TLS — are in
**[`deploy/README.md`](deploy/README.md)**.

Quick local development loop:

```bash
# relay
cd realtime-server
npm install
cp .env.example .env          # set JWT_SECRET, bootstrap creds, Splunk creds
npm run dev                   # http://localhost:8787, WS at /realtime

# frontend
cd ../templar-soc-frontend
npm install
npm run dev                   # http://localhost:5173
```

Verified production versions: **Splunk Enterprise 10.4.1**, **Node v22.23.1**,
**Python 3.12.3**, Ubuntu 24.04 (Azure).

---

## Security notes

Read this before redeploying.

- **No secrets are committed.** `.env` files, the SOC VM SSH key, Splunk
  `passwords.conf` / `server.conf`, and the real HEC token are all gitignored.
  Every one of them has a committed `.example` template instead.
- **Generate fresh credentials per event.** The HEC token, `JWT_SECRET`,
  organizer password and `templar_relay` Splunk password should all be new for
  each deployment — never carried over from a previous run.
- **`templar_relay` is deliberately least-privilege.** See
  `deploy/splunk/system-local/authorize.conf`: no real-time search, capped job
  quota, and search restricted to the `templar_investigation` index. The relay
  must never be configured with the Splunk `admin` account.
- **The player vhost is deny-by-default.** `deploy/nginx/sites-available/player.conf`
  proxies an explicit allowlist of endpoints; every other `/api/*` path returns
  404 on the player domain, so the organizer surface can't be enumerated or
  brute-forced from it. Mutating routes are `GET`-only there.
- **Rate limits are defined in `deploy/nginx/conf.d/templar-ratelimit.conf`**,
  keyed on `$binary_remote_addr` — 10 r/s general API, 10 r/min on login.
- **`CTF-logs/`, `voices/` and the generated dataset contain challenge answers.**
  If you fork this to run an event, keep the repo private until it's over.

> Note: `realtime-server/README.md` predates the Splunk integration and still
> describes the relay as a pure transport layer with no Splunk logic. `splunk.js`
> and `searchGuard.js` supersede that — the relay does proxy searches today.
