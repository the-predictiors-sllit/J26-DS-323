# Smart scheduling backend

- `router.py`: feature health checks and router composition, imported by the application.
- `solar_prediction/`: prediction endpoints, schemas, weather access, inference, and forecast preparation.
- `solar_prediction/models/`: unchanged 5-minute and 15-minute trained models and metadata.
- `milp/`: appliance schemas, MILP solver, schedule orchestration, and background job storage.

The MILP service consumes 15-minute slots from `solar_prediction/forecast.py`.
Solar prediction does not depend on MILP. Routers delegate work to services.
All existing `/api/v1/smartscheduling` endpoint paths and response formats are preserved.
The backend-input example lives in `solar_prediction/examples.py`.
