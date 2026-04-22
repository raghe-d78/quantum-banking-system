FROM node:20

WORKDIR /app

COPY services/identity-service/package*.json ./
RUN npm install

COPY services/identity-service ./
COPY shared ../shared

CMD ["node","src/server.js"]