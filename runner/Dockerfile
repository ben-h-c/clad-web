# Always-on agent runner for clad-web — replaces the Mac/PM2 setup.
#
# Build from the REPO ROOT (not runner/) so it can copy the shared TS libs the
# runner imports via ../src/lib:
#   docker build -f runner/Dockerfile -t clad-runner .
#
# On Railway / Render / Fly: set the Dockerfile path to runner/Dockerfile and
# the build context / root to the repo root. Provide config as env vars in the
# platform's settings (NOT a .env file):
#   WORKER_BASE_URL, AGENT_TOKEN, XAI_API_KEY, YOUTUBE_API_KEY,
#   TRANSCRIPT_API_URL, TRANSCRIPT_API_KEY
#
# This is a worker (no inbound port). Let the platform restart it on exit; the
# loop in index.mjs runs forever on its own.
FROM node:22-slim

WORKDIR /app/runner

# Runner code + its deps, plus the shared TS libs it imports from ../src/lib.
COPY runner/ ./
COPY src/lib/ /app/src/lib/
RUN npm install --omit=dev --no-audit --no-fund

ENV NODE_ENV=production
# index.mjs imports .ts from ../src/lib; Node 22 strips the types with this flag.
CMD ["node", "--experimental-strip-types", "index.mjs"]
