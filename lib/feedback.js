// Device feedback helpers — vibration + Web Audio beeps. UMD-style: also
// loadable from Node (where navigator/AudioContext are undefined, so the
// functions silently no-op) for completeness, mainly used by index.html as
// a regular <script src> that sets the API on window so the ES module
// entry (app/main.jsx) and the extracted component modules can reach them
// as bare identifiers.
//
// _audioCtx is kept internal to the module (no window leak) — only the
// API surface (haptic / warmUpAudio / playAlarm) is exposed.

function haptic(pattern) {
  try { if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(pattern); } catch(e) {}
}

// AudioContext is a singleton and must be created after a user gesture
// for autoplay policy. We lazily build it on first call and resume on
// any later interaction via warmUpAudio.
let _audioCtx = null;
function getAudioCtx() {
  if (_audioCtx) return _audioCtx;
  if (typeof window === "undefined") return null;
  try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
  return _audioCtx;
}
function warmUpAudio() {
  const ctx = getAudioCtx();
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
}

// type: "waypoint" (regular fix) — three short 880 Hz beeps
//       "virtual"  (TOC/TOD/BOD) — two ascending 880 → 1100 Hz beeps
function playAlarm(type) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const go = () => {
    const beeps = type === "virtual"
      ? [{ delay: 0, freq: 880 }, { delay: 0.3, freq: 1100 }]
      : [{ delay: 0, freq: 880 }, { delay: 0.38, freq: 880 }, { delay: 0.76, freq: 880 }];
    beeps.forEach(({ delay, freq }) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.45, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  };
  if (ctx.state === "suspended") ctx.resume().then(go).catch(() => {});
  else go();
}

const __NAVLOG_FEEDBACK__ = { haptic, warmUpAudio, playAlarm };
if (typeof module !== "undefined" && module.exports) {
  module.exports = __NAVLOG_FEEDBACK__;
}
if (typeof window !== "undefined") {
  Object.assign(window, __NAVLOG_FEEDBACK__);
}
