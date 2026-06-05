# Зависимости
FROM node:22-slim AS deps
WORKDIR /app
ENV HUSKY=0
RUN apt-get update && apt-get install -y openssl
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Сборка
FROM node:22-slim AS builder
WORKDIR /app
ENV HUSKY=0
RUN apt-get update && apt-get install -y openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/mydb"
RUN npx prisma generate
RUN yarn build
RUN yarn install --production --frozen-lockfile && yarn cache clean

# Запуск
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y openssl

USER node
COPY --chown=node:node package.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/prisma ./prisma
COPY --chown=node:node --from=builder /app/prisma.config.ts ./prisma.config.ts

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]