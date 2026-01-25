# デプロイクイックスタートガイド

このガイドは、最小限の手順でTodoアプリをデプロイするためのクイックスタートです。

詳しい説明が必要な場合は、[はじめてのデプロイガイド](./deployment-guide-for-beginners.md)を参照してください。

---

## 前提条件

- GitHubアカウント
- Googleアカウント
- プロジェクトがGitHubにプッシュ済み

---

## デプロイフロー概要

```
1. Vercel → フロントエンド（React）
2. Cloud Run → バックエンド（Hono API）
3. GitHub Actions → 自動デプロイ
```

---

## ステップ1: GCPプロジェクトの準備

### 1.1 プロジェクト作成

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. 「プロジェクトを作成」をクリック
3. プロジェクト名: `todo-app`
4. プロジェクトIDをメモ: `todo-app-xxxxx`

### 1.2 APIを有効化

以下のAPIを有効化（各リンクをクリックして「有効にする」）:

- [Cloud Run API](https://console.cloud.google.com/apis/library/run.googleapis.com)
- [Artifact Registry API](https://console.cloud.google.com/apis/library/artifactregistry.googleapis.com)
- ~~[Cloud SQL API](https://console.cloud.google.com/apis/library/sqladmin.googleapis.com)~~ ← Neonを使う場合は不要

### 1.3 Artifact Registryリポジトリ作成

1. [Artifact Registry](https://console.cloud.google.com/artifacts) を開く
2. 「リポジトリを作成」をクリック
3. 設定:
   - 名前: `todo-api`
   - 形式: `Docker`
   - リージョン: `asia-northeast1`
4. 「作成」をクリック

### 1.4 Neonでデータベースを作成

**Neon**は、無料で使えるサーバーレスPostgreSQLサービスです。Cloud SQLより安く、セットアップも簡単です。

#### 1.4.1 Neonアカウント作成

1. [Neon](https://neon.tech) にアクセス
2. 「Sign Up」をクリック
3. GitHubアカウントでサインアップ（推奨）または、メールアドレスでサインアップ

#### 1.4.2 プロジェクト作成

1. ダッシュボードで「Create a project」をクリック
2. 設定:
   - **Project name**: `todo-app`
   - **Database name**: `tododb`
   - **Region**: `AWS / Asia Pacific (Tokyo) ap-northeast-1`（東京リージョン推奨）
   - **PostgreSQL version**: `16`（最新版でOK）
3. 「Create Project」をクリック

#### 1.4.3 接続文字列を取得

プロジェクト作成後、**Connection Details**が表示されます。

1. 「Connection string」タブを選択
2. **Pooled connection**を選択（推奨）
3. 接続文字列をコピー:
   ```
   postgresql://your-username:your-password@ep-xxx-xxx.ap-northeast-1.aws.neon.tech/tododb?sslmode=require
   ```
4. この接続文字列を**安全な場所にメモ**（後でGitHub Secretsに登録します）

**重要メモ:**
- **Neonの無料プラン**: 0.5GB storage、常時稼働
- **自動スリープ**: 5分間アクセスがないとスリープ（初回アクセス時に数秒のコールドスタート）
- **本番利用**: 無料プランでも十分実用的

#### 1.4.4 データベースの確認（オプション）

Neonダッシュボードの「SQL Editor」で接続を確認できます:

```sql
-- テーブル一覧を表示
\dt

-- データベース情報を表示
SELECT version();
```

### 1.5 Dockerイメージをビルドしてプッシュ

**前提条件**: gcloud CLIがインストールされていること（[インストール手順](https://cloud.google.com/sdk/docs/install)）

#### 1.5.1 gcloud認証とプロジェクト設定

**重要**: この手順をスキップすると、docker pushで認証エラーが発生します。

```bash
# 1. gcloudにログイン（ブラウザが開きます）
gcloud auth login

# 2. プロジェクトを設定（プロジェクトIDを置き換えてください）
gcloud config set project todo-app-xxxxx

# 3. Docker認証を設定（重要！）
# このコマンドで、DockerクライアントがArtifact Registryにアクセスできるようになります
gcloud auth configure-docker asia-northeast1-docker.pkg.dev
```

**3番目のコマンドの説明:**
- `~/.docker/config.json` に認証ヘルパーの設定が追加されます
- これにより、`docker push` 時に gcloud の認証情報が自動的に使用されます
- **この設定がないと**、以下のエラーが発生します：
  ```
  Unauthenticated request. Unauthenticated requests do not have permission
  "artifactregistry.repositories.uploadArtifacts" on resource...
  ```

**確認方法:**
```bash
# Docker設定ファイルを確認
cat ~/.docker/config.json
# 以下のような設定が追加されていればOK
# "credHelpers": {
#   "asia-northeast1-docker.pkg.dev": "gcloud"
# }
```

#### 1.5.2 Dockerイメージをビルド

```bash
# プロジェクトルートに移動
cd /path/to/todo-docker-app

# todo-apiディレクトリに移動
cd todo-api

# Dockerイメージをビルド（プロジェクトIDを置き換えてください）
docker build -t asia-northeast1-docker.pkg.dev/todo-app-xxxxx/todo-api/todo-api:latest .
```

**注意**: ビルド中に`DATABASE_URL`環境変数が必要というエラーが出る場合がありますが、Dockerfileでダミー値が設定されているので正常にビルドされます。

#### 1.5.3 Artifact Registryにプッシュ

```bash
# イメージをプッシュ（プロジェクトIDを置き換えてください）
docker push asia-northeast1-docker.pkg.dev/todo-app-xxxxx/todo-api/todo-api:latest
```

#### 1.5.4 プッシュ確認

1. [Artifact Registry](https://console.cloud.google.com/artifacts) を開く
2. `todo-api` リポジトリをクリック
3. `todo-api` イメージが表示されていればOK

### 1.6 Cloud Runサービス作成

1. [Cloud Run](https://console.cloud.google.com/run) を開く
2. 「サービスを作成」をクリック
3. 設定:
   - サービス名: `todo-api`
   - リージョン: `asia-northeast1`
   - コンテナイメージのURL: `asia-northeast1-docker.pkg.dev/todo-app-xxxxx/todo-api/todo-api:latest`（手順1.5でプッシュしたイメージ）
   - 認証: `未認証の呼び出しを許可`
4. 「コンテナ、ネットワーキング、セキュリティ」→「コンテナ」:
   - コンテナポート: `8080`
   - メモリ: `512 MiB`
   - CPU: `1`
5. 「環境変数」:
   - `DATABASE_URL` = 手順1.4.3で取得したNeonの接続文字列（例: `postgresql://your-username:your-password@ep-xxx-xxx.ap-northeast-1.aws.neon.tech/tododb?sslmode=require`）
6. 「作成」をクリック
7. サービスURLをメモ: `https://todo-api-xxxxx-an.a.run.app`

### 1.7 サービスアカウント作成

1. [サービスアカウント](https://console.cloud.google.com/iam-admin/serviceaccounts) を開く
2. 「サービスアカウントを作成」をクリック
3. サービスアカウント名: `github-actions`
4. 権限を追加:
   - `Cloud Run 管理者`
   - `Artifact Registry 書き込み`
   - `サービス アカウント ユーザー`
5. 「完了」をクリック
6. 作成したサービスアカウントをクリック → 「キー」タブ
7. 「鍵を追加」→「新しい鍵を作成」→「JSON」
8. ダウンロードされたJSONファイルの内容をコピー（後で使う）

---

## ステップ2: Vercelでフロントエンドをデプロイ

### 2.1 プロジェクトをインポート

1. [Vercel](https://vercel.com) にアクセス → GitHubでサインアップ
2. 「Add New...」→「Project」をクリック
3. GitHubリポジトリ `todo-docker-app` を選択
4. 設定:
   - Framework Preset: `Vite`
   - Build Command: `npm run build`
   - Output Directory: `dist`
5. 「Deploy」をクリック
6. デプロイURLをメモ: `https://todo-docker-app-xxxxx.vercel.app`

### 2.2 環境変数を設定

1. Vercel Dashboard → プロジェクト → Settings → Environment Variables
2. 以下を追加:
   - `VITE_API_URL` = `https://todo-api-xxxxx-an.a.run.app`（Cloud RunのURL）
3. 「Save」→「Redeploy」

### 2.3 Vercel認証情報を取得

1. **VERCEL_TOKEN**:
   - Vercel Dashboard → Settings → Tokens
   - 「Create」→ 名前: `GitHub Actions` → Scope: `Full Account`
   - トークンをコピー（後で使う）

2. **VERCEL_ORG_ID と VERCEL_PROJECT_ID**:
   - Vercel Dashboard → プロジェクト → Settings → General
   - **Project ID** をコピー
   - **Team ID** または **Organization ID** をコピー

---

## ステップ3: GitHub Secretsを設定

1. GitHubリポジトリ → Settings → Secrets and variables → Actions
2. 「New repository secret」をクリック
3. 以下を1つずつ登録:

### GCP関連

| Name | Value |
|------|-------|
| `GCP_PROJECT_ID` | `todo-app-xxxxx`（プロジェクトID） |
| `GCP_SERVICE_ACCOUNT_KEY` | JSONファイルの内容全体（手順1.7で取得） |
| `GCP_REGION` | `asia-northeast1` |
| `CLOUD_RUN_SERVICE_NAME` | `todo-api` |
| `DATABASE_URL` | Neonの接続文字列（手順1.4.3で取得、例: `postgresql://your-username:your-password@ep-xxx-xxx.ap-northeast-1.aws.neon.tech/tododb?sslmode=require`） |

### Vercel関連

| Name | Value |
|------|-------|
| `VERCEL_TOKEN` | Vercelトークン |
| `VERCEL_ORG_ID` | Organization ID |
| `VERCEL_PROJECT_ID` | Project ID |

---

## ステップ4: GitHub Actionsワークフローを作成

### 4.1 フロントエンド用

`.github/workflows/frontend-deploy.yml` を作成:

```yaml
name: Deploy Frontend to Vercel

on:
  push:
    branches:
      - main
    paths:
      - "src/**"
      - "public/**"
      - "index.html"
      - "package.json"
      - "vite.config.ts"

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npm run build
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: "--prod"
```

### 4.2 バックエンド用

`.github/workflows/backend-deploy.yml` を作成:

```yaml
name: Deploy Backend to Cloud Run

on:
  push:
    branches:
      - main
    paths:
      - "todo-api/**"

env:
  PROJECT_ID: ${{ secrets.GCP_PROJECT_ID }}
  REGION: ${{ secrets.GCP_REGION }}
  SERVICE_NAME: ${{ secrets.CLOUD_RUN_SERVICE_NAME }}

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: google-github-actions/auth@v2
        with:
          credentials_json: "${{ secrets.GCP_SERVICE_ACCOUNT_KEY }}"

      - uses: google-github-actions/setup-gcloud@v2

      - run: gcloud auth configure-docker ${{ env.REGION }}-docker.pkg.dev

      - name: Build and Push
        working-directory: ./todo-api
        run: |
          docker build -t ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/todo-api/todo-api:${{ github.sha }} .
          docker push ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/todo-api/todo-api:${{ github.sha }}

      - name: Deploy to Cloud Run
        run: |
          gcloud run deploy ${{ env.SERVICE_NAME }} \
            --image ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/todo-api/todo-api:${{ github.sha }} \
            --region ${{ env.REGION }} \
            --platform managed \
            --allow-unauthenticated \
            --set-env-vars "DATABASE_URL=${{ secrets.DATABASE_URL }}" \
            --port 8080
```

---

## ステップ5: デプロイ

```bash
git add .
git commit -m "Add CI/CD workflows"
git push origin main
```

GitHub Actions が自動的に実行されます：

1. GitHub → リポジトリ → Actions タブを確認
2. ワークフローが成功すれば完了！

---

## 動作確認

### フロントエンド

```
https://your-app.vercel.app
```

### バックエンド

```bash
curl https://todo-api-xxxxx-an.a.run.app/api/todos
```

---

## トラブルシューティング

### Docker push で認証エラーが出る

**エラー内容:**
```
Unauthenticated request. Unauthenticated requests do not have permission
"artifactregistry.repositories.uploadArtifacts" on resource...
```

**原因:** Docker認証が設定されていない

**解決方法:**
```bash
# Docker認証を設定
gcloud auth configure-docker asia-northeast1-docker.pkg.dev

# 確認
cat ~/.docker/config.json
# "credHelpers" に "asia-northeast1-docker.pkg.dev": "gcloud" が含まれていればOK
```

**それでも解決しない場合:**
```bash
# Application Default Credentialsを設定
gcloud auth application-default login
```

### GitHub Actionsが失敗する

1. GitHub → リポジトリ → Actions → 失敗したワークフローをクリック
2. エラーメッセージを確認
3. よくあるエラー:
   - Secrets が正しく設定されていない
   - サービスアカウントの権限が不足している
   - DATABASE_URL の形式が間違っている

### Cloud Runログの確認

1. [Cloud Run](https://console.cloud.google.com/run) → `todo-api` → 「ログ」タブ
2. エラーメッセージを確認

### 詳細なトラブルシューティング

[はじめてのデプロイガイド](./deployment-guide-for-beginners.md#トラブルシューティング) を参照してください。

---

## まとめ

これで、以下が完了しました：

✅ GCPプロジェクトの準備
✅ **Neonでデータベースをデプロイ（無料）**
✅ Vercelでフロントエンドをデプロイ
✅ Cloud Runでバックエンドをデプロイ
✅ GitHub Actionsで自動デプロイ

今後は `git push` するだけで、自動的にデプロイされます！
