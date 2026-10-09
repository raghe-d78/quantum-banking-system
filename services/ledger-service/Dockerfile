FROM node:20-slim
ENV NODE_ENV=production
WORKDIR /app

COPY services/ledger-service/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY shared /shared
RUN cd /shared && npm ci --omit=dev --no-audit --no-fund

COPY services/ledger-service/src ./src
USER node
EXPOSE 3003
CMD ["node", "src/server.js"]
