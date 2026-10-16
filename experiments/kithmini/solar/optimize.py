"""Independent seeded PSO runs and a grid reference using exactly the same objective."""

import numpy as np


def particle_swarm(objective, max_tilt, seed, particles=28, iterations=60):
    rng = np.random.default_rng(seed)
    span = np.array([max_tilt, 360.0])
    pos = rng.random((particles, 2)) * span
    velocity = rng.uniform(-0.1, 0.1, (particles, 2)) * span
    personal = pos.copy()
    personal_scores = objective(personal)
    idx = np.argmax(personal_scores)
    best, best_score = personal[idx].copy(), float(personal_scores[idx])
    history = [best_score]
    for i in range(iterations):
        inertia = 0.8 - 0.4 * i / max(1, iterations - 1)
        dp, dg = personal - pos, best - pos
        # Shortest angular displacement prevents a discontinuity at true North.
        dp[:, 1] = (dp[:, 1] + 180) % 360 - 180
        dg[:, 1] = (dg[:, 1] + 180) % 360 - 180
        velocity = (
            inertia * velocity
            + 1.5 * rng.random(pos.shape) * dp
            + 1.5 * rng.random(pos.shape) * dg
        )
        velocity = np.clip(velocity, -span * 0.15, span * 0.15)
        pos += velocity
        outside = (pos[:, 0] < 0) | (pos[:, 0] > max_tilt)
        pos[:, 0] = np.clip(pos[:, 0], 0, max_tilt)
        velocity[outside, 0] = 0
        pos[:, 1] %= 360
        scores = objective(pos)
        improved = scores > personal_scores
        personal[improved], personal_scores[improved] = pos[improved], scores[improved]
        idx = np.argmax(personal_scores)
        if personal_scores[idx] > best_score:
            best, best_score = personal[idx].copy(), float(personal_scores[idx])
        history.append(best_score)
    return {
        "tilt_deg": float(best[0]),
        "azimuth_deg": float(best[1]),
        "poa_kwh_m2": best_score,
        "seed": seed,
        "history_kwh_m2": history,
    }


def grid_search(objective, max_tilt):
    tilts = np.unique(np.append(np.arange(0, max_tilt + 1e-9, 5), max_tilt))
    azimuths = np.arange(0, 360, 10)
    t, a = np.meshgrid(tilts, azimuths, indexing="ij")
    candidates = np.column_stack([t.ravel(), a.ravel()])
    scores = objective(candidates)
    idx = np.argmax(scores)
    best = candidates[idx]
    return {
        "tilt_deg": float(best[0]),
        "azimuth_deg": float(best[1]),
        "poa_kwh_m2": float(scores[idx]),
        "tilt_step_deg": 5,
        "azimuth_step_deg": 10,
        "evaluations": len(scores),
        "tilts": tilts.tolist(),
        "azimuths": azimuths.tolist(),
        "poa_grid_kwh_m2": scores.reshape(t.shape).tolist(),
    }
