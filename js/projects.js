// ── projects.js ──────────────────────────────────────────────────────────────
// Firestore CRUD for user projects.
//
// Private schema  /users/{userId}/projects/{projectId}:
//   title           string
//   type            "python" | "html"
//   code            string | { [filename]: string }
//   images          Array<{ url, name, storagePath, size, uploadedAt }>
//   publicId        string?   — opaque share token, set when project is shared
//   isPublicPreview boolean?
//   sharedAt        Timestamp?
//   createdAt       Timestamp
//   updatedAt       Timestamp
//
// Public snapshot  /publicProjects/{publicId}:
//   title       string
//   type        string
//   code        same as private (safe to expose — no uid/email)
//   images      Array<{ url, name }> — storagePath stripped
//   projectId   string  (used only by Firestore security rules, not returned to preview clients)
//   publishedAt Timestamp
// ─────────────────────────────────────────────────────────────────────────────
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let _db = null;

export function initFirestore(app) {
  _db = getFirestore(app);
  return _db;
}

function col(userId) {
  return collection(_db, "users", userId, "projects");
}

function docRef(userId, projectId) {
  return doc(_db, "users", userId, "projects", projectId);
}

// ── Public ID ─────────────────────────────────────────────────────────────────

/** Generate a cryptographically random URL-safe ID (16 chars). */
export function generatePublicId() {
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── Publish / unpublish ───────────────────────────────────────────────────────

/**
 * Publish or re-publish a project for public preview.
 * - If the project already has a publicId, the existing snapshot is overwritten.
 * - Otherwise a new publicId is generated and saved to the private document.
 * @returns {Promise<string>} the publicId
 */
export async function publishProject(userId, projectId, { title, type, code, images }, existingPublicId) {
  const publicId = existingPublicId || generatePublicId();

  // Write public snapshot — strip storagePath and internal metadata
  await setDoc(doc(_db, "publicProjects", publicId), {
    title,
    type,
    code,
    images: (images || []).map(({ url, name }) => ({ url, name })),
    projectId,           // referenced by security rules only
    publishedAt: serverTimestamp()
  });

  // Update private project only when creating a new share link
  if (!existingPublicId) {
    await updateDoc(docRef(userId, projectId), {
      publicId,
      isPublicPreview: true,
      sharedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  return publicId;
}

/** Remove the public snapshot and clear share fields from the private document. */
export async function unpublishProject(userId, projectId, publicId) {
  await deleteDoc(doc(_db, "publicProjects", publicId));
  await updateDoc(docRef(userId, projectId), {
    publicId:        deleteField(),
    isPublicPreview: deleteField(),
    sharedAt:        deleteField(),
    updatedAt:       serverTimestamp()
  });
}

/**
 * Load a public project snapshot for the preview page.
 * Strips `projectId` (internal, for security rules) before returning.
 * @returns {Promise<object|null>}
 */
export async function getPublicProject(publicId) {
  const snap = await getDoc(doc(_db, "publicProjects", publicId));
  if (!snap.exists()) return null;
  // eslint-disable-next-line no-unused-vars
  const { projectId: _internal, ...safe } = snap.data();
  return { id: snap.id, ...safe };
}

// ── Private CRUD ──────────────────────────────────────────────────────────────

export async function createProject(userId, { title, type, code }) {
  return addDoc(col(userId), {
    title,
    type,
    code,
    images: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function loadProject(userId, projectId) {
  const snap = await getDoc(docRef(userId, projectId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function listProjects(userId) {
  const q = query(col(userId), orderBy("updatedAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function saveProject(userId, projectId, { title, code }) {
  return updateDoc(docRef(userId, projectId), {
    title,
    code,
    updatedAt: serverTimestamp()
  });
}

// Add an image metadata entry to the project's images array.
export async function addImageToProject(userId, projectId, imageMeta) {
  // imageMeta = { url, name, storagePath, size, type }
  return updateDoc(docRef(userId, projectId), {
    images: arrayUnion({ ...imageMeta, uploadedAt: new Date().toISOString() }),
    updatedAt: serverTimestamp()
  });
}

// Remove an image from the project's images array by storagePath.
export async function removeImageFromProject(userId, projectId, imageMeta) {
  // Must pass the exact same object — use the one stored in Firestore.
  return updateDoc(docRef(userId, projectId), {
    images: arrayRemove(imageMeta),
    updatedAt: serverTimestamp()
  });
}

export async function deleteProject(userId, projectId) {
  return deleteDoc(docRef(userId, projectId));
}
