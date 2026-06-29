FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache curl
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/daemon ./daemon
COPY --from=build /app/cli ./cli
COPY --from=build /app/bridge ./bridge
COPY --from=build /app/plugins ./plugins
COPY --from=build /app/godot ./godot
ENV NODE_ENV=production
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8787/api/health || exit 1
USER node
CMD ["node", "daemon/server.js"]
