# Lightweight Node.js image (no heavy browser required!)
FROM node:20-bookworm-slim

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]
