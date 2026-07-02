FROM node:20

WORKDIR /app

COPY services/ledger-service/package*.json ./
RUN npm install

COPY services/ledger-service ./services/ledger-service
COPY shared ./shared
RUN cd shared && npm install --omit=dev

WORKDIR /app/services/ledger-service

CMD ["node","src/server.js"]