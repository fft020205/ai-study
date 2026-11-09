FROM node:24-bookworm-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run assets:vision && npm run build

FROM python:3.12-slim-bookworm
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends nginx libatomic1 libstdc++6 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=web /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY services/api/requirements.lock.txt /app/services/api/requirements.lock.txt
RUN pip install --no-cache-dir -r services/api/requirements.lock.txt
COPY services/api/study /app/services/api/study
COPY integrations/adaptive-cognitive-load-analysis /app/integrations/adaptive-cognitive-load-analysis
COPY deploy /app/deploy
COPY --from=web /app/apps/web/.next/standalone /app/web
COPY --from=web /app/apps/web/.next/static /app/web/apps/web/.next/static
COPY --from=web /app/apps/web/public /app/web/apps/web/public
EXPOSE 8080
CMD ["python", "/app/deploy/start.py"]
