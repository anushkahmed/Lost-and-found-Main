# FindIt — Lost & Found Campus Portal

A complete MERN-stack platform for university campuses to report lost items, post found items, securely claim ownership, chat with finders, and let admins moderate everything end-to-end.

Built with MongoDB, Express.js, React.js, Node.js, Socket.io, and a stack of supporting libs (Leaflet, Recharts, Speakeasy, jsPDF, Nodemailer, etc.).

---

## Quick start

### Prerequisites
- Node.js **18+**
- MongoDB running locally on `27017` (or a Mongo Atlas URI)
- npm 9+

### 1. Backend
```bash
cd backend
npm install
cp .env.example .env   # then edit values, see "Environment variables" below
npm run dev            # starts nodemon on http://localhost:5000
```

### 2. Frontend
```bash
cd frontend
npm install
npm start              # serves http://localhost:3000
```

### 3. First admin
After registering one account, run once to promote yourself to admin:
```bash
curl -X POST http://localhost:3000/api/auth/first-admin
```
Or use `POST /api/auth/make-admin` with the `ADMIN_SECRET` from your `.env`.

---

## Environment variables (`backend/.env`)

| Var | Required | Purpose |
| --- | --- | --- |
| `MONGO_URI` | ✅ | MongoDB connection string |
| `JWT_SECRET` | ✅ | Used to sign auth + 2FA tokens |
| `ADMIN_SECRET` | ✅ | Shared secret for `/api/auth/make-admin` |
| `PORT` | ⬜ | Defaults to 5000 |
| `FRONTEND_URL` | ⬜ | Used in password-reset links (default `http://localhost:3000`) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` / `SMTP_SECURE` | ⬜ | Enables real email. Without these, email is silently skipped (dev mode) |

---

## Feature matrix

### User
- Email/password auth with **JWT**
- **TOTP 2FA** (Google Authenticator / Authy) with QR code setup
- **Forgot / reset password** with hashed-token links (30-min TTL)
- Profile editing, **avatar upload**, account deactivation
- **Reward points** + **trust score** + verified badge

### Items
- Post found items with multiple images, category, colour, brand, location, date
- **High-value flag** (requires admin approval before claiming)
- **Pin-drop on map** with click-to-pin or "Use my location"
- **Ownership questions** (poster-defined) that claimants must answer
- Edit, status update, **renewal**, **30-day auto expiry** + 60-day archive (cron)
- **Item history** (immutable audit log of every status change / edit / claim outcome)

### Search & matching
- Text + filter (category, colour, location, date, status)
- **Geo search**: "Search near me" with radius slider (haversine distance)
- **Lost-item reports** with automatic match scoring (category, colour, location, date, value, trust)
- Admin-triggered match runner with confirm/reject workflow

### Claims
- Submit a claim with description + ownership question answers
- Admin approve/reject; trust-score and reward-points adjustments
- Real-time socket alert + email notification on outcome

### Communication
- **In-app chat** (1-to-1) with file attachments, typing indicators, and unread badges
- Real-time **announcements** (admin-only); urgent ones are broadcast over email

### Admin
- User management (role / activate / verify badge)
- **Abuse reports** queue (resolve / dismiss with notes)
- **Analytics dashboard** with monthly trends, by-category / by-status, recovery rate, top-trust leaderboard
- **CSV / PDF exports** of full report data
- **Heatmap** of pin-dropped items across campus (Leaflet circle markers, density-sized)
- High-value approval, fake-listing removal, system-wide announcements

### System utilities
- **Light / dark theme** with persistence
- **Mobile-responsive** layout with collapsible drawer sidebar
- **PWA**: installable, offline-capable shell, custom icons, manifest
- Socket.io for live notifications and chat

---

## Project structure

```
findit-fixed/
├── backend/
│   ├── server.js                # Express + Socket.io entry
│   ├── cron/expiry.js           # 25/30/60-day reminders + archiving
│   ├── middleware/auth.js       # JWT + active-account guard
│   ├── models/
│   │   ├── User.js              # auth, trust, points, 2FA, reset token
│   │   ├── Item.js              # found-item with coordinates, ownership Q's
│   │   ├── OtherModels.js       # LostReport, Match, Claim, Notification, Announcement, Conversation, Message
│   │   └── Phase2Models.js      # ItemHistory, AbuseReport
│   ├── routes/
│   │   ├── auth.js              # login, register, 2FA, forgot/reset
│   │   ├── twofa.js             # setup / verify / disable
│   │   ├── items.js             # CRUD + geo + heatmap + history
│   │   ├── claims.js            # submit + approve/reject + emails
│   │   ├── matches.js           # lost reports + matching
│   │   ├── chat.js              # conversations + messages
│   │   ├── users.js             # profile, avatar, admin user mgmt
│   │   ├── abuse.js             # report + admin queue
│   │   ├── adminReports.js      # /analytics + /report (CSV/PDF)
│   │   ├── leaderboard.js       # ranked users by points/trust
│   │   ├── announcements.js     # admin broadcasts (+ email blast for urgent)
│   │   └── notifications.js
│   └── utils/email.js           # nodemailer wrapper (no-op without SMTP_*)
└── frontend/
    ├── public/
    │   ├── manifest.json        # PWA manifest
    │   ├── service-worker.js    # offline shell
    │   └── icon-{192,512}.svg
    └── src/
        ├── App.js               # routes + providers
        ├── theme.css            # light-theme CSS-filter trick
        ├── context/
        │   ├── AuthContext.js   # login + loginWith2fa + logout
        │   ├── SocketContext.js
        │   └── ThemeContext.js
        ├── components/
        │   ├── Layout.js        # sidebar, drawer, theme + chat-unread badges
        │   ├── MapPicker.js     # Leaflet click-to-pin
        │   ├── TwoFactorSection.js
        │   ├── ItemHistoryViewer.js
        │   └── OwnershipQuestionsForm.js
        └── pages/
            ├── LoginPage.js / RegisterPage.js
            ├── ForgotPasswordPage.js / ResetPasswordPage.js
            ├── DashboardPage.js / ProfilePage.js
            ├── PostItemPage.js / SearchPage.js / MatchingPage.js
            ├── NotificationsPage.js / AnnouncementsPage.js
            ├── ChatPage.js / LeaderboardPage.js
            ├── AdminUsersPage.js / AdminAbusePage.js
            ├── AdminAnalyticsPage.js / AdminMapPage.js
            └── ...
```

---

## Key API endpoints (cheat sheet)

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | – | |
| POST | `/api/auth/login` | – | Returns `{ needsTwoFactor, twoFactorToken }` for 2FA users |
| POST | `/api/auth/2fa/login` | – | Exchanges temp token + TOTP code for JWT |
| POST | `/api/auth/forgot-password` | – | Emails reset link (or returns `devResetUrl` if SMTP off) |
| POST | `/api/auth/reset-password` | – | `{ token, email, password }` |
| POST | `/api/2fa/setup` | user | Returns QR + secret |
| POST | `/api/2fa/verify` | user | Enables 2FA after code submitted |
| POST | `/api/2fa/disable` | user | Requires password |
| GET  | `/api/items` | – | `?search&category&lat&lng&radius&...` |
| POST | `/api/items` | user | Multipart form, supports `lat`, `lng`, `isHighValue`, `ownershipQuestions` |
| PUT  | `/api/items/:id/renew` | owner/admin | Resets 30-day expiry |
| GET  | `/api/items/:id/history` | owner/admin | Audit log |
| GET  | `/api/items/meta/heatmap` | admin | All pinned items |
| POST | `/api/claims` | user | `{ itemId, description, answers }` |
| PUT  | `/api/claims/:id` | admin | `{ status: approved|rejected }` |
| POST | `/api/matches/report-lost` | user | File a lost report |
| POST | `/api/matches/run` | admin | Run matching algorithm |
| GET  | `/api/admin/analytics` | admin | Charts + summary |
| GET  | `/api/admin/report?format=csv\|pdf` | admin | Downloadable report |
| POST | `/api/abuse` | user | File abuse report |
| GET  | `/api/abuse?status=open` | admin | Triage queue |
| GET  | `/api/leaderboard?metric=points\|trust` | user | Ranked users |

---

## Cron jobs

`backend/cron/expiry.js` runs daily at 02:00 server time:
- **25 days** since post → reminder email + in-app notification ("expiring soon")
- **30 days** → status set to `expired`
- **60 days** → `archived: true` (hidden from search)

Owners can renew with `PUT /api/items/:id/renew` to push expiry forward 30 more days.

---

## Tech stack

**Backend:** express, mongoose, jsonwebtoken, bcryptjs, multer, socket.io, node-cron, nodemailer, speakeasy, qrcode, papaparse, jspdf

**Frontend:** react, react-router-dom, axios, socket.io-client, leaflet, react-leaflet, recharts

---

## Development tips

- The backend logs `ℹ Email disabled` on startup if SMTP isn't set — that's normal in dev.
- The forgot-password endpoint returns the reset URL in the response body when SMTP is off so you can still test the flow.
- Frontend service worker only registers in production builds (`npm run build`); dev server skips it to avoid stale-cache headaches.
- 2FA test secrets in dev: any time-synced TOTP app works (Google Authenticator, Authy, 1Password, etc.).
- Mongo indexes are auto-created on first insert; the text index on `Item.name/description/foundLocation` powers the keyword search.

---

## License

Project assignment build — feel free to fork for educational purposes.
