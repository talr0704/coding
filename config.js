// ============================================================
//  STEP 1: Replace the values below with YOUR Firebase config
//  Get these from: Firebase Console → Project Settings → Web App
// ============================================================

export const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// ============================================================
//  STEP 2: In Firebase Console → Authentication → Sign-in method
//           Enable "Google" as a provider
//
//  STEP 3: In Firebase Console → Firestore Database
//           Create a database in production mode, then add rules:
//
//  rules_version = '2';
//  service cloud.firestore {
//    match /databases/{database}/documents {
//      match /users/{userId}/projects/{projectId} {
//        allow read, write: if request.auth != null && request.auth.uid == userId;
//      }
//    }
//  }
//
//  STEP 4: In Firebase Console → Authentication → Settings
//           Add your GitHub Pages domain to "Authorised domains"
//           e.g. yourname.github.io
// ============================================================
