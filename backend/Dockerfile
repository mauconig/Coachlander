FROM node:22-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY db ./db
COPY src ./src

ENV NODE_ENV=production
EXPOSE 8782
CMD ["node", "src/server.mjs"]
