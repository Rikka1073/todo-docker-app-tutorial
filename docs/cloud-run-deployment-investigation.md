# Cloud Run デプロイメント調査レポート

## エラー内容

```
The user-provided container failed to start and listen on the port defined provided by the PORT=8080 environment variable within the allocated timeout.
```

## 調査日時
2025-11-30

## 問題の概要

HonoアプリケーションをCloud Runにデプロイする際、コンテナが正しく起動せず、PORT=8080でリッスンできていない。

## プロジェクト構造

```
todo-docker-app/
├── Dockerfile              # フロントエンド用（Vite）
├── todo-api/
│   ├── src/
│   │   └── index.ts       # Honoアプリケーション
│   ├── package.json
│   └── tsconfig.json
├── src/                    # フロントエンドコード
└── ...
```

## 発見された問題点

### 1. ❌ Dockerfileの問題（最重要）

**現在の設定（ルート/Dockerfile）:**
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
```

**問題点:**
- このDockerfileはフロントエンド（Vite）用の設定
- `EXPOSE 5173` はViteの開発サーバーポート
- `npm run dev` は開発モードのコマンド
- Cloud RunにデプロイするにはHonoアプリ用のDockerfileが必要

**影響:** これが主要な原因。HonoアプリではなくViteアプリを起動しようとしている。

### 2. ❌ ポート設定の問題（重要）

**現在の設定（todo-api/src/index.ts:59-67）:**
```typescript
serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  }
);
```

**問題点:**
- ポートが`3000`にハードコードされている
- Cloud Runは`PORT`環境変数で動的にポートを割り当てる（通常8080）
- 環境変数からポートを読み取る必要がある

**修正案:**
```typescript
const port = Number(process.env.PORT) || 3000;

serve(
  {
    fetch: app.fetch,
    port: port,
  },
  (info) => {
    console.log(`Server is running on port ${info.port}`);
  }
);
```

### 3. ❌ ビルドプロセスの問題

**現在の設定（todo-api/package.json）:**
```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

**問題点:**
- Dockerfileが`npm run dev`を使用している（開発モード）
- 本番環境では`npm run build` → `npm start`を使用すべき
- `tsx`は開発用ツールで本番には不適切

### 4. ⚠️ Prismaの考慮事項

**検出された依存関係:**
- `@prisma/client`
- Prisma Client生成が必要
- `DATABASE_URL`環境変数が必要

**注意点:**
- Dockerビルド時に`npx prisma generate`が必要
- Cloud Run実行時にデータベース接続が必要

### 5. ⚠️ CORS設定の考慮（todo-api/src/index.ts:19-23）

```typescript
app.use(
  cors({
    origin: "http://localhost:5173",
  })
);
```

**問題点:**
- ローカル開発用の設定
- Cloud Runデプロイ後はフロントエンドのURLに合わせる必要がある

## Cloud Run の要件

1. **ポート:** `PORT`環境変数から読み取る必要がある（デフォルト8080）
2. **ヘルスチェック:** `/`エンドポイントが200を返す（現在は実装済み）
3. **起動時間:** デフォルトで240秒以内に起動してリクエストを受け付ける必要がある
4. **プロセス:** HTTPサーバーをフォアグラウンドで実行する必要がある

## 推奨される修正手順

### 優先度: 高

1. **todo-api用のDockerfileを作成**
   - `todo-api/Dockerfile`を新規作成
   - マルチステージビルドを使用
   - 本番用の最適化を実施

2. **index.tsのポート設定を修正**
   - `PORT`環境変数から読み取るように変更

### 優先度: 中

3. **Prisma関連の設定**
   - Dockerビルド時に`prisma generate`を実行
   - Cloud Run環境変数に`DATABASE_URL`を設定

4. **CORS設定の見直し**
   - 環境変数で制御できるように変更

## 次のステップ

1. todo-api用のDockerfileを作成
2. index.tsのポート設定を修正
3. ローカルでDockerビルド＆テスト
4. Cloud Runに再デプロイ

## 参考リンク

- [Cloud Run コンテナ ランタイム契約](https://cloud.google.com/run/docs/container-contract)
- [Hono デプロイメント（Node.js）](https://hono.dev/docs/getting-started/nodejs)
