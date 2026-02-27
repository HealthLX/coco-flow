# coco-flow

Web application for [CoCo canonical data models](https://github.com/HealthLX/coco-canonical) — generate sample XML, run XSLT transforms, browse XSD schemas, and download FHIR artifacts.

**Stack:** React 18 · TypeScript · Vite · TanStack Query · Tailwind CSS · Express proxy

---

## Local Development

### Prerequisites

- Node.js 18+
- Python 3.10+ with the [coco-canonical](https://github.com/HealthLX/coco-canonical) repo cloned alongside this one

### Setup (one time)

```bash
# In coco-canonical — set up Python and start the API
cd ../coco-canonical
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux
pip install '.[api]'
uvicorn api.main:app --reload

# In coco-flow — install Node deps
cd ../coco-flow
npm install
```

### Run

```bash
# Terminal 1 — coco-canonical (if not already running)
cd ../coco-canonical && venv\Scripts\activate && uvicorn api.main:app --reload

# Terminal 2 — coco-flow
npm run dev
```

Open **http://localhost:5173**

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

The Dockerfile clones coco-canonical from GitHub at build time — no manual file copying needed.

```bash
docker build -t coco-flow .
docker run -p 3000:3000 coco-flow
```

Or with Compose:

```bash
docker compose up --build -d
```

Open **http://your-server:3000**

### Picking up schema/API changes from coco-canonical

Push changes to coco-canonical on GitHub, then rebuild:

```bash
docker build -t coco-flow .
docker run -p 3000:3000 coco-flow
```

The `git clone` in the Dockerfile always pulls the latest `main`.

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
