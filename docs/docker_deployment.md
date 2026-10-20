# Docker Deployment

This project can run as two containers: a FastAPI inference service and an Nginx-served React application. Nginx serves the UI and proxies `/api` requests to FastAPI over the private Compose network. The model directory is mounted read-only, and the backend runs with Hugging Face offline mode enabled.

## Prerequisites

- Docker Engine with the Compose plugin
- The model files under `models/final/` that the backend loads
- Enough RAM for PyTorch, the three models, and concurrent media inference

The initial image build downloads Python and Node dependencies. Once built, model inference reads the local model files; it does not need Hugging Face or third-party API access.

## Start the containerized deployment

The default UI address is `http://127.0.0.1:8080`. This avoids the development UI port (`5173`) and backend port (`8000`) used by independently launched services. The containerized backend is only reachable inside the Compose network.

```sh
docker compose config
docker compose up --build -d
docker compose ps
docker compose logs -f synthguard-backend synthguard-frontend
```

The backend loads model weights before the frontend starts. Its health check allows up to three minutes for startup. A model that cannot load appears as unavailable through `/api/health`; the UI can still report partial analyses for the remaining sensors.

## Change the published UI address

Create a local `.env` file (it is excluded from the build context) and set:

```dotenv
SYNTHGUARD_PORT=8080
SYNTHGUARD_BIND=127.0.0.1
```

To make the UI reachable from other machines, set `SYNTHGUARD_BIND=0.0.0.0` and restrict access with the host firewall or a TLS-enabled reverse proxy. The default intentionally listens only on the local machine.

## Update model files

Replace or add the model files under `models/final/` on the host, then restart the backend container:

```sh
docker compose restart synthguard-backend
```

The model mount is read-only inside the container. The video calibration artifact is read from `models/final/video_detector/calibration.json` when present; otherwise the backend uses its legacy threshold.

## Development mode

For separately running servers, the frontend uses the relative `/api` path and Vite proxies it to `http://127.0.0.1:8000`. Set `VITE_DEV_API_TARGET` if the backend is listening elsewhere, then restart Vite. Production builds use the same relative path through Nginx.

## Stop the containerized deployment

```sh
docker compose down
```

This stops only the Compose containers for this project. It does not stop separately launched host processes.
