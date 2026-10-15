# Solar orientation implementation

This is an update for the existing `experiments/kithmini` component, not a standalone project.

## Implemented flow

Generate a binary mask using the existing DeepLabV3 model (or upload a reviewed PNG).
Enter actual GPS and camera geometry. Preview the annual sun path, inspect directions,
then run PSO plus independent grid comparison. The result is one fixed tilt and azimuth
for the entire selected year, not a monthly tracking schedule.

The original training code, notebooks, model checkpoint and images need not change.
Black pixels mean sky; white pixels mean opaque obstacles. Reviewed masks remain
necessary for local validation, even though predicted masks can run this pipeline.

## Weather modes

### Historical weather — automatic (UI default: 2025)

The Python backend requests Open-Meteo's Historical Weather API with `models=era5`:
`shortwave_radiation` (GHI), `direct_normal_irradiance` (DNI), and
`diffuse_radiation` (DHI), in W/m². No API key or manually prepared CSV is needed.
The free endpoint is for non-commercial research, subject to provider usage limits.
A long-period request can count as multiple quota calls. Attribute Open-Meteo and
Copernicus ERA5 in reports. Commercial deployment needs a separate licensing review.

Use a completed past year. 2025 has 8,760 hourly intervals; leap years have 8,784.
The source is regional reanalysis, approximately 25 km for ERA5, not measurements
at the photographed roof. Past-year results are not a forecast or guaranteed yield.

The provider labels each value at the END of the preceding UTC hour. We request
padded dates, verify regular complete timestamps/units/finite values, and integrate
overlaps into the selected local year's hourly START intervals. For Asia/Colombo,
this handles the 30-minute offset. Piecewise-constant source hourly means are an
approximation; the conversion preserves the radiation integral before the existing
midpoint night filter. Sun positions and shading use hourly midpoints. Very short
shading events and sunrise/sunset transitions are therefore approximate. Nonzero
radiation at below-horizon midpoints is zeroed with a warning.

Cloud effects are already represented in these radiation estimates. We do not
apply an additional cloud/rain multiplier. Local obstacles come from the image mask.

Successful downloads are cached in `data/weather_cache`, relative to the component
folder, and ignored by Git. The cache key includes the location, padded dates,
variables and fixed source model. Repeated angle searches reuse the loaded data;
PSO does not call the API for each candidate. Invalid caches are rejected. Failed
requests or incomplete data produce an explicit error: no silent Clear-sky fallback.
Delete the corresponding cached JSON deliberately if a fresh provider download is wanted.

Report JSON records provider, request, model, download date, returned grid coordinates,
raw-response SHA-256, time conversion and cache status. Keep the downloaded response
with research evidence locally if exact future reproduction is required.

### Clear-sky

Offline pvlib Ineichen with bundled Linke turbidity climatology. Supports 15, 30 or
60-minute intervals. Excludes actual cloud variability. Retained for testing and
comparison; results are explicitly clear-sky scenarios. For a fair weather-mode
comparison use the SAME year, mask, location, geometry, baseline and 60-minute interval.

### Advanced: own CSV

Retained for custom data and compatibility. Requires a full year of ordered, unique,
offset-aware interval START timestamps and GHI/DNI/DHI in W/m². No missing periods
are invented. The template contains blank values, not real weather. Raw provider
files may require conversion; ordinary users should select automatic historical mode.

## Camera geometry and validation

Assume neither projection nor calibration from a square image alone. The image must
cover a full upward, level 180-degree circular hemisphere at the proposed panel point.
Enter center, horizon radius, true North image position, and clockwise/counterclockwise
azimuth orientation. Confirm projection from lens/export information or calibration.
Unverified geometry remains marked assumed; checking a box is not calibration.

For zenith angle z and horizon radius R:
- Equisolid: r = R sin(z/2) / sin(45 degrees).
- Equidistant: r = R z / 90 degrees.

True-North azimuth, handedness and North image offset determine pixel direction.
Panel tilt changes incidence, not the sun's position or whether the ray is blocked
at this single capture point. One photo does not model shading over an entire array.

## Objective and algorithms

For each time interval and candidate panel normal n:
- Beam = DNI × sky_visibility(sun) × max(0, n dot sun_direction).
- Diffuse = DHI × integral over visible sky of max(0, n dot sky_direction) dOmega / pi.
- Ground reflected = GHI × albedo × (1 - cos(tilt)) / 2.

Diffuse sky is isotropic with 3-degree angular quadrature; ground reflection is
unshaded isotropic. Annual irradiation H = sum(beam + diffuse + ground) × dt_hours / 1000,
in kWh/m². Finite time/angular resolution and opaque binary obstacles are assumptions.

PSO uses 28 particles, 60 iterations and two seeds; tilt is bounded, azimuth wraps
around North. Independent grid comparison uses 5-degree tilt / 10-degree azimuth steps.
The best evaluated candidate from PSO, grid and entered baseline is reported, with its
actual method. Grid agreement checks optimization, not physical accuracy.

The default 7-degree tilt / 180-degree azimuth baseline is a project reference, not a
universal Sri Lankan standard. Compare the same capacity, weather and assumptions.
Gain = 100 × (H_selected - H_baseline) / H_baseline; zero baseline means undefined.

Optional capacity kWp = panel_count × panel_watts / 1000.
Estimated energy kWh = H / (1 kW/m²) × capacity_kWp × assumed_performance_ratio.
Rated watts alone do not estimate annual energy. This simplified model does not
simulate module temperature, clipping, bypass diodes, string mismatch or outages.

## Endpoints and outputs

POST `/solar/analyze`: multipart settings JSON, binary mask PNG, optional CSV,
and `preview_only`. Preview does not download weather. Optimization returns angles,
annual/monthly irradiation, baseline gain, optional energy, method comparisons,
geometry warnings, weather provenance, settings and mask hash.
GET `/solar/weather-template`: blank full-year timestamp CSV for advanced use.
Existing `/health` and `/segment` remain unchanged. Model weights are required only
for mask generation, not a separate new solar training process.

## Verification for this update

28 automated tests pass, including half-hour UTC-to-Colombo rebinned radiation,
leap/full years, cache reuse/corruption, rejected missing data, no silent fallback,
physics/geometry checks and existing backend checks. Frontend typecheck and build pass.
A live full-year API call and optimization passed for a synthetic all-sky mask at
sample coordinates 7 N, 80 E, year 2025. This is connectivity/functional evidence,
not local-site accuracy validation. Browser click-through and actual checkpoint
inference were not repeated here; perform them on the user's laptop.

## Primary sources

- https://open-meteo.com/en/docs/historical-weather-api
- https://open-meteo.com/en/pricing
- https://open-meteo.com/en/terms
- https://pvlib-python.readthedocs.io/en/v0.15.0/reference/generated/pvlib.irradiance.get_total_irradiance.html
- https://pvlib-python.readthedocs.io/en/stable/user_guide/modeling_topics/clearsky.html
