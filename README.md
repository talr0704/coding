# 🚀 CodeKids — Your Class Coding Platform

A Trinket-style coding platform for your students, hosted free on GitHub Pages.
Students sign in with Google, write Python or HTML/CSS, and save their projects.

---

## ✅ Features

- 🐍 **Python** — runs in the browser with Skulpt (no install needed!)
- 🌐 **HTML & CSS** — live preview panel
- 📁 **Multiple files** per project
- 💾 **Save projects** — stored in Firebase Firestore per student
- 🔐 **Google Sign-In** — students use their school Google accounts
- 🎨 **Fun colorful UI** kids will love

---

## 🛠️ Setup Guide (15 minutes)

### Step 1 — Fork / Copy this repo to GitHub

1. Create a new GitHub repository (public or private)
2. Upload all these files to it

### Step 2 — Create a Firebase project (free)

1. Go to [https://console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → name it (e.g. `codekids-myclass`)
3. Disable Google Analytics (not needed) → **Create project**

### Step 3 — Enable Google Sign-In

1. In Firebase Console → **Authentication** → **Get started**
2. Click **Google** → Enable → add your email as support email → **Save**

### Step 4 — Create Firestore Database

1. In Firebase Console → **Firestore Database** → **Create database**
2. Choose **Start in production mode** → pick a location → **Done**
3. Go to **Rules** tab and replace with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/projects/{projectId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

4. Click **Publish**

### Step 5 — Add your web app & get config

1. In Firebase Console → Project Settings (gear icon) → **Your apps** → click `</>`
2. Register app with a nickname (e.g. `codekids-web`)
3. Copy the `firebaseConfig` object values
4. Open **`js/config.js`** in this repo and paste your values:

```js
export const FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

### Step 6 — Add your GitHub Pages domain to Firebase

1. Firebase Console → **Authentication** → **Settings** → **Authorised domains**
2. Click **Add domain** → enter: `yourusername.github.io`

### Step 7 — Enable GitHub Pages

1. In your GitHub repo → **Settings** → **Pages**
2. Source: **Deploy from a branch** → branch: `main` → folder: `/ (root)`
3. Click **Save**
4. Your site will be live at: `https://yourusername.github.io/your-repo-name/`

---

## 📖 How Students Use It

1. Open your GitHub Pages URL
2. Click **Sign in with Google** (uses their school account)
3. Click **+ New Project** → choose Python or HTML & CSS
4. Write code in the editor → click **▶ Run**
5. Click **💾 Save** (or it auto-saves every 30 seconds)

---

## 💡 Tips for Teachers

- **Share the URL** with students — bookmark it!
- Projects are **private per student** — only they can see their own work
- Students can create **unlimited projects** on the free Firebase tier
- Python supports `input()` — an input box will appear at the bottom
- Multi-file Python projects: use the **+ File** button to add `helper.py` modules

---

## 🔧 Customization

- **Change the site name**: search for `CodeKids` in HTML files and replace it
- **Add a teacher view**: you could add a Firestore collection rule for a teacher UID to read all student projects
- **Theme**: all colors are CSS variables in `css/style.css`

---

## 📦 File Structure

```
codekids/
├── index.html          ← Landing / login page
├── dashboard.html      ← Student's project list
├── editor.html         ← Code editor (Skulpt + HTML preview)
├── css/
│   └── style.css       ← All styles
├── js/
│   └── config.js       ← ⚠️ YOUR FIREBASE CONFIG GOES HERE
└── README.md
```

---

## 🆓 Firebase Free Tier Limits

The Spark (free) plan gives you:
- 50,000 reads/day, 20,000 writes/day, 20,000 deletes/day
- 1 GB storage
- Plenty for a classroom of 30 students!
