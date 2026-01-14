# Cloud Run デプロイ修正計画

## 作成日
2025-11-30

## 目的
HonoアプリケーションをCloud Runに正しくデプロイできるようにする

## 現在の構成の理解

### プロジェクト構成
```
todo-docker-app/
├── Dockerfile              # フロントエンド用（Vite）
├── docker-compose.yml      # ローカル開発環境
├── todo-api/
│   ├── Dockerfile          # API用（現在は開発モード）
│   ├── src/index.ts        # Honoアプリケーション
│   ├── prisma/
│   │   └── schema.prisma   # データベーススキーマ
│   ├── .env                # ローカル環境変数
│   ├── .env.production     # 本番環境変数（Neon DB）
│   └── package.json
```

### データベース
- **ローカル**: PostgreSQL (Docker)
- **本番**: Neon (サーバーレスPostgreSQL)

### 現在の問題
1. todo-api/Dockerfileが開発モード（`npm run dev`）
2. ポートがハードコード（3000）されている
3. Cloud RunのPORT環境変数（8080）に対応していない
4. 本番用の最適化がされていない

## 修正計画

### Phase 1: コード修正（所要時間: 15分）

#### 1.1 index.tsのポート設定を修正
**ファイル**: `todo-api/src/index.ts`

**変更箇所**: 59-67行目

**現在のコード**:
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

**修正後のコード**:
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

**理由**: Cloud Runは動的にPORT環境変数を設定する（通常8080）

#### 1.2 CORS設定を修正（オプション）
**ファイル**: `todo-api/src/index.ts`

**変更箇所**: 19-23行目

**現在のコード**:
```typescript
app.use(
  cors({
    origin: "http://localhost:5173",
  })
);
```

**修正後のコード**:
```typescript
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  })
);
```

**理由**: 本番環境でフロントエンドのURLを環境変数で設定できるようにする

### Phase 2: Dockerfileの最適化（所要時間: 20分）

#### 2.1 本番用Dockerfileを作成
**ファイル**: `todo-api/Dockerfile`

**修正方針**:
- マルチステージビルドを使用してイメージサイズを最小化
- TypeScriptをビルドして本番用にコンパイル
- Prisma Clientを生成
- 本番依存関係のみをインストール
- セキュリティのため非rootユーザーで実行

**新しいDockerfile**:
```dockerfile
# ビルドステージ
FROM node:20-alpine AS builder

WORKDIR /app

# 依存関係のインストール
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

# ソースコードのコピー
COPY . .

# Prisma Clientの生成
RUN npx prisma generate

# TypeScriptのビルド
RUN npm run build

# 本番ステージ
FROM node:20-alpine AS runner

WORKDIR /app

# 本番依存関係のみをインストール
COPY package*.json ./
RUN npm ci --omit=dev

# Prismaスキーマとビルド成果物をコピー
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/generated ./src/generated

# 非rootユーザーで実行
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs

# Cloud RunのPORT環境変数を使用
ENV PORT=8080
EXPOSE 8080

# 本番起動コマンド
CMD ["node", "dist/index.js"]
```

**主な改善点**:
- ✅ マルチステージビルド（イメージサイズ削減）
- ✅ 本番依存関係のみ（`--omit=dev`）
- ✅ Prisma Client自動生成
- ✅ TypeScriptコンパイル済み
- ✅ 非rootユーザー実行（セキュリティ向上）
- ✅ PORT環境変数対応

### Phase 3: ローカルテスト（所要時間: 15分）

#### 3.1 Dockerイメージのビルド
```bash
cd todo-api
docker build -t hono-api:test .
```

#### 3.2 ローカルで本番モードをテスト
```bash
docker run -p 8080:8080 \
  -e PORT=8080 \
  -e DATABASE_URL="<Neon DBのURL>" \
  hono-api:test
```

#### 3.3 動作確認
```bash
# ヘルスチェック
curl http://localhost:8080/

# TODOリスト取得
curl http://localhost:8080/todos
```

**期待される結果**:
- ✅ サーバーがポート8080で起動
- ✅ `/` エンドポイントが "Hello Hono!" を返す
- ✅ `/todos` エンドポイントがJSON配列を返す

### Phase 4: Cloud Runへのデプロイ（所要時間: 10分）

#### 4.1 Artifact Registryへプッシュ（必要に応じて）
```bash
# プロジェクトとリージョンを設定
PROJECT_ID=<your-project-id>
REGION=<your-region>

# イメージをタグ付け
docker tag hono-api:test ${REGION}-docker.pkg.dev/${PROJECT_ID}/cloud-run-source-deploy/hono-api:latest

# プッシュ
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/cloud-run-source-deploy/hono-api:latest
```

#### 4.2 Cloud Runサービスのデプロイ
```bash
gcloud run deploy hono-api \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/cloud-run-source-deploy/hono-api:latest \
  --platform=managed \
  --region=${REGION} \
  --allow-unauthenticated \
  --set-env-vars="DATABASE_URL=<Neon DBのURL>" \
  --set-env-vars="CORS_ORIGIN=<フロントエンドのURL>"
```

**または、ソースから直接デプロイ**:
```bash
cd todo-api
gcloud run deploy hono-api \
  --source=. \
  --platform=managed \
  --region=${REGION} \
  --allow-unauthenticated \
  --set-env-vars="DATABASE_URL=<Neon DBのURL>" \
  --set-env-vars="CORS_ORIGIN=<フロントエンドのURL>"
```

#### 4.3 環境変数の設定
Cloud Runコンソールまたはgcloudコマンドで以下を設定:

| 環境変数 | 値 | 説明 |
|---------|-----|------|
| `DATABASE_URL` | Neon DBの接続URL | .env.productionから取得 |
| `CORS_ORIGIN` | フロントエンドのURL | 例: https://your-frontend.web.app |
| `PORT` | （自動設定） | Cloud Runが自動で8080を設定 |

### Phase 5: デプロイ後の検証（所要時間: 5分）

#### 5.1 ヘルスチェック
```bash
SERVICE_URL=$(gcloud run services describe hono-api --region=${REGION} --format='value(status.url)')
curl ${SERVICE_URL}/
```

**期待される出力**: `Hello Hono!`

#### 5.2 API動作確認
```bash
# TODOリスト取得
curl ${SERVICE_URL}/todos

# TODO作成
curl -X POST ${SERVICE_URL}/todos \
  -H "Content-Type: application/json" \
  -d '{"title":"Test from Cloud Run"}'
```

#### 5.3 ログ確認
```bash
gcloud run services logs read hono-api --region=${REGION} --limit=50
```

**確認項目**:
- ✅ "Server is running on port 8080" のログが表示される
- ✅ エラーログがない
- ✅ データベース接続が成功している

## 追加の最適化（オプション）

### 1. .dockerignoreの作成
**ファイル**: `todo-api/.dockerignore`

```
node_modules
dist
.env
.env.local
*.log
.git
README.md
```

**効果**: ビルド速度向上、イメージサイズ削減

### 2. Cloud Runの設定最適化

```bash
gcloud run deploy hono-api \
  --source=. \
  --platform=managed \
  --region=${REGION} \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=10 \
  --cpu=1 \
  --memory=512Mi \
  --timeout=60s \
  --set-env-vars="DATABASE_URL=<URL>,CORS_ORIGIN=<URL>"
```

**パラメータ説明**:
- `--min-instances=0`: コールドスタートを許可（コスト削減）
- `--max-instances=10`: 最大インスタンス数
- `--cpu=1`: CPU 1コア
- `--memory=512Mi`: メモリ512MB
- `--timeout=60s`: リクエストタイムアウト

### 3. データベースマイグレーション

**本番環境への初回デプロイ時**:
```bash
# ローカルから本番DBにマイグレーション実行
cd todo-api
DATABASE_URL="<Neon DBのURL>" npx prisma migrate deploy
```

または、Cloud Run Jobsを使用:
```bash
gcloud run jobs create prisma-migrate \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/cloud-run-source-deploy/hono-api:latest \
  --set-env-vars="DATABASE_URL=<Neon DBのURL>" \
  --command="npx" \
  --args="prisma,migrate,deploy"
```

## トラブルシューティング

### 問題1: コンテナが起動しない
**確認事項**:
- ログを確認: `gcloud run services logs read hono-api --region=${REGION}`
- PORT環境変数が正しく読み込まれているか
- ビルドが成功しているか

### 問題2: データベース接続エラー
**確認事項**:
- DATABASE_URL環境変数が正しく設定されているか
- Neon DBのIPアドレス制限が設定されていないか
- SSL接続設定（`sslmode=require`）が含まれているか

### 問題3: CORS エラー
**確認事項**:
- CORS_ORIGIN環境変数が正しく設定されているか
- フロントエンドのURLがhttpsになっているか
- ワイルドカード（`*`）を許可する場合は`origin: "*"`に変更

## 実装チェックリスト

### コード修正
- [ ] index.tsのポート設定を環境変数対応に修正
- [ ] CORS設定を環境変数対応に修正（オプション）

### Dockerfile修正
- [ ] マルチステージビルドの実装
- [ ] Prisma Client生成の追加
- [ ] 本番依存関係のみのインストール
- [ ] 非rootユーザーの設定
- [ ] .dockerignoreの作成（オプション）

### ローカルテスト
- [ ] Dockerイメージのビルド成功
- [ ] ポート8080でのローカル起動成功
- [ ] API動作確認（GET /todos）
- [ ] データベース接続確認

### Cloud Runデプロイ
- [ ] イメージのビルド＆プッシュ（または直接デプロイ）
- [ ] 環境変数の設定（DATABASE_URL, CORS_ORIGIN）
- [ ] サービスのデプロイ成功

### デプロイ後検証
- [ ] ヘルスチェック成功（GET /）
- [ ] API動作確認（GET /todos, POST /todos）
- [ ] ログにエラーがないことを確認
- [ ] レスポンスタイムの確認

## タイムライン

| Phase | 作業内容 | 所要時間 |
|-------|---------|----------|
| 1 | コード修正 | 15分 |
| 2 | Dockerfile最適化 | 20分 |
| 3 | ローカルテスト | 15分 |
| 4 | Cloud Runデプロイ | 10分 |
| 5 | デプロイ後検証 | 5分 |
| **合計** | | **約65分** |

## 参考資料

- [Cloud Run ドキュメント](https://cloud.google.com/run/docs)
- [Hono デプロイメントガイド](https://hono.dev/docs/getting-started/nodejs)
- [Prisma Deployment](https://www.prisma.io/docs/guides/deployment/deployment)
- [Docker マルチステージビルド](https://docs.docker.com/build/building/multi-stage/)

## 次のステップ

1. ✅ 調査完了
2. ✅ 計画立案完了
3. ⏭️ 実装開始（ユーザーの承認後）
4. ⏭️ テスト実行
5. ⏭️ デプロイ実行
6. ⏭️ 本番環境での動作確認
