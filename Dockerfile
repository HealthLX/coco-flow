# ── Stage 1: Build the React frontend ─────────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 2: Production image — Python (FastAPI) + Node (Express) ──────────────
FROM python:3.11-slim AS production

# Which coco-canonical ref (branch, tag, or commit) to build against.
# Defaults to "main" but can be overridden at build time:
#   docker build --build-arg COCO_CANONICAL_REF=v1.2.3 ...
ARG COCO_CANONICAL_REF=main
# Optional: set to any value (e.g. $(date +%s)) to invalidate the git-clone layer after upstream changes.
ARG CACHE_BUST

# Install Node.js 20, git, and procps (ps) needed by concurrently
RUN apt-get update && apt-get install -y --no-install-recommends curl git procps && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Pull coco-canonical source directly from GitHub at the specified ref.
# This layer is cached until Dockerfile/args change — use CACHE_BUST or docker build --no-cache
# after coco-canonical updates, or transforms can 400 ("No transform configured") on providerdirectory.
RUN echo "CACHE_BUST=${CACHE_BUST}" && \
    git clone --depth 1 https://github.com/HealthLX/coco-canonical.git coco-canonical && \
    cd coco-canonical && \
    git fetch --depth 1 origin "${COCO_CANONICAL_REF}" && \
    git checkout "${COCO_CANONICAL_REF}"

# Install Python API dependencies from the cloned repo
RUN pip install --no-cache-dir 'coco-canonical/.[api]'

# Install Node production dependencies (Express + concurrently)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy Express proxy server
COPY server/ ./server/

# Copy built React frontend from Stage 1
COPY --from=frontend-builder /app/dist ./dist

# Only port 3000 is public — Express serves the app and proxies /api/* to FastAPI
EXPOSE 3000

ENV FASTAPI_URL=http://localhost:8000
ENV PORT=3000

# Start FastAPI on :8000 (internal) and Express on :3000 (public)
CMD ["npx", "concurrently", \
     "--names", "API,EXPRESS", \
     "--prefix-colors", "cyan,green", \
     "--kill-others-on-fail", \
     "sh -c 'PYTHONPATH=coco-canonical uvicorn api.main:app --host 0.0.0.0 --port 8000'", \
     "npx tsx server/index.ts"]
