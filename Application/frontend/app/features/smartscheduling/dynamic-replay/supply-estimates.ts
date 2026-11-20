import type { Frame } from "./actions";

/** Estimate supply for covered slots; these are not household-meter readings. */
export function estimateSupply(completed: Frame[]) {
  // A missing observation is unknown, not zero solar or definite grid import.
  const covered = completed.filter((frame) => frame.actual_kw !== null);
  const totals = covered.reduce((sum, frame) => {
    const load = frame.revised_load_kw;
    const solar = frame.actual_kw!;
    // kW × 0.25 hours gives kWh for one 15-minute slot. This assumes the
    // point reading and the simulated load stay constant throughout the slot.
    return {
      load: sum.load + load * 0.25,
      solarUsed: sum.solarUsed + Math.min(load, solar) * 0.25,
      gridShortfall: sum.gridShortfall + Math.max(load - solar, 0) * 0.25,
    };
  }, { load: 0, solarUsed: 0, gridShortfall: 0 });
  return { ...totals, coveredSlots: covered.length, totalSlots: completed.length };
}
