FROM node:20-slim
ENV NODE_ENV=production
WORKDIR /app

COPY services/kms-service/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY shared /shared
RUN cd /shared && npm ci --omit=dev --no-audit --no-fund

COPY services/kms-service/src ./src
USER node
EXPOSE 3006
CMD ["node", "src/server.js"]
