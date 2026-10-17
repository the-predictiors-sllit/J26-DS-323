"""Open-Meteo ERA5 hourly radiation with explicit interval alignment and disk cache."""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import tempfile
from urllib.parse import urlencode
from urllib.request import urlopen
from urllib.error import HTTPError, URLError
import numpy as np
import pandas as pd

ENDPOINT = 'https://archive-api.open-meteo.com/v1/archive'
VARIABLES = ('shortwave_radiation', 'direct_normal_irradiance', 'diffuse_radiation')
CACHE_DIR = Path(__file__).resolve().parents[1] / 'data' / 'weather_cache'


def fetch_payload(params):
    try:
        with urlopen(ENDPOINT + '?' + urlencode(params), timeout=60) as response:
            raw = response.read(8 * 1024 * 1024 + 1)
        if len(raw) > 8 * 1024 * 1024:
            raise ValueError('Weather response exceeds 8 MB.')
        payload = json.loads(raw)
        if not isinstance(payload, dict) or payload.get('error'):
            raise ValueError('Weather provider returned an invalid response.')
        return payload
    except HTTPError as exc:
        raise ValueError(f'Historical weather API returned HTTP {exc.code}. Retry later or explicitly select Clear-sky. No fallback was used.') from exc
    except (URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        raise ValueError('Cannot download historical weather. Check internet access and retry. No Clear-sky fallback was used.') from exc


def align_hourly(payload, starts):
    """Conserve irradiance integral when UTC hour ends meet local hour starts.

    API values represent the preceding hour. Treat each as a piecewise-constant
    hourly mean, then integrate overlaps. This does not create finer weather data.
    """
    try:
        hourly = payload['hourly']
        if payload.get('utc_offset_seconds') != 0:
            raise ValueError('Expected UTC weather response.')
        units = payload['hourly_units']
        if any(units.get(v) != 'W/m²' for v in VARIABLES):
            raise ValueError('Unexpected solar radiation units; expected W/m².')
        ends = pd.DatetimeIndex(pd.to_datetime(hourly['time'], utc=True))
        values = np.column_stack([np.asarray(hourly[v], dtype=float) for v in VARIABLES])
        seconds = ends.as_unit('ns').asi8 / 1e9
        if len(seconds) < 2 or not np.all(np.diff(seconds) == 3600):
            raise ValueError('Weather timestamps have gaps, duplicates or wrong ordering.')
        if values.shape != (len(ends), 3) or not np.isfinite(values).all() or np.any((values < 0) | (values > 2000)):
            raise ValueError('Historical weather contains missing or invalid irradiance. No gaps were filled.')
        edges = np.concatenate(([seconds[0] - 3600], seconds))
        target = starts.as_unit('ns').asi8 / 1e9
        target_edges = np.concatenate((target, [target[-1] + 3600]))
        if target_edges[0] < edges[0] or target_edges[-1] > edges[-1]:
            raise ValueError('Historical weather does not cover the entire selected local year.')
        integral = np.vstack((np.zeros(3), np.cumsum(values * 3600, axis=0)))
        sampled = np.column_stack([np.interp(target_edges, edges, integral[:, i]) for i in range(3)])
        return np.diff(sampled, axis=0) / 3600
    except (KeyError, TypeError, IndexError) as exc:
        raise ValueError('Incomplete historical weather response; expected hourly GHI/DNI/DHI.') from exc


def historical_weather(settings, starts):
    start_utc = starts[0].tz_convert('UTC')
    end_utc = (starts[-1] + pd.Timedelta(hours=1)).tz_convert('UTC')
    params = dict(latitude=settings.latitude, longitude=settings.longitude,
                  start_date=(start_utc - pd.Timedelta(days=1)).strftime('%Y-%m-%d'),
                  end_date=(end_utc + pd.Timedelta(days=1)).strftime('%Y-%m-%d'),
                  hourly=','.join(VARIABLES), models='era5', timezone='GMT')
    key = hashlib.sha256(json.dumps(params, sort_keys=True).encode()).hexdigest()
    path = CACHE_DIR / (key + '.json')
    warnings = []
    cached = False
    envelope = None
    if path.exists():
        try:
            candidate = json.loads(path.read_text(encoding='utf-8'))
            if candidate['request'] != params:
                raise ValueError('Cache request mismatch')
            align_hourly(candidate['payload'], starts)
            envelope = candidate
            cached = True
        except (ValueError, KeyError, TypeError, OSError):
            warnings.append('Invalid cached weather was ignored; downloaded a new copy.')
    if envelope is None:
        payload = fetch_payload(params)
        align_hourly(payload, starts)  # Never cache incomplete responses.
        envelope = dict(request=params, downloaded_utc=datetime.now(timezone.utc).isoformat(), payload=payload)
        temp_name = None
        try:
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=CACHE_DIR, delete=False) as f:
                temp_name = f.name
                json.dump(envelope, f, allow_nan=False)
            os.replace(temp_name, path)
        except OSError:
            warnings.append('Weather downloaded, but could not be cached on disk.')
        finally:
            if temp_name and Path(temp_name).exists():
                Path(temp_name).unlink(missing_ok=True)
    payload = envelope['payload']
    values = align_hourly(payload, starts)
    metadata = dict(provider='Open-Meteo', model='ERA5', endpoint=ENDPOINT,
                    request=params, downloaded_utc=envelope['downloaded_utc'], cache_hit=cached,
                    response_sha256=hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest(),
                    grid_latitude=payload.get('latitude'), grid_longitude=payload.get('longitude'),
                    attribution='Weather data: Open-Meteo and Copernicus ERA5 (CC BY 4.0).',
                    time_alignment='Preceding UTC-hour means rebinned by overlap to local-hour starts; piecewise-constant hourly assumption.')
    warnings.append(f'{settings.year} historical ERA5 regional model data, not rooftop measurements or a forecast of future years. No additional cloud multiplier is applied.')
    warnings.append('Hourly weather is rebinned to local hours by overlap. Sun/shadow positions use interval midpoints; short shading events may be missed.')
    return values, metadata, warnings
