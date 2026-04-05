// ── uploads.js ───────────────────────────────────────────────────────────────
// Firebase Storage: upload / delete images for a project.
// Storage path: users/{userId}/projects/{projectId}/{timestamp}_{safeName}
// Only metadata (url, name, storagePath, size, type) is stored in Firestore.
// ─────────────────────────────────────────────────────────────────────────────
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

let _storage = null;

export function initStorage(app) {
  _storage = getStorage(app);
  return _storage;
}

/**
 * Upload a file to Storage for a given project.
 *
 * @param {string}   userId
 * @param {string}   projectId
 * @param {File}     file
 * @param {function} onProgress  - optional, called with 0–100 number
 * @returns {Promise<{ url, name, storagePath, size, type }>}
 */
export async function uploadProjectImage(userId, projectId, file, onProgress) {
  // Sanitise the filename
  const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const storagePath = `users/${userId}/projects/${projectId}/${safeName}`;
  const storageRef = ref(_storage, storagePath);

  await new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file);
    task.on(
      "state_changed",
      snap => {
        if (onProgress) {
          onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
        }
      },
      reject,
      resolve
    );
  });

  const url = await getDownloadURL(storageRef);
  return { url, name: file.name, storagePath, size: file.size, type: file.type };
}

/**
 * Delete a file from Storage by its path.
 * @param {string} storagePath
 */
export async function deleteStorageFile(storagePath) {
  const storageRef = ref(_storage, storagePath);
  return deleteObject(storageRef);
}
