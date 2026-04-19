const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();
const db   = admin.firestore();
const auth = admin.auth();

// Secret stored in Firebase Secret Manager — never appears in source code.
// Deploy with: firebase functions:secrets:set CODEKIDS_API_KEY
const API_KEY = defineSecret("CODEKIDS_API_KEY");

// Normalise varied status strings from Zapier to "active" | "withdrawn"
function normaliseStatus(raw = "") {
  const s = raw.toLowerCase().trim();
  if (["active", "enrolled", "registered", "פעיל"].includes(s))            return "active";
  if (["withdrawn", "inactive", "cancelled", "canceled",
       "withdrew", "left", "פרש", "לא פעיל"].includes(s))                  return "withdrawn";
  return null;
}

exports.updateStudentStatus = onRequest(
  { secrets: [API_KEY] },
  async (req, res) => {
    try {
      if (req.method !== "POST") {
        return res.status(405).send("Method Not Allowed");
      }

      // ── 1. Authenticate the request ──────────────────────────
      if (req.headers["x-api-key"] !== API_KEY.value()) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // ── 2. Validate body ──────────────────────────────────────
      const { email, name = "", status: rawStatus } = req.body;
      const status = normaliseStatus(rawStatus);

      if (!email || !status) {
        return res.status(400).json({
          error: "Missing or invalid fields",
          required: { email: "string", status: "active | withdrawn" },
        });
      }

      const normalizedEmail = email.toLowerCase().trim();
      const isActive = status === "active";

      // ── 3. Update Firestore allowlist ─────────────────────────
      await db.collection("authorizedStudents").doc(normalizedEmail).set({
        email:     normalizedEmail,
        name:      name,
        status:    status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // ── 4. Sync Firebase Auth user ────────────────────────────
      let uid = null;
      try {
        const existing = await auth.getUserByEmail(normalizedEmail);
        uid = existing.uid;
        await auth.updateUser(uid, { disabled: !isActive });
      } catch (err) {
        if (err.code === "auth/user-not-found") {
          if (isActive) {
            // Pre-create the account so it is ready when the student signs in.
            // No password — authentication is via Google.
            const created = await auth.createUser({
              email:       normalizedEmail,
              displayName: name,
              disabled:    false,
            });
            uid = created.uid;
          }
          // Withdrawn + no account → nothing to do in Auth.
        } else {
          throw err;
        }
      }

      // Store uid in Firestore for easy cross-reference
      if (uid) {
        await db.collection("authorizedStudents")
          .doc(normalizedEmail).update({ uid });
      }

      console.log(`[OK] ${normalizedEmail} → ${status}`);
      return res.status(200).json({
        success: true,
        email:   normalizedEmail,
        status,
      });

    } catch (error) {
      console.error("Error updating student:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);
