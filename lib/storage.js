// IndexedDB helpers — PDF overlay records and the user-points library.
// Pure storage-layer code; no React, no DOM. Loaded as <script src> in
// index.html (UMD: exports on window) and via require() in tests.
//
// Two stores, two databases:
//   navlog_pdf_handles / handles  — full PDF overlay records including the
//                                   FileSystemFileHandle (when available)
//                                   so re-warping doesn't require re-picking.
//   navlog_userpts     / points   — pilot's saved waypoint library.

// Local copy of the diagnostic helper from index.html — keeps the module
// self-contained.
function _storageWarn(label, err) {
  try { console.warn('[navlog]', label, err); } catch (_) {}
}

// ── PDF overlays ─────────────────────────────────────────────────────────────

function _pdfHandleDb() {
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open('navlog_pdf_handles', 1);
    req.onupgradeneeded = function(e) {
      e.target.result.createObjectStore('handles', { keyPath: 'id' });
    };
    req.onsuccess = function(e) { resolve(e.target.result); };
    req.onerror = function() { reject(req.error); };
  });
}

// Stores full overlay record (handle + dataUrl + metadata) in IndexedDB.
async function savePdfOverlayIdb(ov, handle) {
  try {
    var db = await _pdfHandleDb();
    // Preserve the existing handle when the caller passed null — the routine
    // sync effect in App calls this on every overlay state change (rename,
    // opacity tweak, hi-res arrival, etc.) and would otherwise wipe the
    // FileSystemFileHandle saved at creation, forcing the user to re-pick the
    // PDF on every calibration.
    var preservedHandle = handle || null;
    if (!handle) {
      try {
        var existing = await new Promise(function(resolve) {
          var t = db.transaction('handles', 'readonly');
          var r = t.objectStore('handles').get(ov.id);
          r.onsuccess = function(e) { resolve(e.target.result || null); };
          r.onerror = function() { resolve(null); };
        });
        if (existing && existing.handle) preservedHandle = existing.handle;
      } catch (e) { _storageWarn('savePdfOverlayIdb:preserveHandle:' + ov.id, e); }
    }
    var tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put({
      id: ov.id, handle: preservedHandle,
      name: ov.name || null,
      dataUrl: ov.dataUrl || null,
      dataUrlHi: ov.dataUrlHi || null,
      width: ov.width, height: ov.height,
      bounds: ov.bounds || null,
      pdfPts: ov.pdfPts, mapPts: ov.mapPts,
      opacity: ov.opacity, visible: ov.visible,
      calibration: ov.calibration || null,
      order: (ov.order != null) ? ov.order : null,
    });
  } catch(e) { _storageWarn('savePdfOverlayIdb:' + (ov && ov.id), e); }
}

async function getPdfOverlayIdb(id) {
  try {
    var db = await _pdfHandleDb();
    return new Promise(function(resolve) {
      var tx = db.transaction('handles', 'readonly');
      var req = tx.objectStore('handles').get(id);
      req.onsuccess = function(e) { resolve(e.target.result || null); };
      req.onerror = function() { resolve(null); };
    });
  } catch(e) { _storageWarn('getPdfOverlayIdb:' + id, e); return null; }
}

async function getAllPdfOverlaysIdb() {
  try {
    var db = await _pdfHandleDb();
    return new Promise(function(resolve) {
      var tx = db.transaction('handles', 'readonly');
      var req = tx.objectStore('handles').getAll();
      req.onsuccess = function(e) { resolve(e.target.result || []); };
      req.onerror = function() { resolve([]); };
    });
  } catch(e) { _storageWarn('getAllPdfOverlaysIdb', e); return []; }
}

async function deletePdfHandle(id) {
  try {
    var db = await _pdfHandleDb();
    var tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').delete(id);
  } catch(e) { _storageWarn('deletePdfHandle:' + id, e); }
}

// Convenience reader: pull just the FileSystemFileHandle off an overlay
// record. Used by the "Recarregar" button in pdf-layers-panel.jsx to
// re-open the source PDF after a reload, where the in-memory dataUrl was
// dropped but the persisted handle is still good.
async function getPdfHandle(id) {
  try {
    var rec = await getPdfOverlayIdb(id);
    return (rec && rec.handle) || null;
  } catch(e) { _storageWarn('getPdfHandle:' + id, e); return null; }
}

// Persist (or update) just the file handle on an existing overlay record.
// Used when the user re-picks the PDF file via showOpenFilePicker —
// preserves every other field of the record (name, opacity, calibration,
// etc.) and only swaps the FileSystemFileHandle.
async function savePdfHandle(id, handle) {
  try {
    var db = await _pdfHandleDb();
    var existing = await new Promise(function(resolve) {
      var t = db.transaction('handles', 'readonly');
      var r = t.objectStore('handles').get(id);
      r.onsuccess = function(e) { resolve(e.target.result || null); };
      r.onerror = function() { resolve(null); };
    });
    if (!existing) return;
    var tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(Object.assign({}, existing, { handle: handle || null }));
  } catch(e) { _storageWarn('savePdfHandle:' + id, e); }
}

// ── User points library ──────────────────────────────────────────────────────

function _userPtsDb() {
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open('navlog_userpts', 1);
    req.onupgradeneeded = function(e) {
      e.target.result.createObjectStore('points', { keyPath: 'id' });
    };
    req.onsuccess = function(e) { resolve(e.target.result); };
    req.onerror = function() { reject(req.error); };
  });
}

async function userPtsAll() {
  try {
    var db = await _userPtsDb();
    return new Promise(function(resolve) {
      var tx = db.transaction('points', 'readonly');
      var req = tx.objectStore('points').getAll();
      req.onsuccess = function(e) { resolve(e.target.result || []); };
      req.onerror = function() { resolve([]); };
    });
  } catch (e) { _storageWarn('userPtsAll', e); return []; }
}

async function userPtsPut(pt) {
  try {
    var db = await _userPtsDb();
    var rec = Object.assign({}, pt, {
      id: pt.id || (Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8)),
      createdAt: pt.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    var tx = db.transaction('points', 'readwrite');
    tx.objectStore('points').put(rec);
    return rec;
  } catch (e) { _storageWarn('userPtsPut', e); return null; }
}

async function userPtsDelete(id) {
  try {
    var db = await _userPtsDb();
    var tx = db.transaction('points', 'readwrite');
    tx.objectStore('points').delete(id);
  } catch (e) { _storageWarn('userPtsDelete:' + id, e); }
}

const __NAVLOG_STORAGE__ = {
  savePdfOverlayIdb, getPdfOverlayIdb, getAllPdfOverlaysIdb, deletePdfHandle,
  getPdfHandle, savePdfHandle,
  userPtsAll, userPtsPut, userPtsDelete,
};
if (typeof module !== "undefined" && module.exports) {
  module.exports = __NAVLOG_STORAGE__;
}
if (typeof window !== "undefined") {
  Object.assign(window, __NAVLOG_STORAGE__);
}
