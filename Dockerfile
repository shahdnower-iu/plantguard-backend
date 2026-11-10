   FROM node:20-slim
   WORKDIR /app
   RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
   COPY package*.json ./
   RUN npm ci
   COPY prisma ./prisma
   RUN npx prisma generate
   COPY . .
   RUN npm run build
   ENV NODE_ENV=production
  EXPOSE 3001
   CMD ["npm", "start"]
