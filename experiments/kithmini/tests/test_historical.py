"""API adapter tests use deterministic responses, never consume provider quota."""
import json
import sys
from pathlib import Path
import numpy as np
import pandas as pd
import pytest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from solar import historical as h
from solar.schema import SolarSettings
from solar.weather import annual_starts, load_weather


def settings(**changes):
    args = dict(latitude=7, longitude=80, projection='equisolid', center_x=.5,
                center_y=.5, radius=.5, azimuth_clockwise=True, geometry_acknowledged=True,
                weather_mode='historical', year=2025, interval_minutes=60)
    return SolarSettings(**(args | changes))


def payload(starts):
    ends = pd.date_range(starts[0].tz_convert('UTC').floor('h') - pd.Timedelta(hours=1),
                         starts[-1].tz_convert('UTC').ceil('h') + pd.Timedelta(hours=2), freq='h')
    return dict(utc_offset_seconds=0, latitude=7, longitude=80,
                hourly_units={v:'W/m²' for v in h.VARIABLES},
                hourly={'time':[t.strftime('%Y-%m-%dT%H:%M') for t in ends],
                        **{v:[100.0]*len(ends) for v in h.VARIABLES}})


def test_preceding_hour_and_colombo_half_hour_alignment():
    starts=pd.date_range('2025-01-01T00:00:00+05:30', periods=2, freq='h')
    p=payload(starts)
    p['hourly']['time'] = [f'2024-12-31T{hour}:00' for hour in range(18,23)]
    # Ends 18:00,19:00,20:00,21:00,22:00 UTC, values 0,10,20,30,40.
    for v in h.VARIABLES: p['hourly'][v]=list(np.arange(5,dtype=float)*10)
    out=h.align_hourly(p,starts)
    np.testing.assert_allclose(out[:,0],[15,25])


@pytest.mark.parametrize('year,count',[(2025,8760),(2024,8784)])
def test_complete_year_cache_and_metadata(tmp_path,monkeypatch,year,count):
    s=settings(year=year); starts=annual_starts(s); p=payload(starts)
    calls=[]
    monkeypatch.setattr(h,'CACHE_DIR',tmp_path)
    monkeypatch.setattr(h,'fetch_payload',lambda params:(calls.append(params) or p))
    values,meta,_=h.historical_weather(s,starts)
    assert values.shape==(count,3) and not meta['cache_hit']
    assert meta['request']['models']=='era5' and meta['request']['timezone']=='GMT'
    assert meta['grid_latitude']==7
    _,meta2,_=h.historical_weather(s,starts)
    assert len(calls)==1 and meta2['cache_hit']
    assert meta['response_sha256']==meta2['response_sha256']
    # Weather engine integration retains source and provenance, zeroes night.
    weather=load_weather(s)
    assert len(weather['ghi'])==count
    assert weather['metadata']['cache_hit']
    assert np.all(weather['ghi'][~weather['daylight']]==0)


@pytest.mark.parametrize('bad',['null','gap','unit','offset'])
def test_bad_provider_data_rejected(bad):
    starts=annual_starts(settings()); p=payload(starts)
    if bad=='null': p['hourly'][h.VARIABLES[0]][4]=None
    elif bad=='gap': p['hourly']['time'][4]=p['hourly']['time'][3]
    elif bad=='unit': p['hourly_units'][h.VARIABLES[0]]='kW/m²'
    else: p['utc_offset_seconds']=19800
    with pytest.raises(ValueError): h.align_hourly(p,starts)


def test_failure_does_not_fallback_or_cache(tmp_path,monkeypatch):
    monkeypatch.setattr(h,'CACHE_DIR',tmp_path)
    def unavailable(params): raise ValueError('Weather API unavailable')
    monkeypatch.setattr(h,'fetch_payload',unavailable)
    with pytest.raises(ValueError,match='unavailable'): load_weather(settings())
    assert not list(tmp_path.iterdir())


def test_historical_settings_reject_current_year_and_subhourly():
    from datetime import datetime,timezone
    with pytest.raises(ValueError,match='completed past year'): settings(year=datetime.now(timezone.utc).year)
    with pytest.raises(ValueError,match='60-minute'): settings(interval_minutes=30)


def test_corrupt_cache_redownload(tmp_path,monkeypatch):
    s=settings(); starts=annual_starts(s); p=payload(starts)
    monkeypatch.setattr(h,'CACHE_DIR',tmp_path)
    monkeypatch.setattr(h,'fetch_payload',lambda _:p)
    h.historical_weather(s,starts)
    next(tmp_path.glob('*.json')).write_text('invalid')
    _,meta,warnings=h.historical_weather(s,starts)
    assert not meta['cache_hit'] and any('Invalid cached' in w for w in warnings)
