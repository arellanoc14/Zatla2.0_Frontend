// Under-canopy (supplemental) lighting — single source of truth.
//
// Derived ONLY from the real placed benches on the schematic. Two fixtures per
// bench; fixture length/wattage chosen by the bench's length:
//   4ft bench run → 2× 4ft fixtures @ 150W (450 µmol/s PPF, 1.28A @120V)
//   8ft bench run → 2× 8ft fixtures @ 300W (900 µmol/s PPF, 2.57A @120V)
// Mixed 4ft/8ft layouts total correctly because each bench is classified
// individually by its own length.
//
// Top (overhead) lights are NEVER handled here — they are always counted
// elsewhere and are unaffected by the canopy toggle.

const REF_VOLTAGE = 120;

// Fixture specs keyed by nominal length in feet — based on the GrowPros
// Solutions UCL Model 3 "Cobra" under-canopy line (wegrowpros.com):
//   Full fixture: 300W dual-channel (150W UVA/Blue/5000K + 150W Deep Red/Far
//   Red/3000K), 900 µmol/s PPF, 3.0 µmol/J, 2.57A @ 120V, covers ~7ft × 6ft.
//   4ft benches use a single 150W channel-equivalent (450 µmol/s, 1.28A @120V).
const FIXTURE_4FT = { lengthFt: 4, watts: 150, ppf: 450, ampsAt120: 1.28, label: "4ft under-canopy fixture (150W)" };
const FIXTURE_8FT = { lengthFt: 8, watts: 300, ppf: 900, ampsAt120: 2.57, label: "UCL Model 3 Cobra (300W)" };

// Pick the fixture for a single bench based on its run length (inches).
// Benches 6ft+ are treated as 8ft runs; shorter runs use 4ft fixtures.
function fixtureForBench(bench) {
  const lengthFt = Math.round((bench.lengthIn || 0) / 12);
  return lengthFt >= 6 ? FIXTURE_8FT : FIXTURE_4FT;
}

// Compute under-canopy totals across all placed benches.
// `voltage` scales amperage (P = V·I → I = P/V); higher voltage = lower amps.
export function computeUnderCanopy(benches = [], voltage = REF_VOLTAGE) {
  const v = voltage > 0 ? voltage : REF_VOLTAGE;
  let fixtures = 0;
  let watts = 0;
  let ppf = 0;
  const groups = new Map(); // lengthFt -> { fixture, fixtures }

  for (const b of benches) {
    const fx = fixtureForBench(b);
    fixtures += 2;
    watts += fx.watts * 2;
    ppf += fx.ppf * 2;
    const g = groups.get(fx.lengthFt) || { fixture: fx, fixtures: 0 };
    g.fixtures += 2;
    groups.set(fx.lengthFt, g);
  }

  // Amps from real power at the selected voltage (single source of truth).
  const amps = watts / v;

  return {
    fixtures,
    watts,
    ppf,                 // total supplemental PPF (µmol/s)
    amps,                // total under-canopy amperage at `voltage`
    voltage: v,
    groups: [...groups.values()].sort((a, b) => a.fixture.lengthFt - b.fixture.lengthFt),
  };
}

export { FIXTURE_4FT, FIXTURE_8FT, REF_VOLTAGE };