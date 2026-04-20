// ── auth.js ──────────────────────────────────────────────────────────────────
// Google Sign-In, Email/Password Sign-up & Login, Account Linking
// ─────────────────────────────────────────────────────────────────────────────
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  linkWithCredential,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

let _auth = null;
const _googleProvider = new GoogleAuthProvider();

export function initAuth(app) {
  _auth = getAuth(app);
  setPersistence(_auth, browserLocalPersistence).catch(console.error);
  return _auth;
}

export function onAuthChange(callback) {
  return onAuthStateChanged(_auth, callback);
}

export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(_auth, _googleProvider);
    return { user: result.user, error: null };
  } catch (err) {
    if (err.code === "auth/account-exists-with-different-credential") {
      return {
        user: null,
        error: err,
        needsLinking: true,
        pendingCred: GoogleAuthProvider.credentialFromError(err),
        email: err.customData?.email
      };
    }
    return { user: null, error: err };
  }
}

export async function signUpEmail(email, password) {
  try {
    const result = await createUserWithEmailAndPassword(_auth, email, password);
    return { user: result.user, error: null };
  } catch (err) {
    return { user: null, error: err };
  }
}

export async function signInEmail(email, password) {
  try {
    const result = await signInWithEmailAndPassword(_auth, email, password);
    return { user: result.user, error: null };
  } catch (err) {
    // Check if this email has different provider (e.g. Google)
    if (err.code === "auth/wrong-password" || err.code === "auth/user-not-found") {
      try {
        const methods = await fetchSignInMethodsForEmail(_auth, email);
        if (methods.length > 0 && !methods.includes("password")) {
          return {
            user: null,
            error: err,
            needsProviderSwitch: true,
            providers: methods
          };
        }
      } catch (_) { /* ignore */ }
    }
    return { user: null, error: err };
  }
}

// Link a pending Google credential to an existing email/password account.
// Called after user proved identity by signing in with email+password.
export async function linkGoogleToEmailAccount(email, pendingCred, password) {
  try {
    const result = await signInWithEmailAndPassword(_auth, email, password);
    await linkWithCredential(result.user, pendingCred);
    return { user: result.user, error: null };
  } catch (err) {
    return { user: null, error: err };
  }
}

export async function doSignOut() {
  return signOut(_auth);
}

export async function sendPasswordReset(email) {
  try {
    const { sendPasswordResetEmail } = await import(
      "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js"
    );
    await sendPasswordResetEmail(_auth, email);
    return { error: null };
  } catch (err) {
    return { error: err };
  }
}

// Maps Firebase auth error codes to friendly Hebrew messages.
export function getAuthErrorMsg(error) {
  const map = {
    "auth/email-already-in-use":                "כתובת האימייל כבר רשומה. נסה להתחבר במקום זאת.",
    "auth/invalid-email":                       "כתובת האימייל אינה תקינה.",
    "auth/operation-not-allowed":               "שיטת הכניסה אינה מופעלת — בדוק את הגדרות Firebase.",
    "auth/weak-password":                       "הסיסמה חלשה מדי — נדרשים לפחות 6 תווים.",
    "auth/user-not-found":                      "לא נמצא משתמש עם האימייל הזה.",
    "auth/wrong-password":                      "הסיסמה שגויה.",
    "auth/invalid-credential":                  "פרטי הכניסה שגויים.",
    "auth/too-many-requests":                   "יותר מדי ניסיונות כניסה. נסה שוב מאוחר יותר.",
    "auth/popup-closed-by-user":                "",   // silent — user closed popup
    "auth/cancelled-popup-request":             "",
    "auth/network-request-failed":              "שגיאת רשת. בדוק את חיבור האינטרנט.",
    "auth/account-exists-with-different-credential":
      "קיים חשבון עם כתובת האימייל הזו. אנא עיין בהנחיות לקישור החשבונות."
  };
  return map[error?.code] || (error?.message ? `שגיאה: ${error.message}` : "שגיאה לא ידועה.");
}
