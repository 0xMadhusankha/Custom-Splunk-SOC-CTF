# Deploying TEMPLAR SOC

Reproduces the production deployment from a bare Ubuntu 24.04 host. Every file
referenced here was pulled from the running VM, with secrets stripped.

Verified against: Splunk Enterprise 10.4.1, Node v22.23.1, Python 3.12.3,
nginx (Ubuntu 24.04), Azure VM.

## What's in here

```
deploy/
  nginx/
    sites-available/player.conf     player vhost — deny-by-default API allowlist
    sites-available/admin.conf      organizer vhost — full /api/ surface
    snippets/templar-headers.conf   HSTS, CSP, frame/sniff/referrer policy
    snippets/templar-proxy.conf     shared upstream proxy headers
    conf.d/templar-ratelimit.conf   limit_req / limit_conn zones (http context)
  systemd/templar-relay.service     the relay unit
  splunk/
    system-local/authorize.conf     least-privilege templar_relay role
    apps/search/local/indexes.conf  the templar_investigation index
    apps/search/local/inputs.conf   splunktcp:9997 receiver
    apps/search/local/transforms.conf   IOC lookup definition
    apps/search/lookups/templar_ioc_kv.csv   IOC lookup table
    apps/splunk_httpinput/local/inputs.conf.example   HEC input (token redacted)
  env-templates/
    frontend.env.admin              organizer build env
    frontend.env.player             player build env
```

Not committed, by design: Splunk `passwords.conf` and `server.conf` (they hold
`pass4SymmKey` and `sslPassword`), the real HEC token, `realtime-server/.env`,
and the VM SSH key. Create these fresh per deployment.

---

## 1. Host prerequisites

```bash
sudo apt update
sudo apt install -y nginx python3 certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Two DNS A records must point at the host — one for players, one for organizers.
The committed configs use `soc.templarhq.xyz` and `animus.templarhq.xyz`;
substitute your own throughout.

Open inbound `80` and `443` only. Splunk's `8000`, `8088`, `8089` and `9997`
must **not** be reachable from the internet — the relay talks to Splunk over
loopback. (On the reference deployment these bind `0.0.0.0`, so the cloud
network security group is what actually closes them. Prefer binding them to
`127.0.0.1` where you can.)

## 2. Splunk Enterprise

Install Splunk to `/opt/splunk` and enable boot-start, then drop the config in:

```bash
sudo -u splunk mkdir -p /opt/splunk/etc/apps/search/local \
                        /opt/splunk/etc/apps/search/lookups \
                        /opt/splunk/etc/apps/splunk_httpinput/local

sudo install -o splunk -g splunk -m 600 \
  splunk/apps/search/local/indexes.conf    /opt/splunk/etc/apps/search/local/
sudo install -o splunk -g splunk -m 600 \
  splunk/apps/search/local/inputs.conf     /opt/splunk/etc/apps/search/local/
sudo install -o splunk -g splunk -m 600 \
  splunk/apps/search/local/transforms.conf /opt/splunk/etc/apps/search/local/
sudo install -o splunk -g splunk -m 644 \
  splunk/apps/search/lookups/templar_ioc_kv.csv /opt/splunk/etc/apps/search/lookups/
sudo install -o splunk -g splunk -m 600 \
  splunk/system-local/authorize.conf       /opt/splunk/etc/system/local/
```

Create the HEC input with a **freshly generated** token:

```bash
sudo /opt/splunk/bin/splunk http-event-collector create templar_hec \
     -index templar_investigation -uri https://127.0.0.1:8089
```

or copy `splunk/apps/splunk_httpinput/local/inputs.conf.example` to
`/opt/splunk/etc/apps/splunk_httpinput/local/inputs.conf` and replace the token
placeholder.

Create the relay's service account against the least-privilege role that
`authorize.conf` defines (no real-time search, capped quota, scoped to the one
index):

```bash
sudo /opt/splunk/bin/splunk add user templar_relay \
     -password '<strong-unique-password>' -role templar_relay -auth admin:<pw>
sudo /opt/splunk/bin/splunk restart
```

Never point the relay at the Splunk `admin` account.

## 3. Seed the dataset

```bash
export HEC_TOKEN=<the token from step 2>
DRYRUN=1 python3 ../tools/animus_gen3.py    # sanity-check counts first
python3 ../tools/animus_gen3.py             # ingest
```

Confirm in Splunk: `index=templar_investigation | stats count by sourcetype`.

## 4. The relay

```bash
sudo mkdir -p /opt/realtime-server
sudo chown soc-analyst:soc-analyst /opt/realtime-server
# copy realtime-server/ from this repo (excluding node_modules/ and data/)
cd /opt/realtime-server
npm ci --omit=dev

cp .env.example .env
chmod 600 .env
```

Edit `.env`:

- `JWT_SECRET` — long random string, fresh per deployment.
- `ALLOWED_ORIGINS` — your two real https origins.
- `ADMIN_BOOTSTRAP_USER` / `ADMIN_BOOTSTRAP_PASS` — used only on first boot when
  no credential exists yet.
- `SPLUNK_USERNAME` / `SPLUNK_PASSWORD` — the `templar_relay` account.
- `DATA_DIR` — persistent path for SQLite + uploaded sounds.

Install and start the unit:

```bash
sudo install -m 644 systemd/templar-relay.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now templar-relay
systemctl status templar-relay
```

It should be listening on `127.0.0.1:8787`.

Rotate credentials before the event (this is the intended flow — don't leave the
bootstrap password in place):

```bash
npm run set-admin-credentials  -- --username=organizer --password=<new>
npm run set-player-credentials -- --username=analyst   --password=<new>
```

## 5. Frontend builds

The same codebase builds twice, once per surface:

```bash
cd templar-soc-frontend
cp ../deploy/env-templates/frontend.env.player .env.player
cp ../deploy/env-templates/frontend.env.admin  .env.admin
# edit both to your real hostnames

npm ci
npm run build          # runs build:player and build:admin

sudo mkdir -p /var/www/player /var/www/admin
sudo cp -r player-dist/* /var/www/player/
sudo cp -r admin-dist/*  /var/www/admin/
sudo chown -R www-data:www-data /var/www/player /var/www/admin
```

## 6. nginx

```bash
sudo install -m 644 nginx/conf.d/templar-ratelimit.conf   /etc/nginx/conf.d/
sudo install -m 644 nginx/snippets/templar-headers.conf   /etc/nginx/snippets/
sudo install -m 644 nginx/snippets/templar-proxy.conf     /etc/nginx/snippets/
sudo install -m 644 nginx/sites-available/player.conf     /etc/nginx/sites-available/player
sudo install -m 644 nginx/sites-available/admin.conf      /etc/nginx/sites-available/admin

sudo ln -sf /etc/nginx/sites-available/player /etc/nginx/sites-enabled/player
sudo ln -sf /etc/nginx/sites-available/admin  /etc/nginx/sites-enabled/admin
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t && sudo systemctl reload nginx
```

The committed vhosts already contain Certbot's TLS block and its
`/etc/letsencrypt/live/<domain>/` paths. On a fresh host those certs don't exist
yet, so `nginx -t` will fail until you issue them. Either run
`sudo certbot --nginx -d soc.<your-domain> -d animus.<your-domain>` against
plain HTTP server blocks first and let Certbot write the TLS lines itself, or
issue the certs standalone and then fix the paths in both files.

## 7. Verify

```bash
curl -s https://soc.<your-domain>/api/health          # 200
curl -s -o /dev/null -w '%{http_code}\n' \
     https://soc.<your-domain>/api/auth/login          # 404 — deny-by-default works
curl -s -o /dev/null -w '%{http_code}\n' \
     https://animus.<your-domain>/api/player-auth/login # 404 — no player auth on admin
```

Then in a browser: log into the player console, run a search, and confirm results
come back from Splunk. From Mission Control, publish a broadcast and confirm it
lands in the player session live over WebSocket.

---

## Security posture

The two vhosts are asymmetric on purpose.

**Player domain** proxies an explicit allowlist — `/api/health`,
`/api/player-auth/*`, `/api/search`, `/api/search/anchor`, plus `GET`-only
`/api/broadcasts` and `/api/sounds` (+ sound file fetch). Everything else under
`/api/` returns 404. Organizer login, voice push, the scheduled queue, the audit
log and all broadcast/sound mutations are simply not reachable from the domain
players are given.

**Organizer domain** exposes the full `/api/` surface but explicitly 404s
`/api/player-auth/*`, and raises `client_max_body_size` to 25m only on the sound
upload endpoint.

**Both** include `templar-headers.conf`: HSTS, `nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: no-referrer`, a restrictive `Permissions-Policy`, and a CSP
with `script-src 'self'` and `frame-ancestors 'none'`. The Vite build emits no
inline scripts, so that CSP genuinely contains injected markup. `connect-src`
uses `$host` so one snippet serves both vhosts.

**Rate limiting** is layered over the relay's own limiter: 10 r/s on general API
with burst 30, 10 r/min on login endpoints with burst 10, and a 40-connection
cap per IP on search and WebSocket. Zones key on `$binary_remote_addr`, the TCP
peer address, which a client can't spoof at that layer. They're tuned so a whole
team behind one NAT'd egress IP stays well clear — only automated floods trip them.

`server_tokens off` is set in the rate-limit conf, which loads in the `http`
context via `conf.d/`.
