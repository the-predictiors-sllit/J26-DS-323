import sys, json; sys.path.insert(0, "src")  # run from the project folder
from plan import get_plan
pv = [0]*6 + [0.1,0.4,0.8,1.2,1.5,1.7,1.6,1.4,1.0,0.6,0.2] + [0]*7
load = [0.4]*6 + [0.3]*12 + [0.6,0.7,0.7,0.6,0.5,0.5]
outage = [0]*17 + [1,1,1] + [0]*4                      # a cut from 17:00 to 20:00
for prof in ["savings", "resilience"]:
    r = get_plan(prof, 35, 22, 50, pv, load, outage); print(prof, r["summary"])
    print([h["soc_pct_end"] for h in r["hours"]][8:21])
print(json.dumps(get_plan("balanced", 35, 22, 50, pv, load, outage)["hours"][17], indent=1))
