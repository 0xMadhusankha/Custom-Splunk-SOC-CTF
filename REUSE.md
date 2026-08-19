# Reusing this build for another CTF

This repo is a working SOC-investigation CTF platform that happens to be dressed
as ANIMUS 1.0 / TEMPLAR. The **engine is generic**; only the theme, the names,
and the dataset are ANIMUS-specific. Nothing about the architecture assumes the
Templar story.

The identifiers (`templar_investigation`, `templar_relay`, `TemplarCross.jsx`, …)
are left in place deliberately — they touch 68 source files, the SQLite schema,
the systemd unit, nginx, and the Splunk role. Renaming all of them is a wide,
build-breaking refactor for zero functional gain. **Rebrand the surface, keep the
plumbing.** This guide tells you exactly which files that means.

---

## What is engine vs. what is content

| Layer | Reusable as-is? | Where |
|---|---|---|
| WebSocket broadcast fan-out, auth, audit log | ✅ Engine — don't touch | `realtime-server/server.js`, `auth.js`, `db.js` |
| Splunk search proxy + SPL guardrails | ✅ Engine — don't touch | `realtime-server/splunk.js`, `searchGuard.js` |
| Console UI, SPL editor, timeline, event grid | ✅ Engine | `templar-soc-frontend/src/components/`, `pages/` |
| Mission Control (publish alerts/intel/audio) | ✅ Engine | `templar-soc-frontend/src/admin/` |
| nginx vhosts, rate limits, security headers | ✅ Engine — change hostnames only | `deploy/nginx/` |
| Colors, fonts, logo, product name | 🎨 Theme — change per event | `src/styles/tokens.css`, `index.html`, `admin.html` |
| The story, alerts, intel briefings, audio | 📝 Content — rewrite per event | Authored live in Mission Control; `voices/` |
| The dataset + answer key | 📝 Content — regenerate per event | `tools/animus_gen3.py` |
| IOC lookup table | 📝 Generated output, not source | emitted by the generator |

> ⚠️ **This repo contains ANIMUS answers.** `tools/animus_gen3.py` holds the full
> answer key in the `RA` dict and prints it on every run; `CTF-logs/`, `voices/`,
> `story.txt`, `event-flow.txt` and the committed IOC lookup are all spoiler
> material. **Keep the repo private**, or strip those before making it public.

---

## Fast path: rebrand in ~30 minutes

If you just want a differently-named SOC running your own dataset, do these six
things and skip the rest of this document.

1. **Colors + fonts** → `templar-soc-frontend/src/styles/tokens.css`
2. **Product names** → `<title>` in `index.html` and `admin.html`
3. **Logo mark** → `templar-soc-frontend/src/components/brand/TemplarCross.jsx`
4. **Hostnames** → `deploy/nginx/sites-available/*.conf`, `.env.player`, `.env.admin`, relay `ALLOWED_ORIGINS`
5. **Your dataset** → edit the constants at the top of `tools/animus_gen3.py`, re-run it
6. **Fresh secrets** → new `JWT_SECRET`, HEC token, organizer/player passwords, Splunk service-account password

Everything below is the detail behind those six steps.

---

## 1. Visual theme

**`templar-soc-frontend/src/styles/tokens.css`** is the single source of truth.
Every surface reads from these CSS variables, so changing them here re-skins the
entire application — there are no hardcoded colors in components.

The palette is organized by role, not by name:

```css
--void, --charcoal, --charcoal-raised, --charcoal-hi   /* surfaces, dark → light */
--border, --border-faint, --border-lit                 /* 1px structure */
--white, --steel, --muted, --dim, --faint              /* ink, bright → quiet */
--crimson*                                             /* operational activity accent */
--gold*                                                /* prestige/faction accent, used sparingly */
--sev-critical / high / medium / low / info / emergency /* severity semantics */
```

To re-theme, swap the `--crimson*` family (your primary accent) and `--gold*`
(your secondary). Keep the `--sev-*` values semantically sane — critical should
stay the most alarming color, or the event grid stops reading correctly at a
glance.

**Fonts** are `--font-mono` (JetBrains Mono) and `--font-display` (Oswald). If
you change them you must update three places:

1. `tokens.css` — the variable values
2. `index.html` **and** `admin.html` — the Google Fonts `<link>` tags
3. `deploy/nginx/snippets/templar-headers.conf` — the CSP `font-src` /
   `style-src` allowlist, if you move off `fonts.googleapis.com` /
   `fonts.gstatic.com`

**Logo:** `src/components/brand/TemplarCross.jsx` is original inline SVG
geometry. Replace the paths with your own mark; keep the component name and
props so imports don't break.

**Motion** (`--t-fast/base/slow`) and structure (`--radius`, `--sidebar-w`,
`--topbar-h`) are also tokens. The UI respects `prefers-reduced-motion`
throughout — preserve that if you add animation.

## 2. Names shown to players

| What | File |
|---|---|
| Player browser tab | `templar-soc-frontend/index.html` → `<title>` |
| Organizer browser tab | `templar-soc-frontend/admin.html` → `<title>` |
| Login screen copy | `src/pages/Login.jsx` |
| Sidebar / topbar labels | `src/components/layout/Sidebar.jsx`, `TopBar.jsx` |
| Audio cue categories | `src/audio/soundLibrary.js` → `SOUND_CATEGORIES` |

`SOUND_CATEGORIES` is currently `Mission Control, Story, Assassin Broadcast,
Threat Intel, Warning, Emergency, Ambient, Success, Failure, Custom`. Only
`Assassin Broadcast` is story-specific — rename it to whatever your adversary
faction is called.

Both HTML entries set `<meta name="robots" content="noindex, nofollow">`. Leave
that in place so your event surfaces don't get indexed mid-competition.

## 3. Infrastructure

### Hostnames

Three coordinated places, and they must agree or CORS and the WebSocket will
fail:

1. `deploy/nginx/sites-available/player.conf` → `server_name` + Certbot cert paths
2. `deploy/nginx/sites-available/admin.conf` → `server_name` + Certbot cert paths
3. `deploy/env-templates/frontend.env.player` / `.env.admin` → `VITE_REALTIME_WS`, `VITE_REALTIME_HTTP`
4. Relay `.env` → `ALLOWED_ORIGINS` (comma-separated, must list both https origins)

The frontend env values are **baked in at build time**, so changing a hostname
means rebuilding both bundles — not just reloading nginx.

`templar-headers.conf` needs no hostname edit: its CSP `connect-src` uses
`wss://$host`, so one snippet correctly serves both vhosts.

### Splunk index name

If you rename `templar_investigation`, change it in four places:

1. `deploy/splunk/apps/search/local/indexes.conf` — the stanza name
2. `deploy/splunk/system-local/authorize.conf` — `srchIndexesAllowed` **and** `srchIndexesDefault`
3. Relay `.env` — `SPLUNK_INDEX`
4. `tools/animus_gen3.py` line 30 — `INDEX`

Plus the HEC input's `index` / `indexes` keys in
`deploy/splunk/apps/splunk_httpinput/local/inputs.conf.example`.

### Service account and role

`authorize.conf` defines `role_templar_relay`: real-time search disabled, job
quota capped at 60, search restricted to the one index. Keep this shape whatever
you rename it to — it's what makes it safe to proxy arbitrary player SPL.
**Never** point the relay at the Splunk `admin` account.

### systemd unit

`deploy/systemd/templar-relay.service` hardcodes `User=soc-analyst` and
`WorkingDirectory=/opt/realtime-server`. Change both if your deployment differs;
rename the unit file if you want a different service name.

## 4. The dataset — the real work

`tools/animus_gen3.py` (~51KB) generates the entire investigation. It is
deterministic — `random.seed(20260622)` at line 27 — so every run produces an
identical dataset and the answer key stays exact. **Change the seed for a new
event** so a player who saw the old data gains nothing.

### Structure

Three generator functions, called in order at the bottom of the file:

```python
gen_normal()          # baseline enterprise noise across all departments
gen_good_assassin()   # the loud, fully-ticketed, already-closed campaign (cover)
gen_rogue_assassin()  # the hidden APT — the actual objective, 7 stages
```

### Constants to edit

All at the top of the file, lines 30–132:

| Constant | What it controls |
|---|---|
| `INDEX` | target Splunk index |
| `DOMAIN`, `NB` | AD domain and NetBIOS name |
| `HOSTS` | hostname → IP map for the whole fake enterprise |
| `DEPARTMENTS`, `USERS` | the org roster (user → department) |
| `SOC_ANALYSTS`, `IT_ADMINS`, `DEVS`, `EXECS`, `NEW_HIRES`, `SVC` | role groupings |
| `RA` | **the answer key** — every rogue-campaign IOC, account, path, domain |
| `GA_IPS`, `GA_RDP_IPS`, `GA_PHISH_DOMAINS`, `GA_WEBSHELL`, `GA_MALWARE_SHA` | the decoy campaign's infrastructure |
| `LEGIT_*` | the near-miss decoys that must be eliminated by correlation |
| `BASE` | start of the 8-day window (a Monday, UTC) |

### The design principle worth keeping

The intended solve is a **cross-source correlation, not a single-IOC filter**.
Every legitimate privileged action in the dataset ties to a verifiable IT change
ticket. The rogue campaign is the only activity with *no* matching ticket — that
absence is the signal. The `LEGIT_*` constants exist to plant deliberate
near-misses at each stage (a foreign-IP service login that *is* ticketed, a
contractor account created the same day that *is* ticketed), so players cannot
shortcut by grepping one field.

If you write a new storyline, preserve that shape. A dataset where one `index=…
| search evil.exe` finds the answer is not an investigation.

### Emitters available

The builder functions (lines 151–212) cover: Windows Security/System, Sysmon,
PowerShell, Defender, DNS, IIS, VPN, firewall, proxy, mail, WAF, IDS, EDR,
physical badge readers, and SOC case records. Compose new storylines from these
rather than inventing new sourcetypes — the console's field extraction expects
them.

### Running it

```bash
export HEC_TOKEN=<your token>
DRYRUN=1 python3 tools/animus_gen3.py     # counts + answer key, sends nothing
python3 tools/animus_gen3.py              # ingest for real
```

Both modes print the answer key — run `DRYRUN=1` first and read it to confirm
your storyline is solvable before you ingest.

### The IOC lookup is generated, not authored

On a real (non-dry) run the script writes the lookup table to
`/tmp/templar_ioc_kv.csv`. Copy it into place:

```bash
sudo install -o splunk -g splunk -m 644 \
  /tmp/templar_ioc_kv.csv /opt/splunk/etc/apps/search/lookups/
```

`deploy/splunk/apps/search/local/transforms.conf` binds that filename to the
`templar_ioc_kv` lookup definition. The copy committed in this repo is ANIMUS's
output — **regenerate it, don't hand-edit it**, or the lookup will disagree with
the indexed data.

### Clearing an old dataset

```bash
sudo /opt/splunk/bin/splunk clean eventdata -index templar_investigation -f
```

## 5. Narrative content

Alerts, threat-intel briefings and emergency broadcasts are **authored live from
Mission Control during the event** — they are not files in this repo. Nothing to
port; just write new ones on the night.

Audio cues *are* files. `voices/` holds the ANIMUS narration mp3s. Replace them
with your own and upload through Mission Control's audio console — uploads go to
the relay's `/api/sounds`, are stored under `DATA_DIR`, and become
server-authoritative so every connected player device resolves the same sound.

> With no relay configured the sound library silently falls back to IndexedDB,
> which is same-browser only. That's fine for local dev and useless for a live
> event — make sure `VITE_REALTIME_HTTP` is set in your production builds.

## 6. Per-event security checklist

Do all of these for every new event. None of them are optional.

- [ ] New `JWT_SECRET` — long random string
- [ ] New HEC token (`splunk http-event-collector create …`)
- [ ] New `templar_relay` Splunk password
- [ ] New organizer password: `npm run set-admin-credentials -- --username=<u> --password=<p>`
- [ ] New player password: `npm run set-player-credentials -- --username=<u> --password=<p>`
- [ ] Bootstrap credentials in `.env` rotated away (they only apply on first boot)
- [ ] New random seed in the generator
- [ ] Old index cleaned before re-ingest
- [ ] TLS certs issued for the new hostnames
- [ ] Splunk ports 8000/8088/8089/9997 not reachable from the internet — only 80/443
- [ ] Verify deny-by-default: `curl https://<player-host>/api/auth/login` returns **404**

## 7. Don't change these

- **The player vhost allowlist.** `player.conf` proxies an explicit list of
  endpoints and 404s everything else under `/api/`. Adding a blanket
  `location /api/` there would expose organizer login, the voice push, the
  scheduled queue and the audit log to players. If you add a player-facing
  endpoint, add it explicitly.
- **`searchGuard.js`.** It is the only thing standing between a player's raw SPL
  and your Splunk instance.
- **The `authorize.conf` role limits.** Removing the index scope or job quota
  turns the search proxy into an open Splunk shell.
- **`limit_req` on login.** 10 requests/minute is what makes the single shared
  player credential survive contact with a room full of competitors.

---

## Known rough edges

- `realtime-server/README.md` predates the Splunk integration and claims the
  relay has no Splunk logic. It does — `splunk.js` and `searchGuard.js`.
- `templar-soc-frontend/README.md` describes the app as mock-data-only. The
  `MockSplunkService` still exists and is still useful for offline UI work, but
  production runs against the relay's `/api/search`.
- The committed nginx vhosts already contain Certbot's TLS block, so `nginx -t`
  fails on a fresh host until certs exist for those names. See
  `deploy/README.md` §6 for the ordering.
