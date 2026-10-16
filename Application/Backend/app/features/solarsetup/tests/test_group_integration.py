"""Group routing and missing-model isolation; no checkpoint needed."""
import io
import json
from PIL import Image
from fastapi.testclient import TestClient
from app.main import app
from app.features.solarsetup import router as feature

client = TestClient(app)

def test_group_health_routes_still_work():
    for path in ['/health', '/api/v1/panelhealth/health', '/api/v1/smartscheduling/health', '/api/v1/energyresilience/health']:
        assert client.get(path).status_code == 200


def test_missing_checkpoint_isolated(tmp_path, monkeypatch):
    monkeypatch.setattr(feature, 'MODEL_PATH', tmp_path/'absent.pt')
    monkeypatch.setattr(feature, 'state', {'model':None,'checkpoint':None,'error':None})
    response=client.get('/api/v1/solarsetup/health')
    assert response.status_code == 200
    assert response.json()['status'] == 'model_missing'
    buf=io.BytesIO();Image.new('RGB',(64,64)).save(buf,format='PNG')
    assert client.post('/api/v1/solarsetup/segment', files={'photo':('photo.png',buf.getvalue(),'image/png')}).status_code==503
    assert client.get('/health').json()['status']=='ok'


def test_namespaced_preview_and_template():
    s=dict(latitude=7,longitude=80,projection='equisolid',center_x=.5,center_y=.5,radius=.5,
           azimuth_clockwise=True,geometry_acknowledged=True,year=2025,interval_minutes=60)
    buf=io.BytesIO();Image.new('L',(101,101),0).save(buf,format='PNG')
    r=client.post('/api/v1/solarsetup/solar/analyze', data={'settings':json.dumps(s),'preview_only':'true'},files={'mask':('mask.png',buf.getvalue(),'image/png')})
    assert r.status_code==200,r.text
    assert len(r.json()['sun_samples'])>0
    assert client.get('/api/v1/solarsetup/solar/weather-template?year=2025&interval_minutes=60').status_code==200
    assert client.get('/solar/weather-template').status_code==404
