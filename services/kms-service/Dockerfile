FROM node:20

WORKDIR /app

COPY services/kms-service/package*.json ./
RUN npm install --omit=dev

COPY services/kms-service ./
COPY shared ../shared
RUN cd ../shared && npm install --omit=dev

CMD ["node", "src/server.js"]
