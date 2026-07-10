https://flow.cocodata.org/

# coco-flow

Web application for [CoCo canonical data models](https://github.com/HealthLX/coco-canonical) — generate sample XML, run XSLT transforms, browse XSD schemas, and download FHIR artifacts.

**Stack:** React 18 · TypeScript · Vite · TanStack Query · Tailwind CSS · Express proxy

---

## Local Development

### Option 1 — Two terminals (recommended)

The fastest way to develop. Run coco-canonical and coco-flow separately — changes to either repo reload instantly, no Docker or rebuilds needed.

**Terminal 1 — start the FastAPI backend:**
```bash
cd coco-canonical
pip install ‘.[api]’          # once
uvicorn api.main:app --reload --port 8000
```

**Terminal 2 — start the React frontend:**
```bash
cd coco-flow
npm install                   # once
npm run dev
```

Open **http://localhost:5173** — Vite proxies `/api/*` to FastAPI on port 8000 automatically.

---

### Option 2 — Docker (local)

Always build with `--no-cache` locally to ensure you get the latest `coco-canonical` from GitHub:

```bash
docker compose build --no-cache
docker compose up -d
```

Open **http://localhost:3000**

To stop:

```bash
docker compose down
```

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

### Render

The hosted app at <https://coco-flow.onrender.com/> is a Render service that **builds this
repository's `Dockerfile` directly** — it does not pull a prebuilt image. CI therefore builds
nothing: `.github/workflows/deploy.yml` only POSTs Render's deploy hook. If auto-deploy-on-push
is enabled in the Render dashboard, that workflow is redundant and can be deleted.

### Using a container registry (any Docker host)

If you build and push an image yourself to a registry such as Docker Hub or GHCR, you can run coco-flow on any Docker host:

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
| `VALIDATOR_API_URL` | `https://validator.fhir.org` | FHIR validation service |
| `FHIR_IG` | `hl7.fhir.us.core#6.1.0` | Implementation Guide loaded for validation |
| `FHIR_SV` | `4.0.1` | FHIR spec version |

---

## FHIR validation

After transforming a canonical sample to FHIR, the Workspace offers a **Validate FHIR** step that
checks the output against a US Core profile (or base FHIR R4).

> **The generated resource is sent to HL7's public validator at `validator.fhir.org`.**
> coco-flow only ever produces **synthetic** data, so nothing sensitive leaves the app. If you
> would rather not depend on a public service, point `VALIDATOR_API_URL` at your own
> [validator-wrapper](https://github.com/hapifhir/org.hl7.fhir.validator-wrapper) instance — no
> code changes are needed. Note it needs ~2 GB RAM.

`/api/fhir-validate` is handled by **Express**, not FastAPI. In production `server/index.ts` mounts
it ahead of the FastAPI proxy; in dev the same router is mounted into the Vite dev server (see
`vite.config.ts`), because Vite's `/api` proxy would otherwise forward it to FastAPI and 404.

Each resource is validated against **its own US Core 6.1.0 profile**, chosen by resource type
(`Patient` → `us-core-patient`, `Practitioner` → `us-core-practitioner`, and so on), and reported
separately with its own pass/fail and issue list. Custom XSLT output has no resource-type contract,
so it offers a two-option profile picker instead.

Types where US Core 6.1.0 defines **no** profile (`ExplanationOfBenefit`, `Claim`, `InsurancePlan`,
`MedicationKnowledge`, `List`, `HealthcareService`, `OrganizationAffiliation`) fall back to base
FHIR R4. So do types where US Core defines **several** and the resource type alone can't
disambiguate: `Observation` (22 profiles), `Condition` (2), `DiagnosticReport` (2).

Three details worth knowing:

- The validator caches a loaded engine per session. A cold session takes ~30–50 s while it loads
  US Core; after that, calls are sub-second. Express warms a session on boot so the first click is
  fast, and caches results per (resource, profile).
- `validator.fhir.org` sits behind nginx with a **~130 s gateway timeout**. Loading definitions for
  a new resource type can take most of that on its own (a cold `PractitionerRole` measured ~120 s),
  so a batch of resources reliably 504s. Express therefore sends **one request per resource**,
  sequentially, reusing the warmed session.
- A 504 doesn't mean the upstream gave up — it keeps loading in the background. Failed requests are
  retried up to twice with backoff, which normally lands on a now-warm engine and returns instantly.
- Terminology validation cannot be disabled, so occasional
  `Error performing tx5 operation 'validate-code: timeout'` **warnings** from `tx.fhir.org` are
  expected. They are warnings, not errors, and do not fail validation.

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
