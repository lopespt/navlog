// useFlightActions — mutações do `flight` agrupadas em handlers nomeados.
//
// Extraído de app/main.jsx como parte da quebra do god-component. Cada
// função aqui é um wrapper sobre setFlight((f) => ...) — não tem estado
// próprio, é só organização. Inputs:
//   - flight     : usado por directToWp para confirmação por callsign
//   - setFlight  : mutator
//   - ac         : aeronave atual (para defaults de TAS em direct-to)
//   - liveRoute, liveETAs : usados por directToWp para estimar posição
//
// Bare-identifier dependencies (window globals via lib/*):
//   parseHHMM, formatHHMMSS, nowHHMM, applyDirectTo, clearDirectTo,
//   estimatedPosition, haptic, warmUpAudio.

export function useFlightActions({ flight, setFlight, ac, liveRoute, liveETAs }) {
  // ── ATA virtual (TOC/TOD/BOD) ─────────────────────────────────────────
  function markVirtual(key) {
    haptic([40]); warmUpAudio();
    const now = nowHHMM();
    setFlight((f) => ({ ...f, autoWpATAs: { ...(f.autoWpATAs || {}), [key]: formatHHMMSS(now) } }));
  }
  function unmarkVirtual(key) {
    setFlight((f) => { const m = { ...(f.autoWpATAs || {}) }; delete m[key]; return { ...f, autoWpATAs: m }; });
  }
  function setVirtualAta(key, ataStr) {
    setFlight((f) => ({ ...f, autoWpATAs: { ...(f.autoWpATAs || {}), [key]: ataStr } }));
  }

  // ── ATA de checkpoint real ────────────────────────────────────────────
  function setAta(i, ataStr) {
    setFlight((f) => {
      const cps = [...f.checkpoints];
      const ataMin = parseHHMM(ataStr);
      if (ataMin == null) {
        cps[i] = { ...cps[i], ata: null, gsActual: null };
        return { ...f, checkpoints: cps };
      }
      const prev = cps[i - 1];
      let prevTime;
      if (prev.isOrigin) {
        prevTime = parseHHMM(f.atd ?? f.eobt);
      } else {
        prevTime = prev.ata != null ? parseHHMM(prev.ata) : null;
      }
      let gsActual = null;
      if (prevTime != null && cps[i].dist > 0) {
        let elapsed = ataMin - prevTime;
        if (elapsed < 0) elapsed += MINUTES_PER_DAY;
        if (elapsed > 0) gsActual = (cps[i].dist / elapsed) * 60;
      }
      cps[i] = { ...cps[i], ata: ataStr, gsActual };
      // Auto-clear an active deviation when its target gets a real ATA — the
      // adjustment leg has been consumed and the original plan resumes.
      var nextDev = f.activeDeviation;
      if (ataStr != null && nextDev && nextDev.targetIdx === i) nextDev = null;
      return { ...f, checkpoints: cps, activeDeviation: nextDev };
    });
  }

  function markCrossed(i) {
    haptic([60]); warmUpAudio();
    setAta(i, formatHHMMSS(nowHHMM()));
  }

  function unmark(i) {
    setFlight((f) => {
      const cps = [...f.checkpoints];
      cps[i] = { ...cps[i], ata: null, gsActual: null };
      return { ...f, checkpoints: cps };
    });
  }

  // ── Notas por waypoint ────────────────────────────────────────────────
  function saveNote(i, text) {
    setFlight((f) => {
      const cps = [...f.checkpoints];
      cps[i] = { ...cps[i], notes: text };
      return { ...f, checkpoints: cps };
    });
  }

  // ── Desvio / direct-to ────────────────────────────────────────────────
  function setDeviation(dev) {
    setFlight(function(f) {
      var cps = (dev && dev.targetIdx != null)
        ? applyDirectTo(f.checkpoints, dev.targetIdx)
        : f.checkpoints;
      return Object.assign({}, f, { checkpoints: cps, activeDeviation: dev });
    });
  }

  // One-tap direct-to: usa a posição estimada como âncora, sem dropar pino.
  function directToWp(targetIdx) {
    setFlight(function(f) {
      var target = f.checkpoints[targetIdx];
      if (!target || target.lat == null || target.lon == null) return f;
      var est = estimatedPosition({
        liveRoute, liveETAs, flight: f,
        nowMin: nowHHMM(),
        eobtMin: parseHHMM(f.eobt) ?? 0,
      });
      if (!est) {
        return Object.assign({}, f, {});
      }
      if (typeof window !== "undefined" && typeof window.confirm === "function") {
        var ok = window.confirm("Direct to " + (target.name || ("WP " + targetIdx)) + " a partir da posição estimada?");
        if (!ok) return f;
      }
      var dev = {
        fromLat: roundCoord(est.lat),
        fromLon: roundCoord(est.lon),
        targetIdx: Number(targetIdx),
        currentAlt: target.alt != null ? Number(target.alt) : (f.cruiseAlt ?? 7000),
        currentTas: ac && ac.tasCruise ? ac.tasCruise : 100,
        startedAt: formatHHMMSS(nowHHMM()),
      };
      return Object.assign({}, f, {
        checkpoints: applyDirectTo(f.checkpoints, targetIdx),
        activeDeviation: dev,
      });
    });
  }

  function clearDeviation() {
    setFlight(function(f) {
      var c = Object.assign({}, f, { checkpoints: clearDirectTo(f.checkpoints) });
      delete c.activeDeviation;
      return c;
    });
  }

  // ── Reordenação de checkpoints ────────────────────────────────────────
  function moveUp(i) {
    if (i <= 1) return;
    setFlight((f) => {
      const cps = [...f.checkpoints];
      [cps[i - 1], cps[i]] = [cps[i], cps[i - 1]];
      return { ...f, checkpoints: cps };
    });
  }

  function moveDown(i) {
    setFlight((f) => {
      if (i >= f.checkpoints.length - 1) return f;
      if (i === 0) return f;
      const cps = [...f.checkpoints];
      [cps[i], cps[i + 1]] = [cps[i + 1], cps[i]];
      return { ...f, checkpoints: cps };
    });
  }

  function reorder(fromIdx, toIdx) {
    if (fromIdx === toIdx || fromIdx <= 0 || toIdx <= 0) return;
    setFlight((f) => {
      const cps = [...f.checkpoints];
      const [item] = cps.splice(fromIdx, 1);
      cps.splice(toIdx, 0, item);
      return { ...f, checkpoints: cps };
    });
  }

  // ── Voo ───────────────────────────────────────────────────────────────
  function resetFlight() {
    setFlight((f) => ({
      ...f,
      atd: null,
      autoWpATAs: {},
      windVel: 0,
      checkpoints: f.checkpoints.map((cp) =>
        cp.isOrigin ? cp : { ...cp, ata: null, gsActual: null }
      ),
    }));
  }

  function depart() {
    haptic([50, 30, 50, 30, 80]); warmUpAudio();
    setFlight((f) => ({ ...f, atd: formatHHMMSS(nowHHMM()) }));
  }

  return {
    markVirtual, unmarkVirtual, setVirtualAta,
    setAta, markCrossed, unmark,
    saveNote,
    setDeviation, directToWp, clearDeviation,
    moveUp, moveDown, reorder,
    resetFlight, depart,
  };
}
