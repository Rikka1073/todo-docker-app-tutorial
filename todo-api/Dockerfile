FROM node:20-alpine AS builder

WORKDIR /app

# 依存関係のインストール
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY . .

# Prisma Clientの生成（ダミーのDATABASE_URLを設定）
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate

RUN npm run build

# 本番ステージ
FROM node:20-alpine AS runner

WORKDIR /app

# 本番依存関係のみをインストール
COPY package*.json ./
RUN npm ci --omit=dev

# Prismaスキーマとビルド成果物をコピー
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/generated ./dist/generated

# 非rootユーザーで実行
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs

# Cloud RunのPORT環境変数を使用
ENV PORT=8080
EXPOSE 8080

# 本番起動コマンド
CMD ["node", "dist/index.js"]

