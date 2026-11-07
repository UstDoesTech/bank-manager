FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY engine ./engine
COPY db ./db
COPY server ./server
COPY web ./web
COPY ["Bank Manager.html", "./"]
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
USER node
CMD ["node", "server/index.js"]
