"""Rule-based baseline: the usual self-consumption inverter logic, no knowledge of outages."""


def rule_based_controller(t, soc, df):
    """Charge from solar surplus, discharge to cover the home, export when the battery is full.
    p_cmd = pv - load (kWh): positive charges, negative discharges."""
    return df["pv"].iloc[t] - df["load"].iloc[t]


def make_reserve_controller(bat, reserve_pct):
    """Second baseline many inverters offer: self-consume but keep a fixed backup reserve (no outage knowledge)."""
    floor = reserve_pct / 100 * bat.cap

    def controller(t, soc, df):
        p = df["pv"].iloc[t] - df["load"].iloc[t]
        if p < 0:
            p = -min(-p, max(soc - floor, 0.0) * bat.eta)
        return p
    return controller
