# Runs the app in Vite dev mode inside Docker, for occasional local use.
# Not intended to be exposed to the internet — this is a dev server, not a
# production build.

FROM node:20-alpine

WORKDIR /app

# Install dependencies first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the project (bind mount in docker-compose.yml overrides
# this at runtime for live-reload during development)
COPY . .

EXPOSE 5173

# --host so the dev server is reachable from outside the container,
# --port to pin it explicitly.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
