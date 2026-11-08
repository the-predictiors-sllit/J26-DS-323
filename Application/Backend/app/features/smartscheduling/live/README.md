# Live solar integration scaffold

`providers.py` defines `LiveSolarProvider` and a deliberately unimplemented `SolisProvider`. `service.py` validates timestamped nonnegative readings and can perform an on-demand shortfall assessment with the same detector as the historical replay. `router.py` exposes `GET /live/status`, `GET /live/measurement`, and `POST /live/assess` under `/api/v1/smartscheduling`. The separate frontend page is `/features/smartscheduling/live-monitoring`.

No credentials are accepted through the browser or logged. The placeholder never sends a Solis request, and `/live/measurement` and `/live/assess` return 503 until a provider implementation is supplied. `provider_implemented` only reports that code exists; a successful fresh reading is needed to verify the connection.

To integrate a real provider later:

1. Obtain authorized access and check the current [SolisCloud developer documentation](https://developer.soliscloud.com/guide/), the account's API access, the appropriate data endpoint, field units, timestamps, data latency, and rate limits. Keep secrets server-side in your deployment's secret store or environment, never in committed files or client-side variables. Do not guess the power units.
2. Implement `SolisProvider.read_between` with timeouts, error handling, pagination/rate-limit handling where applicable, and timestamps converted to timezone-aware instants. Return AC generation in kW, ordered or sortable, with actual device timestamps. Return only data within the requested range. Raise `ProviderUnavailable` for provider failures without exposing credentials. Change `is_implemented` only when implemented.
3. Verify the provider using its real responses, including missing, duplicate, stale and future timestamps. The test provider in `test_live.py` shows the contract without requiring Solis access.
4. `POST /live/assess` accepts a caller-supplied forecast availability time and past/current slots; it returns a threshold preview. It checks the declared time but cannot verify that a caller's forecast was really available then. Do not send forecasts reconstructed using later information. The preview does not enforce cooldown or persist history.

**Further work is required beyond the provider adapter.** This scaffold does not store an authoritative 14-day plan, run a background monitor, enforce cooldown across calls, persist readings/events, authenticate users, know actual appliance states, apply an optimized revision, or control devices. A future live system must implement and test those components and define an approval/control policy before enabling rescheduling. The historical replay remains separate and continues to use simulated states.
