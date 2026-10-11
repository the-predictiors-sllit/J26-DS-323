export type SolarSettings = {
  latitude: number; longitude: number; timezone: string; altitude_m: number;
  year: number; interval_minutes: number; weather_mode: 'clear_sky' | 'historical' | 'csv';
  projection: 'equisolid' | 'equidistant'; center_x: number; center_y: number; radius: number;
  north_offset_deg: number; azimuth_clockwise: boolean;
  geometry_status: 'assumed' | 'verified'; geometry_acknowledged: boolean;
  baseline_tilt: number; baseline_azimuth: number; max_tilt: number; albedo: number;
  panel_count: number | null; panel_watts: number | null; performance_ratio: number; seed: number;
};
export type SunMap = {
  mask_width: number; mask_height: number;
  geometry: { cx: number; cy: number; radius: number; cardinals: { label: string; x: number; y: number }[] };
  sun_samples: { x: number; y: number; visible: boolean; time: string }[];
};
type Candidate = { tilt_deg: number; azimuth_deg: number; poa_kwh_m2: number; energy_kwh?: number | null };
export type SolarReport = SunMap & {
  settings: SolarSettings; selected_method: string; selected: Candidate; baseline: Candidate;
  gain_percent: number | null; capacity_kwp: number | null; warnings: string[]; weather_source: string;
  pso: { best: Candidate; runs: (Candidate & { seed: number; history_kwh_m2: number[] })[] };
  grid: Candidate & { evaluations: number }; pso_minus_grid_kwh_m2: number;
  dni_weighted_blocked_percent: number | null;
  monthly: { month: number; selected_poa_kwh_m2: number; baseline_poa_kwh_m2: number; selected_energy_kwh: number | null; baseline_energy_kwh: number | null }[];
};
const API = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
export function weatherTemplateUrl(year: number, minutes: number, timezone: string) {
  return `${API}/solar/weather-template?year=${year}&interval_minutes=${minutes}&timezone=${encodeURIComponent(timezone)}`;
}
export async function calculateSolar(settings: SolarSettings, mask: Blob, weather?: File, previewOnly = false): Promise<SolarReport | SunMap> {
  const data = new FormData();
  data.append('settings', JSON.stringify(settings));
  data.append('mask', mask, mask instanceof File ? mask.name : 'predicted_mask.png');
  data.append('preview_only', String(previewOnly));
  if (weather && !previewOnly) data.append('weather', weather);
  const response = await fetch(`${API}/solar/analyze`, { method: 'POST', body: data, signal: AbortSignal.timeout(300000) });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : JSON.stringify(result.detail));
  return result;
}
