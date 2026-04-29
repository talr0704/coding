# CodeKids — MindPlay Business Project

## What is this?
A browser-based coding platform for kids. Students write Python or HTML/CSS code directly in the browser, see output in real time, and save projects to the cloud. Teachers manage students via Zapier integration.

## Tech Stack
- **Frontend:** Plain HTML/CSS/JS — hosted on GitHub Pages (no build step)
- **Python runtime:** Skulpt 1.2.0 (runs Python in the browser, no server needed)
- **Code editor:** CodeMirror 5
- **Backend:** Firebase (Auth + Firestore + Storage + Functions)
- **Student management:** Zapier → Firebase Functions

## Firebase Project
- **Project ID:** `mindplay-code`
- **Project name:** MindPlay
- **Config file:** `js/config.js`
- **Region:** us-central1 (Functions), me-west1/us-east1 (Firestore/Storage)

## Repository
- **Business GitHub:** (insert business GitHub URL here)
- **Branch for development:** create `claude/...` branches, PR into `main`
- **Hosting:** GitHub Pages from `main` branch — auto-deploys on merge

## Key Files
| File | Purpose |
|------|---------|
| `index.html` | Login page (Google + Email/Password) |
| `dashboard.html` | Student's project list |
| `editor.html` | Code editor (Python + HTML/CSS) |
| `trial.html` | Trial lesson — no login required |
| `p.html` | Public project preview (shareable link) |
| `js/config.js` | Firebase config — **business project credentials** |
| `js/auth.js` | Auth helpers (Google, Email, password reset) |
| `js/projects.js` | Firestore CRUD for projects |
| `js/runner.js` | Skulpt Python runner + Turtle engine bridge |
| `js/turtle-engine.js` | Custom turtle graphics (3-canvas architecture) |
| `functions/index.js` | Firebase Cloud Functions (Node.js 22) |
| `firestore.rules` | Firestore security rules |
| `storage.rules` | Storage security rules |

## Firebase Functions
| Function | Type | Purpose |
|----------|------|---------|
| `updateStudentStatus` | HTTP (Zapier webhook) | Creates/enables/disables students |
| `createStudentAccount` | Callable (teacher only) | Creates email+password account for student |
| `cleanupExpiredStudents` | Scheduled (daily) | Deletes data of students withdrawn 6+ months |

## Firestore Structure
```
/users/{uid}/projects/{projectId}
  title, type, code, images[], createdAt, updatedAt

/authorizedStudents/{email}
  name, status ("active"|"withdrawn"|"expired"), role ("student"|"teacher")
  withdrawnAt, uid, updatedAt

/publicProjects/{publicId}
  title, type, code, images[], publishedAt
```

## Student Authorization Flow
1. Zapier sends POST to Firebase Function with email + status
2. Function updates Firestore `authorizedStudents` + Firebase Auth
3. On login: app reads `authorizedStudents/{email}` — blocks if not active
4. Withdrawn students: 6-month grace period, then auto-deleted by scheduled function

## Teacher Features
- Teachers have `role: "teacher"` in `authorizedStudents` (set manually in Firestore Console)
- Dashboard shows "👤 Create Student Account" button for teachers only
- Teacher can create email+password accounts for students who can't use Google

## Deployment
```bash
# Pull latest from GitHub
git pull origin main

# Deploy functions (after changes to functions/index.js)
firebase deploy --only functions

# Deploy Firestore rules (after changes to firestore.rules)
firebase deploy --only firestore:rules

# Frontend deploys automatically via GitHub Pages on merge to main
```

## First-time Setup (new machine)
```bash
npm install -g firebase-tools
firebase login
cd functions && npm install && cd ..
firebase functions:secrets:set ZAPIER_SECRET
firebase deploy --only functions
firebase deploy --only firestore:rules
```

## Zapier Webhook
- **URL:** `https://us-central1-mindplay-code.cloudfunctions.net/updateStudentStatus`
- **Method:** POST
- **Header:** `x-zapier-secret: [secret set via firebase functions:secrets:set ZAPIER_SECRET]`
- **Body:**
```json
{
  "email": "student@gmail.com",
  "name": "Student Name",
  "status": "active",
  "role": "student"
}
```
- Status values: `active`, `enrolled`, `withdrawn`, `inactive`, `cancelled`, `פעיל`, `פרש`

## Authentication Flow
- Google Sign-In (primary — recommended for kids)
- Email/Password (fallback — teacher creates account for student)
- After sign-in: checks `authorizedStudents/{email}` — unauthorized users are signed out immediately
- "Forgot password?" button sends Firebase reset email

## Trial Lesson
- URL: `/trial.html`
- No login required — full Python + Turtle editor
- Code is NOT saved
- Banner encourages students to join the course

## Costs
- Firebase Blaze plan (pay-as-you-go) with free tier included
- Expected cost for a normal school: near zero
- 6-month auto-cleanup prevents data accumulation from inactive students

## Important Notes
- `js/config.js` is the ONLY file that differs from the personal project (talr0704/coding)
- Never store passwords in Firestore — Firebase Auth handles encryption
- `role: "teacher"` must be set manually in Firestore Console for each teacher
- The `withdrawnAt` timestamp is only set ONCE (first withdrawal) — doesn't reset if Zapier sends the same status again
