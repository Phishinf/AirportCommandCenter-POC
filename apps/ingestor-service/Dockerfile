FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json tsconfig.json ./
RUN npm install --production=false

COPY src/ ./src/

RUN npm run build

# ─── Production ───────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=production
ENV CONNECTOR_MODE=mock

EXPOSE 4001

CMD ["node", "dist/main.js"]
