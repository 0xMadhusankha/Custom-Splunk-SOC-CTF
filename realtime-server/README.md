# TEMPLAR SOC — realtime relay

Pure transport layer for the ANIMUS 1.0 SOC: broadcast fan-out over
WebSocket, sound-file storage, single-organizer login, and an activity
log. It has **zero investigation/Splunk business logic** — the frontend
(`mockSplunkService.js`) still owns every severity/category rule and
sends this service fully-finalized records to store and relay verbatim.

## Local development

```bash
npm install
cp .env.example .env      # edit JWT_SECRET, ADMIN_BOOTSTRAP_USER/PASS
npm run dev                # http://localhost:8787, WS at /realtime
```

On first boot with no stored credential, it self-provisions the single
organizer account from `ADMIN_BOOTSTRAP_USER` / `ADMIN_BOOTSTRAP_PASS`.
Rotate the password later (e.g. before each event) with:

```bash
npm run set-admin-credentials -- --username=organizer --password=<new>
```

Point the frontend at it via the frontend's `.env`:

```
VITE_REALTIME_WS=ws://localhost:8787/realtime
VITE_REALTIME_HTTP=http://localhost:8787
```

## Deploying (Azure)

Build and run the `Dockerfile` as an Azure Container App or Linux App
Service. Requirements:

- **Enable WebSockets** on the hosting resource (App Service: "Web
  sockets: On"; Container Apps support WS by default).
- **Mount a persistent volume** at `/app/data` (Azure Files share, or a
  Container Apps persistent storage mount) so SQLite + uploaded sound
  files survive restarts and redeploys.
- Set `ALLOWED_ORIGINS` to the real player/admin hostnames
  (`https://soc.templarhq.xyz,https://animus.templarhq.xyz`).
- Set a strong `JWT_SECRET` and real `ADMIN_BOOTSTRAP_USER`/`PASS` (or
  rotate immediately after first boot via the CLI script above).
- Point the two frontend builds' env at `wss://<your-relay-host>/realtime`
  and `https://<your-relay-host>`.

## What this service is not

It does not talk to Splunk and never will directly — when the
investigation backend is wired up, Splunk stays behind
`mockSplunkService.js`'s replacement (`RealSplunkService`), completely
independent of this relay. This relay only exists to make "Mission
Control publishes something → every connected player sees/hears it
instantly" work across real network devices, which `BroadcastChannel`
never could.
