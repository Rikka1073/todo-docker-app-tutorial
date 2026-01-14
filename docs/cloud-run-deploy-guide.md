# Cloud Run デプロイ実践ガイド

## 作成日
2025-12-04

## 目的
修正したHono APIアプリケーションをCloud Runにデプロイする実践手順

## 前提条件

### 必要なもの
- ✅ Google Cloud Platform (GCP) アカウント
- ✅ gcloud CLI インストール済み
- ✅ GCPプロジェクトID
- ✅ Neon DBの接続URL（DATABASE_URL）
- ✅ 修正済みのDockerfile（マルチステージビルド対応）

### 事前確認
```bash
# gcloud CLIがインストールされているか確認
gcloud --version

# ログインしているか確認
gcloud auth list
```

## デプロイ手順

### ステップ1: GCP設定

#### 1.1 プロジェクトIDの設定
```bash
gcloud config set project <YOUR_PROJECT_ID>
```

**例**:
```bash
gcloud config set project docker-todo-app-479106
```

#### 1.2 Cloud Runリージョンの設定
```bash
gcloud config set run/region <REGION>
```

**推奨リージョン**:
- `asia-northeast1` (東京) - 日本のユーザー向け
- `asia-southeast1` (シンガポール) - Neon DB (ap-southeast-1) に近い

**例**:
```bash
gcloud config set run/region asia-northeast1
```

#### 1.3 設定確認
```bash
# 現在の設定を確認
gcloud config list

# 出力例:
# [core]
# account = your-email@gmail.com
# project = docker-todo-app-479106
# [run]
# region = asia-northeast1
```

### ステップ2: 必要なAPIの有効化

#### 2.1 Cloud Build APIの有効化
```bash
gcloud services enable cloudbuild.googleapis.com
```

**注意**: APIの有効化には1-2分かかる場合があります。

#### 2.2 Cloud Run APIの有効化（念のため）
```bash
gcloud services enable run.googleapis.com
```

#### 2.3 Artifact Registry APIの有効化
```bash
gcloud services enable artifactregistry.googleapis.com
```

### ステップ3: デプロイの実行

#### 3.1 todo-apiディレクトリに移動
```bash
cd /path/to/todo-docker-app/todo-api
```

#### 3.2 デプロイコマンドの実行

**基本的なデプロイ**:
```bash
gcloud run deploy hono-api \
  --source=. \
  --platform=managed \
  --region=asia-northeast1 \
  --allow-unauthenticated \
  --timeout=60s \
  --cpu=1 \
  --memory=512Mi \
  --set-env-vars="DATABASE_URL=<YOUR_NEON_DB_URL>"
```

**実際のコマンド例**:
```bash
gcloud run deploy hono-api \
  --source=. \
  --platform=managed \
  --region=asia-northeast1 \
  --allow-unauthenticated \
  --timeout=60s \
  --cpu=1 \
  --memory=512Mi \
  --set-env-vars="DATABASE_URL=postgresql://neondb_owner:PASSWORD@HOST/neondb?sslmode=require&channel_binding=require"
```

**パラメータ説明**:
| パラメータ | 説明 |
|-----------|------|
| `--source=.` | 現在のディレクトリのソースコードをデプロイ |
| `--platform=managed` | フルマネージドのCloud Runを使用 |
| `--region` | デプロイ先のリージョン |
| `--allow-unauthenticated` | 認証なしでアクセス可能にする |
| `--timeout=60s` | リクエストタイムアウト時間 |
| `--cpu=1` | CPU 1コアを割り当て |
| `--memory=512Mi` | メモリ512MBを割り当て |
| `--set-env-vars` | 環境変数を設定 |

#### 3.3 デプロイの進行

デプロイコマンドを実行すると、以下の確認が表示されます：

1. **Artifact Registryの作成確認**
   ```
   Deploying from source requires an Artifact Registry Docker repository to store
   built containers. A repository named [cloud-run-source-deploy] in region
   [asia-northeast1] will be created.

   Do you want to continue (Y/n)?
   ```
   → **Y** を入力してEnter

2. **ビルドとデプロイの進行**
   ```
   Building using Dockerfile and deploying container to Cloud Run service [hono-api]
   Building and deploying new service...
   Validating Service........done
   Creating Container Repository.........................done
   Uploading sources.....................done
   Building Container........done
   Setting IAM Policy.............done
   Creating Revision........................done
   Routing traffic.....done
   ```

3. **デプロイ完了**
   ```
   Done.
   Service [hono-api] revision [hono-api-00001-xxx] has been deployed and is serving 100 percent of traffic.
   Service URL: https://hono-api-XXXXXXXXXX.asia-northeast1.run.app
   ```

### ステップ4: デプロイ後の確認

#### 4.1 ヘルスチェック
```bash
curl https://hono-api-XXXXXXXXXX.asia-northeast1.run.app/
```

**期待される出力**:
```
Hello Hono!
```

#### 4.2 API動作確認
```bash
# TODOリスト取得
curl https://hono-api-XXXXXXXXXX.asia-northeast1.run.app/todos
```

**期待される出力**:
```json
[{"id":1,"title":"neon01","completed":false}]
```

#### 4.3 ログ確認
```bash
gcloud run services logs read hono-api --region=asia-northeast1 --limit=20
```

**確認項目**:
- ✅ "Server is running on http://localhost:8080" が表示される
- ✅ エラーログがない
- ✅ データベース接続エラーがない

## 環境変数の管理

### DATABASE_URLの取得方法

**Neon DBの場合**:
1. Neonダッシュボードにログイン
2. プロジェクトを選択
3. "Connection Details" を確認
4. "Connection string" をコピー

**フォーマット**:
```
postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require&channel_binding=require
```

### 環境変数の更新

デプロイ後に環境変数を変更する場合：

```bash
gcloud run services update hono-api \
  --region=asia-northeast1 \
  --set-env-vars="DATABASE_URL=<NEW_DATABASE_URL>"
```

または、複数の環境変数を設定：

```bash
gcloud run services update hono-api \
  --region=asia-northeast1 \
  --set-env-vars="DATABASE_URL=<URL>,CORS_ORIGIN=<FRONTEND_URL>"
```

## トラブルシューティング

### 問題1: Cloud Build APIが有効化されていない

**エラー**:
```
ERROR: (gcloud.run.deploy) PERMISSION_DENIED: Cloud Build API has not been used in project...
```

**解決方法**:
```bash
# APIを有効化
gcloud services enable cloudbuild.googleapis.com

# 1-2分待ってから再実行
sleep 60
gcloud run deploy hono-api --source=. ...
```

### 問題2: STARTUP TCP probe failed

**エラー**:
```
Default STARTUP TCP probe failed 1 time consecutively for container "hono-api-1" on port 8080.
```

**確認事項**:
1. Dockerfileが正しいか確認
   - runner stageで`RUN npx prisma generate`が実行されているか
   - `CMD ["node", "dist/index.js"]`が正しいか

2. index.tsでPORT環境変数を読み取っているか
   ```typescript
   const port = Number(process.env.PORT) || 3000;
   ```

3. ローカルで動作確認
   ```bash
   docker build -t hono-api:test .
   docker run -p 8080:8080 -e PORT=8080 -e DATABASE_URL="<URL>" hono-api:test
   curl http://localhost:8080/
   ```

### 問題3: データベース接続エラー

**エラーログ**:
```
PrismaClientInitializationError: Can't reach database server
```

**確認事項**:
1. DATABASE_URLが正しく設定されているか
   ```bash
   gcloud run services describe hono-api --region=asia-northeast1 --format="value(spec.template.spec.containers[0].env)"
   ```

2. DATABASE_URLのフォーマットが正しいか
   - `postgresql://`または`postgres://`で始まる
   - `sslmode=require`が含まれている

3. Neon DBのIPアドレス制限がないか確認

### 問題4: 既存のサービスが見つからない

**エラー**:
```
ERROR: (gcloud.run.services.describe) The requested resource was not found.
```

**解決方法**:
```bash
# サービス一覧を確認
gcloud run services list --region=asia-northeast1

# リージョンが間違っている可能性があるので、全リージョン検索
gcloud run services list
```

## 便利なコマンド集

### サービス情報の確認
```bash
# サービス詳細表示
gcloud run services describe hono-api --region=asia-northeast1

# サービスURL取得
gcloud run services describe hono-api --region=asia-northeast1 --format="value(status.url)"
```

### ログ確認
```bash
# 最新20件のログ表示
gcloud run services logs read hono-api --region=asia-northeast1 --limit=20

# リアルタイムでログを表示
gcloud run services logs tail hono-api --region=asia-northeast1
```

### サービスの削除
```bash
gcloud run services delete hono-api --region=asia-northeast1
```

### トラフィックの管理
```bash
# 新しいリビジョンにトラフィックを徐々に移行（カナリアデプロイ）
gcloud run services update-traffic hono-api \
  --region=asia-northeast1 \
  --to-revisions=hono-api-00002-xxx=50,hono-api-00001-xxx=50
```

## コスト管理

### 無料枠
Cloud Runの無料枠（2024年時点）:
- 月間200万リクエスト
- 月間36万vCPU秒
- 月間180万GBメモリ秒

### コスト削減のヒント

1. **最小インスタンス数を0に設定**（デフォルト）
   ```bash
   --min-instances=0
   ```

2. **適切なリソース割り当て**
   - CPU: 1コアで十分（軽量API）
   - メモリ: 512MiB推奨

3. **タイムアウトの調整**
   - 不要に長いタイムアウトを設定しない
   - 推奨: 60秒

### コスト確認
```bash
# 請求情報の確認（GCPコンソールで確認）
# https://console.cloud.google.com/billing
```

## デプロイの更新

### コード変更後の再デプロイ

1. コードを修正
2. 同じデプロイコマンドを実行

```bash
cd todo-api
gcloud run deploy hono-api \
  --source=. \
  --platform=managed \
  --region=asia-northeast1 \
  --allow-unauthenticated \
  --timeout=60s \
  --cpu=1 \
  --memory=512Mi \
  --set-env-vars="DATABASE_URL=<YOUR_NEON_DB_URL>"
```

Cloud Runは自動的に新しいリビジョンを作成し、トラフィックを切り替えます。

### ロールバック

問題が発生した場合、前のリビジョンに戻すことができます：

```bash
# リビジョン一覧を確認
gcloud run revisions list --service=hono-api --region=asia-northeast1

# 特定のリビジョンにトラフィックを戻す
gcloud run services update-traffic hono-api \
  --region=asia-northeast1 \
  --to-revisions=hono-api-00001-xxx=100
```

## まとめ

### デプロイの基本フロー

1. **設定**: GCPプロジェクトとリージョンを設定
2. **API有効化**: Cloud Build, Cloud Run, Artifact Registry
3. **デプロイ**: `gcloud run deploy`コマンド実行
4. **確認**: ヘルスチェック、API動作確認、ログ確認

### 重要なポイント

- ✅ Dockerfileのrunner stageで`RUN npx prisma generate`を実行
- ✅ index.tsで`process.env.PORT`を読み取る
- ✅ DATABASE_URLに`sslmode=require`を含める
- ✅ デプロイ前にローカルで動作確認

## 関連ドキュメント

- [cloud-run-fix-plan.md](./cloud-run-fix-plan.md) - 修正計画と問題解決の詳細
- [Cloud Run 公式ドキュメント](https://cloud.google.com/run/docs)
- [gcloud CLI リファレンス](https://cloud.google.com/sdk/gcloud/reference/run/deploy)
