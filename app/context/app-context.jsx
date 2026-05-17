// AppProvider + 4 React contexts. Split em vez de um único context para
// isolar re-renders por frequência de mudança:
//
//   ThemeContext   — { theme }                     raro
//   PrefsContext   — { prefs, savePrefs }          baixo (toggles)
//   FlightContext  — { flight, setFlight, ac, ...actions }    alto (cada digitação)
//   DerivedContext — { computed, liveRoute, ... }  alto (recomputa com flight)
//
// Componentes que só leem theme não re-renderizam quando flight muda —
// ganho real para CheckpointRow (1Hz ticker em flight-tab.jsx).
//
// Esta primeira versão só monta os providers e expõe os hooks. Os
// componentes continuam recebendo via props até serem migrados
// (commits subsequentes do roadmap Context API).

import React, { createContext, useContext } from "react";

const ThemeContext   = createContext(null);
const PrefsContext   = createContext(null);
const FlightContext  = createContext(null);
const DerivedContext = createContext(null);

export function AppProvider({
  theme,
  prefs, savePrefs,
  flight, setFlight, ac, actions,
  derived,
  children,
}) {
  return (
    <ThemeContext.Provider value={theme}>
      <PrefsContext.Provider value={{ prefs, savePrefs }}>
        <FlightContext.Provider value={{ flight, setFlight, ac, ...actions }}>
          <DerivedContext.Provider value={derived}>
            {children}
          </DerivedContext.Provider>
        </FlightContext.Provider>
      </PrefsContext.Provider>
    </ThemeContext.Provider>
  );
}

function required(value, hookName) {
  if (value == null) throw new Error(hookName + ": missing <AppProvider> ancestor");
  return value;
}

export function useTheme()   { return required(useContext(ThemeContext),   "useTheme"); }
export function usePrefs()   { return required(useContext(PrefsContext),   "usePrefs"); }
export function useFlight()  { return required(useContext(FlightContext),  "useFlight"); }
export function useDerived() { return required(useContext(DerivedContext), "useDerived"); }
