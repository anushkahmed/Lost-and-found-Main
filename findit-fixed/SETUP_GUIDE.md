# FindIt — Lost & Found MERN App
## Complete Setup Guide (Beginner-Friendly)

---

## PROJECT STRUCTURE

```
findit/
├── backend/
│   ├── models/
│   │   ├── User.js              ← MongoDB user schema
│   │   ├── Item.js              ← MongoDB found items schema
│   │   └── OtherModels.js       ← LostReport, Notification, Announcement, Match, Claim
│   ├── routes/
│   │   ├── auth.js              ← Register / Login
│   │   ├── items.js             ← Feature 1 & 2: Post + Search
│   │   ├── matches.js           ← Feature 3: Matching algorithm
│   │   ├── claims.js            ← Feature 4: Claims + Notifications
│   │   ├── notifications.js     ← Feature 4: Read/mark notifications
│   │   └── announcements.js     ← Feature 5: Broadcast
│   ├── middleware/
│   │   └── auth.js              ← JWT token verification
│   ├── .env                     ← Environment variables
│   ├── server.js                ← Entry point
│   └── package.json
│
└── frontend/
    ├── public/
    │   └── index.html
    └── src/
        ├── context/
        │   ├── AuthContext.js   ← Global login state
        │   └── SocketContext.js ← Socket.io connection
        ├── pages/
        │   ├── LoginPage.js
        │   ├── RegisterPage.js
        │   ├── DashboardPage.js       ← Live stats from API
        │   ├── PostItemPage.js        ← Feature 1
        │   ├── SearchPage.js          ← Feature 2
        │   ├── MatchingPage.js        ← Feature 3
        │   ├── NotificationsPage.js   ← Feature 4
        │   └── AnnouncementsPage.js   ← Feature 5
        ├── components/
        │   └── Layout.js        ← Sidebar + topbar + toasts
        ├── App.js               ← Routes
        └── index.js
```

---

## STEP 1 — Install Node.js & MongoDB

### Node.js
1. Go to https://nodejs.org
2. Download the LTS version and install it
3. Open a terminal and check: `node --version` (should show v18 or higher)

### MongoDB
**Option A — MongoDB Atlas (free cloud, recommended for beginners)**
1. Go to https://www.mongodb.com/cloud/atlas
2. Create a free account
3. Create a free cluster (M0 Free)
4. Click "Connect" → "Connect your application"
5. Copy the connection string — looks like:
   `mongodb+srv://yourname:password@cluster0.xxxxx.mongodb.net/findit`
6. Paste it in `backend/.env` as `MONGO_URI=...`

**Option B — Local MongoDB**
1. Download from https://www.mongodb.com/try/download/community
2. Install it — MongoDB runs on `mongodb://localhost:27017`
3. The `.env` already has: `MONGO_URI=mongodb://localhost:27017/findit`

---

## STEP 2 — Set Up the Backend

Open a terminal in the `findit/backend` folder:

```bash
cd findit/backend
npm install
```

This installs: Express, Mongoose, Socket.io, JWT, bcrypt, multer, cors, dotenv, nodemon.

### Edit the .env file
```
PORT=5000
MONGO_URI=mongodb://localhost:27017/findit     ← or your Atlas URL
JWT_SECRET=pick_any_long_random_string_here
NODE_ENV=development
```

### Start the backend
```bash
npm run dev
```

You should see:
```
🚀 Server running on http://localhost:5000
✅ MongoDB connected
```

---

## STEP 3 — Set Up the Frontend

Open a **second terminal** in `findit/frontend`:

```bash
cd findit/frontend
npm install
npm start
```

The React app opens at http://localhost:3000

---

## STEP 4 — Create Your First Admin User

The first user you register will be a regular user.
To make someone admin, open MongoDB Compass or Atlas, find the `users` collection,
and change their `role` field from `"user"` to `"admin"`.

OR add this one-time script to `backend/server.js` after the mongoose.connect:
```javascript
// Run once to make yourself admin — then remove this block
const User = require('./models/User');
User.findOneAndUpdate({ email: 'your@email.com' }, { role: 'admin' }).then(() => {
  console.log('Made admin!');
});
```

---

## API ENDPOINTS REFERENCE

### Auth
| Method | Endpoint            | Description         | Auth needed |
|--------|---------------------|---------------------|-------------|
| POST   | /api/auth/register  | Create account      | No          |
| POST   | /api/auth/login     | Login               | No          |
| GET    | /api/auth/me        | Get my profile      | Yes         |

### Items (Feature 1 & 2)
| Method | Endpoint        | Description                           | Auth needed |
|--------|-----------------|---------------------------------------|-------------|
| POST   | /api/items      | Post a found item                     | Yes         |
| GET    | /api/items      | Search/filter items (query params)    | No          |
| GET    | /api/items/:id  | Get single item                       | No          |
| PUT    | /api/items/:id  | Update item status                    | Yes         |
| DELETE | /api/items/:id  | Delete item                           | Admin only  |

**Search query params for GET /api/items:**
```
?search=backpack        ← text search
&category=Bags          ← filter by category
&colour=blue            ← filter by colour
&location=library       ← filter by location
&date=2026-04-18        ← filter by date
&status=found           ← filter by status
&page=1&limit=12        ← pagination
```

### Matches (Feature 3)
| Method | Endpoint                | Description              | Auth needed |
|--------|-------------------------|--------------------------|-------------|
| POST   | /api/matches/run        | Run matching algorithm   | Admin only  |
| GET    | /api/matches            | Get all matches          | Yes         |
| PUT    | /api/matches/:id        | Confirm/reject a match   | Admin only  |
| POST   | /api/matches/report-lost | Submit lost item report | Yes         |

### Claims & Notifications (Feature 4)
| Method | Endpoint                        | Description           | Auth needed |
|--------|---------------------------------|-----------------------|-------------|
| POST   | /api/claims                     | Submit a claim        | Yes         |
| GET    | /api/claims                     | Get claims            | Yes         |
| PUT    | /api/claims/:id                 | Approve/reject claim  | Admin only  |
| GET    | /api/notifications              | Get my notifications  | Yes         |
| PUT    | /api/notifications/:id/read     | Mark one read         | Yes         |
| PUT    | /api/notifications/read-all     | Mark all read         | Yes         |

### Announcements (Feature 5)
| Method | Endpoint               | Description             | Auth needed |
|--------|------------------------|-------------------------|-------------|
| GET    | /api/announcements     | Get all announcements   | No          |
| POST   | /api/announcements     | Create announcement     | Admin only  |
| DELETE | /api/announcements/:id | Delete announcement     | Admin only  |

---

## SOCKET.IO EVENTS

| Event             | Direction       | Triggered when                       |
|-------------------|-----------------|--------------------------------------|
| item:new          | Server → All    | A new found item is posted           |
| item:claim        | Server → Poster | Someone claims their item            |
| item:status       | Server → All    | Item status changes                  |
| match:found       | Server → User   | System finds a match for your report |
| claim:approved    | Server → User   | Admin approves your claim            |
| announcement:new  | Server → All    | Admin posts an announcement          |

---

## COMMON ERRORS & FIXES

**"MongoDB connection failed"**
→ Check your MONGO_URI in .env
→ If using Atlas, make sure your IP is whitelisted in Network Access

**"Not authorized, no token"**
→ You're calling a protected route without logging in first
→ Login first, the app stores the token automatically

**"CORS error" in browser**
→ Make sure backend .env has PORT=5000 and frontend proxy is set to http://localhost:5000

**Images not uploading**
→ The `uploads/` folder is created automatically by multer
→ Make sure the backend is running with write permissions

**"Cannot find module"**
→ Run `npm install` again in both backend and frontend folders

---

## HOW EACH FEATURE WORKS (FLOW)

### Feature 1 — Post Found Item
```
User fills form → React sends FormData to POST /api/items
→ Multer saves images to uploads/ folder
→ Mongoose saves document to MongoDB items collection
→ Socket.io emits item:new to all connected users
→ Success message shown to user
```

### Feature 2 — Search & Filter
```
User types/selects filters → React builds query string
→ GET /api/items?search=bag&category=Bags&colour=blue...
→ Express builds MongoDB query with $text search + field filters
→ MongoDB returns matching documents with pagination
→ React renders the results dynamically
→ User clicks item → sees detail modal → can submit claim
```

### Feature 3 — Matching System
```
Admin clicks "Run Matching Algorithm"
→ POST /api/matches/run
→ Server fetches all found items + all lost reports from MongoDB
→ Algorithm scores each pair on 4 criteria (0-100)
→ Pairs scoring 60+ saved to matches collection
→ Socket.io notifies the person who reported the item as lost
→ Admin sees matches, confirms or rejects them
→ On confirm: item status → 'claimed', lost report → 'matched'
```

### Feature 4 — Notifications
```
Various events create Notification documents in MongoDB:
  - New claim on your item
  - Match found for your lost report
  - Claim approved/rejected
  
Socket.io emits the event in real-time to the user's room
→ User sees toast notification
→ NotificationsPage fetches all notifications from API
→ User can filter by type, mark as read
```

### Feature 5 — Announcements
```
Admin fills form → POST /api/announcements
→ Saved to MongoDB announcements collection
→ Socket.io emits announcement:new to ALL connected clients
→ Every user sees a toast notification immediately
→ AnnouncementsPage fetches and displays all announcements
→ Live announcements (from socket) show "LIVE" badge
```
