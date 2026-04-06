// ── projects.js ──────────────────────────────────────────────────────────────
// Firestore CRUD for user projects.
// Schema per project document:
//   title       string
//   type        "python" | "html"
//   code        string | { [filename]: string }
//   images      Array<{ url, name, storagePath, size, uploadedAt }>
//   createdAt   Timestamp
//   updatedAt   Timestamp
// Path: /users/{userId}/projects/{projectId}
// ─────────────────────────────────────────────────────────────────────────────
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
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
