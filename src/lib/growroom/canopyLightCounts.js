// Display-only inventory derived from persisted bench geometry.
// Every bench section receives exactly two canopy fixtures per tier.
export function countCanopyLightsByLength(benches = []) {
  return benches.reduce((counts, bench) => {
    const tiers = Math.max(1, Math.round(Number(bench?.tiers) || 1));
    const fixtureCount = 2 * tiers;
    const lengthIn = Number(bench?.lengthIn) || 0;

    if (lengthIn >= 72) counts.eightFt += fixtureCount;
    else counts.fourFt += fixtureCount;

    return counts;
  }, { fourFt: 0, eightFt: 0 });
}

export function countCanopyPowerHardware(benches = []) {
  // One power cable per beginning bench: the frontmost row only. Benches
  // farther back continue the run and do not receive another power cable.
  const rowPositions = benches.map((bench) => Math.round((Number(bench?.pos?.y) || 0) * 10) / 10);
  const frontRowY = rowPositions.length ? Math.min(...rowPositions) : null;
  const powerCables = frontRowY === null
    ? 0
    : rowPositions.filter((y) => y === frontRowY).length;

  return {
    powerCables,
    splitters: Math.ceil(powerCables / 2),
  };
}