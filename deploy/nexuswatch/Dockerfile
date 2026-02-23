# NexusWatch private-cloud image
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build:nexus

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4173

COPY --from=build /app/dist ./dist
COPY --from=build /app/api ./api
COPY --from=build /app/server/nexuswatch ./server/nexuswatch

EXPOSE 4173
CMD ["node", "server/nexuswatch/private-cloud-server.mjs"]
