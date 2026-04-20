const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule }  = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();
const db   = admin.firestore();
const auth = admin.auth();

// One-time setup: firebase functions:secrets:set ZAPIER_SECRET
const ZAPIER_SECRET = defineSecret("ZAPIER_SECRET");

function normaliseStatus(raw = "") {
  const s = raw.toLowerCase().trim();
  if (["active", "enrolled", "registered", "פעיל"].includes(s))   return "active";
  if (["withdrawn", "inactive", "cancelled", "canceled",
       "withdrew", "left", "פרש", "לא פעיל"].includes(s))         return "withdrawn";
  return null;
}

// ── Zapier webhook: sync student status ──────────────────────────────────────
exports.updateStudentStatus = onRequest(
  { secrets: [ZAPIER_SECRET] },
  async (req, res) => {
    try {
      if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

      if (req.headers["x-zapier-secret"] !== ZAPIER_SECRET.value()) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { email, name = "", status: rawStatus, role = "student" } = req.body;
      const status = normaliseStatus(rawStatus);

      if (!email || !status) {
        return res.status(400).json({
          error: "Missing or invalid fields",
          required: { email: "string", status: "active | withdrawn" },
        });
      }

      const normalizedEmail = email.toLowerCase().trim();
      const isActive = status === "active";

      // Build Firestore update
      const updateData = {
        email:     normalizedEmail,
        name:      name,
        status:    status,
        role:      role === "teacher" ? "teacher" : "student",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (isActive) {
        // Reactivated — clear the withdrawal date
        updateData.withdrawnAt = null;
      } else {
        // Only record withdrawnAt the first time (don't reset the grace period
        // if Zapier sends the same "withdrawn" status again later)
        const existing = await db.collection("authorizedStudents").doc(normalizedEmail).get();
        if (!existing.exists || !existing.data().withdrawnAt) {
          updateData.withdrawnAt = admin.firestore.FieldValue.serverTimestamp();
        }
      }

      await db.collection("authorizedStudents").doc(normalizedEmail)
        .set(updateData, { merge: true });

      // Sync Firebase Auth user
      let uid = null;
      try {
        const existing = await auth.getUserByEmail(normalizedEmail);
        uid = existing.uid;
        await auth.updateUser(uid, { disabled: !isActive });
      } catch (err) {
        if (err.code === "auth/user-not-found") {
          if (isActive) {
            const created = await auth.createUser({
              email: normalizedEmail, displayName: name, disabled: false,
            });
            uid = created.uid;
          }
        } else {
          throw err;
        }
      }

      if (uid) {
        await db.collection("authorizedStudents").doc(normalizedEmail).update({ uid });
      }

      console.log(`[OK] ${normalizedEmail} → ${status} (${role})`);
      return res.status(200).json({ success: true, email: normalizedEmail, status });

    } catch (error) {
      console.error("Error updating student:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ── Callable: teacher creates / resets a student's password ──────────────────
exports.createStudentAccount = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in");

  const callerEmail = (request.auth.token.email || "").toLowerCase();
  const teacherSnap = await db.collection("authorizedStudents").doc(callerEmail).get();
  if (!teacherSnap.exists || teacherSnap.data().role !== "teacher") {
    throw new HttpsError("permission-denied", "Only teachers can create student accounts");
  }

  const { email, password } = request.data || {};
  if (!email || !password || password.length < 6) {
    throw new HttpsError("invalid-argument", "Valid email and password (min 6 chars) required");
  }

  const normalizedEmail = email.toLowerCase().trim();
  const studentSnap = await db.collection("authorizedStudents").doc(normalizedEmail).get();
  if (!studentSnap.exists || studentSnap.data().status !== "active") {
    throw new HttpsError("not-found", "Student not found in authorized list");
  }

  try {
    const existing = await auth.getUserByEmail(normalizedEmail);
    await auth.updateUser(existing.uid, { password, disabled: false });
    return { success: true, created: false };
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      const created = await auth.createUser({
        email:       normalizedEmail,
        displayName: studentSnap.data().name || "",
        password,
        disabled:    false,
      });
      await db.collection("authorizedStudents").doc(normalizedEmail).update({ uid: created.uid });
      return { success: true, created: true };
    }
    throw err;
  }
});

// ── Scheduled: delete data for students whose 6-month grace period expired ───
// Runs every day at 03:00 Israel time.
exports.cleanupExpiredStudents = onSchedule("every 24 hours", async () => {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const snap = await db.collection("authorizedStudents")
    .where("status", "==", "withdrawn")
    .where("withdrawnAt", "<=", sixMonthsAgo)
    .get();

  if (snap.empty) {
    console.log("[cleanup] No expired students found.");
    return;
  }

  for (const studentDoc of snap.docs) {
    const { email, uid } = studentDoc.data();
    console.log(`[cleanup] Processing ${email} (uid: ${uid})`);

    try {
      // 1. Delete Firestore projects
      if (uid) {
        const projectsSnap = await db
          .collection("users").doc(uid).collection("projects").get();

        if (!projectsSnap.empty) {
          const batch = db.batch();
          projectsSnap.docs.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
        await db.collection("users").doc(uid).delete();
      }

      // 2. Delete Storage files (images uploaded by student)
      if (uid) {
        try {
          const bucket = admin.storage().bucket();
          await bucket.deleteFiles({ prefix: `users/${uid}/` });
        } catch (storageErr) {
          // Storage folder may not exist — not an error
          console.log(`[cleanup] No storage files for ${uid}`);
        }
      }

      // 3. Disable Firebase Auth account
      if (uid) {
        try { await auth.updateUser(uid, { disabled: true }); }
        catch (_) { /* user may already be deleted */ }
      }

      // 4. Mark as expired in Firestore
      await studentDoc.ref.update({
        status:    "expired",
        expiredAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`[cleanup] ✓ ${email} expired and cleaned up`);
    } catch (err) {
      console.error(`[cleanup] ✗ Failed for ${email}:`, err);
    }
  }
});
