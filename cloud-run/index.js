// Cloud Run endpoint: POST /updatestudentstatus
// Receives student status updates from Zapier and syncs with Firebase Auth + Firestore.
//
// Environment variables (set in Cloud Run):
//   ZAPIER_SECRET   — shared secret; Zapier must send it as X-Zapier-Secret header
//   GOOGLE_APPLICATION_CREDENTIALS — set automatically by Cloud Run (ADC)
//
// Expected POST body (JSON):
//   {
//     "email":  "student@gmail.com",   // required
//     "name":   "Student Name",        // optional
//     "status": "active" | "withdrawn" // required  (also accepts "Active","Withdrew",etc.)
//   }

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth }      from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import express          from 'express';

initializeApp({ credential: applicationDefault() });

const adminAuth = getAuth();
const db        = getFirestore();
const server    = express();
server.use(express.json());

// Normalise varied status strings from Zapier to "active" | "withdrawn"
function normaliseStatus(raw = '') {
  const s = raw.toLowerCase().trim();
  if (['active', 'enrolled', 'registered', 'פעיל'].includes(s))   return 'active';
  if (['withdrawn', 'inactive', 'cancelled', 'canceled',
       'withdrew', 'left', 'פרש', 'לא פעיל'].includes(s))         return 'withdrawn';
  return null;
}

server.post('/updatestudentstatus', async (req, res) => {
  // ── 1. Authenticate the request ──────────────────────────────
  const secret = process.env.ZAPIER_SECRET;
  if (secret && req.headers['x-zapier-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // ── 2. Parse & validate body ──────────────────────────────────
  const { email, name = '', status: rawStatus } = req.body ?? {};
  const status = normaliseStatus(rawStatus);

  if (!email || !status) {
    return res.status(400).json({
      error: 'Missing or invalid fields',
      required: { email: 'string', status: 'active | withdrawn' }
    });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const isActive = status === 'active';

  try {
    // ── 3. Sync Firestore allowlist ───────────────────────────────
    await db.collection('authorizedStudents').doc(normalizedEmail).set({
      email:     normalizedEmail,
      name:      name,
      status:    status,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    // ── 4. Sync Firebase Auth user ────────────────────────────────
    let authUid = null;
    try {
      const existing = await adminAuth.getUserByEmail(normalizedEmail);
      authUid = existing.uid;
      await adminAuth.updateUser(authUid, { disabled: !isActive });
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        if (isActive) {
          // Pre-create the account so it's ready when the student first signs in.
          // No password — student will authenticate via Google.
          const created = await adminAuth.createUser({
            email:       normalizedEmail,
            displayName: name,
            disabled:    false
          });
          authUid = created.uid;
        }
        // If withdrawn and user doesn't exist yet — nothing more to do.
      } else {
        throw err;
      }
    }

    // ── 5. Store uid back in Firestore for easy lookup ────────────
    if (authUid) {
      await db.collection('authorizedStudents').doc(normalizedEmail).update({ uid: authUid });
    }

    console.log(`[OK] ${normalizedEmail} → ${status}`);
    res.json({ success: true, email: normalizedEmail, status });

  } catch (err) {
    console.error(`[ERROR] ${normalizedEmail}:`, err);
    res.status(500).json({ error: err.message });
  }
});

// Health check
server.get('/', (_req, res) => res.send('OK'));

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Listening on :${PORT}`));
