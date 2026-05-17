// PDF chart overlay helpers — rendering, georeferencing (3-point affine warp),
// re-warping, file-system access. Pure DOM/Canvas/PDF.js code; no React.
//
// Depends on window.pdfjsLib (loaded as <script src> in index.html) and
// window.L (Leaflet) for map.project / map.unproject, plus getPdfOverlayIdb
// from lib/storage.js for handle lookups during re-warp.
//
// Loaded as <script src="lib/pdf.js"> in index.html (UMD: exports on window).
// Not Node-testable (uses DOM, Canvas, Image, document) — kept here purely to
// pull the cluster out of the babel block so index.html shrinks.

// Render first page of a PDF file → { dataUrl, width, height }
async function renderPdfToImage(file, scale) {
  scale = scale || 4;
  if (!window.pdfjsLib) throw new Error('PDF.js not loaded');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  var ab = await file.arrayBuffer();
  var pdf = await window.pdfjsLib.getDocument({ data: ab }).promise;
  var page = await pdf.getPage(1);
  // Cap longest side at 6000 px to balance quality vs memory
  var baseVp = page.getViewport({ scale: 1 });
  var longest = Math.max(baseVp.width, baseVp.height);
  var maxLong = 6000;
  var effectiveScale = Math.min(scale, maxLong / longest);
  var vp = page.getViewport({ scale: effectiveScale });
  var canvas = document.createElement('canvas');
  canvas.width  = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  var ctx = canvas.getContext('2d', { alpha: false });
  // White background — PDFs are usually white-on-something
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({
    canvasContext: ctx,
    viewport: vp,
    intent: 'print', // higher-fidelity text/vector rendering
  }).promise;
  return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
}

// Warp PDF image to Mercator-aligned canvas using 3-point affine transform.
// Returns { dataUrl, width, height, bounds } ready for L.imageOverlay.
//
// Builds the affine transform { a, b, c, d, tx, ty } so that
//   mx = a*u + c*v + tx
//   my = b*u + d*v + ty
// maps pdf pixel (u, v) to mercator (mx, my). The pure-math version of this
// solve also lives in lib/planning.js as affineFrom3Points / invertAffine /
// applyAffinePt — this implementation is inlined because it also has to set
// up the canvas and bounding box.
async function computeWarpedImage(imgData, pdfPts, mapLeaflet) {
  var REF_ZOOM = 14;
  var ppts = pdfPts.pdfPts, mpts = pdfPts.mapPts;

  // Convert LatLng reference points to Mercator pixels at REF_ZOOM
  var mp = mpts.map(function(m) { return mapLeaflet.project(window.L.latLng(m[0], m[1]), REF_ZOOM); });

  // Solve affine: PDF pixel (u,v) → Mercator pixel (mx, my)
  var u1=ppts[0][0],v1=ppts[0][1], u2=ppts[1][0],v2=ppts[1][1], u3=ppts[2][0],v3=ppts[2][1];
  var det = u1*(v2-v3) - v1*(u2-u3) + (u2*v3-u3*v2);
  if (Math.abs(det) < 0.5) return null;
  function sol(x1,x2,x3) {
    return [
      (x1*(v2-v3) - v1*(x2-x3) + (x2*v3-x3*v2)) / det,
      (u1*(x2-x3) - x1*(u2-u3) + (u2*x3-u3*x2)) / det,
      (u1*(v2*x3-v3*x2) - v1*(u2*x3-u3*x2) + x1*(u2*v3-u3*v2)) / det
    ];
  }
  var rx=sol(mp[0].x,mp[1].x,mp[2].x); // [a,c,tx] for x
  var ry=sol(mp[0].y,mp[1].y,mp[2].y); // [b,d,ty] for y
  var a=rx[0],c=rx[1],tx=rx[2], b=ry[0],d=ry[1],ty=ry[2];

  // Bounding box of the 4 image corners in Mercator space
  var W=imgData.width, H=imgData.height;
  var xs=[a*0+c*0+tx, a*W+c*0+tx, a*0+c*H+tx, a*W+c*H+tx];
  var ys=[b*0+d*0+ty, b*W+d*0+ty, b*0+d*H+ty, b*W+d*H+ty];
  var minX=Math.min.apply(null,xs),maxX=Math.max.apply(null,xs);
  var minY=Math.min.apply(null,ys),maxY=Math.max.apply(null,ys);

  // Canvas size — cap at 8192px on longest side for high quality
  var cw=maxX-minX, ch=maxY-minY;
  var sc=Math.min(1, 8192/Math.max(cw,ch));
  cw=Math.max(1,Math.round(cw*sc)); ch=Math.max(1,Math.round(ch*sc));

  // Load image element then draw warped
  var img = await new Promise(function(res,rej){
    var i=new Image(); i.onload=function(){res(i);}; i.onerror=rej; i.src=imgData.dataUrl;
  });
  var cvs=document.createElement('canvas'); cvs.width=cw; cvs.height=ch;
  var ctx=cvs.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // setTransform(a,b,c,d,e,f): maps drawing (u,v) → canvas (a*u+c*v+e, b*u+d*v+f)
  ctx.setTransform(a*sc, b*sc, c*sc, d*sc, (tx-minX)*sc, (ty-minY)*sc);
  ctx.drawImage(img, 0, 0);

  // Leaflet Mercator: Y increases downward; higher lat = smaller Y pixel
  var sw=mapLeaflet.unproject(window.L.point(minX,maxY),REF_ZOOM);
  var ne=mapLeaflet.unproject(window.L.point(maxX,minY),REF_ZOOM);

  return {
    dataUrl: cvs.toDataURL('image/png'),
    width: cw, height: ch,
    bounds: [[sw.lat, sw.lng], [ne.lat, ne.lng]]
  };
}

// Apply per-overlay translation + scale tweaks (from manual calibration) to a
// 2-corner LatLng bounds tuple. Rotation is NOT supported here — would require
// rewarping. Returns a new bounds array.
function applyOverlayCalibration(bounds, calibration) {
  if (!bounds || !calibration) return bounds;
  var dLat = Number(calibration.dLat || 0);
  var dLng = Number(calibration.dLng || 0);
  var sx = Number(calibration.scaleX != null ? calibration.scaleX : 1) || 1;
  var sy = Number(calibration.scaleY != null ? calibration.scaleY : 1) || 1;
  var sw = bounds[0], ne = bounds[1];
  if (!sw || !ne) return bounds;
  var swLat = sw[0], swLng = sw[1], neLat = ne[0], neLng = ne[1];
  var midLat = (swLat + neLat) / 2;
  var midLng = (swLng + neLng) / 2;
  var halfH = (neLat - swLat) / 2;
  var halfW = (neLng - swLng) / 2;
  return [
    [midLat - halfH * sy + dLat, midLng - halfW * sx + dLng],
    [midLat + halfH * sy + dLat, midLng + halfW * sx + dLng],
  ];
}

// Re-renders the original PDF and warps it with a brand-new pair of control
// point arrays. Returns { dataUrl, width, height, bounds } ready to splat into
// the overlay record, or null when the handle isn't available / permission was
// denied. Used by the calibration flow to fix a chart whose georef drifted.
async function rewarpOverlayFromHandle(overlayId, pdfPts, mapPts, mapLeaflet, opts) {
  if (!overlayId || !pdfPts || !mapPts || !mapLeaflet || !window.pdfjsLib) return null;
  if (pdfPts.length < 3 || mapPts.length < 3) return null;
  var rec = await getPdfOverlayIdb(overlayId);
  if (!rec || !rec.handle) return null;
  var handle = rec.handle;
  try {
    var perm = await handle.queryPermission({ mode: 'read' });
    if (perm !== 'granted') perm = await handle.requestPermission({ mode: 'read' });
    if (perm !== 'granted') return null;
    var file = await handle.getFile();
    var scale = (opts && opts.scale) || 4;
    var imgData = await renderPdfToImage(file, scale);
    var warped = await computeWarpedImage(imgData, { pdfPts: pdfPts, mapPts: mapPts }, mapLeaflet);
    if (!warped) return null;
    return {
      dataUrl: warped.dataUrl,
      width: warped.width,
      height: warped.height,
      bounds: warped.bounds,
    };
  } catch (_) { return null; }
}

// Same as rewarpOverlayFromHandle but takes a File object directly. Used as a
// fallback when the saved handle is missing / permission was revoked / the
// browser never supported the File System Access API in the first place.
async function rewarpOverlayFromFile(file, pdfPts, mapPts, mapLeaflet, opts) {
  if (!file || !pdfPts || !mapPts || !mapLeaflet || !window.pdfjsLib) return null;
  if (pdfPts.length < 3 || mapPts.length < 3) return null;
  try {
    var scale = (opts && opts.scale) || 4;
    var imgData = await renderPdfToImage(file, scale);
    var warped = await computeWarpedImage(imgData, { pdfPts: pdfPts, mapPts: mapPts }, mapLeaflet);
    if (!warped) return null;
    return {
      dataUrl: warped.dataUrl,
      width: warped.width,
      height: warped.height,
      bounds: warped.bounds,
    };
  } catch (_) { return null; }
}

// Opens the OS file picker for a single PDF. Returns { file, handle? } or null
// when the user cancels. handle is populated when the browser supports the File
// System Access API so we can re-render later without re-prompting.
async function pickPdfFile() {
  if (window.showOpenFilePicker) {
    try {
      var picks = await window.showOpenFilePicker({
        types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
        multiple: false,
      });
      var handle = picks[0];
      var file = await handle.getFile();
      return { file: file, handle: handle };
    } catch (_) { return null; }
  }
  return new Promise(function(resolve) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,.pdf';
    input.style.display = 'none';
    input.onchange = function() {
      var f = input.files && input.files[0];
      input.remove();
      resolve(f ? { file: f, handle: null } : null);
    };
    input.oncancel = function() { input.remove(); resolve(null); };
    document.body.appendChild(input);
    input.click();
  });
}

// Re-renders the original PDF for a given overlay at a higher scale, warps with
// the stored 3 control points, and returns the resulting hi-res dataUrl. The
// caller pushes it into state + IDB. Returns null if the file handle is missing
// or permission was denied.
async function renderPdfHiRes(overlay, mapLeaflet, opts) {
  if (!overlay || !overlay.id || !mapLeaflet || !window.pdfjsLib) return null;
  if (!overlay.pdfPts || !overlay.mapPts) return null;
  var rec = await getPdfOverlayIdb(overlay.id);
  if (!rec || !rec.handle) return null;
  var handle = rec.handle;
  try {
    var perm = await handle.queryPermission({ mode: 'read' });
    if (perm !== 'granted') perm = await handle.requestPermission({ mode: 'read' });
    if (perm !== 'granted') return null;
    var file = await handle.getFile();
    var scale = (opts && opts.scale) || 5;
    var imgData = await renderPdfToImage(file, scale);
    var warped = await computeWarpedImage(imgData, { pdfPts: overlay.pdfPts, mapPts: overlay.mapPts }, mapLeaflet);
    return warped ? warped.dataUrl : null;
  } catch (e) { return null; }
}

async function renderPdfFromHandle(handle) {
  if (!handle) return null;
  try {
    var perm = await handle.queryPermission({ mode: 'read' });
    if (perm !== 'granted') perm = await handle.requestPermission({ mode: 'read' });
    if (perm !== 'granted') return null;
    var file = await handle.getFile();
    return await renderPdfToImage(file, 4);
  } catch(e) { return null; }
}

const __NAVLOG_PDF__ = {
  renderPdfToImage, computeWarpedImage, applyOverlayCalibration,
  rewarpOverlayFromHandle, rewarpOverlayFromFile,
  pickPdfFile, renderPdfHiRes, renderPdfFromHandle,
};
if (typeof module !== "undefined" && module.exports) {
  module.exports = __NAVLOG_PDF__;
}
if (typeof window !== "undefined") {
  Object.assign(window, __NAVLOG_PDF__);
}
