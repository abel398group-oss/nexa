# WAHA Session Monitor (WhatsApp health)

Active monitoring for the WhatsApp gateway (WAHA). Detects when the session
drops, **auto-restarts** it, and alerts the admin on multiple channels.

## Why

The WAHA session (WEBJS engine) can drop to `STOPPED`/`FAILED` (container
restart, WhatsApp Web disconnect, etc.). While down, Lia receives nothing and
replies to nobody. Before this monitor there was no alert — the outage was only
noticed by manual testing.

## How it works

`WahaHealthService` (`apps/backend/src/application/whatsapp/waha-health.service.ts`):

- **Scheduled health-check** every 3 min (`@Interval`): reads the session status
  from `GET /api/sessions/{session}`.
- **Instant reaction** via the `session.status` webhook event: WAHA notifies the
  backend on every state change; `WhatsappController` routes it to
  `handleStatusEvent`, which triggers an immediate check.
- **Auto-restart**: when the status is not `WORKING`, it calls
  `POST /api/sessions/{session}/start` and polls up to ~30s for recovery.
  A `STARTING` session inside a 10-min window is treated as "recovering" and does
  **not** raise a false alarm.
- **Alerts** (best-effort, never crash the flow), fired once on a confirmed
  outage with a 30-min cooldown, plus a recovery notice:
  - **Panel notification** — `NotificationsService` (the in-app bell).
  - **E-mail** — SMTP via `EMAIL_SMTP_*` (skipped if not configured).
  - **WhatsApp to admin** — `WahaClientService.sendText` to `ALERT_ADMIN_PHONE`.

The `session.status` event is auto-registered by `WahaBootstrapService` at boot;
it re-registers the webhook whenever a desired event is missing.

## Environment variables

| Var | Required | Description |
|-----|----------|-------------|
| `WAHA_API_URL` / `WAHA_API_KEY` / `WAHA_SESSION` | yes | already used by WAHA |
| `ALERT_ADMIN_PHONE` | for WhatsApp alert | admin number, e.g. `5511999999999` (not the bot's own line) |
| `ALERT_ADMIN_EMAIL` | for e-mail alert | admin e-mail |
| `ALERT_TENANT_ID` | optional | tenant that receives the panel notification; if empty, notifies all active tenants |
| `EMAIL_SMTP_HOST/PORT/SECURE/USER/PASS/FROM_NAME` | for e-mail alert | SMTP (cPanel/HostGator). If absent, e-mail alerts are skipped |

## Manual operations (droplet)

Check status:

```bash
docker exec nexa-backend-1 sh -c 'wget -qO- --header="X-Api-Key: $WAHA_API_KEY" http://waha:3000/api/sessions/default' | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('status'))"
```

Force a restart:

```bash
docker exec nexa-backend-1 sh -c 'wget -qO- --method=POST --header="X-Api-Key: $WAHA_API_KEY" --header="Content-Type: application/json" --body-data="{}" http://waha:3000/api/sessions/default/start'
```

If the status is `SCAN_QR_CODE`, the pairing was lost and a human must re-scan the
QR (auto-restart cannot fix it) — see the WAHA pairing runbook.

## Notes

- The monitor is best-effort: a WhatsApp alert may itself fail if WAHA is fully
  down; the panel + e-mail channels cover that case.
- Outage logs use the `WahaHealth` context (pino).
