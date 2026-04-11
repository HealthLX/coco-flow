# coco-flow

Web application for [CoCo canonical data models](https://github.com/HealthLX/coco-canonical) — generate sample XML, run XSLT transforms, browse XSD schemas, and download FHIR artifacts.

**Stack:** React 18 · TypeScript · Vite · TanStack Query · Tailwind CSS · Express proxy

---

## Local Development

### Option 1 — Easiest (Docker)

If you just want to use or demo coco-flow locally, you don’t need to install Python or clone `coco-canonical`.

From the `coco-flow` directory:

```bash
docker compose build --no-cache
docker compose up -d
```

Then open:

```text
http://localhost:3000
```

This runs the full stack (frontend + Express + FastAPI from `coco-canonical`) inside a single container.

To stop it:

```bash
docker compose down
```

### Option 2 — Frontend-only dev (Vite)

If you are working on the React UI and want hot-reload:

**Prerequisite:** Node.js 18+

```bash
# install dependencies once
npm install

# start Vite dev server
npm run dev
```

Vite will serve the app on **http://localhost:5173** and proxy `/api/*` to whatever `FASTAPI_URL` you configure (default `http://localhost:8000`).

For a backend during frontend dev you can either:

- Keep the Docker container running and point Vite at it, or
- Run a separate `coco-canonical` FastAPI instance (see that repo’s README for details).

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server with hot reload (proxies `/api/*` → FastAPI on `:8000`) |
| `npm run build` | TypeScript check + Vite production build → `dist/` |
| `npm run serve` | Express server — serves `dist/` and proxies `/api/*` |
| `npm run preview` | Preview the production build locally |

---

## Deployment (Docker)

The Docker image contains:

- The built coco-flow React frontend.
- The Node/Express proxy on port `3000`.
- The FastAPI backend from [coco-canonical](https://github.com/HealthLX/coco-canonical) running on port `8000` **inside the same container**.

You do **not** need to clone `coco-canonical` on the server. The Dockerfile fetches it from GitHub at **build time**.

### Build and run locally

Build an image that tracks the latest `main` branch of `coco-canonical`:

```bash
docker build -t coco-flow \
  --build-arg COCO_CANONICAL_REF=main \
  .

docker run -d -p 3000:3000 --name coco-flow coco-flow
```

Open **http://localhost:3000**

### Using a container registry (any Docker host)

Once you have built and pushed an image (manually or via CI) to a registry such as Docker Hub or GHCR, you can run coco-flow on any Docker host:

```bash
docker pull your-registry/cocoflow:latest
docker run -d -p 3000:3000 --name coco-flow your-registry/cocoflow:latest
```

This works the same on EC2, a VM, or any platform that can run Docker containers.

### Using docker-compose

For local development or simple deployments, you can use the provided `docker-compose.yml`:

```bash
docker compose up --build -d
```

This builds the image from the current source and starts a single `app` service that:

- Listens on port `3000` on the host.
- Proxies API calls to the FastAPI backend on `http://localhost:8000` **inside the container**.

For environments where you **pull** an already-built image instead of building locally, you can use a minimal compose file such as:

```yaml
services:
  app:
    image: your-registry/cocoflow:latest
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - FASTAPI_URL=http://localhost:8000
    restart: unless-stopped
```

Run it with:

```bash
docker compose up -d
```

Open **http://your-server:3000**

### Picking which coco-canonical version to use

The Dockerfile accepts a `COCO_CANONICAL_REF` build argument that controls which ref of `coco-canonical` is baked into the image:

- Branch (e.g. `main`)
- Tag (e.g. `v1.2.3`)
- Commit SHA

Examples:

```bash
# Track the latest main branch (good for dev/staging)
docker build -t coco-flow-dev \
  --build-arg COCO_CANONICAL_REF=main \
  .

# Pin to a tagged release of coco-canonical (good for production)
docker build -t coco-flow-roster-v1 \
  --build-arg COCO_CANONICAL_REF=v1.2.3 \
  .
```

To upgrade to a newer version of coco-canonical, rebuild the image with a different `COCO_CANONICAL_REF` and redeploy the new image.

### Docker: `Transform failed 400` — `No transform configured for target: providerdirectory`

That response means the API’s `sample_builds` config in the container has **no usable XSLT list** for Provider Directory (older `coco-canonical` checkout). Sample **generation** can still work while **transforms** fail if the baked-in repo predates `transform_files` / the multipart transform router.

**Fix:** Force a **fresh** clone of `coco-canonical` when building (Docker often reuses a cached `git clone` layer even when you run `docker compose up --build`):

```bash
docker compose build --no-cache
docker compose up -d
```

Or pass a one-off cache-bust so only the clone layer invalidates:

```bash
# PowerShell
$env:CACHE_BUST = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds(); docker compose up --build -d

# bash
CACHE_BUST=$(date +%s) docker compose up --build -d
```

You can pin a known-good commit: `COCO_CANONICAL_REF=<full-sha> docker compose build --no-cache`.

**Check inside the running container** (API JSON should show a unified Provider Directory build with `transform_files`):

```bash
docker compose exec app curl -s http://127.0.0.1:8000/config
```

The `providerdirectory` build entry should include a non-empty `transform_files` array (one canonical sample `provider-directory-sample.xml`; multiple XSLTs produce a multipart FHIR response).

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Express server port |
| `FASTAPI_URL` | `http://localhost:8000` | FastAPI service URL |

---

## Project Structure

```
coco-flow/
├── src/
│   ├── components/     # Sidebar, ActionPanel, StatusLogger, ArtifactList, StatCards, TopBar
│   ├── context/        # AppContext — selected canonical + activity log state
│   ├── pages/          # DiscoverPage, SchemasPage, TransformsPage
│   └── services/api.ts # Typed fetch wrappers for all FastAPI endpoints
├── server/
│   └── index.ts        # Express proxy: /api/* → FastAPI, serves dist/
├── Dockerfile
└── docker-compose.yml
```
