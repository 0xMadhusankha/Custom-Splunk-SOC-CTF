# ANIMUS 1.0 — TEMPLAR SOC — realtime relay
# Node 20, Linux. Deploy as Azure Container App / App Service (Linux).
# Mount a persistent volume at /app/data so SQLite + uploaded sounds
# survive restarts/redeploys.
FROM node:20-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV DATA_DIR=/app/data
VOLUME ["/app/data"]

EXPOSE 8787
CMD ["node", "server.js"]
