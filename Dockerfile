FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

RUN npm install
RUN npm run setup

COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY server/package*.json ./server/
RUN npm install --omit=dev; npm install --prefix server --omit=dev

COPY --from=builder /app/server ./server
COPY --from=builder /app/client/dist ./client/dist

# Create persistent data directory for SQLite (Fly.io volume mounts here)
RUN mkdir -p /data

EXPOSE 8080
CMD ["npm", "run", "start"]
