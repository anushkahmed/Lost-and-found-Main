# Feature Owner's Guide — Where Each Feature Lives

This file is for the teammate owning the **5 SRS features** below. Every feature has:
- 📂 a **file map** with line ranges
- 🔍 **search keywords** to grep when you need to find every related reference
- 🗂 the **schema fields** the feature uses
- 🌐 the **API endpoints** the feature exposes
- 🧪 a **manual test recipe** to verify it works end-to-end

> All paths are relative to `findit-fixed/`.
>
> **Notes for the latest revision:**
> - **Phase A** (backend hardening) and **Phase B** (frontend cookie-auth migration, Zod validation, Jest tests, ErrorBoundary) are both **complete**. See [`SECURITY_AUDIT.md`](./SECURITY_AUDIT.md) for the full breakdown and [`PRODUCTION_GUIDE.md`](./PRODUCTION_GUIDE.md) §1.c for the Phase B summary.
> - Line numbers below are accurate as of this revision, but if they drift slightly the **🔍 grep keywords** under each section are the canonical lookup.
> - The frontend no longer keeps a JWT in `localStorage`. Token handling is now isolated in `frontend/src/api/tokenStore.js` and `frontend/src/api/client.js` (the global axios interceptor). Pages and contexts continue to call `axios` directly — they don't need to know about the token at all.
> - To run the security regression suite: `cd backend && npm test`.

---

## Table of contents

1. [Digital Ownership Questions](#1-digital-ownership-questions)
2. [Notification System](#2-notification-system) (email · push · claim status · admin broadcast · reminders)
3. [Report Lost Item](#3-report-lost-item)
4. [Auto Expiry & Reminder](#4-auto-expiry--reminder)
5. [Emergency High-Value Item Flag](#5-emergency-high-value-item-flag)
6. [Trust Score System](#6-trust-score-system)

---

## 1. Digital Ownership Questions

> Extra layer of verification beyond simple description matching. Posters define questions, claimants must answer, answers are stored as proof-of-ownership.

### File map

| # | File | Lines | What it does |
|---|---|---|---|
| 1 | `backend/models/Item.js` | **69-71** | Schema — `ownershipQuestions: [{ question }]` array on every found item |
| 2 | `backend/models/OtherModels.js` | **69-80** (`claimSchema`) — `answers` array at **73-76** | Stores claimant answers permanently as `[{ question, answer }]` on the claim doc |
| 3 | `backend/routes/items.js` | `POST /` handler — `ownershipQuestions` parsed from multipart in the body block, persisted into `Item.create({ ... ownershipQuestions ... })` (capped at 10, 200 chars per question) | Accepts the array on item create |
| 4 | `backend/routes/claims.js` | `POST /` handler — validation block under "Ownership Q&A required if poster added questions" | Rejects 400 if poster set questions but claimant left answers blank or wrong-shaped; normalizes answer shape; caps lengths |
| 5 | `frontend/src/components/OwnershipQuestionsForm.js` | whole file | Reusable component, two modes: `mode="edit"` (poster) and answer mode (claimant) |
| 6 | `frontend/src/pages/PostItemPage.js` | poster form — state + form append + UI render around the "Ownership questions" section | Poster adds questions while creating an item |
| 7 | `frontend/src/pages/SearchPage.js` | claim modal — initializes answers from item, renders the form | Claimant fills answers in the claim modal |

### 🔍 grep keywords

```
ownershipQuestions       # canonical identifier
OwnershipQuestionsForm   # the React component
claim.answers            # stored answers on a claim
normalizedAnswers        # the validation+normalization site in claims.js
```

### 🗂 Schema fields

- `Item.ownershipQuestions: [{ question: String }]`
- `Claim.answers: [{ question: String, answer: String }]`

### 🌐 API touchpoints

- `POST /api/items` — multipart, accepts `ownershipQuestions` as JSON-stringified array
- `POST /api/claims` — body must include `answers: [{ question, answer }]` matching the item's questions

### 🧪 Manual test

1. As any user, post a found item with **2 ownership questions** (e.g. "What was inside?" / "Any scratches?").
2. Log in as a different user, open the item in Search → click Claim.
3. The modal should now ask the same 2 questions; submitting blank answers → 400 error.
4. Fill answers → claim saves; admin sees them on the Claims page.

---

## 2. Notification System

> Email, push (real-time via socket), claim status alerts, admin broadcasts, reminder notifications.

### 2a. Core notification model + API

| File | Lines | Role |
|---|---|---|
| `backend/models/OtherModels.js` | **22-29** (`notificationSchema`) | DB schema — `userId, type, title, message, itemId, read`. **`type` enum at line 24** is the canonical list of notification kinds (`claim`, `match`, `status`, `announcement`, `expiry`). The `abuse` route writes `type: 'abuse'` — extend the enum if you ever want strict validation on it. |
| `backend/routes/notifications.js` | whole file | `GET /api/notifications` (paginated, hard-capped via `parsePagination`), `PUT /:id/read`, `PUT /read-all`, `DELETE /:id`, `DELETE /clear-all`. Every `:id` is `requireObjectId`-validated. **The leaked test endpoint that used to live here was removed in the Phase A security pass.** |
| `frontend/src/pages/NotificationsPage.js` | whole file | List view + mark-as-read |
| `frontend/src/components/Layout.js` | sidebar polling + unread badge block (~33-52) | Polls `/api/notifications` every 8s, shows the unread badge on the sidebar Notifications link |

### 2b. Real-time push (Socket.io) — **socket auth changed in Phase A**

| File | Lines | Role |
|---|---|---|
| `backend/server.js` | `io.use(...)` handshake auth (~57-72) **+** `io.on('connection')` (~204-227) | **Phase A change:** the old `socket.on('join', userId)` is **gone**. Every Socket.io connection now requires a valid access JWT in `socket.handshake.auth.token`. The server reads the user from the token and force-joins the user to **their own room** server-side — clients can no longer choose which room to join. The `chat:typing` event also re-checks conversation membership before forwarding. |
| `frontend/src/context/SocketContext.js` | whole file | **Phase B:** passes the in-memory access token via a function callback (`auth: cb => cb({ token: getAccessToken() })`). Reconnections automatically pick up a refreshed token without tearing the socket down. The legacy client-emitted `socket.emit('join', userId)` was removed. |
| `frontend/src/components/Layout.js` | toast subscriber block (~57-71) | Subscribes to `match:found`, `announcement:new`, `item:new` and shows toasts |

Server-side socket emitters (where push is sent from):

| File | What it pushes |
|---|---|
| `backend/routes/claims.js` | `item:claim` (admins, on new claim), `claim:approved`, `claim:rejected` |
| `backend/routes/matches.js` | `match:found`, `claim:approved` (on confirm) |
| `backend/routes/announcements.js` | `announcement:new` |
| `backend/routes/abuse.js` | `abuse:new` (admins) |
| `backend/routes/items.js` | `item:new` (now sanitized — no poster email leak), `item:status` |
| `backend/cron/expiry.js` | `expiry:reminder` (per user, per stale item), `system:cron` (admin heartbeat) |
| `backend/routes/chat.js` | `chat:message` (per recipient room) |

### 2c. Email notifications

| File | Lines | Role |
|---|---|---|
| `backend/utils/email.js` | whole file | **The wrapper** — `sendEmail({to, subject, text, html})` and `wrap(title, body)` for consistent HTML. Returns `{skipped: true}` if SMTP not configured (never throws). |
| `backend/routes/auth.js` | `POST /forgot-password` handler | Password-reset email (HTML-escapes the user's name) |
| `backend/routes/claims.js` | claim-approved + claim-rejected handlers | Claim status emails — **HTML-escaped** so a name containing `<script>` can never inject |
| `backend/routes/announcements.js` | urgent-priority block in `POST /` | Urgent announcements emailed to all active users — **HTML-escaped** (title + body) |

### 2d. Reminder notifications (cron)

| File | Lines | Role |
|---|---|---|
| `backend/cron/expiry.js` | **23** (schedule), **28-46** (25-day reminder pass) | Creates Notification doc + emits `expiry:reminder` socket event |
| `backend/server.js` | **193** | Wires the cron in: `require('./cron/expiry')(io)` |

### 🔍 grep keywords

```
sendEmail                # all email send sites
req.io.to(               # all socket emit sites (per-user)
req.io.emit(             # all socket broadcast sites
io.use(                  # the socket-auth handshake middleware (server.js)
notification:            # log searches
type: 'expiry'           # the reminder kind
type: 'announcement'     # the broadcast kind
type: 'claim'            # the claim alert kind
```

### 🌐 API touchpoints

- `GET /api/notifications` — list user's notifications (paginated; `?page=&limit=` capped at 100)
- `PUT /api/notifications/:id/read` — mark read
- `PUT /api/notifications/read-all` — bulk
- `DELETE /api/notifications/:id` — dismiss
- `DELETE /api/notifications/clear-all` — bulk

### 🧪 Manual test

1. **Push (claim alert):** User A posts item, User B claims it → User A's admin gets a real-time toast and a row in NotificationsPage.
2. **Email:** Set `SMTP_*` in `.env`, then approve a claim — check the claimant's inbox.
3. **Broadcast:** As admin, post an announcement with `priority: urgent` → all users see toast and (if SMTP on) get an email.
4. **Reminder:** Manually run the cron once for testing — drop into `cron/expiry.js`, replace `cron.schedule(...)` with an immediate call, restart, watch for `⏰ Expiry cron completed` in the log and a Notification doc per stale item.
5. **Socket auth (Phase A regression):** open a browser dev console and connect to the socket without a token (e.g. `io('http://localhost:5000')`) → connection should be **rejected** with `unauthorized`.

---

## 3. Report Lost Item

> Users register a lost-item complaint. The system stores searchable records and the matching algorithm tries to pair each report with a found item.

### File map

| File | Lines | Role |
|---|---|---|
| `backend/models/OtherModels.js` | **4-13** (`lostReportSchema`) | `name, category, colour, description, lostLocation, date, reportedBy, status` (enum `searching|matched|resolved`) |
| `backend/routes/matches.js` | `POST /report-lost` handler | Validates required fields, **enforces category enum**, **rejects far-future dates**, persists the report |
| `backend/routes/matches.js` | `GET /my-reports` handler | Returns the calling user's lost reports |
| `backend/routes/matches.js` | `GET /` handler | Returns matches; admin sees all, users only see those for their own reports |
| `backend/routes/matches.js` | `POST /run` handler (admin only) | Matching algorithm — iterates LostReports × found Items, calls `calculateMatchScore`, creates Match docs at score ≥60, notifies via Notification + socket `match:found` |
| `backend/routes/matches.js` | `calculateMatchScore` function | Scoring rubric: category 40, colour 25, location 20, date 15, high-value +10, trust ≥70 +5 |
| `backend/routes/matches.js` | `PUT /:id` handler (admin only, `requireObjectId`) | Admin confirms/rejects; on confirm marks Item `claimed` and LostReport `matched` |
| `frontend/src/pages/MatchingPage.js` | state, submit handler, "Report a Lost Item" form (right pane) | The lost-report form |
| `frontend/src/pages/MatchingPage.js` | matches list block | Match list + confirm/reject buttons |
| `frontend/src/components/Layout.js` | sidebar entries `/matching` (admin + student) | Navigation |

### 🔍 grep keywords

```
LostReport          # the model name (capitalized)
report-lost         # the canonical endpoint suffix
calculateMatchScore # the scoring algorithm
match:found         # the socket event for users
```

### 🗂 Schema fields

```
LostReport: { name, category, colour, description, lostLocation, date, reportedBy, status }
Match:      { foundItem, lostReport, score, status: 'pending|confirmed|rejected', confirmedBy }
```

### 🌐 API touchpoints

- `POST /api/matches/report-lost` — file a lost report
- `GET /api/matches/my-reports` — your own reports
- `GET /api/matches` — matches (scoped by role)
- `POST /api/matches/run` — admin triggers matching
- `PUT /api/matches/:id` — admin confirms/rejects a match (id validated)

### 🧪 Manual test

1. As a regular user, go to **Lost & Match** → fill the right-pane form → submit. Confirm 201 in network tab.
2. As admin, post a found item with similar category/colour/location/date.
3. As admin again, click **Run Matching Algorithm** — match should appear with a score ≥60.
4. Confirm the match. The lost-reporter receives a toast + Notification.

---

## 4. Auto Expiry & Reminder

> Listings expire after 30 days, reminder fires at 25 days, archive at 60 days. Users can renew.

### File map

| File | Lines | Role |
|---|---|---|
| `backend/models/Item.js` | **74-77** (`expiresAt`), **78-81** (`archived`), **82-84** (`renewedAt`), **51** (status enum includes `expired` and `archived`) | Schema fields |
| `backend/cron/expiry.js` | **23** (schedule `0 2 * * *`) | Daily at 02:00 |
| `backend/cron/expiry.js` | **28-46** | **25-day reminder pass** — finds items posted 25+ days ago, emits `expiry:reminder` socket + creates Notification |
| `backend/cron/expiry.js` | **48-53** | **30-day expire pass** — `Item.updateMany` sets `status: 'expired'` |
| `backend/cron/expiry.js` | **55-60** | **60-day archive pass** — sets `archived: true, status: 'archived'` |
| `backend/cron/expiry.js` | **62-66** | Pings admins via `system:cron` socket event |
| `backend/server.js` | **193** | Wires the cron in: `require('./cron/expiry')(io)` after MongoDB connects |
| `backend/routes/items.js` | `PUT /:id/renew` handler — owner-or-admin guard, status check, history log | Owner/admin can renew: resets `expiresAt = +30d`, un-archives, flips `expired` → `found`, writes `ItemHistory` |
| `backend/routes/items.js` | `GET /` query line `archived: { $ne: true }` + heatmap query | Excludes `archived: true` from search and heatmap |
| `backend/models/OtherModels.js` | **24** | Notification `type: 'expiry'` enum value |

### 🔍 grep keywords

```
expiresAt           # field name
archived            # field name
renewedAt           # field name
cron.schedule       # the scheduler line
expiry:reminder     # the socket event name
type: 'expiry'      # notification kind
PUT /api/items/:id/renew
```

### 🗂 Schema fields

- `Item.expiresAt: Date` (default `+30 days` from creation)
- `Item.archived: Boolean` (default `false`)
- `Item.renewedAt: Date` (last renewal time, nullable)
- `Item.status: 'found' | 'claimed' | 'returned' | 'expired' | 'archived'`

### 🌐 API touchpoints

- `PUT /api/items/:id/renew` — owner or admin renews. Resets expiry +30 days. (`:id` is `requireObjectId`-validated.)
- `GET /api/items` — naturally excludes archived items via `query.archived = { $ne: true }`.

### 🧪 Manual test (without waiting 30 days)

1. Open Mongo shell or Compass → set an item's `createdAt` to `new Date(Date.now() - 31*24*60*60*1000)` and `expiresAt` to a date in the past.
2. Manually invoke the cron body — easiest: temporarily duplicate the `cron.schedule` callback into a one-shot call right after `cron.schedule(...)` in `cron/expiry.js`.
3. Restart backend → that item should now be `status: 'expired'`.
4. Hit `PUT /api/items/:id/renew` → status flips back to `found`, `expiresAt` resets, `renewedAt` fills in.

---

## 5. Emergency High-Value Item Flag

> Immediate attention, stronger verification, admin monitoring, priority matching.

### File map

| File | Lines | Role |
|---|---|---|
| `backend/models/Item.js` | **59-66** | Schema — `isHighValue`, `highValueApproved` |
| `backend/routes/items.js` | `POST /` handler — `wantsHighValue` boolean coerce, `highValueApproved` defaults to `false` when flagged, ItemHistory `meta` carries the flags | Posting flow flags items + writes audit log |
| `backend/routes/claims.js` | `POST /` handler — early gate `if (item.isHighValue && item.highValueApproved === false) return 403` | **Blocks claims** while pending admin approval |
| `backend/routes/claims.js` | claim-approved branch — `reward = itemDoc.isHighValue ? 50 : 20` | High-value items award **+50 reward points** to poster on successful return (vs +20 for normal) |
| `backend/routes/matches.js` | `calculateMatchScore` — `if (foundItem.isHighValue) score += 10` | Match scoring: `+10 bonus` when found item is high-value |
| `backend/routes/matches.js` | `GET /` final sort — score desc, then `isHighValue` desc | Matches sorted by score then by `isHighValue` (priority surfacing) |
| `backend/routes/adminReports.js` | analytics summary — `Item.countDocuments({ isHighValue: true, highValueApproved: false })` | Counts `highValuePending` for admin dashboard |
| `backend/routes/chat.js` | conversation populates include `isHighValue, highValueApproved, status` | Chat UI can show the flag |
| `backend/routes/items.js` | `PUT /:id` admin field whitelist now includes **`highValueApproved`** and **`status`** | **New in Phase A** — non-admins can no longer change these fields. Admin approval is now the canonical way to flip `highValueApproved`. |
| `frontend/src/pages/PostItemPage.js` | poster checkbox block | "Mark as high-value (requires admin approval)" toggle |
| `frontend/src/pages/SearchPage.js` | item card render | Shows "High-value" badge when `isHighValue && highValueApproved !== false` |
| `frontend/src/pages/DashboardPage.js` | admin tile | "High-value Pending" count |
| `frontend/src/pages/AdminAnalyticsPage.js` | summary tile | Surfaces `summary.highValuePending` from backend analytics |

### 🔍 grep keywords

```
isHighValue          # the field
highValueApproved    # the approval gate
```

### 🗂 Schema fields

- `Item.isHighValue: Boolean` (poster's intent)
- `Item.highValueApproved: Boolean` (default `false` if flagged → admin must approve)

### 🌐 API touchpoints

- `POST /api/items` — accepts `isHighValue` in the multipart body (string `'true'` / `'false'`)
- `PUT /api/items/:id` — admin can flip `highValueApproved` to `true`. Non-admins **cannot** set this field (whitelist enforced).
- `POST /api/claims` — returns 403 if a claim is attempted before approval

> ⚠ **Note:** the admin-approval flow uses the generic `PUT /api/items/:id`. If you want a dedicated `PUT /api/items/:id/approve-high-value` endpoint, it's a 10-line addition; the model already has the field.

### 🧪 Manual test

1. As regular user, post item with **"Mark as high-value"** checked → confirm `isHighValue: true, highValueApproved: false` in DB.
2. As another regular user, try to claim → expect **403 — "High-value item is pending admin approval"**.
3. As **regular user** (not admin), try `PUT /api/items/:id` with `{ highValueApproved: true }` → field is silently dropped (whitelist).
4. As admin, hit `PUT /api/items/:id` with `{ highValueApproved: true }` → claims now go through.
5. After approval, run matching → notice the +10 high-value bonus in `match.score` versus a normal item.

---

## 6. Trust Score System

> Prevent fraud, encourage honesty, prioritize trustworthy users in matching.

### File map

| File | Lines | Role |
|---|---|---|
| `backend/models/User.js` | **57-62** | Schema — `trustScore: { default: 50, min: 0, max: 100 }` |
| `backend/routes/claims.js` | `clampTrustScore` function | Helper that clamps any score change to 0–100 |
| `backend/routes/claims.js` | claim-approved branch | **+10 trust + +10 points** to claimant; **+5 trust + +20 (or +50 high-value) points** to poster |
| `backend/routes/claims.js` | claim-rejected branch | **−5 trust** to claimant; **−15 extra trust** if the user has 3+ rejected claims (anti-fraud signal); calls `clampTrustScore` after each `$inc` |
| `backend/routes/matches.js` | `POST /run` handler — `if ((lost.reportedBy?.trustScore || 0) >= 70) score += 5` | Matching algorithm prioritizes trustworthy claimants |
| `backend/routes/leaderboard.js` | whole file | `GET /api/leaderboard?metric=trust` — public ranked list (emails redacted for non-admins) |
| `backend/routes/adminReports.js` | top-trust block | Top-trust leaderboard widget data for admin analytics |
| `backend/routes/users.js` | `/me/full` + admin list | Trust included in user views |
| `frontend/src/pages/ProfilePage.js` | trust badge near top | Self-display |
| `frontend/src/pages/DashboardPage.js` | "Your Trust Score" tile (color: green ≥70, amber otherwise) | Personal dashboard tile |
| `frontend/src/pages/AdminUsersPage.js` | trust badge column | Admin user list |
| `frontend/src/pages/AdminAnalyticsPage.js` | "Trust score leaderboard" widget | Admin analytics |
| `frontend/src/pages/LeaderboardPage.js` | metric toggle "Trust score" / "Reward points" | Public leaderboard |

### Verified-badge sibling

The trust system pairs with `User.verifiedBadge: Boolean` (also on the User schema) which admins toggle via `PUT /api/users/:id/verify` (`backend/routes/users.js`). The badge renders alongside trust score everywhere `verifiedBadge` appears.

### 🔍 grep keywords

```
trustScore               # field
clampTrustScore          # helper
verifiedBadge            # paired feature
$inc: { trustScore       # all score-mutation sites
```

### 🗂 Schema fields

- `User.trustScore: Number` (0–100, default 50)
- `User.verifiedBadge: Boolean` (admin-set)
- `User.points: Number` (separate from trust — gamification only)

### 🌐 API touchpoints

- `GET /api/leaderboard?metric=trust` — public leaderboard
- `GET /api/users/me/full` — own trust score + stats
- `GET /api/users` (admin) — list with trust filter
- `PUT /api/users/:id/verify` (admin, `requireObjectId`) — toggle the verified badge

### 🧪 Manual test

1. Register two users — both should start at `trustScore: 50` in DB.
2. As admin, approve a claim by user B → B's trust should be 60, poster's +5.
3. Reject another claim by user B → B's trust should drop to 55.
4. Reject **3 claims** by user B in a row → on the 3rd rejection trust drops by 5 + 15 = 20 (then clamped at 0 if it goes negative).
5. Bring B's trust ≥ 70, then run matching → matches involving B's lost reports should score 5 points higher than equivalent reports from a low-trust user.
6. Check `GET /api/leaderboard?metric=trust` — B should be near the top.

---

## Bonus: routes added in the Phase A security pass

These aren't part of the 5 SRS features above, but they exist now and are worth knowing:

| Endpoint | Purpose |
| --- | --- |
| `POST /api/auth/refresh` | Reads the httpOnly `findit_rt` cookie, validates `tokenVersion`, rotates the refresh token, returns a new 15-min access JWT. |
| `POST /api/auth/logout` | Bumps `User.tokenVersion` (invalidating every active refresh token for this user) and clears the `findit_rt` cookie. |
| `GET /api/chat/file/:filename` | Authenticated download for chat attachments. Re-checks conversation membership before streaming the file from `uploads/chat-private/`. |
| `GET /api/ready` | Readiness probe — 503 until Mongo is connected. Wire this into Render/Railway/Heroku health checks. |

## Bonus: files added in the Phase B pass

| File | Role |
| --- | --- |
| `frontend/src/api/tokenStore.js` | Module-level holder for the 15-min access token. Lives in JS memory only — never `localStorage`. |
| `frontend/src/api/client.js` | Installs global axios interceptors: attaches `Authorization: Bearer <access>` from memory; on 401 dedupes a single concurrent `/api/auth/refresh` call and retries the original request. |
| `frontend/src/components/ErrorBoundary.js` | React class-based boundary wrapping `<App />`; replaces white-screen JS errors with a recovery card. |
| `backend/middleware/validate.js` | Generic `validate({ body, query, params })` Zod middleware. |
| `backend/schemas/auth.schemas.js` | `registerBody`, `loginBody`, `twoFaLoginBody`, `forgotPasswordBody`, `resetPasswordBody` — strict-object Zod shapes applied to `routes/auth.js`. |
| `backend/tests/*` | Jest + Supertest + `mongodb-memory-server` regression suite (17 assertions, run via `npm test`). |

---

## Cheat-sheet: where to look for what

| If you need to… | Open this first |
|---|---|
| See **all DB schemas** | `backend/models/` (User.js, Item.js, OtherModels.js, Phase2Models.js) |
| See **all routes** | `backend/server.js` (~167-178 mounts everything) → `backend/routes/*.js` |
| See **all middleware** | `backend/middleware/` (auth, security, rateLimiters, asyncHandler) |
| See **all utilities** | `backend/utils/` (env, logger, crypto, upload, email) |
| Add a new **socket event** | server side: emit with `req.io.to(userId).emit(...)` (see claims.js or matches.js for examples). client side: subscribe in `frontend/src/components/Layout.js` |
| Add a new **email template** | `backend/utils/email.js` already has `wrap(title, body)`; call `sendEmail({...})` from any route. **Always HTML-escape user-supplied values before interpolation.** |
| Add a new **cron job** | duplicate `backend/cron/expiry.js` pattern, then `require('./cron/<name>')(io)` in `server.js` |
| Wire a new **notification kind** | append to the `type` enum in `OtherModels.js` (line 24), then create with `Notification.create({ type, ... })` |
| Extend the **matching algorithm** | `backend/routes/matches.js` → `calculateMatchScore` |
| Tweak **trust score deltas** | `backend/routes/claims.js` — search `$inc: { trustScore` |
| Add a new **rate limiter** | `backend/middleware/rateLimiters.js` — copy an existing limiter, mount in the route |
| Add a new **upload field** | use `makeImageUpload(subdir, { maxBytes })` from `backend/utils/upload.js` and follow up with `verifyMagicBytesMiddleware` |
| Add a new **request schema** | drop a Zod shape into `backend/schemas/<area>.schemas.js`, then in the route: `validate({ body: mySchema }), asyncHandler(handler)` |
| Add a new **regression test** | mirror the structure of `backend/tests/security.test.js`. The factory `tests/app.factory.js` builds the same Express stack supertest can hit — no real DB / port needed. |
| Use the **token in memory from a custom hook** | `import { getAccessToken } from '../api/tokenStore'`; subscribe to changes with `onAccessTokenChange(cb)` if you need reactivity outside React |

---

## How to verify the whole feature set quickly

```powershell
# Terminal 1
cd findit-fixed\backend
npm run dev

# Terminal 2
cd findit-fixed\frontend
npm start
```

Then in the browser:
1. Set `ALLOW_ADMIN_BOOTSTRAP=true` in `backend/.env`, register two users (one becomes admin via `POST /api/auth/first-admin`), then unset `ALLOW_ADMIN_BOOTSTRAP`.
2. Walk through each feature using the **🧪 Manual test** recipe under each section above.
3. Liveness/readiness:
   - `curl http://localhost:5000/api/health` (always 200)
   - `curl http://localhost:5000/api/ready` (200 once Mongo connects)

If anything 404s or returns the wrong shape, grep one of the **🔍 grep keywords** listed under that feature — it'll take you straight to the file.
