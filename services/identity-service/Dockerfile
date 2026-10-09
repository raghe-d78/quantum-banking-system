FROM node:20-slim
ENV NODE_ENV=production
WORKDIR /app

COPY services/identity-service/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY shared /shared
RUN cd /shared && npm ci --omit=dev --no-audit --no-fund

COPY services/identity-service/src ./src
USER node
EXPOSE 3001
CMD ["node", "src/server.js"]
