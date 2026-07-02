FROM node:20

WORKDIR /app

COPY services/account-service/package*.json ./
RUN npm install

COPY services/account-service ./
COPY shared ../shared
RUN cd ../shared && npm install --omit=dev

CMD ["node", "src/server.js"]