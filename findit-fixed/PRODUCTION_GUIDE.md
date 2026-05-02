# FindIt — Production Readiness Audit, Startup Guide & Feature Map

Three sections, in order:
1. **Production readiness audit** — what's hardened in **Phase A** (backend) and **Phase B** (frontend + tests + monitoring), plus the residual TODO list.
2. **How to turn the project on** — first-time setup all the way through to a live deploy.
3. **SRS feature → file location map** — exactly where each requested feature lives in the codebase.

> A more granular, prioritized security audit (with rationale per finding) lives in [`SECURITY_AUDIT.md`](./SECURITY_AUDIT.md). Read that for the OWASP-style breakdown.

> **Phase B finished:** the frontend now uses the dual-token auth flow end-to-end, every auth route is gated by a Zod schema, and `npm test` runs 17 Supertest assertions against an in-memory Mongo. Details are in §1.c.

---

## 1. Production readiness audit

### 1.a — Hardened in the Phase A security pass (committed in this branch)

| Concern | Before | After | Where |
| --- | --- | --- | --- |
| **NoSQL operator injection** | `User.findOne({ email })` accepted `{ "$ne": null }` payloads | `email`/`password` coerced to primitive strings; `express-mongo-sanitize` strips `$`/`.` globally; `hpp` neutralizes parameter pollution | `backend/routes/auth.js`, `backend/server.js` |
| **Socket.io auth** | Any client could `emit('join', '<victim id>')` and read another user's notifications/chat | Mandatory JWT handshake (`io.use`); user can only join *their* room; `chat:typing` checks conversation membership | `backend/server.js` |
| **JWT in localStorage** | 7-day token sat in JS-readable storage (XSS = full takeover) | Backend now ships the dual-token model: 15-min access JWT + httpOnly+Secure+SameSite=Strict refresh-cookie at `/api/auth/refresh`, with token-version revocation | `backend/routes/auth.js`, `backend/middleware/auth.js`, `backend/models/User.js` |
| **Brute-force protection** | None | Per-IP `authLimiter` 10/15 min, `forgotPasswordLimiter` 5/15 min, `uploadLimiter` 30/h, `apiLimiter` 300/15 min, `abuseLimiter` 10/h **+** per-account lockout (5 strikes → 15 min) | `backend/middleware/rateLimiters.js`, `backend/routes/auth.js` |
| **Password policy** | ≥6 chars | ≥10 chars + lowercase + uppercase + digit + common-password block; bcrypt cost raised 10 → 12 | `backend/routes/auth.js`, `backend/models/User.js` |
| **2FA secrets at rest** | Stored as plaintext base32 | AES-256-GCM via `TWOFA_ENC_KEY` (or fallback to a SHA-256 of `JWT_SECRET`) | `backend/utils/crypto.js`, `backend/routes/twofa.js` |
| **File uploads** | Extension-only check, predictable `Date.now()` filenames | Random 32-hex filenames, MIME+extension allowlist, **magic-byte verification post-write** (`file-type@^16`), SVG rejected | `backend/utils/upload.js` |
| **Public chat attachments** | Anyone with a URL guess could fetch private files at `/uploads/chat/...` | Chat files now live in private `uploads/chat-private/`; downloaded only via authenticated `GET /api/chat/file/:filename` that re-checks conversation membership | `backend/routes/chat.js` |
| **Security headers** | None | `helmet` with prod CSP (incl. `frame-ancestors 'none'`), HSTS (2y), Referrer-Policy: same-origin, X-Content-Type-Options, COEP-friendly CORP | `backend/server.js` |
| **Test endpoint in prod** | `POST /api/notifications/test` registered after `module.exports` and silently lived | Removed | `backend/routes/notifications.js` |
| **Admin bootstrap** | `make-admin`/`first-admin` always live | Both gated by `ALLOW_ADMIN_BOOTSTRAP=true` + constant-time-compared `ADMIN_SECRET` | `backend/routes/auth.js` |
| **Unbounded queries** | `?limit=999999` accepted | `parsePagination()` hard-caps `limit` at 50 (100 admin) and `page` at 1000 across every list endpoint | `backend/middleware/security.js` + every route |
| **Search regex** | User input fed directly into Mongo `$regex` (ReDoS) | `escapeRegex()` everywhere | `backend/routes/items.js`, `backend/routes/users.js` |
| **ObjectId validation** | Bad ids crashed with a 500 (CastError) and were a soft IDOR vector | `requireObjectId('id')` middleware on every `:id` param | `backend/middleware/security.js` |
| **Logging** | `console.log` everywhere; risk of leaking secrets | `pino-http` structured logs with `password|token|code|authorization|cookie` redaction; per-request `x-request-id` for correlation | `backend/utils/logger.js`, `backend/server.js` |
| **Errors** | `error.message` echoed to clients | Centralized `errorHandler` returns generic messages in prod; multer/CORS/Validation/Cast errors mapped to safe codes | `backend/middleware/security.js` |
| **Email injection** | User name interpolated into HTML emails raw | All interpolation HTML-escaped | `backend/routes/claims.js`, `backend/routes/announcements.js`, `backend/routes/auth.js` |
| **Self-demote / self-deactivate** | Possible | Blocked; admin role/status changes also bump `tokenVersion` so the affected user is force-logged-out | `backend/routes/users.js` |
| **`item:new` socket payload** | Broadcast to every connected client incl. poster email | Project only safe fields (id, name, category, images, status, isHighValue, coordinates, createdAt) | `backend/routes/items.js` |
| **Resilience** | Abrupt termination | `SIGTERM`/`SIGINT` graceful shutdown drains HTTP, sockets, Mongo; `unhandledRejection`/`uncaughtException` captured | `backend/server.js` |
| **Readiness probe** | Only `/api/health` | Added `GET /api/ready` returning 503 until Mongo is connected — wire this into Render/Railway/Heroku health checks | `backend/server.js` |
| **Defense-in-depth** | `User.password` selectable by default | `password`, `twoFactorSecret`, `failedLoginAttempts`, `lockedUntil`, `tokenVersion`, `passwordResetToken/Expires` all `select:false` | `backend/models/User.js` |

### 1.b — Already production-grade (verified during the audit)

- **bcrypt** with cost **12** (raised from 10 in this pass).
- **Password reset** — random 32-byte token; **stored as SHA-256 hash** (raw never persists); 30-min TTL; non-enumerating response.
- **Active-account guard** — deactivated users are rejected on every protected route.
- **PWA** — installable manifest, offline shell, service worker scoped to **NEVER** cache `/api/` or `/socket.io/`.
- **Light/dark theme** + **responsive layout** persisted in localStorage.
- **Centralized email wrapper** — gracefully no-ops when SMTP isn't configured.
- **Cron job** — `node-cron` daily at 02:00 for expiry/archive (`backend/cron/expiry.js`).
- **Mongoose connection** — `serverSelectionTimeoutMS: 10000`, `family: 4` for predictable Atlas connectivity.

### 1.c — Hardened in the Phase B pass (committed in this branch)

| Concern | Before | After | Where |
| --- | --- | --- | --- |
| **Frontend session storage** | `localStorage.findit_user` held a 7-day JWT; an XSS = full takeover | Access token lives only in a JS module variable (`tokenStore.js`). Refresh-token cookie (`httpOnly` + `Secure` + `SameSite=Strict`) is the sole long-lived credential, set by the backend, never read by JS. App boot does a silent `POST /api/auth/refresh` to rehydrate the session | `frontend/src/api/tokenStore.js`, `frontend/src/api/client.js`, `frontend/src/context/AuthContext.js` |
| **Axios auth wiring** | Each component called `axios.defaults.headers...` itself | A single global axios instance attaches `Authorization: Bearer <access>` from memory and on **401** dedupes a single concurrent `/api/auth/refresh` call before retrying the original request. Auth endpoints are excluded from the retry loop to avoid feedback storms | `frontend/src/api/client.js`, `frontend/src/index.js` |
| **Socket.io handshake** | Frontend connected anonymously and then `emit('join', userId)` (Phase A fixed the backend; the frontend was still emitting the legacy join) | Removed the client `emit('join', …)`; the handshake now passes the access token via a function callback so reconnects pick up refreshed tokens transparently | `frontend/src/context/SocketContext.js` |
| **Render error containment** | A single uncaught render error blanked the whole app | Class-based `<ErrorBoundary>` wraps `<App/>` with a friendly fallback; in production the raw error is never shown to the user; Sentry hook is wired but no-op until `SENTRY_DSN` is set | `frontend/src/components/ErrorBoundary.js`, `frontend/src/App.js` |
| **Schema-first request validation** | Each route did its own ad-hoc type/length checks | New `validate(schema)` middleware uses Zod's `safeParse` → enforces types **and** strips unknown keys. Strict-object schemas applied to `/register`, `/login`, `/2fa/login`, `/forgot-password`, `/reset-password`. A `{$ne: null}` payload is now rejected at the validation layer before any Mongo call | `backend/middleware/validate.js`, `backend/schemas/auth.schemas.js`, `backend/routes/auth.js` |
| **Automated tests** | None | Jest + Supertest + `mongodb-memory-server`: 17 passing assertions for auth (register / mass-assignment / weak-pw / NoSQL injection / lockout / refresh / logout) and security (RBAC IDOR, status mass-assignment, helmet headers, `/api/ready`). Run with `cd backend && npm test` | `backend/tests/*`, `backend/jest.config.js` |
| **Backend monitoring hook** | Errors only hit logs | `errorHandler` calls `captureException` for every 5xx if `SENTRY_DSN` is present; otherwise it's a silent no-op (no SDK loaded → cold-start unaffected) | `backend/middleware/security.js` |

### 1.d — Still recommended (operational / non-code)

| # | Recommendation | Effort | Why |
| --- | --- | --- | --- |
| 1 | **External object storage** — swap multer to `multer-s3` (S3 / Cloudflare R2 / Backblaze B2) | Hours | Render/Heroku ephemeral disks lose uploaded files on every redeploy |
| 2 | **MongoDB Atlas Cloud Backup** — enable continuous PITR; retention ≥ 30 days; run a quarterly restore drill | Operational | The SRS calls for "Automated Backups" |
| 3 | **CSRF double-submit token** | 1 hour | The current cookie is `SameSite=Strict` so cross-site CSRF is already blocked by the browser, but a token gives belt-and-braces protection if a future endpoint ever requires `SameSite=Lax` |
| 4 | **Bump deferred dependencies** — `jspdf@^4.2.1`, `nodemailer@^8.0.7` | 30 min + smoke test | npm audit flags both. Each upgrade is a breaking-change major; smoke-test the **Admin → Analytics → Download PDF** and a password-reset email before merging |
| 5 | **Provider-side rate limit** at Cloudflare / Render edge | Operational | Defense in depth in front of `express-rate-limit`; especially useful for `/api/auth/*` |
| 6 | **`mongodump --archive | gzip` cron** offsite copy | Operational | Belt-and-braces alongside Atlas snapshots |

### 1.d — Things to verify on every deploy

- ✅ `.env` is **not** committed (covered by `.gitignore`).
- ✅ `JWT_SECRET` is **32+ random chars**. Startup refuses to boot otherwise.
- ✅ `JWT_REFRESH_SECRET` is set to a **different** 32+ char string. Without it the server falls back to `JWT_SECRET + ":refresh"` and prints a startup warning.
- ✅ `TWOFA_ENC_KEY` is set to a 32+ char key. Without it 2FA secrets degrade to plaintext (warning printed).
- ✅ `MONGO_URI` points to the production cluster (use the SRV string for Atlas).
- ✅ `CORS_ORIGIN` is set to the **exact** public frontend origin(s). In production the server **refuses to start** without it.
- ✅ `FRONTEND_URL` is set so password-reset emails contain working links.
- ✅ `REACT_APP_API_URL` is set on the **frontend build** to the public backend URL (this gets baked in at build time — re-build to change).
- ✅ `SMTP_*` set if you want emails (forgot-password + claim status + urgent announcements).
- ✅ `NODE_ENV=production` so HSTS engages, CSP turns on, the proxy is trusted, and the frontend service-worker registers.
- ✅ `ALLOW_ADMIN_BOOTSTRAP` is **unset** (or `false`) in production. Set it to `true` only briefly when you need to use `first-admin`/`make-admin`, then unset.
- ✅ Wire `/api/ready` (not `/api/health`) into your platform's health probe so a Mongo outage marks the instance unhealthy.

### 1.e — Disaster recovery (quick reference)

| Scenario | Recovery |
| --- | --- |
| Server crash / OOM | Process supervisor (Render/Railway/PM2) restarts; `unhandledException` + graceful shutdown handles in-flight requests |
| Compromised JWT/refresh secret | Rotate `JWT_SECRET` and `JWT_REFRESH_SECRET` in env, redeploy → every active session is forced to re-login |
| Compromised individual session | User can log out (bumps `tokenVersion`); admin role-change/status-change also bumps `tokenVersion` |
| Lost 2FA device | Admin temporarily unsets `twoFactorEnabled` for the user via Mongo; user re-enrolls |
| DB corruption | Atlas Cloud Backup point-in-time restore (recommended retention 30+ days) |
| Uploads lost on redeploy | Migrate to external object storage (S3 / R2 / B2). Today: re-uploads required after a redeploy |

---

## 2. How to turn the project on

### Prerequisites

| Tool | Version |
| --- | --- |
| Node.js | 18+ (tested on 18 / 20) |
| npm | 9+ |
| MongoDB | 5+ (local install **or** a free Atlas cluster) |

> Windows tip: install Node from [nodejs.org](https://nodejs.org/) and MongoDB Community Server. Atlas (free tier) is easier than a local install for first-time setup.

### Step-by-step (development)

```powershell
# 1. Clone / open the repo at findit-fixed/

# 2. Backend
cd backend
npm install
copy .env.example .env       # then edit .env (see below)
npm run dev                  # nodemon → http://localhost:5000
```

Open a second terminal:
```powershell
# 3. Frontend
cd findit-fixed\frontend
npm install
copy .env.example .env.local # optional — only needed if backend isn't on :5000
npm start                    # → http://localhost:3000
```

### Run the security tests (recommended before each deploy)

```powershell
cd findit-fixed\backend
npm test
```

Expected output: **`Tests: 17 passed, 17 total`**. The test suite spins up an
in-memory Mongo (`mongodb-memory-server`) and runs Supertest against the real
Express stack (auth + items + RBAC). On first run the binary download takes
~30s; subsequent runs are ~30s end-to-end.

Visit http://localhost:3000.

### Filling out `backend/.env`

**Required:**
```
MONGO_URI=mongodb://localhost:27017/findit
JWT_SECRET=<32+ random chars; generate with `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`>
```

**Strongly recommended (warnings printed at startup if missing):**
```
JWT_REFRESH_SECRET=<a *different* 32+ char random string>
TWOFA_ENC_KEY=<32+ char key; `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`>
```

**Token TTLs (optional, accept anything `jsonwebtoken` accepts):**
```
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=7d
```

**Server / CORS:**
```
PORT=5000
NODE_ENV=development
LOG_LEVEL=debug
FRONTEND_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3000    # comma-separated allowlist; REQUIRED in production
```

**Admin bootstrap (DEV ONLY — keep unset in production):**
```
ALLOW_ADMIN_BOOTSTRAP=false
ADMIN_SECRET=<random>
```

**Email (optional in dev — falls back to a dev URL on screen if blank):**
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@example.com
SMTP_PASS=your-app-password   # Gmail: use an *App Password*
SMTP_FROM="FindIt <noreply@findit.local>"
```

### Promote yourself to admin (first time only)

`first-admin` and `make-admin` are now **gated**. Set `ALLOW_ADMIN_BOOTSTRAP=true` in `.env`, restart the backend, then:

```powershell
# After registering your VERY FIRST user:
Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/auth/first-admin
```

Or, after multiple users exist:
```powershell
$body = @{ email = "you@example.com"; adminSecret = "<your ADMIN_SECRET>" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/auth/make-admin -Body $body -ContentType 'application/json'
```

**Important:** once bootstrapping is complete, set `ALLOW_ADMIN_BOOTSTRAP=false` and restart. The endpoints will return 404 from then on.

In production, prefer promoting via Mongo directly (`db.users.updateOne({ email }, { $set: { role: 'admin' } })`) and never set `ALLOW_ADMIN_BOOTSTRAP=true`.

### Smoke test in a browser

1. Register a 2nd account from an incognito window.
2. As the regular user → **Post Item** with a pin-drop on the map.
3. As the admin → search, click the item, see the **Item history**.
4. Regular user → **Lost & Match** → submit a Lost Report.
5. Admin → **Matching System** → "Run Matching Algorithm".
6. Toggle **light/dark** in the sidebar.
7. As admin → **Analytics** → click **CSV** and **PDF** downloads.
8. Try logging in with a wrong password 5 times → confirm the **15-minute lockout** message on attempt #6.
9. Try `POST /api/auth/login` with `{"email": {"$ne": null}, "password": "x"}` → confirm `400` (the NoSQL injection probe is rejected).

If anything 500s, check `GET http://localhost:5000/api/health` (uptime/env) and `GET /api/ready` (DB connection).

### Production build

Frontend (CRA static build):
```powershell
cd findit-fixed\frontend
"REACT_APP_API_URL=https://api.findit.example.com" | Out-File -FilePath .env.production -Encoding ascii
npm run build
# `build/` is now a static bundle deployable to Vercel/Netlify/Cloudflare Pages/etc.
```

Backend (any Node host — Render, Railway, Fly.io, EC2):
```bash
cd backend
NODE_ENV=production node server.js
# or with PM2:  pm2 start server.js --name findit-api
```

The backend listens on `process.env.PORT` so most PaaS providers work out of the box.

### Deploy recipes (high level)

| Component | Easiest path |
| --- | --- |
| MongoDB | **Atlas** free tier — copy the SRV URI into `MONGO_URI`. Enable Cloud Backup (free tier includes ≥7-day retention). |
| Backend | **Render** Web Service: build `npm install`, start `node server.js`. Add env vars in dashboard. **Wire `/api/ready` to the health-check path.** |
| Frontend | **Vercel** or **Netlify**: connect repo, set `REACT_APP_API_URL`, build cmd `npm run build`, output dir `build`. |
| Email | **Resend / SendGrid / Mailgun** — set `SMTP_*` envs |
| Uploads | Out-of-the-box: local disk on the backend (works for small/medium scale). For Render/Heroku-style ephemeral disks: swap multer to **multer-s3** with an S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2). |

---

## 3. SRS feature → file location map

> Detailed file/line-level guide for the 5 core SRS features lives in [`Moumita.md`](./Moumita.md). The summary below is enough to navigate.

### 3.1 Digital Ownership Questions

> Extra layer of verification beyond simple description matching. Reduce false claims, help admins decide rightful ownership, store proof-of-ownership data digitally.

| Layer | File | What it does |
| --- | --- | --- |
| Schema (questions on the item) | `backend/models/Item.js` | `ownershipQuestions: [{ question }]` array on every found item |
| Schema (answers on the claim) | `backend/models/OtherModels.js` (`claimSchema.answers`) | Stored permanently with each claim doc; `[{ question, answer }]` |
| Validation on submit | `backend/routes/claims.js` (`POST /api/claims`) | Rejects 400 if poster set questions but claimant left answers blank or wrong-shaped |
| Reusable form component | `frontend/src/components/OwnershipQuestionsForm.js` | Two modes: `editable` (poster) and answer-mode (claimant) |
| Posting integration | `frontend/src/pages/PostItemPage.js` | Poster adds custom questions when posting a found item |
| Claim integration | `frontend/src/pages/SearchPage.js` (claim modal) | Claimant must answer all questions before submitting |

### 3.2 Notification System

> Email Notifications, Push Notifications, Claim Status Alerts, Admin Broadcast Alerts, Reminder Notifications

| Sub-feature | File(s) |
| --- | --- |
| In-app notifications model | `backend/models/OtherModels.js` (`notificationSchema`) |
| In-app notifications API | `backend/routes/notifications.js` |
| In-app notifications UI | `frontend/src/pages/NotificationsPage.js` (+ unread badge in `frontend/src/components/Layout.js`) |
| Real-time push (Socket.io) | Server emits in `backend/routes/{claims,matches,announcements,abuse,items,chat}.js`; client receives in `frontend/src/context/SocketContext.js` and toasts in `frontend/src/components/Layout.js` |
| Email service wrapper | `backend/utils/email.js` — gracefully no-ops without `SMTP_*` |
| Email — claim approved/rejected | `backend/routes/claims.js` — `sendEmail({...})` after each status change (HTML-escaped) |
| Email — password reset | `backend/routes/auth.js` — `POST /api/auth/forgot-password` |
| Email — urgent admin broadcasts | `backend/routes/announcements.js` — emails all active users when `priority === 'urgent'` (HTML-escaped) |
| Reminder notifications (25-day expiry warning) | `backend/cron/expiry.js` — creates a Notification + emits `expiry:reminder` socket; falls through to the toast pipeline |

### 3.3 Report Lost Item

> Enable users to officially register a lost item complaint. Generate searchable lost-item records. Help the system or admin match lost items with found items.

| Layer | File | What it does |
| --- | --- | --- |
| Model | `backend/models/OtherModels.js` (`lostReportSchema`) | name / category / colour / description / lostLocation / date / reportedBy / status |
| Submit endpoint | `backend/routes/matches.js` (`POST /api/matches/report-lost`) | Validates required fields incl. category enum + future-date check |
| List endpoints | `backend/routes/matches.js` (`GET /api/matches/my-reports` + `GET /api/matches`) | Users see their own; admins see everything |
| Form UI | `frontend/src/pages/MatchingPage.js` (right pane "Report a Lost Item") | Submits to the endpoint above |
| Sidebar entry (students) | `frontend/src/components/Layout.js` → `studentLinks` "Lost & Match" |
| Matching consumption | `backend/routes/matches.js` (`POST /api/matches/run`) | Compares LostReports vs Items, scores ≥60 → creates Match + notifies user |

### 3.4 Auto Expiry & Reminder

> Expire old listings, send reminder before expiry, archive expired items, allow renewal.

| Layer | File | What it does |
| --- | --- | --- |
| Schema fields | `backend/models/Item.js` | `expiresAt` (default = +30 days), `archived`, `renewedAt` |
| Cron job (the whole pipeline) | `backend/cron/expiry.js` | Runs daily at 02:00. Three passes: 25-day reminder → 30-day expiry → 60-day archive |
| Cron wiring | `backend/server.js` | `require('./cron/expiry')(io)` after MongoDB connects |
| Renew endpoint | `backend/routes/items.js` (`PUT /api/items/:id/renew`) | Resets `expiresAt = +30 days`, un-archives, flips `expired` → `found`, writes an `ItemHistory` row |
| Hide archived from search | `backend/routes/items.js` (`GET /api/items` query) | `query.archived = { $ne: true }` |

### 3.5 Emergency High-Value Item Flag

> Immediate attention, stronger verification, admin monitoring, priority matching.

| Layer | File | What it does |
| --- | --- | --- |
| Schema fields | `backend/models/Item.js` | `isHighValue`, `highValueApproved` (defaults to false when flagged → admin must approve) |
| Posting flow (toggle + flag) | `frontend/src/pages/PostItemPage.js` | "Mark as high-value (requires admin approval)" checkbox |
| Admin approval | `PUT /api/items/:id` (admin) — admin field whitelist now includes `highValueApproved` and `status` (`backend/routes/items.js`) |
| Block claims until approved | `backend/routes/claims.js` (`POST /api/claims`) | Returns `403 High-value item is pending admin approval` |
| Visible badge | `frontend/src/pages/SearchPage.js` (item card) | "High-value" badge rendered when `isHighValue === true` |
| Stronger verification | Combines with §3.1 — `ownershipQuestions` typically required on high-value posts |
| Priority matching | `backend/routes/matches.js` (`calculateMatchScore`) | `+10` when found item is high-value; matches sorted by score then by `isHighValue` |
| Admin monitoring widget | `frontend/src/pages/DashboardPage.js` | "High-value Pending" stat card on admin dashboard |

### 3.6 Trust Score System

> Prevent fraud, encourage honest behavior, prioritize trustworthy users, improve claim approval accuracy.

| Layer | File | What it does |
| --- | --- | --- |
| Schema field | `backend/models/User.js` | `trustScore: { default: 50, min: 0, max: 100 }` |
| Score increase | `backend/routes/claims.js` | On claim approval: claimant `+10` trust + `+10` reward; poster `+5` trust + `+20` (or `+50` for high-value) |
| Score decrease | `backend/routes/claims.js` | On claim rejection: claimant `-5`; **+15 extra penalty** if user has 3+ rejected claims (anti-fraud signal) |
| Bounds enforcement | `backend/routes/claims.js` (`clampTrustScore`) | Re-clamps to 0–100 after every `$inc` |
| Used in matching | `backend/routes/matches.js` (`POST /api/matches/run`) | `+5` bonus when claimant `trustScore ≥ 70` |
| Profile display | `frontend/src/pages/ProfilePage.js` | Trust badge with color-coded threshold |
| Dashboard tile (per user) | `frontend/src/pages/DashboardPage.js` | "Your Trust Score" stat card |
| Admin user table | `frontend/src/pages/AdminUsersPage.js` | Trust column, sortable / filterable |
| Public leaderboard | `backend/routes/leaderboard.js` + `frontend/src/pages/LeaderboardPage.js` | Toggle between **points** and **trust** sorting |
| Verified badge (visual reputation) | `User.verifiedBadge` (Boolean) — admins set via `PUT /api/users/:id/verify` |

---

## Quick health-check after deployment

```bash
# Liveness: should respond ~immediately even when DB is briefly unreachable
curl https://api.findit.example.com/api/health
# { "ok": true, "uptime": 12, "env": "production", "timestamp": "..." }

# Readiness: 503 until Mongo is connected — wire this into your platform's health probe
curl https://api.findit.example.com/api/ready
# { "ok": true, "db": "connected" }
```

If `/api/ready` is `503`, check `MONGO_URI`. If the request times out, check `CORS_ORIGIN` and that the host actually exposes the chosen `PORT`.
