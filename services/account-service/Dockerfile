FROM node:20

WORKDIR /app

COPY services/account-service/package*.json ./
RUN npm install

COPY services/account-service ./services/account-service
COPY shared ./shared

WORKDIR /app/services/account-service

CMD ["node", "src/server.js"]