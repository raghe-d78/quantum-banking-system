FROM node:20

WORKDIR /app

COPY services/identity-service/package*.json ./
RUN npm install

COPY services/identity-service ./
COPY shared ../shared
RUN cd ../shared && npm install --omit=dev

CMD ["node","src/server.js"]