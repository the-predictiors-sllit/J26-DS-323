"""Reproducible controlled evaluation of the application's actual MILP solver."""
from pathlib import Path
import sys, itertools, json, platform, time
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'Application' / 'Backend'))
from app.features.smartscheduling.milp.optimizer import ApplianceJob, solve_solar_only

OUT = Path(__file__).resolve().parent / 'results'
STEP = .25

def frame(values, base=0):
    return pd.DataFrame({'timestamp': pd.date_range('2024-08-17 06:00', periods=len(values), freq='15min', tz='Asia/Colombo').astype(str), 'solar_kw': values, 'base_load_kw': base})

def audit(f, jobs, starts, factor=1, cap=None, actual=None):
    """Reconstruct load independently of production evaluation, checking all constraints."""
    errors = []
    load = f.base_load_kw.to_numpy(dtype=float).copy()
    if set(starts) != {j.job_id for j in jobs}: errors.append('missing or unexpected jobs')
    shift = 0
    for j in jobs:
        s = starts.get(j.job_id)
        if not isinstance(s, (int, np.integer)) or s < 0 or s + j.duration_minutes // 15 > len(f):
            errors.append('invalid start: ' + j.job_id); continue
        t = pd.Timestamp(f.timestamp.iloc[s]); minutes = t.hour*60+t.minute
        clock = lambda x: int(x[:2])*60+int(x[3:])
        if minutes < clock(j.earliest_start) or minutes+j.duration_minutes > clock(j.latest_finish): errors.append('window: '+j.job_id)
        load[s:s+j.duration_minutes//15] += j.power_kw
        shift += j.priority * abs(minutes-clock(j.preferred_start))
    if np.any(load > f.solar_kw.to_numpy()*factor + 1e-6): errors.append('forecast solar limit')
    if cap is not None and np.any(load > cap+1e-6): errors.append('household limit')
    realized = f.solar_kw.to_numpy() if actual is None else np.asarray(actual)
    deficit = np.maximum(load-realized,0)
    return {'valid': not errors, 'violations': '; '.join(errors), 'weighted_shift_min': shift,
            'peak_kw': float(load.max()), 'realized_deficit_kwh': float(deficit.sum()*STEP),
            'realized_deficit_slots': int((deficit>1e-6).sum()), 'load_kwh':float(load.sum()*STEP),
            'solar_used_kwh': float(np.minimum(load,realized).sum()*STEP)}

def exhaustive(f,jobs,factor=1,cap=None):
    choices=[]
    for j in jobs:
        def m(s): return int(s[:2])*60+int(s[3:])
        choices.append([i for i in range(len(f)-j.duration_minutes//15+1) if 360+i*15>=m(j.earliest_start) and 360+i*15+j.duration_minutes<=m(j.latest_finish)])
    valid=[]
    for values in itertools.product(*choices):
        starts=dict(zip([j.job_id for j in jobs],values)); a=audit(f,jobs,starts,factor,cap)
        if a['valid']: valid.append((a['weighted_shift_min'],a['peak_kw']))
    return min(valid) if valid else None

def validation():
    jobs=[ApplianceJob('a',1,30,'06:00','07:30','06:00',2), ApplianceJob('b',1,30,'06:00','07:30','06:00',1)]
    cases=[('priority_and_peak',frame([1.2]*6),jobs,1,None),
           ('household_cap',frame([3]*6),jobs,1,1.5),
           ('infeasible',frame([.5]*6),jobs,1,None),
           ('safety_factor',frame([2]*6),jobs,.5,None),
           ('exact_boundary',frame([1]*2),[ApplianceJob('x',1,30,'06:00','06:30','06:00',1)],1,None)]
    rows=[]
    for name,f,js,factor,cap in cases:
        oracle=exhaustive(f,js,factor,cap); result=solve_solar_only(f,js,safety_factor=factor,household_limit_kw=cap)
        actual=None if result['status']!='optimal' else audit(f,js,result['starts'],factor,cap)
        ok=(result['status']=='infeasible') if oracle is None else (result['status']=='optimal' and actual['valid'] and abs(actual['weighted_shift_min']-oracle[0])<1e-5 and abs(actual['peak_kw']-oracle[1])<1e-5)
        rows.append({'case':name,'status':result['status'],'oracle':str(oracle),'audit':str(actual),'pass':ok})
    return pd.DataFrame(rows)

def evaluation():
    jobs=[ApplianceJob('washer',.7,60,'08:00','15:00','09:00',2), ApplianceJob('pump',.8,60,'09:00','16:00','10:00',1), ApplianceJob('cooker',.9,30,'10:00','15:00','12:00',3)]
    x=np.arange(52); shape=np.maximum(0,np.sin(np.pi*(x-4)/44))
    rows=[]
    for name,scale in [('sunny',3.5),('mixed',2.5),('cloudy',1.5)]:
        forecast=scale*shape; f=frame(forecast); actual=forecast.copy(); actual[16:22]*=.35
        for factor in [.7,.9,1.0]:
            r=solve_solar_only(f,jobs,safety_factor=factor,time_limit_seconds=8)
            row={'scenario':name,'safety_factor':factor,'method':'MILP','status':r['status'],'solve_seconds':r['solve_seconds']}
            if r['status']=='optimal': row.update(audit(f,jobs,r['starts'],factor,actual=actual))
            rows.append(row)
            # User-preferred operation is a meaningful unconstrained baseline, even when solar is insufficient.
            starts={j.job_id:(int(j.preferred_start[:2])*60+int(j.preferred_start[3:])-360)//15 for j in jobs}
            baseline={'scenario':name,'safety_factor':factor,'method':'preferred start','status':'scheduled','solve_seconds':0}
            baseline.update(audit(f,jobs,starts,factor,actual=actual)); rows.append(baseline)
    return pd.DataFrame(rows)

def main():
    OUT.mkdir(exist_ok=True)
    v=validation(); e=evaluation()
    v.to_csv(OUT/'validation.csv',index=False); e.to_csv(OUT/'controlled_evaluation.csv',index=False)
    (OUT/'run_metadata.json').write_text(json.dumps({'python':platform.python_version(),'numpy':np.__version__,'pandas':pd.__version__,'scope':'synthetic controlled scenarios; actual curve is an artificial shortfall, not measured data','interval_minutes':15,'jobs':'same three jobs for each scenario','solar_safety_factors':[.7,.9,1.0]},indent=2))
    print(v[['case','status','pass']].to_string(index=False)); print('\n'+e[['scenario','safety_factor','method','status','realized_deficit_kwh','weighted_shift_min']].to_string(index=False))
    if not v['pass'].all(): raise SystemExit('Validation failed; inspect results/validation.csv')
if __name__=='__main__': main()
