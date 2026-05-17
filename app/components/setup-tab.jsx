// Setup tab — the route planning surface. Aircraft selector, identification
// (callsign, EOBT, ORIG/DEST/ALTN, VFR/IFR), environment (variation, wind,
// ISA), waypoints list, ICAO Field 15 importer, frequencies, fleet manager
// shortcut, saved user-points panel. Extracted from app/main.jsx — uses no
// main.jsx-scoped helpers beyond haptic, which lives in lib/feedback.js as
// of this commit.

import React, { useState, useEffect, useRef } from "react";
import {
  Plane, Plus, Trash, Wind, Upload, Download,
  Pencil, Settings, GripVertical, MapPin, FileText, Search, Star,
  Radio, RefreshCw, ClipboardList, ChevronDown, ChevronUp,
} from "lucide-react";
import { Section, Loading, Empty, ErrorState } from "./ui-primitives.jsx?v=20260517.2256";


function AiracBadge({ theme }) {
  const [info, setInfo] = useState(null);
  useEffect(() => { airacGetCurrent().then(setInfo); }, []);
  if (!info) return null;
  const days = info.days_remaining;
  const expired = typeof days === "number" && days < 0;
  const warn    = typeof days === "number" && days >= 0 && days <= 3;
  const cls = expired
    ? "border-red-500 text-red-300 bg-red-500/10"
    : warn
      ? "border-amber-500 text-amber-300 bg-amber-500/10"
      : (theme.panelBorder + " " + (theme.fgMuted || "text-zinc-400"));
  const tip = `Efetivo ${(info.effective_date || "").slice(0,10)} → expira ${(info.expiration_date || "").slice(0,10)}`;
  return (
    <div title={tip}
      className={`text-[10px] uppercase tracking-widest border rounded-md px-2 py-1 inline-flex items-center gap-1.5 num ${cls}`}>
      <span className="font-bold">AIRAC {info.cycle}</span>
      <span>·</span>
      <span>{expired ? "expirado" : (days == null ? "—" : `${days} dia${days !== 1 ? "s" : ""}`)}</span>
    </div>
  );
}

function FreqsSection({ flight, setFlight, theme, onRefreshFreqs }) {
  const [open, setOpen] = useState(false);
  const [proceduresIcao, setProceduresIcao] = useState(null);
  const setFreq = (which, key, val) => {
    const freqs = { ...(flight.freqs || {}), [which]: { ...(flight.freqs?.[which] || {}), [key]: val } };
    setFlight({ ...flight, freqs });
  };
  const fieldClass = `w-full ${theme.inputBg} border ${theme.inputBorder} ${theme.fg} px-2 py-1.5 text-sm rounded-lg num focus:${theme.accentBorder} focus:outline-none focus:ring-2 focus:ring-amber-500/30`;

  return (
    <section>
      <button onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between text-[10px] uppercase tracking-widest ${theme.fgMuted} mb-2`}>
        <span className="flex items-center gap-2"><Radio className="w-4 h-4" /> Frequências</span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <div className="space-y-2">
          {[
            ["origin", flight.origin || "Origem"],
            ["destination", flight.destination || "Destino"],
            ["alternate", flight.alternate || "Alternado"],
          ].map(([which, label]) => {
            const icao = flight[which];
            const isIcao = icao && /^[A-Z0-9]{4}$/.test(String(icao).toUpperCase());
            return (
              <div key={which} className={`${theme.panel} border ${theme.panelBorder} rounded-xl p-3`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className={`text-xs font-bold ${theme.accent}`}>{label}</div>
                  {isIcao && (
                    <div className="flex items-center gap-1">
                      <button type="button"
                        onClick={() => onRefreshFreqs && onRefreshFreqs(which, true)}
                        title="Buscar do AIRAC (sobrescreve)"
                        className={`text-[10px] px-2 py-1 rounded border inline-flex items-center gap-1 ${theme.panelBorder} ${theme.fgMuted}`}>
                        <RefreshCw className="w-3 h-3" /> AIRAC
                      </button>
                      <button type="button"
                        onClick={() => setProceduresIcao(String(icao).toUpperCase())}
                        title="Ver SID / STAR / Approach"
                        className={`text-[10px] px-2 py-1 rounded border inline-flex items-center gap-1 ${theme.panelBorder} ${theme.fgMuted}`}>
                        <ClipboardList className="w-3 h-3" /> Procs
                      </button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ["atis", "ATIS"], ["ground", "Ground"], ["tower", "Tower"],
                    ["approach", "App/Dep"], ["ctaf", "CTAF"], ["unicom", "UNICOM"],
                    ["elev", "Elev (ft)"],
                  ].map(([k, l]) => (
                    <div key={k}>
                      <label className={`text-[10px] uppercase ${theme.fgFaint} block`}>{l}</label>
                      <input className={fieldClass}
                        value={flight.freqs?.[which]?.[k] || ""}
                        onChange={(e) => setFreq(which, k, e.target.value)} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {proceduresIcao && (
        <ProceduresPanel
          icao={proceduresIcao}
          flight={flight}
          setFlight={setFlight}
          theme={theme}
          onClose={() => setProceduresIcao(null)}
        />
      )}
    </section>
  );
}

function ProceduresPanel({ icao, flight, setFlight, theme, onClose }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all | SID | STAR | APP

  // Detail (procedure + transition selected by user)
  const [selected, setSelected] = useState(null); // { typeCode, identifier, transition }
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState(null);
  const [insertAfterIdx, setInsertAfterIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null); setData(null);
    airacProcedures(icao).then(d => {
      if (cancelled) return;
      if (!d) { setErr("Sem dados ou falha na API"); setLoading(false); return; }
      setData(d); setLoading(false);
    }).catch(e => { if (!cancelled) { setErr(e.message || String(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [icao]);

  useEffect(() => {
    if (!selected) { setDetail(null); setDetailErr(null); return; }
    let cancelled = false;
    setDetailLoading(true); setDetailErr(null); setDetail(null);
    airacProcedureDetail(icao, selected.identifier).then(d => {
      if (cancelled) return;
      if (!d) { setDetailErr("Falha ao carregar procedimento"); setDetailLoading(false); return; }
      setDetail(d); setDetailLoading(false);
      const cps = (flight && flight.checkpoints) || [];
      const def = selected.typeCode === "SID"
        ? 0
        : Math.max(0, cps.length - 2);
      setInsertAfterIdx(def);
    }).catch(e => { if (!cancelled) { setDetailErr(e.message || String(e)); setDetailLoading(false); } });
    return () => { cancelled = true; };
  }, [selected]);

  // Group listing by typeCode → identifier → [transitions]
  const grouped = (function() {
    if (!data || typeof data !== "object") return null;
    const out = { SID: {}, STAR: {}, APP: {} };
    Object.keys(data).forEach(typeKey => {
      const list = data[typeKey];
      if (!Array.isArray(list)) return;
      const tCode = String(typeKey).toUpperCase();
      const target = out[tCode] || (out[tCode] = {});
      list.forEach(item => {
        const id = item.identifier || item.name;
        if (!id) return;
        if (!target[id]) target[id] = [];
        const t = item.transition || "";
        if (!target[id].includes(t)) target[id].push(t);
      });
    });
    return out;
  })();

  function applyProcedure() {
    if (!selected || !detail) return;
    const legs = pickProcedureLegs(detail, selected.transition, selected.typeCode);
    const source = {
      kind: "procedure",
      airport: icao,
      procedure: selected.identifier,
      transition: selected.transition,
      type: selected.typeCode,
    };
    const newCps = [];
    legs.forEach(leg => {
      const cp = legToCheckpoint(leg, source, selected.typeCode);
      if (cp) newCps.push(cp);
    });
    if (newCps.length === 0) {
      alert("Nenhum fixo com coordenadas neste procedimento.");
      return;
    }
    setFlight(f => {
      const cps = [...((f && f.checkpoints) || [])];
      const max = Math.max(0, cps.length - 1);
      const after = Math.max(0, Math.min(insertAfterIdx, max));
      cps.splice(after + 1, 0, ...newCps);
      return Object.assign({}, f, { checkpoints: cps });
    });
    onClose();
  }

  // ── Detail view ─────────────────────────────────────────────────────────────
  if (selected) {
    const legs = detail ? pickProcedureLegs(detail, selected.transition, selected.typeCode) : [];
    const insertableLegs = legs.filter(l => l.fix_coordinates && l.fix_coordinates.lat != null);
    const cps = (flight && flight.checkpoints) || [];
    return (
      <div onClick={(e) => e.stopPropagation()}
        style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", flexDirection: "column" }}
        className={theme.bg}>
        <div className={`flex items-center gap-2 p-3 shrink-0 ${theme.panel} border-b ${theme.panelBorder}`}>
          <button onClick={() => setSelected(null)}
            className={`px-3 py-1.5 rounded-lg border text-sm ${theme.panelBorder} ${theme.fgFaint}`}>
            ← Voltar
          </button>
          <div className="flex-1 text-center">
            <div className={`text-sm font-bold ${theme.cyan}`}>
              {selected.typeCode} · {selected.identifier}{selected.transition ? " · " + selected.transition : ""}
            </div>
            <div className={`text-[10px] ${theme.fgFaint}`}>{icao}</div>
          </div>
          <div style={{ width: 80 }} />
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {detailLoading && <Loading theme={theme} />}
          {detailErr && <ErrorState theme={theme} message={detailErr} />}
          {detail && legs.length > 0 && (
            <>
              <div className={`${theme.panel} border ${theme.panelBorder} rounded-xl overflow-hidden divide-y ${theme.panelBorder}`}>
                {legs.map((leg, i) => {
                  const hasCoords = leg.fix_coordinates && leg.fix_coordinates.lat != null;
                  const altStr = leg.altitude_ft != null
                    ? (leg.altitude_restriction === "at_or_above" ? `≥ ${leg.altitude_ft} ft`
                      : leg.altitude_restriction === "at_or_below" ? `≤ ${leg.altitude_ft} ft`
                      : `${leg.altitude_ft} ft`)
                    : "—";
                  return (
                    <div key={i}
                      className={`px-3 py-2 grid items-center gap-2 ${hasCoords ? "" : "opacity-50"}`}
                      style={{ gridTemplateColumns: "2rem minmax(0, 1fr)" }}>
                      <span className={`text-[10px] num ${theme.fgFaint}`}>#{leg.sequence != null ? leg.sequence : i}</span>
                      <div className="min-w-0">
                        <div className={`font-bold truncate ${theme.fg}`}>
                          {leg.fix_identifier || leg.fix_name || "—"}
                          {!hasCoords && <span className={`ml-2 text-[10px] ${theme.fgFaint}`}>(sem coords, ignorado)</span>}
                        </div>
                        <div className={`text-xs num truncate ${theme.fgFaint}`}>
                          {altStr}
                          {leg.course != null ? ` · MC ${leg.course}°` : ""}
                          {leg.turn_direction ? ` · turn ${leg.turn_direction}` : ""}
                          {leg.path_terminator ? ` · ${leg.path_terminator}` : ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div>
                <label className={`text-[10px] uppercase tracking-widest ${theme.fgFaint} block mb-1`}>
                  Inserir após qual ponto da rota
                </label>
                <select value={insertAfterIdx}
                  onChange={(e) => setInsertAfterIdx(Number(e.target.value))}
                  className={`w-full ${theme.inputBg} border ${theme.inputBorder} ${theme.fg} px-3 py-2 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30`}>
                  {cps.map((cp, i) => (
                    <option key={i} value={i}>
                      {i + 1}. {cp.name || "(sem nome)"}{cp.isOrigin ? " · origem" : i === cps.length - 1 ? " · destino" : ""}
                    </option>
                  ))}
                </select>
                <div className={`text-[10px] ${theme.fgFaint} mt-1`}>
                  Default: {selected.typeCode === "SID" ? "depois da origem" : "antes do destino"}.
                </div>
              </div>
              <button onClick={applyProcedure}
                disabled={insertableLegs.length === 0}
                className={`w-full py-3 rounded-xl font-bold text-sm ${
                  insertableLegs.length === 0
                    ? `${theme.panel} ${theme.fgFaint} opacity-40`
                    : `${theme.accentBg} ${theme.accentBgFg ?? "text-black"}`
                }`}>
                Adicionar à rota ({insertableLegs.length} fixo{insertableLegs.length !== 1 ? "s" : ""})
              </button>
            </>
          )}
          {detail && legs.length === 0 && (
            <Empty theme={theme} icon={MapPin} title="Sem fixes" hint="Este procedimento não tem coordenadas geográficas para anexar à rota." />
          )}
        </div>
      </div>
    );
  }

  // ── Listing view ───────────────────────────────────────────────────────────
  return (
    <div onClick={(e) => e.stopPropagation()}
      style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", flexDirection: "column", isolation: "isolate" }}
      className={theme.bg}>
      <div className={`flex items-center gap-2 p-3 shrink-0 ${theme.panel} border-b ${theme.panelBorder}`}>
        <button onClick={onClose}
          className={`px-3 py-1.5 rounded-lg border text-sm ${theme.panelBorder} ${theme.fgFaint}`}>
          Fechar
        </button>
        <div className="flex-1 text-center">
          <div className={`text-sm font-bold ${theme.cyan}`}>Procedures · {icao}</div>
        </div>
        <div style={{ width: 80 }} />
      </div>
      <div className={`flex shrink-0 border-b ${theme.panelBorder} overflow-x-auto`}>
        {[["all", "Todos"], ["SID", "SIDs"], ["STAR", "STARs"], ["APP", "Approaches"]].map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)}
            className={`flex-1 min-w-[64px] py-3 text-[10px] font-bold uppercase tracking-wider ${filter === key ? theme.accent + " border-b-2 border-current" : theme.fgFaint}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {loading && <Loading theme={theme} />}
        {err && <ErrorState theme={theme} message={err} />}
        {grouped && [["SID", "SIDs"], ["STAR", "STARs"], ["APP", "Approaches"]].map(([typeCode, label]) => {
          if (filter !== "all" && filter !== typeCode) return null;
          const ids = Object.keys(grouped[typeCode] || {}).sort();
          if (ids.length === 0) return null;
          return (
            <div key={typeCode}>
              <div className={`text-[10px] uppercase tracking-widest ${theme.fgFaint} mb-1`}>
                {label} ({ids.length})
              </div>
              <div className={`${theme.panel} border ${theme.panelBorder} rounded-xl overflow-hidden divide-y ${theme.panelBorder}`}>
                {ids.map(id => {
                  const transitions = grouped[typeCode][id] || [];
                  return (
                    <div key={id} className="px-3 py-2">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`text-[10px] font-bold w-12 shrink-0 ${theme.cyan}`}>{typeCode}</span>
                        <div className={`font-bold ${theme.fg}`}>{id}</div>
                        <div className={`text-[10px] num ${theme.fgFaint} ml-auto`}>
                          {transitions.length} trans.
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 ml-12">
                        {transitions.length === 0 ? (
                          <button onClick={() => setSelected({ typeCode, identifier: id, transition: "" })}
                            className={`text-[10px] px-2 py-1 rounded border ${theme.panelBorder} ${theme.fgMuted} active:scale-95`}>
                            Selecionar
                          </button>
                        ) : transitions.map(t => (
                          <button key={t || "(none)"} onClick={() => setSelected({ typeCode, identifier: id, transition: t })}
                            className={`text-[10px] px-2 py-1 rounded border ${theme.panelBorder} ${theme.fgMuted} active:scale-95`}>
                            {t || "(direct)"}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {grouped && Object.values(grouped).every(g => Object.keys(g).length === 0) && !loading && (
          <Empty theme={theme} icon={ClipboardList} title="Sem procedimentos" hint={`Não há SID/STAR/Approach publicados para ${icao}.`} />
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, theme }) {
  return (
    <div className={`${theme?.panel || "bg-zinc-900"} border ${theme?.panelBorder || "border-zinc-800"} rounded px-2 py-1.5`}>
      <div className={`text-[10px] uppercase tracking-wider ${theme?.fgFaint || "text-zinc-500"}`}>{label}</div>
      <div className={`text-sm font-bold num ${theme?.accent || "text-amber-400"}`}>{value}</div>
    </div>
  );
}

function SetupTab({ flight, setFlight, ac, theme, onEditCp, onAddCp, onNewBlank, onDeleteCp, onMoveUp, onMoveDown, onReorder, onImportFPL, fleet, onManageFleet, computed, liveRoute, userPoints, onAddUserPoint, onDeleteUserPoint, onRefreshFreqs }) {
  const set = (k, v) => setFlight({ ...flight, [k]: v });
  const setN = (k, v) => set(k, v === "" ? null : Number(v));

  // Drag-to-reorder state
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const listRef = useRef(null);

  function onDragHandleTouchStart(e, i) {
    haptic([20]);
    setDragIdx(i);
    setDragOverIdx(i);
  }
  function onDragHandleTouchMove(e) {
    if (dragIdx == null) return;
    e.preventDefault();
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const row = el?.closest('[data-wp-idx]');
    if (row) {
      const idx = parseInt(row.dataset.wpIdx, 10);
      if (!isNaN(idx) && idx !== dragOverIdx) setDragOverIdx(idx);
    }
  }
  function onDragHandleTouchEnd() {
    if (dragIdx != null && dragOverIdx != null && dragIdx !== dragOverIdx) {
      haptic([30]);
      onReorder(dragIdx, dragOverIdx);
    }
    setDragIdx(null);
    setDragOverIdx(null);
  }

  const fieldClass =
    `w-full ${theme.inputBg} border-2 ${theme.inputBorder} ${theme.fg} px-3 py-2.5 text-base rounded-xl num focus:${theme.accentBorder} focus:outline-none focus:ring-2 focus:ring-amber-500/30`;
  const labelClass = `text-[10px] uppercase tracking-widest ${theme.fgFaint} mb-1 block`;

  return (
    <div className="px-3 py-3 space-y-4">
      <div className="flex items-center justify-end -mb-2">
        <AiracBadge theme={theme} />
      </div>

      {/* AERONAVE */}
      <Section theme={theme} icon={<Plane className="w-4 h-4" />} title="Aeronave">
        <select
          value={flight.aircraftKey}
          onChange={(e) => set("aircraftKey", e.target.value)}
          className={fieldClass}
        >
          {Object.entries(fleet).map(([k, v]) => (
            <option key={k} value={k}>{v.name}</option>
          ))}
        </select>
        <button
          onClick={onManageFleet}
          className={`mt-2 w-full ${theme.panel} border ${theme.panelBorder} ${theme.fgMuted} rounded-xl py-2 text-xs uppercase tracking-widest flex items-center justify-center gap-2`}
        >
          <Settings className="w-3.5 h-3.5" /> Gerenciar frota
        </button>
        <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
          <Stat theme={theme} label="TAS" value={`${ac.tasCruise} kt`} />
          <Stat theme={theme} label="GPH" value={`${ac.gphCruise}`} />
          <Stat theme={theme} label="Fuel" value={`${ac.fuelUsable} gal`} />
        </div>
      </Section>

      {/* IDENTIFICAÇÃO */}
      <Section theme={theme} icon={<MapPin className="w-4 h-4" />} title="Identificação">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>Callsign</label>
            <input className={fieldClass} value={flight.callsign}
              onChange={(e) => set("callsign", e.target.value.toUpperCase())} />
          </div>
          <div>
            <label className={labelClass}>EOBT (UTC)</label>
            <input className={fieldClass} value={flight.eobt} placeholder="13:00"
              onChange={(e) => set("eobt", e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Origem</label>
            <input className={fieldClass} value={flight.origin}
              onChange={(e) => set("origin", e.target.value.toUpperCase())}
              onBlur={async (e) => {
                const icao = (e.target.value || "").toUpperCase().trim();
                const ap = await airacAirport(icao);
                setFlight(f => syncAirportCheckpoint(f, "origin", icao, ap));
              }}
              onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} />
          </div>
          <div>
            <label className={labelClass}>Destino</label>
            <input className={fieldClass} value={flight.destination}
              onChange={(e) => set("destination", e.target.value.toUpperCase())}
              onBlur={async (e) => {
                const icao = (e.target.value || "").toUpperCase().trim();
                const ap = await airacAirport(icao);
                setFlight(f => syncAirportCheckpoint(f, "destination", icao, ap));
              }}
              onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} />
          </div>
          <div>
            <label className={labelClass}>Alternado</label>
            <input className={fieldClass} value={flight.alternate}
              onChange={(e) => set("alternate", e.target.value.toUpperCase())} />
          </div>
          <div>
            <label className={labelClass}>Regras</label>
            <select className={fieldClass} value={flight.rules}
              onChange={(e) => set("rules", e.target.value)}>
              <option>VFR</option><option>IFR</option>
            </select>
          </div>
        </div>
      </Section>

      {/* AMBIENTE */}
      <Section theme={theme} icon={<Wind className="w-4 h-4" />} title="Ambiente (vento médio)">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>Alt cruzeiro (ft)</label>
            <input className={fieldClass} type="number" value={flight.cruiseAlt ?? ""}
              onChange={(e) => setN("cruiseAlt", e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Var. magnética fallback (W = neg)</label>
            {(() => {
              const origin = flight.checkpoints.find(cp => cp.isOrigin);
              const wmm = origin?.lat != null ? getDecl(origin.lat, origin.lon, flight.cruiseAlt ?? 7000) : null;
              return wmm != null
                ? <div className={`${fieldClass} flex items-center justify-between`}>
                    <span className={theme.fgMuted}>Auto WMM</span>
                    <span className={`num font-bold ${theme.accent}`}>{wmm >= 0 ? '+' : ''}{wmm.toFixed(1)}°</span>
                  </div>
                : <input className={fieldClass} type="number" value={flight.variation ?? ""}
                    onChange={(e) => setN("variation", e.target.value)} placeholder="Ex: -22" />;
            })()}
          </div>
          <div>
            <label className={labelClass}>Vento direção (°)</label>
            <input className={fieldClass} type="number" value={flight.windDir ?? ""}
              onChange={(e) => setN("windDir", e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Vento vel. (kt)</label>
            <input className={fieldClass} type="number" value={flight.windVel ?? ""}
              onChange={(e) => setN("windVel", e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>ISA Dev (°C, + = mais quente)</label>
            <input className={fieldClass} type="number" value={flight.isaDevC ?? ""}
              onChange={(e) => setN("isaDevC", e.target.value)} placeholder="0" />
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Combustível inicial real (gal) — vazio = usar usable</label>
            <input className={fieldClass} type="number" value={flight.fuelInitial ?? ""}
              onChange={(e) => setN("fuelInitial", e.target.value)} placeholder={`${ac.fuelUsable}`} />
          </div>
        </div>
        <div className={`text-[10px] ${theme.fgFaint} mt-1`}>
          Cada waypoint pode ter vento próprio (override) — toque para editar.
        </div>
      </Section>

      {/* FREQUÊNCIAS */}
      <FreqsSection flight={flight} setFlight={setFlight} theme={theme} onRefreshFreqs={onRefreshFreqs} />

      {/* WAYPOINTS */}
      <Section theme={theme} icon={<MapPin className="w-4 h-4" />} title={`Rota · ${flight.checkpoints.filter(c=>!c.isAuto).length} pts + ${flight.checkpoints.filter(c=>c.isAuto).length} auto`}>
        <div
          ref={listRef}
          className="space-y-1.5"
          onTouchMove={onDragHandleTouchMove}
          onTouchEnd={onDragHandleTouchEnd}
          onTouchCancel={onDragHandleTouchEnd}
        >
          {flight.checkpoints.map((cp, i) => {
            const isDragging = dragIdx === i;
            const isOver = dragOverIdx === i && dragIdx != null && dragIdx !== i;
            // Virtual TOC/TOD/BOC/BOD rows that fall WITHIN the leg ending at `i`.
            // liveRoute computes these from cp.portions transitions, so they're
            // surfaced here for the planning view too.
            const virtuals = (liveRoute || []).filter(v => v.isVirtual && v.userIdx === i);
            return (
            <React.Fragment key={i}>
            {virtuals.map(v => (
              <div key={v.autoKey}
                className={`flex items-stretch gap-1 rounded ${theme.panel} border border-dashed border-cyan-500/30 px-3 py-1.5 opacity-90`}>
                <div className="w-5 shrink-0" />
                <div className="flex-1 flex items-center gap-2 min-w-0">
                  <div className={`text-[11px] font-bold ${theme.cyan}`}>
                    {v.name === "TOC" ? "↗ TOC" :
                     v.name === "TOD" ? "↘ TOD" :
                     v.name === "BOC" ? "↗ BOC" :
                     v.name === "BOD" ? "↘ BOD" : v.name}
                  </div>
                  <div className={`text-[10px] ${theme.fgFaint} num`}>
                    {v.alt} ft · +{v.dist} NM
                  </div>
                </div>
              </div>
            ))}
            <div data-wp-idx={i}
              className={`flex items-stretch gap-1 rounded transition-all duration-150 ${isDragging ? "opacity-50 scale-[0.98]" : ""} ${isOver ? `ring-2 ${theme.accentBorder} bg-amber-500/10` : ""}`}>
              {/* Alça de arrasto — apenas para waypoints manuais não-origem */}
              {!cp.isOrigin && !cp.isAuto ? (
                <div
                  className={`${theme.panel} border ${theme.panelBorder} rounded px-1.5 flex items-center justify-center cursor-grab active:cursor-grabbing`}
                  style={{ touchAction: "none" }}
                  onTouchStart={(e) => onDragHandleTouchStart(e, i)}
                >
                  <GripVertical className={`w-4 h-4 ${theme.fgFaint}`} />
                </div>
              ) : (
                <div className="w-5 shrink-0" />
              )}

              {/* Waypoint auto (TOC/TOD) — display only, no edit */}
              {cp.isAuto ? (
                <div className={`flex-1 ${theme.panel} border border-dashed ${theme.panelBorder} rounded px-3 py-2 flex items-center gap-2 opacity-70 min-w-0`}>
                  <div className={`text-[10px] ${theme.fgFaint} num w-4 shrink-0`}>{i + 1}</div>
                  <div className="min-w-0 flex-1">
                    <div className={`text-xs font-bold ${theme.cyan}`}>
                      {cp.name === "TOC" ? "↗ TOC" : "↘ TOD"}
                      <span className={`ml-2 text-[10px] ${theme.fgFaint} font-normal`}>AUTO</span>
                    </div>
                    <div className={`text-[10px] ${theme.fgFaint} num`}>{cp.alt} ft · +{cp.dist} NM · TC {String(cp.tc ?? 0).padStart(3,"0")}°</div>
                  </div>
                </div>
              ) : (
                /* Botão de edição — waypoints manuais */
                <button onClick={() => onEditCp(i)}
                  className={`flex-1 ${theme.panel} border ${computed[i]?.warnings?.length ? 'border-red-500' : theme.panelBorder} rounded px-3 py-2 flex items-center justify-between transition-colors min-w-0`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`text-[10px] ${computed[i]?.warnings?.length ? 'text-red-400' : theme.fgFaint} num w-4 shrink-0`}>{i + 1}</div>
                    <div className="text-left min-w-0 flex-1">
                      <div className="font-bold truncate flex items-center gap-1">
                        {cp.name || "—"}
                        {computed[i]?.phaseHint && (
                          <span className={`text-[10px] ${theme.cyan} border border-current rounded px-1`}>
                            {computed[i].phaseHint === "TOC" ? "↗ TOC"
                              : computed[i].phaseHint === "TOD" ? "↘ TOD"
                              : computed[i].phaseHint === "BOC" ? "↗ BOC"
                              : "↘ BOD"}
                          </span>
                        )}
                        {cp.windMode === "none" && <span className={`text-[10px] ${theme.cyan} border border-current rounded px-1`}>W=0</span>}
                        {cp.windMode === "custom" && <span className={`text-[10px] ${theme.cyan} border border-current rounded px-1`}>W↗</span>}
                      </div>
                      <div className={`text-[10px] ${theme.fgFaint} uppercase tracking-wider truncate flex items-center gap-1`}>
                        {cp.isOrigin
                          ? `Origem · ${cp.useCruiseAlt ? (computed.find(c=>c.isOrigin)?.alt ?? cp.alt) : (cp.alt ?? 0)} ft`
                          : `${cp.useCruiseAlt ? (computed[i]?.alt ?? cp.alt) : (cp.alt ?? "?")} ft · TC ${String(computed[i]?.tc ?? cp.tc ?? 0).padStart(3, "0")}° · ${computed[i]?.dist ?? cp.dist ?? 0} NM`}
                        {cp.useCruiseAlt && <span className={`text-[10px] ${theme.accent} border border-current rounded px-1 normal-case`}>CRZ</span>}
                      </div>
                      {computed[i]?.warnings?.length > 0 && (
                        <div className="mt-0.5 space-y-0.5">
                          {computed[i].warnings.map(function(w, wi) {
                            return <div key={wi} className="text-[10px] text-red-400 leading-tight">⚠ {w}</div>;
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                  <Pencil className={`w-3.5 h-3.5 ${computed[i]?.warnings?.length ? 'text-red-400' : theme.fgFaint} shrink-0 ml-1`} />
                </button>
              )}

              {/* Lixeira — apenas para waypoints manuais */}
              {!cp.isOrigin && !cp.isAuto && (
                <button
                  onClick={() => onDeleteCp(i)}
                  className={`${theme.panel} border ${theme.panelBorder} rounded px-2.5 ${theme.fgFaint} hover:text-red-400 active:scale-95 shrink-0`}
                  aria-label="Remover"
                >
                  <Trash className="w-4 h-4" />
                </button>
              )}
            </div>
            </React.Fragment>
            );
          })}
          <button onClick={onAddCp}
            className={`w-full border border-dashed ${theme.inputBorder} rounded px-3 py-2 ${theme.fgFaint} flex items-center justify-center gap-2 text-sm transition-colors`}>
            <Plus className="w-4 h-4" /> Adicionar waypoint
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={onImportFPL}
            className={`${theme.panel} border ${theme.inputBorder} ${theme.fgMuted} rounded px-2 py-2 text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 transition-colors`}>
            <Upload className="w-3 h-3" /> FPL
          </button>
          <button onClick={onNewBlank}
            className={`${theme.panel} border ${theme.inputBorder} ${theme.fgMuted} rounded px-2 py-2 text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 transition-colors`}>
            <FileText className="w-3 h-3" /> Limpar
          </button>
        </div>
      </Section>

      {/* MEUS PONTOS */}
      <Section theme={theme} icon={<MapPin className="w-4 h-4" />} title={`Meus pontos · ${(userPoints || []).length}`}
        collapsible defaultOpen={(userPoints || []).length <= 5}>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <button
            onClick={function() {
              const data = { format: "navlog-userpts/v1", exportedAt: new Date().toISOString(), points: userPoints };
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "navlog-pontos-" + new Date().toISOString().slice(0,10) + ".json";
              document.body.appendChild(a); a.click(); document.body.removeChild(a);
              setTimeout(function() { URL.revokeObjectURL(url); }, 500);
            }}
            disabled={(userPoints || []).length === 0}
            className={`${theme.panel} border ${theme.inputBorder} ${(userPoints || []).length === 0 ? theme.fgFaint + ' opacity-40' : theme.fgMuted} rounded px-2 py-2 text-[10px] uppercase tracking-wider flex items-center justify-center gap-1`}>
            <Download className="w-3 h-3" /> Exportar JSON
          </button>
          <label className={`${theme.panel} border ${theme.inputBorder} ${theme.fgMuted} rounded px-2 py-2 text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer active:scale-95`}>
            <Upload className="w-3 h-3" /> Importar JSON
            <input type="file" accept="application/json,.json" className="hidden"
              onChange={async function(e) {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                try {
                  const text = await file.text();
                  const parsed = JSON.parse(text);
                  let arr = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.points) ? parsed.points : null);
                  if (!arr) { alert("Formato não reconhecido (esperado array ou objeto com 'points')."); e.target.value = ""; return; }
                  let imported = 0, skipped = 0;
                  for (const pt of arr) {
                    if (!pt || pt.lat == null || pt.lon == null) { skipped++; continue; }
                    await onAddUserPoint({
                      name: pt.name || "PT",
                      kind: pt.kind || "custom",
                      lat: Number(pt.lat),
                      lon: Number(pt.lon),
                      alt: pt.alt != null ? Number(pt.alt) : null,
                      notes: pt.notes || "",
                      tags: pt.tags || [],
                      source: pt.source || { kind: "manual" },
                    });
                    imported++;
                  }
                  alert("Importados: " + imported + (skipped ? " · Ignorados: " + skipped : ""));
                } catch (err) {
                  alert("Erro ao importar: " + (err.message || err));
                }
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {(userPoints || []).length === 0 ? (
          <div className={`text-[11px] ${theme.fgFaint} text-center py-2`}>
            Nenhum ponto guardado. Use o botão <Search className="w-3 h-3 inline -mt-0.5" /> no editor de waypoint para criar (busca / radial+dist / interseção / coords) e <strong>Salvar na biblioteca</strong>.
          </div>
        ) : (
          <div className={`${theme.panel} border ${theme.panelBorder} rounded-xl divide-y ${theme.panelBorder} overflow-hidden`}>
            {[...userPoints].sort(function(a, b) { return (a.name || "").localeCompare(b.name || ""); }).map(function(pt) {
              return (
                <div key={pt.id || pt.name}
                  className="grid items-center gap-2 px-3 py-2"
                  style={{ gridTemplateColumns: "3.5rem minmax(0, 1fr) auto" }}>
                  <span className={`text-[10px] font-bold ${theme.accent} inline-flex items-center gap-1`}>
                    <Star className="w-3 h-3 fill-current shrink-0" />
                    {pt.kind === "computed" ? "CALC" : pt.kind === "airport" ? "APT" : pt.kind === "navaid" ? "NAV" : pt.kind === "waypoint" ? "WPT" : "MEU"}
                  </span>
                  <div className="min-w-0">
                    <div className={`font-bold truncate ${theme.fg}`}>{pt.name}</div>
                    <div className={`text-xs truncate num ${theme.fgFaint}`}>
                      {pt.lat != null ? pt.lat.toFixed(4) : "—"}, {pt.lon != null ? pt.lon.toFixed(4) : "—"}
                      {pt.alt != null ? ` · ${pt.alt} ft` : ""}
                      {pt.notes ? ` · ${pt.notes}` : ""}
                    </div>
                  </div>
                  <button
                    onClick={function() {
                      if (confirm(`Remover ${pt.name} da biblioteca?`)) onDeleteUserPoint(pt.id);
                    }}
                    className={`px-2 py-1 rounded border border-red-500/40 text-red-400 text-[10px] active:scale-95`}>
                    Remover
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

export { SetupTab };
