# Server-side build: decrypts and serves the WhatsApp backup entirely on the
# server (better-sqlite3 + node:crypto). The browser only ever receives
# already-decrypted JSON — no upload, no client-side decryption.

FROM node:20-alpine AS builder

# better-sqlite3 needs to compile a native addon against this Alpine/musl target
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

RUN npm run build \
 && npm run build:server \
 && npm prune --omit=dev


FROM node:20-alpine

WORKDIR /app

# Reuse the already-compiled node_modules (including the native better-sqlite3
# addon) from the builder stage instead of recompiling — keeps this final
# image free of the python3/make/g++ toolchain.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server-dist ./server-dist

EXPOSE 5173

CMD ["node", "server-dist/index.js"]
