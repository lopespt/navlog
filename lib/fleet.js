// Aircraft profiles for the fleet — short performance specs used by the
// route planner. Exposed via window.FLEET_DEFAULTS so main.jsx and the
// extracted fleet-manager.jsx + routes-manager.jsx can read it as a bare
// identifier, in the same UMD pattern as lib/themes.js.
//
// Shape per aircraft:
//   id           — internal key matching the object key
//   isBuiltIn    — true for the five factory profiles (used to gate
//                  the "Restaurar valores padrão" / delete buttons)
//   name, short  — display name and a 4-char IATA-ish short code
//   tasCruise    — knots at cruise altitude (gets corrected by ISA + alt)
//   vy, vDescent — climb/descent speed in knots
//   rocClimb     — rate of climb in fpm
//   rodDescent   — rate of descent in fpm
//   gph*         — gallons per hour by phase
//   fuelUsable   — usable fuel in gallons
//   mtow, bew    — max takeoff / basic empty weight in lb
//   engine       — text label

const FLEET_DEFAULTS = {
  baron58: {
    id: "baron58", isBuiltIn: true,
    name: "Beechcraft Baron 58",
    short: "BE58",
    tasCruise: 190, vy: 105, vDescent: 150,
    rocClimb: 700, rodDescent: 500,
    gphClimb: 32, gphCruise: 26, gphDescent: 18,
    fuelUsable: 166, mtow: 5500, bew: 3700,
    engine: "Pistão IO-550",
  },
  dakota: {
    id: "dakota", isBuiltIn: true,
    name: "Piper PA-28-236 Dakota",
    short: "PA28",
    tasCruise: 142, vy: 76, vDescent: 120,
    rocClimb: 900, rodDescent: 500,
    gphClimb: 16, gphCruise: 13, gphDescent: 9,
    fuelUsable: 72, mtow: 3000, bew: 1700,
    engine: "Pistão O-540",
  },
  dukePiston: {
    id: "dukePiston", isBuiltIn: true,
    name: "Beechcraft Duke B60 (pistão)",
    short: "DUKE-P",
    tasCruise: 220, vy: 110, vDescent: 160,
    rocClimb: 900, rodDescent: 700,
    gphClimb: 50, gphCruise: 38, gphDescent: 25,
    fuelUsable: 232, mtow: 6775, bew: 4423,
    engine: "Pistão TIO-541",
  },
  dukeTurbine: {
    id: "dukeTurbine", isBuiltIn: true,
    name: "Beechcraft Duke Turbine",
    short: "DUKE-T",
    tasCruise: 260, vy: 120, vDescent: 180,
    rocClimb: 1500, rodDescent: 800,
    gphClimb: 55, gphCruise: 42, gphDescent: 28,
    fuelUsable: 230, mtow: 6775, bew: 4500,
    engine: "Turboélice",
  },
  comanche: {
    id: "comanche", isBuiltIn: true,
    name: "Piper PA-24-250 Comanche",
    short: "PA24",
    tasCruise: 160, vy: 85, vDescent: 130,
    rocClimb: 900, rodDescent: 500,
    gphClimb: 16, gphCruise: 12, gphDescent: 9,
    fuelUsable: 60, mtow: 2900, bew: 1690,
    engine: "Pistão O-540",
  },
};

const __NAVLOG_FLEET__ = { FLEET_DEFAULTS };
if (typeof module !== "undefined" && module.exports) {
  module.exports = __NAVLOG_FLEET__;
}
if (typeof window !== "undefined") {
  Object.assign(window, __NAVLOG_FLEET__);
}
