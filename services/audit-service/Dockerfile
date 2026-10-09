FROM node:20-slim
ENV NODE_ENV=production
WORKDIR /app

COPY services/audit-service/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY shared /shared
RUN cd /shared && npm ci --omit=dev --no-audit --no-fund

COPY services/audit-service/src ./src
USER node
EXPOSE 3004
CMD ["node", "src/server.js"]
