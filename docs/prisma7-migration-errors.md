# Prisma 7 移行時のエラー対処ガイド

## このドキュメントについて

### 何をしようとしたのか

このドキュメントは、**Prisma 6から7へのアップグレード作業**中に発生した一連のエラーと、その解決方法をまとめたものです。

**実施した作業の流れ:**

1. **依存関係のアップグレード**
   - `package.json`で`@prisma/client`と`prisma`を6.x → 7.xに更新
   - `npm install`で依存関係をインストール

2. **ローカル環境での動作確認**
   - `npx prisma generate`でPrisma Clientを再生成
   - ローカルでアプリを起動してテスト

3. **Dockerビルドとデプロイ**
   - DockerイメージをビルドしてArtifact Registryにプッシュ
   - Cloud Runにデプロイ

4. **CI/CD（GitHub Actions）でのデプロイ**
   - コードをGitHubにプッシュ
   - GitHub Actionsで自動ビルド・デプロイを実行

5. **本番環境での動作確認**
   - Vercel（フロントエンド）からCloud Run（バックエンド）への接続テスト

### なぜエラーが発生したのか

Prisma 7では、以下のような**破壊的変更（Breaking Changes）**が含まれているため、単純にバージョンを上げるだけではエラーが発生します:

- **datasource設定の変更**: `schema.prisma`内の`url`プロパティが廃止され、`prisma.config.ts`での設定が必要に
- **PrismaClient初期化の変更**: ドライバーアダプター（`@prisma/adapter-pg`など）が必須に
- **環境変数の扱いの変更**: ビルド時と実行時で環境変数の扱いが異なる

このドキュメントでは、Prisma 6から7への移行時に発生した各エラーとその解決方法を、**実際に遭遇した順番**で記録しています。

## 目次

1. [エラー1: DATABASE_URL環境変数が解決できない](#エラー1-database_url環境変数が解決できない)
2. [エラー2: datasource urlプロパティがサポートされない](#エラー2-datasource-urlプロパティがサポートされない)
3. [エラー3: PrismaClient初期化時に引数が必要](#エラー3-prismaclient初期化時に引数が必要)
4. [エラー4: package.jsonとpackage-lock.jsonの不整合](#エラー4-packagejsonとpackage-lockjsonの不整合)
5. [エラー5: dist/index.jsが見つからない](#エラー5-distindexjsが見つからない)
6. [エラー6: dotenv/configモジュールが見つからない](#エラー6-dotenvconfigモジュールが見つからない)
7. [エラー7: 本番環境でlocalhostのAPIを呼び出している](#エラー7-本番環境でlocalhostのapiを呼び出している)
8. [エラー8: CORSポリシーによりAPIアクセスがブロックされる](#エラー8-corsポリシーによりapiアクセスがブロックされる)

---

## エラー1: DATABASE_URL環境変数が解決できない

**発生タイミング:** Dockerイメージをビルドしている時（`docker build`コマンド実行時）

### エラー内容

```
#13 1.643 Failed to load config file "/app" as a TypeScript/JavaScript module. 
Error: PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL.
#13 ERROR: process "/bin/sh -c npx prisma generate" did not complete successfully: exit code: 1
```

### 原因

Docker build時に`npx prisma generate`を実行する際、環境変数`DATABASE_URL`が設定されていないため。GitHub Actionsで環境変数を設定していても、それは実行時の設定であり、ビルド時には利用できない。

### 対処法

Dockerfileで`prisma generate`実行時にダミーのDATABASE_URLを設定する。`prisma generate`はデータベースに接続せず、スキーマファイルから型を生成するだけなので、ダミー値で問題ない。

**修正箇所: `todo-api/Dockerfile`**

```dockerfile
# Prisma Clientの生成（ダミーのDATABASE_URLを設定）
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate
```

実行時には、Cloud Runで設定された本物のDATABASE_URLが使用される。

---

## エラー2: datasource urlプロパティがサポートされない

**発生タイミング:** `npx prisma generate`を実行している時（ローカル開発環境、またはDockerビルド中）

### エラー内容

```
#13 1.853 error: The datasource property `url` is no longer supported in schema files. 
Move connection URLs for Migrate to `prisma.config.ts` and pass either `adapter` 
for a direct database connection or `accelerateUrl` for Accelerate to the PrismaClient constructor.
See https://pris.ly/d/config-datasource and https://pris.ly/d/prisma7-client-config
```

### 原因

Prisma 7では、`schema.prisma`内のdatasourceブロックで`url`プロパティがサポートされなくなった。代わりに`prisma.config.ts`で接続URLを管理する必要がある。

### 対処法

#### 1. `prisma.config.ts`を作成

**ファイル: `todo-api/prisma.config.ts`**

```typescript
import 'dotenv/config'
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
```

**重要**: `import 'dotenv/config'`を先頭に追加することで、環境変数が読み込まれる。

#### 2. `schema.prisma`から`url`を削除

**修正前:**
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

**修正後:**
```prisma
datasource db {
  provider = "postgresql"
}
```

#### 3. Dockerfileで`prisma.config.ts`をコピー

runner stageで`prisma.config.ts`をコピーするように修正。

**修正箇所: `todo-api/Dockerfile`**

```dockerfile
# Prismaスキーマとビルド成果物をコピー
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/dist ./dist
```

---

## エラー3: PrismaClient初期化時に引数が必要

**発生タイミング:** TypeScriptコンパイル時（`npm run build`実行時、Dockerビルド中）

### エラー内容

```
#14 1.924 src/index.ts(14,16): error TS2554: Expected 1 arguments, but got 0.
#14 ERROR: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
```

### 原因

Prisma 7では、PrismaClientの初期化時にドライバーアダプターが必須になった。PostgreSQLの場合、`@prisma/adapter-pg`を使用する必要がある。

### 対処法

#### 1. 必要なパッケージをインストール

**修正箇所: `todo-api/package.json`**

```json
{
  "dependencies": {
    "@hono/node-server": "^1.19.6",
    "@prisma/adapter-pg": "^7.2.0",
    "@prisma/client": "^7.2.0",
    "@prisma/extension-accelerate": "^2.0.2",
    "dotenv": "^17.2.3",
    "hono": "^4.10.4",
    "pg": "^8.13.1"
  },
  "devDependencies": {
    "@types/node": "^20.11.17",
    "@types/pg": "^8.11.10",
    "prisma": "^7.2.0",
    "tsx": "^4.7.1",
    "typescript": "^5.8.3"
  }
}
```

#### 2. PrismaClientの初期化コードを修正

**修正箇所: `todo-api/src/index.ts`**

**修正前:**
```typescript
import { PrismaClient } from "./generated/prisma/client.js";

const prisma = new PrismaClient();
```

**修正後:**
```typescript
import { PrismaClient } from "./generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });
```

#### 3. package-lock.jsonを更新

```bash
cd todo-api
npm install
```

---

## エラー4: package.jsonとpackage-lock.jsonの不整合

**発生タイミング:** GitHub Actionsでのビルド時、または`npm ci`実行時

### エラー内容

```
npm ci can only install packages when your package.json and package-lock.json 
or npm-shrinkwrap.json are in sync. Please update your lock file with `npm install` 
before continuing.
```

### 原因

`package.json`に依存関係を追加したが、`package-lock.json`が更新されていない。Docker buildやGitHub Actionsでは`npm ci`が使用されるため、両ファイルが同期している必要がある。

### 対処法

```bash
cd todo-api
npm install
```

これにより`package-lock.json`が更新される。必ず更新された`package-lock.json`をgitにコミットすること。

---

## エラー5: dist/index.jsが見つからない

**発生タイミング:** Dockerコンテナ起動時（Cloud Runでのデプロイ後、アプリ起動時）

### エラー内容

```
Error: Cannot find module '/app/dist/index.js'
    at Module._resolveFilename (node:internal/modules/cjs/loader:1207:15)
    at Module._load (node:internal/modules/cjs/loader:1038:27)
    at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:164:12)
    at node:internal/main/run_main_module:28:49 {
  code: 'MODULE_NOT_FOUND',
  requireStack: []
}
```

### 原因

TypeScriptのコンパイル時、`rootDir`が指定されていないため、`index.js`が`dist/src/index.js`に出力されていた。しかし、Dockerfileでは`dist/index.js`を参照している。

また、Prisma Clientが`dist/generated/prisma`に配置されていないため、実行時に見つからない。

### 対処法

#### 1. tsconfig.jsonを修正

**修正箇所: `todo-api/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "NodeNext",
    "strict": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "types": ["node"],
    "jsx": "react-jsx",
    "jsxImportSource": "hono/jsx",
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

**変更点:**
- `rootDir: "./src"`を追加 → `index.js`が`dist/`直下に出力される
- `include: ["src/**/*"]`を追加 → `prisma.config.ts`がビルド対象から除外される

#### 2. Dockerfileを修正

生成されたPrisma Clientを`dist/generated`にコピーする。

**修正箇所: `todo-api/Dockerfile`**

```dockerfile
# Prismaスキーマとビルド成果物をコピー
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/generated ./dist/generated
```

これにより、実行時に`dist/index.js`から`./generated/prisma/client.js`が正しく読み込まれる。

---

## エラー6: dotenv/configモジュールが見つからない

**発生タイミング:** GitHub Actionsでデータベースマイグレーション実行時（`npx prisma migrate deploy`）

### エラー内容

```
Failed to load config file "/home/runner/work/todo-docker-app/todo-docker-app/todo-api/prisma.config.js" 
as a TypeScript/JavaScript module. Error: Error: Cannot find module 'dotenv/config'
Require stack:
- /home/runner/work/todo-docker-app/todo-docker-app/todo-api/prisma.config.js
```

### 原因

GitHub Actionsの"Run database migrations"ステップで`npx prisma migrate deploy`を実行する際、`node_modules`がインストールされていないため、`dotenv`が見つからない。

### 対処法

migration実行前に依存関係をインストールする。

**修正箇所: `.github/workflows/backend-deploy.yml`**

**修正前:**
```yaml
- name: Run database migrations (Optional)
  working-directory: ./todo-api
  run: |
    npx prisma migrate deploy
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

**修正後:**
```yaml
- name: Run database migrations (Optional)
  working-directory: ./todo-api
  run: |
    npm ci
    npx prisma migrate deploy
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

---

## エラー7: 本番環境でlocalhostのAPIを呼び出している

**発生タイミング:** Vercel（本番環境）でフロントエンドを開いた時、ブラウザのコンソールにエラーが表示される

### エラー内容

```
GET http://localhost:3000/todos net::ERR_CONNECTION_REFUSED
index-rssTaZfJ.js:14  Uncaught (in promise) TypeError: Failed to fetch
```

### 原因

フロントエンド（React）のコードでAPI URLが`http://localhost:3000`にハードコードされており、本番環境（Vercel）でもlocalhostを参照してしまう。

### 対処法

#### 1. 環境変数ファイルを作成

**ファイル: `.env`（ローカル開発用）**

```
VITE_API_URL=http://localhost:3000
```

**ファイル: `.env.example`（テンプレート）**

```
VITE_API_URL=http://localhost:3000
```

#### 2. .gitignoreに.envを追加

**修正箇所: `.gitignore`**

```
node_modules
dist
dist-ssr
*.local
.env
```

#### 3. App.tsxでAPI URLを環境変数化

**修正箇所: `src/App.tsx`**

**修正前:**
```typescript
const fetchTodos = async () => {
  const res = await fetch("http://localhost:3000/todos");
  // ...
};
```

**修正後:**
```typescript
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

const fetchTodos = async () => {
  const res = await fetch(`${API_URL}/todos`);
  // ...
};
```

全てのAPI呼び出し箇所（`fetch`, `axios.post`, `axios.put`）で`${API_URL}`を使用する。

#### 4. Vercelに環境変数を設定

1. Vercelダッシュボードでプロジェクトを開く
2. **Settings** → **Environment Variables**に移動
3. 以下を追加:
   - **Key**: `VITE_API_URL`
   - **Value**: `https://your-cloud-run-url.run.app` (実際のCloud RunのURL)
   - **Environments**: Production, Preview, Developmentすべてにチェック

#### 5. Cloud RunのURLを確認

```bash
gcloud run services describe <SERVICE_NAME> --region <REGION> --format="value(status.url)"
```

または、GCPコンソールのCloud Runページで確認。

---

## エラー8: CORSポリシーによりAPIアクセスがブロックされる

**発生タイミング:** Vercel（本番環境）からCloud Run（バックエンド）にAPIリクエストを送った時、ブラウザのコンソールにエラーが表示される

### エラー内容

```
Access to fetch at 'https://hono-api-646639314014.asia-northeast1.run.app/todos'
from origin 'https://todo-docker-app-blond.vercel.app' has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

### 原因

フロントエンド（Vercel: `https://todo-docker-app-blond.vercel.app`）からバックエンド（Cloud Run）へのAPIリクエストが、CORS（Cross-Origin Resource Sharing）ポリシーによってブロックされている。

バックエンドのコードでは以下のようにCORSが設定されているが：

```typescript
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  })
);
```

Cloud Runで`CORS_ORIGIN`環境変数が設定されていないため、デフォルト値の`http://localhost:5173`が使用されており、本番環境のVercel URLからのリクエストが拒否されている。

### 対処法

#### 方法1: GitHub Actionsで環境変数を設定（推奨）

Cloud Runのデプロイ時に`CORS_ORIGIN`環境変数を設定する。

**修正箇所: `.github/workflows/backend-deploy.yml`**

**修正前:**
```yaml
--set-env-vars "DATABASE_URL=${{ secrets.DATABASE_URL }}" \
```

**修正後:**
```yaml
--set-env-vars "DATABASE_URL=${{ secrets.DATABASE_URL }},CORS_ORIGIN=https://todo-docker-app-blond.vercel.app" \
```

この方法では、デプロイのたびに自動的に正しいCORS設定が適用される。

#### 方法2: 複数のoriginを許可する（開発・本番両対応）

開発環境と本番環境の両方をサポートする場合、コードを修正して複数のoriginを許可する。

**修正箇所: `todo-api/src/index.ts`**

```typescript
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://todo-docker-app-blond.vercel.app",
      process.env.CORS_ORIGIN || "",
    ].filter(Boolean),
  })
);
```

#### 方法3: gcloudコマンドで直接設定（手動）

既にデプロイ済みのサービスに環境変数を追加する場合：

```bash
gcloud run services update <SERVICE_NAME> \
  --region <REGION> \
  --update-env-vars "CORS_ORIGIN=https://todo-docker-app-blond.vercel.app"
```

### 検証方法

1. 変更をコミット＆プッシュ
2. GitHub Actionsでデプロイが完了するまで待つ
3. Vercelのフロントエンドを開いてブラウザの開発者ツールを確認
4. Networkタブで`/todos`リクエストのResponse Headersに`Access-Control-Allow-Origin`が含まれていることを確認

---

## まとめ

### 主な変更点

1. **prisma.config.ts**: 新設し、DATABASE_URLの設定を移行
2. **schema.prisma**: `url`プロパティを削除
3. **package.json**: `@prisma/adapter-pg`と`pg`を追加
4. **src/index.ts**: PrismaClient初期化時にアダプターを追加
5. **tsconfig.json**: `rootDir`と`include`を設定
6. **Dockerfile**: `prisma.config.ts`と生成されたPrisma Clientをコピー
7. **backend-deploy.yml**: migration実行前に`npm ci`を追加、CORS_ORIGIN環境変数を設定
8. **src/App.tsx**: API URLを環境変数化

### チェックリスト

- [ ] すべての変更をコミット
- [ ] package-lock.jsonを更新してコミット
- [ ] Vercelに環境変数`VITE_API_URL`を設定（Cloud RunのURL）
- [ ] backend-deploy.ymlにCORS_ORIGIN環境変数を設定
- [ ] GitHub Actionsでビルドとデプロイが成功することを確認
- [ ] 本番環境でフロントエンドからAPIにアクセスできることを確認（CORSエラーが出ないこと）

### 参考リンク

- [Prisma 7 Upgrade Guide](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7)
- [Prisma Config Reference](https://www.prisma.io/docs/orm/reference/prisma-config-reference)
- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
- [CORS (Cross-Origin Resource Sharing)](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [Hono CORS Middleware](https://hono.dev/docs/middleware/builtin/cors)
