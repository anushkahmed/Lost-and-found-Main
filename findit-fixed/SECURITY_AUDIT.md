# FindIt — Security & Production-Readiness Audit

_Last updated: 2026-05-01 (Phase B complete)_

This is a structured audit of the FindIt MERN Lost & Found Campus Portal performed
in the role of a senior full-stack security engineer. Findings are ranked by risk.
Each finding is paired with an explanation of why it matters and how it is being
fixed in the accompanying code changes.

The audit is split into two phases:

| Phase | Scope                                                                                            | Status        |
| ----- | ------------------------------------------------------------------------------------------------ | ------------- |
| **A** | Backend critical hardening: auth, sockets, rate limits, helmet, uploads, error handling, logging | ✅ DONE       |
| **B** | Frontend cookie-based auth migration, Zod request validation, automated tests, prod polish       | ✅ DONE        |

---

## 1. Highest-risk issues (fix in Phase A)

### 1.1 NoSQL operator injection on `/api/auth/login` and `/api/auth/forgot-password`
**Risk:** Account takeover for any registered user.

`User.findOne({ email })` accepts whatever JSON shape the body parser produced.
A request body of `{"email": {"$ne": null}, "password": "x"}` makes Mongo return
the first user document, then `bcrypt.compare("x", user.password)` returns false
**but** an attacker can pair this with `password: {"$ne": null}` once we allow it
through Express. The login route is the canonical CWE-943 case.

**Fix:**
- Cast every identity input to a primitive string before it reaches Mongo (`String(email).trim().toLowerCase()`).
- Add `express-mongo-sanitize` globally to strip `$` and `.` from request payloads.
- Add `hpp` to neutralize HTTP-parameter-pollution arrays on query strings.

### 1.2 Socket.io connections are unauthenticated; any client can join any user's room
**Risk:** Total privacy loss on chat, notifications, claim approvals, abuse reports.

```js
io.on('connection', (socket) => {
  socket.on('join', (userId) => socket.join(userId));   // accepts ANY userId
  socket.on('chat:typing', ({ toUserId }) => io.to(toUserId).emit(...));
});
```

Any browser, anywhere, can `socket.emit('join', '<victim id>')` and start receiving
their `claim:approved`, `chat:message`, `match:found`, `abuse:new` events.

**Fix:** authenticate the WebSocket handshake with a signed JWT, attach `socket.user`,
and force `socket.join(socket.user.id)` server-side. Reject `chat:typing` unless the
sender is a participant of the conversation.

### 1.3 JWT stored in `localStorage`
**Risk:** Any reflected/stored XSS becomes total session theft.

`localStorage.getItem('findit_user')` is JS-readable; XSS = full takeover.

**Fix (Phase A: backend infrastructure / Phase B: frontend migration):**
Adopt the standards-based dual-token pattern:
- Short-lived **access token** (15 min) returned in JSON body, kept in JS memory only.
- Long-lived **refresh token** (7 days) issued as `httpOnly`, `Secure`, `SameSite=Strict` cookie at `/api/auth/refresh`.
- Refresh-token rotation on each `/refresh`; `tokenVersion` on the user doc lets logout invalidate every active session.
- `protect` middleware accepts both `Authorization: Bearer` and the `findit_at` cookie during transition.

### 1.4 No rate limiting → credential stuffing & abuse
**Risk:** Brute-force login, password-reset flooding, OTP guessing, claim spam.

**Fix:** `express-rate-limit` with three tiers:
- `authLimiter` (10 req / 15 min / IP) on login, register, 2FA, forgot, reset.
- `apiLimiter` (300 req / 15 min / IP) on the global `/api/*`.
- `uploadLimiter` (20 req / hour / user) on `POST /api/items` and chat uploads.
- Per-account lockout after **5 failed logins** for **15 minutes** (model-level, not just IP).

### 1.5 `password` field is selectable by default
**Risk:** Any future code path that does `User.find().lean()` (or similar without `.select('-password')`) leaks bcrypt hashes.

**Fix:** Mark `password` as `select: false` in the schema; require explicit `.select('+password')` (already used in `auth.js` & `twofa.js`).

### 1.6 File uploads validated by extension only
**Risk:** Attacker uploads `pwn.html.png` and switches the URL extension; or uploads `.svg` containing an inline `<script>` which we serve as `image/svg+xml` and the browser executes when the URL is opened directly.

**Fix:**
- Reject SVG outright (attack surface).
- Verify magic bytes (`file-type` library) on disk before accepting the upload.
- Sanitize filenames (`crypto.randomBytes(16).toString('hex')`; never trust `originalname`).
- Set `Content-Disposition: attachment; filename="…"` on the static `/uploads/chat` mount so browsers download rather than execute.
- Cap MIME types (`image/jpeg|image/png|image/webp` for items/avatars; chat allows `image/*` + a small allowlist for documents).

### 1.7 `/uploads` served fully public; chat attachments leak
**Risk:** Anyone with a URL guess can fetch private claim photos & chat files.

**Fix:**
- Item images stay public (acceptable — they're meant to be searchable).
- **Avatars**: still public, but stored under a directory whose name is randomized.
- **Chat attachments**: gated by a signed-URL handler `GET /api/chat/file/:id` that re-checks conversation membership. The raw `/uploads/chat` mount is removed from the static handler.

### 1.8 Missing security headers
**Risk:** Click-jacking, MIME sniffing, leaked Referer to third-parties, no HSTS.

**Fix:** Add `helmet` with a CSP tuned for our React app + Leaflet tiles + recharts; enable HSTS in production; `Referrer-Policy: same-origin`; `X-Content-Type-Options: nosniff`; `X-Frame-Options: DENY`.

### 1.9 Test endpoint mounted in production
`backend/routes/notifications.js` declares `module.exports = router;` then **continues to register `POST /api/notifications/test`** below. Because `router` is exported by reference, the test route is live — any user can flood themselves and exercise insertMany at will. **Removed.**

### 1.10 Unbounded queries / pagination ignored
- `/api/items?limit=999999` — no max
- `/api/users?limit=...` — no max
- `/api/announcements` — no max
- `/api/items/meta/heatmap` — `.limit(1000)` (acceptable)

**Fix:** Centralized `parsePagination()` helper that hard-caps `limit` at 50 (100 for admin) and `page` at 1000.

---

## 2. High-risk issues (fix in Phase A)

| # | Finding | Fix |
| -- | ------- | --- |
| 2.1 | Weak password policy (just length ≥ 6) | zxcvbn-style policy: ≥10 chars, mixed case, digit, symbol; reject top-100 common passwords |
| 2.2 | 2FA secret stored as plaintext base32 | Encrypt with AES-256-GCM using `TWOFA_ENC_KEY` env var |
| 2.3 | No CSRF protection once we move to cookies | `SameSite=Strict` on the refresh cookie + a CSRF double-submit cookie for state-changing requests in Phase B |
| 2.4 | Mass-assignment risk on `/api/users/me` | Already whitelisted ✓ — verified during audit |
| 2.5 | `make-admin` and `first-admin` privileged endpoints unmetered | Hard rate limit + only allow when `process.env.ALLOW_ADMIN_BOOTSTRAP=true` |
| 2.6 | `req.body.recipientId` in `/api/chat/conversations` not validated as ObjectId | `mongoose.isValidObjectId(...)` gate before query |
| 2.7 | No request logging; errors leak `error.message` to clients | `pino-http` structured logs (with `redact` for `password`, `token`, `code`, `authorization`) + a centralized error handler that returns generic 500s to users while logging full stack server-side |
| 2.8 | `dns.setDefaultResultOrder('ipv4first')` is global side-effect on require | Keep, but only in dev — note in audit |
| 2.9 | Origin validation in CORS callback throws an `Error` instead of `cb(null, false)` — can produce 500s | Switch to `cb(null, false)` so unauthorised origins get a clean preflight failure |
| 2.10 | `req.io.emit('item:new', ...)` broadcasts the entire item incl. poster email to every connected client | Strip sensitive fields before emit (`postedBy: { name, _id }` only) |
| 2.11 | No graceful shutdown — Mongo / sockets are abruptly killed | Listen for `SIGTERM` / `SIGINT`, drain HTTP, close sockets, `mongoose.connection.close()` |
| 2.12 | `app.set('trust proxy', 1)` — needs to match deployment topology | Document in `PRODUCTION_GUIDE.md` |

---

## 3. Medium-risk issues (Phase B)

| # | Finding | Fix |
| -- | ------- | --- |
| 3.1 | No central input validation library; manual checks differ between routes | Zod schemas per route + a `validate(schema)` middleware |
| 3.2 | Frontend renders user-supplied text inside attribute via template strings — React escapes by default but `dangerouslySetInnerHTML` audit needed | Grep confirms no usage; document in audit |
| 3.3 | No React `<ErrorBoundary>` | Add `ErrorBoundary` component around `App` |
| 3.4 | No automated tests for auth/RBAC/uploads | Jest + Supertest suite covering: register/login, NoSQL injection rejection, RBAC, IDOR, upload MIME |
| 3.5 | No DB indexes on hot queries (`Item.postedBy`, `Notification.userId`, `Conversation.participants`) | Add explicit `index: true` |
| 3.6 | No backup or disaster-recovery doc | Add MongoDB Atlas snapshot guidance to PRODUCTION_GUIDE |
| 3.7 | No monitoring hooks | Health check `/api/health` + readiness `/api/ready` (DB ping + memory) for Render/Heroku/Railway probes |
| 3.8 | Email content not HTML-escaped (we interpolate `user.name` raw) | Run all interpolated values through a tiny `escapeHtml()` |

---

## 4. Items considered but **not** changed

- **bcryptjs vs argon2:** bcrypt is OWASP-acceptable; switching would force every existing user to reset. Cost factor raised to **12** (still fast on modern CPUs but ~2× harder than the default 10).
- **JWT lib:** `jsonwebtoken` 9.x is current; no swap needed.
- **`ipv4first`:** keeping as-is to maintain Atlas connectivity on Windows; documented.

---

## 5. Implementation map (Phase A)

| Concern | File(s) |
| ------- | ------- |
| Headers, sanitizers, error handler, graceful shutdown, socket auth | `backend/server.js` |
| Centralized middleware (cookie+header auth, RBAC, ObjectId, asyncHandler, paginate) | `backend/middleware/auth.js`, `backend/middleware/security.js` (new), `backend/middleware/asyncHandler.js` (new) |
| Safe email-string casting, lockout, refresh cookies, strong password rule, /refresh, /logout | `backend/routes/auth.js` |
| `select: false`, lockout fields, tokenVersion | `backend/models/User.js` |
| Rate limiters | `backend/middleware/rateLimiters.js` (new) |
| Magic-byte upload validation, randomized filenames | `backend/utils/upload.js` (new), `backend/routes/items.js`, `backend/routes/users.js`, `backend/routes/chat.js` |
| Signed chat-attachment download | `backend/routes/chat.js` |
| Removed leaked test route | `backend/routes/notifications.js` |
| 2FA secret encryption | `backend/utils/crypto.js` (new), `backend/routes/twofa.js`, `backend/routes/auth.js` |
| Structured logger | `backend/utils/logger.js` (new) |
| Env validation | `backend/utils/env.js` (new) |

---

## 6. Phase A — completed and deployed in this commit

| Area | What changed | Files |
| ---- | ------------ | ----- |
| Headers | helmet (CSP for prod, HSTS, Referrer-Policy, X-CTO, frame-ancestors none), CORS via callback (no thrown errors), per-request id, structured pino-http logs with redaction | `backend/server.js`, `backend/utils/logger.js` |
| Sanitization | express-mongo-sanitize globally → `$`/`.` stripped from request payloads; hpp neutralizes parameter pollution | `backend/server.js` |
| Auth | Email/password coerced to primitives; per-IP `authLimiter` (10/15min) + per-account lockout (5 strikes → 15 min); short-lived access JWT (15m) + httpOnly+Secure+SameSite=Strict refresh-token cookie; tokenVersion-based logout/revocation; `/api/auth/refresh` + `/logout`; password ≥ 10 chars + complexity + common-password block; bcrypt cost raised to 12 | `backend/routes/auth.js`, `backend/models/User.js`, `backend/middleware/auth.js`, `backend/utils/env.js`, `backend/utils/crypto.js` |
| 2FA | TOTP secret encrypted at rest (AES-256-GCM via TWOFA_ENC_KEY) | `backend/routes/twofa.js`, `backend/utils/crypto.js` |
| Sockets | Mandatory JWT handshake (`io.use`); user can only join their own room; `chat:typing` only forwards if sender+recipient are conversation members | `backend/server.js` |
| Rate limits | Three tiers: 300/15m global, 10/15m on /auth/*, 5/15m on forgot-password, 30/h on uploads, 10/h on abuse | `backend/middleware/rateLimiters.js` |
| Uploads | Random 32-hex filenames; MIME+extension allowlist; magic-byte verification post-write (`file-type@^16`); SVG rejected; chat attachments stored in private `uploads/chat-private/` and downloaded only via authenticated `GET /api/chat/file/:filename` that re-checks conversation membership | `backend/utils/upload.js`, `backend/routes/items.js`, `backend/routes/users.js`, `backend/routes/chat.js` |
| Validation | Every `:id` route guarded by `requireObjectId`; pagination capped via `parsePagination`; user search inputs `escapeRegex`'d before Mongo; category/status enum-checked on every write; coordinates bounded; dates rejected if future-far | `backend/middleware/security.js` + every route |
| Authorization | RBAC verified on every protected route; non-admins can no longer change Item.status; self-deactivation/self-demotion blocked; tokenVersion bumped on role/status changes so the affected user is forced to re-login | `backend/routes/users.js`, `backend/routes/items.js` |
| Email injection | All email interpolation HTML-escaped before reaching `wrap()` | `backend/routes/claims.js`, `backend/routes/announcements.js`, `backend/routes/auth.js` |
| Errors | Centralized error handler — 5xx leaks no internals in prod; multer/CORS/Validation/Cast errors → safe codes; `notFound` for unknown routes | `backend/middleware/security.js`, `backend/server.js` |
| Resilience | Graceful shutdown (SIGTERM/SIGINT) drains HTTP, sockets, Mongo; readiness probe at `/api/ready`; unhandledRejection/uncaughtException captured | `backend/server.js` |
| Cleanup | Removed leaked test endpoint `POST /api/notifications/test` that was registered after `module.exports` and silently lived in production; `make-admin`/`first-admin` now require `ALLOW_ADMIN_BOOTSTRAP=true` | `backend/routes/notifications.js`, `backend/routes/auth.js` |
| Broadcasts | `item:new` socket payload no longer leaks poster email | `backend/routes/items.js` |
| User model | `password`, `twoFactorSecret`, `failedLoginAttempts`, `lockedUntil`, `tokenVersion`, `passwordResetToken/Expires` all `select:false` (defense in depth) | `backend/models/User.js` |
| Env | Fail-fast validation of `JWT_SECRET` (≥32 chars), `MONGO_URI`, `CORS_ORIGIN` (in prod); structured warnings for `JWT_REFRESH_SECRET` / `TWOFA_ENC_KEY` | `backend/utils/env.js` |

**Status:** all 20 changed/new files pass `node --check`, all 37 new dependencies installed cleanly, every module imports without runtime errors.

---

## 7. Phase B — completed and deployed

| Area | What changed | Files |
| ---- | ------------ | ----- |
| Frontend auth | Access token now lives in JS memory only (`tokenStore.js`); `localStorage.findit_user` removed; refresh-token cookie is the sole long-lived credential. AuthContext does a silent `/api/auth/refresh` on app boot to restore the session, and a `/logout` POST on logout that bumps `tokenVersion` server-side | `frontend/src/api/tokenStore.js` (new), `frontend/src/api/client.js` (new), `frontend/src/context/AuthContext.js` |
| Frontend axios interceptors | A single global axios instance: attaches `Authorization: Bearer <access>` from memory; on **401** it dedupes a single concurrent `/refresh` call, retries the original request, and bounces to `/login` if `/refresh` itself 401s. Authentication endpoints (`/login`, `/register`, `/refresh`, `/forgot`, `/reset`) are excluded from the retry loop to avoid feedback storms | `frontend/src/api/client.js`, `frontend/src/index.js` |
| Frontend sockets | Handshake passes the in-memory access token via a function callback (`auth: cb => cb({ token: getAccessToken() })`), so socket reconnections automatically pick up a refreshed token. The legacy client-emitted `socket.emit('join', userId)` was deleted — the server now forces `socket.join(socket.user.id)` on connection (Phase A) | `frontend/src/context/SocketContext.js` |
| ErrorBoundary | Class-based `<ErrorBoundary>` wraps `<ThemeProvider>` so a single broken component doesn't blank the app. The fallback never displays the raw error in production (no codebase leaks); a Sentry hook is in place but a no-op until `SENTRY_DSN` is set | `frontend/src/components/ErrorBoundary.js` (new), `frontend/src/App.js` |
| Schema-first validation (Zod) | New `validate(schema)` middleware uses `safeParse` to enforce types **and** strip unknown keys (defense-in-depth against mass assignment). Applied to `/register`, `/login`, `/2fa/login`, `/forgot-password`, `/reset-password`. Strict shapes mean a `{$ne: null}` payload is now rejected at the Zod layer before any Mongo call | `backend/middleware/validate.js` (new), `backend/schemas/auth.schemas.js` (new), `backend/routes/auth.js` |
| Automated tests | Jest + Supertest + `mongodb-memory-server`: 17 assertions covering register (mass-assignment block, weak-password block, duplicate email), login (NoSQL operator injection rejection, account lockout after 5 strikes), refresh-cookie rotation, logout invalidates older refresh cookies, IDOR check on `PUT /api/items/:id`, status / `highValueApproved` mass-assignment block, helmet headers, `/api/health` and `/api/ready` | `backend/tests/*`, `backend/jest.config.js` |
| Sentry hook | `errorHandler` calls `captureException(err, ctx)` for every 5xx if `SENTRY_DSN` is present; otherwise it's a silent no-op (no SDK loaded → cold-start unaffected) | `backend/middleware/security.js` |
| Docs | This file, `PRODUCTION_GUIDE.md`, and `Moumita.md` updated to describe the new auth flow, env-rotation playbook, and how to run the test suite | `findit-fixed/*.md` |

**How to run the test suite locally**

```bash
cd findit-fixed/backend
npm install
npm test
```

Expect "Tests: 17 passed, 17 total". `mongodb-memory-server` will download a Mongo binary on first run (cached afterwards).

---

## 8. Known open advisories (recommended follow-up)

`npm audit` reports three transitive vulnerabilities that we deliberately did **not** auto-bump in Phase B because each requires an integration smoke test before merging:

| Package | Severity | Why we deferred | Recommended action |
| ------- | -------- | --------------- | ------------------ |
| `jspdf@^3.0.3` | Critical (multiple PDF injection / DoS) | Used only by `routes/adminReports.js` to render an admin-only PDF dashboard. Upgrade to `jspdf@^4.2.1` is a major-version bump and our PDF-rendering path needs a manual visual test before promoting | `cd backend && npm install jspdf@^4.2.1` then exercise the **Admin → Analytics → Download PDF** flow |
| `nodemailer@^7.0.6` | Moderate (SMTP CRLF / envelope.size injection) | Currently we don't pass any user-controlled value into `from`, `subject`, or `envelope`, so the in-the-wild exploit primitive is not reachable. Upgrade to `nodemailer@^8.0.7` is a breaking change | `cd backend && npm install nodemailer@^8.0.7` then send a test password-reset email |
| `file-type@^16.5.4` | Moderate (ASF parser infinite loop) | Pinned to v16 because v17+ are ESM-only and our `require()` would break. We never accept ASF/WMV media (extension allowlist is `.jpg/.png/.webp`), so the parser is never invoked on a malicious sample | Migrate the upload module to ESM and pin `file-type@^21` in a follow-up PR |

The mitigation in each case is **not exposing the vulnerable primitive** to user input, so the residual risk in the meantime is low — but the upgrades should still happen on the next maintenance window.

---
