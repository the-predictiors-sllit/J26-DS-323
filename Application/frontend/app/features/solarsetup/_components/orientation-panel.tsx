'use client';
import { useEffect, useState } from 'react';
import { Button, buttonStyles } from './primitives';
import { Card, Input, Check, NativeSelect } from './primitives';
import { calculateSolar, weatherTemplateUrl, type SolarReport, type SolarSettings, type SunMap } from '../_lib/solar-api';

const defaults: SolarSettings = {
  latitude: 0, longitude: 0, timezone: 'Asia/Colombo', altitude_m: 0, year: 2025,
  interval_minutes: 60, weather_mode: 'historical', projection: 'equisolid',
  center_x: .5, center_y: .5, radius: .5, north_offset_deg: 0, azimuth_clockwise: true,
  geometry_status: 'assumed', geometry_acknowledged: false,
  baseline_tilt: 7, baseline_azimuth: 180, max_tilt: 60, albedo: .2,
  panel_count: null, panel_watts: null, performance_ratio: .8, seed: 42,
};
const inputClass = 'mt-1 w-full';
const display = (value: number | null | undefined, digits = 2) => value == null ? '—' : value.toFixed(digits);

function DownloadReport({ report }: { report: SolarReport }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const value = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    setUrl(value); return () => URL.revokeObjectURL(value);
  }, [report]);
  return <a className={buttonStyles('primary')} href={url} download={`solar_report_${report.settings.year}.json`}>Download full report JSON</a>;
}
function SunOverlay({ map, maskUrl, photoUrl }: { map: SunMap; maskUrl: string; photoUrl?: string }) {
  const [onPhoto, setOnPhoto] = useState(false);
  const scale = Math.min(map.mask_width, map.mask_height);
  return <div className="space-y-3">
    {photoUrl && <label className="flex items-center gap-2 text-sm"><Check  checked={onPhoto} onChange={e => setOnPhoto(e.target.checked)} />Show on matching original photo</label>}
    <svg viewBox={`0 0 ${map.mask_width} ${map.mask_height}`} className="mx-auto max-h-96 w-full rounded-lg border border-border bg-muted" role="img" aria-label="Annual sun samples and calibrated horizon on the selected mask">
      <image href={onPhoto && photoUrl ? photoUrl : maskUrl} width={map.mask_width} height={map.mask_height} />
      <circle cx={map.geometry.cx} cy={map.geometry.cy} r={map.geometry.radius} fill="none" stroke="#06b6d4" strokeWidth={scale * .003} />
      {map.sun_samples.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={scale * .0018} fill={p.visible ? '#16a34a' : '#ef4444'} opacity={.75}><title>{p.time}: {p.visible ? 'sky' : 'obstacle'}</title></circle>)}
      {map.geometry.cardinals.map(p => <text key={p.label} x={map.geometry.cx + (p.x - map.geometry.cx) * .91} y={map.geometry.cy + (p.y - map.geometry.cy) * .91} textAnchor="middle" dominantBaseline="middle" fontSize={scale * .027} fontWeight="bold" fill="#06b6d4" stroke="#0f172a" strokeWidth={scale * .001} paintOrder="stroke">{p.label}</text>)}
    </svg>
    <p className="text-xs text-muted-foreground">Green: visible sun sample · Red: blocked sample · Cyan: horizon and directions. Display is thinned to at most 2,500 annual points; calculation uses all intervals.</p>
  </div>;
}

export function OrientationPanel({ predictedMask, photoUrl }: { predictedMask?: string; photoUrl?: string }) {
  const [settings, setSettings] = useState<SolarSettings>(defaults);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [manualMask, setManualMask] = useState<File | null>(null);
  const [maskUrl, setMaskUrl] = useState(predictedMask || '');
  const [weather, setWeather] = useState<File | undefined>();
  const [map, setMap] = useState<SunMap | null>(null);
  const [report, setReport] = useState<SolarReport | null>(null);
  const [previewConfirmed, setPreviewConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!manualMask) { setMaskUrl(predictedMask || ''); return; }
    const value = URL.createObjectURL(manualMask); setMaskUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [manualMask, predictedMask]);
  // Any input change invalidates results; never show an old result as a new calculation.
  useEffect(() => { setMap(null); setReport(null); setPreviewConfirmed(false); setError(''); }, [settings, latitude, longitude, manualMask, predictedMask, weather]);
  function update<K extends keyof SolarSettings>(key: K, value: SolarSettings[K]) { setSettings(previous => ({ ...previous, [key]: value })); }
  async function run(previewOnly: boolean) {
    setError('');
    if (latitude.trim() === '' || longitude.trim() === '') { setError('Enter the actual latitude and longitude of the photographed location.'); return; }
    if (!maskUrl) { setError('Generate a mask on Site analysis, or upload a binary PNG mask here.'); return; }
    if (!settings.geometry_acknowledged) { setError('Review and acknowledge the camera geometry settings first.'); return; }
    if (!previewOnly && settings.weather_mode === 'csv' && !weather) { setError('Choose a full-year weather CSV.'); return; }
    setBusy(true); setReport(null);
    try {
      const mask = manualMask || await (await fetch(predictedMask!)).blob();
      const response = await calculateSolar({ ...settings, latitude: Number(latitude), longitude: Number(longitude) }, mask, weather, previewOnly);
      setMap(response);
      if (!previewOnly) setReport(response as SolarReport);
    } catch (e) { setError(e instanceof Error ? e.message : 'Calculation failed.'); }
    finally { setBusy(false); }
  }
  function numberField(key: keyof SolarSettings, label: string, step = 'any', min?: number, max?: number) {
    return <label className="block text-sm" key={key}>{label}<Input className={inputClass} type="number" step={step} min={min} max={max} value={settings[key] == null ? '' : String(settings[key])} onChange={e => update(key, e.target.value === '' ? null as never : Number(e.target.value) as never)} required={key !== 'panel_count' && key !== 'panel_watts'} /></label>;
  }
  return <div className="space-y-6">
    <div className="rounded-lg border border-border bg-muted p-4 text-sm text-foreground">Research calculation: results depend on the mask, camera geometry and irradiance assumptions. Clear-sky results are not measured annual generation. Correct projection cannot be inferred just from a square image.</div>
    <form onSubmit={e => { e.preventDefault(); void run(true); }}>
      <fieldset disabled={busy} className="space-y-6 disabled:opacity-70">
        <Card className="space-y-4"><h2 className="text-lg font-semibold">1. Location and mask</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm">Latitude (North positive)<Input required type="number" min="-90" max="90" step="any" className={inputClass} value={latitude} onChange={e => setLatitude(e.target.value)} placeholder="Your capture location" /></label>
            <label className="text-sm">Longitude (East positive)<Input required type="number" min="-180" max="180" step="any" className={inputClass} value={longitude} onChange={e => setLongitude(e.target.value)} placeholder="Your capture location" /></label>
            <label className="text-sm">Timezone<Input required className={inputClass} value={settings.timezone} onChange={e => update('timezone', e.target.value)} /></label>
            {numberField('altitude_m', 'Altitude (m; default sea level)', 'any', -400, 6000)}
          </div>
          <p className="text-sm text-muted-foreground">{manualMask ? `Selected file: ${manualMask.name}` : predictedMask ? 'Using the mask just generated on Site analysis.' : 'No mask selected. Generate one on Site analysis or upload one below.'}</p>
          <label className="block text-sm">Optional: upload a predicted or reviewed mask<Input type="file" accept="image/png" className={inputClass} onChange={e => setManualMask(e.target.files?.[0] || null)} /></label>
          {manualMask && predictedMask && <Button variant="secondary" onClick={() => setManualMask(null)}>Use current model prediction</Button>}
          <p className="text-xs text-muted-foreground">PNG: black = sky, white = obstacle. No grey or transparent pixels. A reviewed mask is optional for implementation, but needed for local validation.</p>
        </Card>
        <Card className="space-y-4"><h2 className="text-lg font-semibold">2. Camera geometry — verify before interpreting results</h2>
          <p className="text-sm text-muted-foreground">Requires an upward, level, complete circular 180° hemisphere. Defaults assume a centered horizon disk. If the export does not match, these defaults are not calibration.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm">Projection<NativeSelect className={inputClass} value={settings.projection} onChange={e => update('projection', e.target.value as SolarSettings['projection'])}><option value="equisolid">Equisolid (assumption until verified)</option><option value="equidistant">Equidistant</option></NativeSelect></label>
            {numberField('center_x', 'Center X / (width − 1)', '.001', 0, 1)}
            {numberField('center_y', 'Center Y / (height − 1)', '.001', 0, 1)}
            {numberField('radius', 'Horizon radius / (short side − 1)', '.001', .001, .5)}
            {numberField('north_offset_deg', 'North position clockwise from image top (°)', 'any', 0, 359.999)}
            <label className="text-sm">Azimuth increases in the image<NativeSelect className={inputClass} value={String(settings.azimuth_clockwise)} onChange={e => update('azimuth_clockwise', e.target.value === 'true')}><option value="true">Clockwise (E to right when N is at top)</option><option value="false">Counterclockwise (E to left when N is at top)</option></NativeSelect></label>
            <label className="text-sm">Geometry evidence<NativeSelect className={inputClass} value={settings.geometry_status} onChange={e => update('geometry_status', e.target.value as 'assumed' | 'verified')}><option value="assumed">Assumed — exploratory result</option><option value="verified">Verified externally with calibration / directions</option></NativeSelect></label>
          </div>
          <label className="flex items-start gap-2 text-sm"><Check  required checked={settings.geometry_acknowledged} onChange={e => update('geometry_acknowledged', e.target.checked)} className="mt-1" />I have checked the full 180° disk, level, projection and true North/handedness, or am explicitly proceeding with unverified assumptions for development.</label>
        </Card>
        <Card className="space-y-4"><h2 className="text-lg font-semibold">3. Irradiance and orientation limits</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm">Irradiance source<NativeSelect className={inputClass} value={settings.weather_mode} onChange={e => { const mode = e.target.value as SolarSettings['weather_mode']; setSettings(previous => ({ ...previous, weather_mode: mode, ...(mode === 'historical' ? { interval_minutes: 60, year: Math.min(previous.year, new Date().getFullYear() - 1) } : {}) })); setWeather(undefined); }}><option value="historical">Historical weather — automatic API</option><option value="clear_sky">Clear-sky model — no weather upload</option><option value="csv">Advanced: own full-year weather CSV</option></NativeSelect></label>
            {numberField('year', 'Simulation / data year', '1', 2000, settings.weather_mode === 'historical' ? new Date().getFullYear() - 1 : 2100)}
            <label className="text-sm">Interval<NativeSelect className={inputClass} value={settings.interval_minutes} disabled={settings.weather_mode === 'historical'} onChange={e => update('interval_minutes', Number(e.target.value))}><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">60 minutes</option></NativeSelect></label>
            {numberField('baseline_tilt', 'Baseline tilt (°; project reference 7°)', 'any', 0, 90)}
            {numberField('baseline_azimuth', 'Baseline azimuth (°; 180° = South)', 'any', 0, 359.999)}
            {numberField('max_tilt', 'Maximum feasible tilt (°; minimum 0°)', 'any', 1, 90)}
            {numberField('albedo', 'Ground reflectance / albedo', '.01', 0, 1)}
          </div>
          <p className="text-xs text-muted-foreground">Azimuth search: 0–360° clockwise from true North. Only use these limits if the roof/mount allows the orientations. One capture point does not model row shading or the whole array.</p>
          {settings.weather_mode === 'historical' && <p className="text-sm text-muted-foreground">Downloads the selected complete year's hourly solar radiation automatically, then reuses a local cache. No CSV upload or model retraining needed. Regional weather estimates, not rooftop measurements or a future forecast. Weather data: <a className="underline" href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> / Copernicus ERA5 (CC BY 4.0). Free API for non-commercial research; usage limits apply. If download fails, an error is shown; Clear-sky is never substituted automatically.</p>}
          {settings.weather_mode === 'csv' && <div className="space-y-3"><label className="block text-sm">Weather CSV<Input type="file" accept=".csv,text/csv" className={inputClass} onChange={e => setWeather(e.target.files?.[0])} /></label><a className={buttonStyles('secondary')} href={weatherTemplateUrl(settings.year, settings.interval_minutes, settings.timezone)}>Download empty timestamp template</a><p className="text-xs text-muted-foreground">Columns: timestamp, ghi, dni, dhi. W/m² interval means; timestamps mark interval starts and include offsets. Full year with no gaps. Template contains no measured weather. See docs/SOLAR_IMPLEMENTATION.md.</p></div>}
        </Card>
        <Card className="space-y-4"><h2 className="text-lg font-semibold">4. Optional energy estimate</h2><p className="text-sm text-muted-foreground">Leave panel count and watts empty for irradiation-only results. Enter both for a simplified fixed-performance-ratio estimate.</p><div className="grid gap-4 sm:grid-cols-3">{numberField('panel_count', 'Number of panels', '1', 1, 10000)}{numberField('panel_watts', 'Rated watts per panel', 'any', 1, 2000)}{numberField('performance_ratio', 'Assumed performance ratio', '.01', .01, 1)}</div></Card>
        <Button type="submit">{busy ? 'Calculating…' : 'Preview annual sun path'}</Button>
      </fieldset>
    </form>
    {error && <p className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive" role="alert">{error}</p>}
    {map && <Card className="space-y-4"><h2 className="text-lg font-semibold">Sun-path and direction check</h2><SunOverlay map={map} maskUrl={maskUrl} photoUrl={!manualMask ? photoUrl : undefined} /><label className="flex items-start gap-2 text-sm"><Check disabled={busy}  checked={previewConfirmed} onChange={e => setPreviewConfirmed(e.target.checked)} className="mt-1" />I checked the horizon and N/E/S/W placement; I understand that selecting “verified” does not itself calibrate the image.</label><Button disabled={busy || !previewConfirmed} onClick={() => void run(false)}>{busy ? 'Optimizing — keep this page open…' : 'Run PSO and grid comparison'}</Button></Card>}
    {report && <Card className="space-y-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">Best candidate under the selected assumptions</h2><p className="mt-1 text-sm text-muted-foreground">Selected method: {report.selected_method} · {report.settings.geometry_status === 'verified' ? 'User-declared verified geometry' : 'Unverified geometry'}</p></div><DownloadReport report={report} /></div>
      <p className="text-sm text-muted-foreground">Weather source: {report.weather_source}</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[['Tilt', `${display(report.selected.tilt_deg, 1)}°`], ['Azimuth', `${display(report.selected.azimuth_deg, 1)}°`], ['Annual plane-of-array irradiation', `${display(report.selected.poa_kwh_m2)} kWh/m²`], ['Gain vs entered baseline', report.gain_percent == null ? 'Undefined (zero baseline)' : `${display(report.gain_percent)}%`]].map(([label,value]) => <div key={label} className="rounded-lg bg-muted/40 p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>)}</div>
      {report.capacity_kwp != null && <p className="rounded-lg bg-primary/10 p-4 text-sm text-foreground">Capacity: {display(report.capacity_kwp)} kWp · Simplified annual energy: {display(report.selected.energy_kwh)} kWh · Baseline: {display(report.baseline.energy_kwh)} kWh. Same capacity and PR for both. This is simulated energy, not validated generation.</p>}
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="mb-2 text-left font-medium">Optimizer comparison — same mask and irradiance</caption><thead><tr className="border-b"><th className="p-2">Candidate</th><th className="p-2">Tilt °</th><th className="p-2">Azimuth °</th><th className="p-2">kWh/m²/year</th></tr></thead><tbody>{[['PSO',report.pso.best],['Grid (5° tilt / 10° azimuth)',report.grid],['Entered baseline',report.baseline]].map(([label,value]) => { const v=value as SolarReport['selected'];return <tr key={String(label)} className="border-b border-border"><td className="p-2">{String(label)}</td><td className="p-2">{display(v.tilt_deg,1)}</td><td className="p-2">{display(v.azimuth_deg,1)}</td><td className="p-2">{display(v.poa_kwh_m2)}</td></tr>;})}</tbody></table></div>
      <p className="text-xs text-muted-foreground">Grid checks only the sampled angles; PSO is stochastic. Agreement is an optimizer check, not proof of actual energy accuracy. DNI-weighted blocked fraction: {display(report.dni_weighted_blocked_percent)}% (not electrical energy loss).</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="mb-2 text-left font-medium">Monthly comparison</caption><thead><tr className="border-b"><th className="p-2">Month</th><th className="p-2">Selected kWh/m²</th><th className="p-2">Baseline kWh/m²</th>{report.capacity_kwp != null && <th className="p-2">Selected energy kWh</th>}</tr></thead><tbody>{report.monthly.map(m => <tr key={m.month} className="border-b border-border"><td className="p-2">{m.month}</td><td className="p-2">{display(m.selected_poa_kwh_m2)}</td><td className="p-2">{display(m.baseline_poa_kwh_m2)}</td>{report.capacity_kwp != null && <td className="p-2">{display(m.selected_energy_kwh)}</td>}</tr>)}</tbody></table></div>
      <div className="text-sm text-muted-foreground"><p className="font-medium">Assumptions and limitations</p><ul className="mt-2 list-disc space-y-2 pl-5">{report.warnings.map(w => <li key={w}>{w}</li>)}</ul></div>
    </Card>}
  </div>;
}
