# CI/CD 実装ガイド

## 概要

このドキュメントでは、todo-docker-app プロジェクトの CI/CD パイプライン実装方針を説明します。

### 目的

- コードの push からデプロイまでを自動化
- 一貫性のあるビルド・デプロイプロセスの確立
- 手動作業の削減とヒューマンエラーの防止

### システム構成

- **フロントエンド**: React (Vite) → Vercel
- **バックエンド**: Hono (Node.js) → Cloud Run (コンテナ)
- **データベース**: Cloud SQL (PostgreSQL)
- **CI/CD ツール**: GitHub Actions

---

## 前提知識：開発環境と本番環境の違い

### 現在の開発環境（ローカル）

あなたが今使っているのは **開発環境** です：

```
ローカルPC
├── docker-compose.yml ← これを使っている
├── Dockerfile (フロントエンド用・開発用)
└── todo-api/Dockerfile (バックエンド用・本番用)
```

**開発環境での作業フロー**:

1. コードを編集
2. `docker-compose up` で起動
3. localhost:5173 でフロントエンドを確認
4. localhost:3000 でバックエンド API を確認
5. コード変更が即座に反映される（ホットリロード）

**重要**: docker-compose は開発用のツールで、**本番環境では使いません**。

### 本番環境（Cloud Run / Vercel）

本番環境は **インターネット上のサーバー** で動きます：

```
インターネット上
├── Vercel ← フロントエンド（React）がここで動く
│   └── ユーザーがブラウザでアクセス
│
├── Cloud Run ← バックエンド（Hono API）がここで動く
│   └── Dockerコンテナ1個だけが動く（docker-composeは使わない）
│
└── Cloud SQL ← データベース
```

**本番環境での動作**:

- フロントエンド: ビルドされた静的ファイル（HTML/CSS/JS）が Vercel で配信
- バックエンド: Docker コンテナ 1 個が Cloud Run で動く
- 誰でもインターネット経由でアクセスできる

---

## 「Docker コンテナをデプロイする」とは？

### ステップバイステップで理解する

#### 現在のローカル環境（開発）

```bash
# あなたが今やっていること
$ docker-compose up

→ Docker Composeが以下を実行:
  1. client (React)、api (Hono)、db (PostgreSQL) の3つのコンテナを起動
  2. ボリュームマウントでコード変更を即座に反映
  3. localhost でアクセス可能
```

#### 本番環境（Cloud Run）

```bash
# CI/CDが自動でやること（手動でやる必要なし）
$ docker build -t my-api ./todo-api    # ← Dockerイメージを作成
$ docker push my-api                    # ← Artifact Registryにアップロード
$ gcloud run deploy                     # ← Cloud Runで起動

→ Cloud Runが以下を実行:
  1. アップロードされたDockerイメージを取得
  2. コンテナを1個起動（バックエンドAPIだけ）
  3. インターネットからアクセス可能なURLを発行
     例: https://todo-api-xxxxx.run.app
```

### 重要な違い

| 項目         | 開発環境（docker-compose）   | 本番環境（Cloud Run） |
| ------------ | ---------------------------- | --------------------- |
| 起動方法     | `docker-compose up`          | `gcloud run deploy`   |
| コンテナ数   | 3 個（client, api, db）      | 1 個（api のみ）      |
| コード変更   | 即座に反映（ホットリロード） | 再デプロイが必要      |
| アクセス     | localhost                    | インターネット URL    |
| データベース | ローカルの PostgreSQL        | Cloud SQL             |
| 用途         | 開発・テスト                 | 本番運用              |

---

## CI/CD とは何か？

### CI/CD = 自動デプロイの仕組み

**CI（Continuous Integration）**: コードを継続的に統合・テストする
**CD（Continuous Deployment）**: テストを通過したコードを自動的に本番環境にデプロイする

### 具体的な流れ

```
【手動でやる作業】
1. コードを編集
2. git add .
3. git commit -m "機能追加"
4. git push origin main  ← ここまで

↓ ここから先は全自動 ↓

【GitHub Actionsが自動でやる】
5. GitHubがコードのpushを検知
6. GitHub Actions（CI/CDサーバー）が起動
7. 以下を自動実行:
   - Dockerイメージをビルド
   - Artifact Registryにpush
   - Cloud Runにデプロイ
8. デプロイ完了！本番環境に反映される
```

### 具体例：バックエンドを修正した場合

```
【あなたがやること】
1. todo-api/src/index.ts を編集（例: 新しいAPIエンドポイント追加）
2. git add todo-api/
3. git commit -m "Add new endpoint"
4. git push origin main

↓ 以降は自動 ↓

【GitHub Actionsが自動でやること】
5. pushを検知
6. todo-api/Dockerfile を使ってイメージをビルド
7. イメージをArtifact Registryにアップロード
8. Cloud Runを更新
9. 数分後、https://todo-api-xxxxx.run.app に新しいコードが反映される
```

---

## 前提条件

### 必要なアカウント・サービス

1. **GitHub**

   - リポジトリへの管理者アクセス権限

2. **Vercel**

   - Vercel アカウントの作成完了
   - プロジェクトのインポート完了

3. **Google Cloud Platform (GCP)**
   - GCP プロジェクトの作成完了
   - Cloud Run API の有効化
   - Artifact Registry API の有効化
   - Cloud SQL API の有効化（既存）
   - サービスアカウントの作成権限

---

## CI/CD アーキテクチャ

### フロントエンド（React）の CI/CD フロー

```
[GitHub Push]
    ↓
[GitHub Actions トリガー]
    ↓
[依存関係インストール]
    ↓
[ビルド (npm run build)]
    ↓
[Vercel デプロイ]
    ↓
[完了]
```

### バックエンド（Hono）の CI/CD フロー

```
[GitHub Push]
    ↓
[GitHub Actions トリガー]
    ↓
[Dockerイメージビルド]
    ↓
[GCP認証]
    ↓
[Artifact Registry へ Push]
    ↓
[Cloud Run デプロイ]
    ↓
[データベースマイグレーション (Optional)]
    ↓
[完了]
```

---

## GitHub Secrets の設定

GitHub Actions を動作させるためには、以下のシークレット（機密情報）を GitHub リポジトリに登録する必要があります。

### 必要なシークレット一覧

#### フロントエンド用

- `VERCEL_TOKEN`: Vercel の認証トークン
  - 取得方法: Vercel Dashboard → Settings → Tokens → Create
- `VERCEL_ORG_ID`: Vercel の Organization ID
  - 取得方法: Vercel Dashboard → Settings → General → Organization ID
- `VERCEL_PROJECT_ID`: Vercel の Project ID
  - 取得方法: Project Settings → General → Project ID

#### バックエンド用

| Secret 名                 | 値の例                           | 説明                               |
| ------------------------- | -------------------------------- | ---------------------------------- |
| `GCP_PROJECT_ID`          | `my-todo-app-12345`              | GCP プロジェクト ID                |
| `GCP_SERVICE_ACCOUNT_KEY` | `{JSON全体}`                     | サービスアカウントの認証 JSON キー |
| `GCP_REGION`              | `asia-northeast1`                | デプロイするリージョン（東京）     |
| `CLOUD_RUN_SERVICE_NAME`  | `todo-api`                       | Cloud Run サービス名               |
| `DATABASE_URL`            | `postgresql://user:pass@host/db` | Cloud SQL への接続 URL             |

---

## GCP サービスアカウントの作成手順

GitHub Actions から GCP のリソース（Cloud Run、Artifact Registry）にアクセスするには、サービスアカウントが必要です。

### 方法 1: GCP コンソール（Web UI）で作成

#### ステップ 1: サービスアカウントを作成

1. **GCP コンソールにアクセス**

   ```
   https://console.cloud.google.com/iam-admin/serviceaccounts
   ```

2. **プロジェクトを選択**

   - 画面上部のプロジェクト名をクリックして、あなたの Todo アプリ用のプロジェクトを選択

3. **「サービスアカウントを作成」をクリック**

4. **サービスアカウントの詳細を入力**
   - **サービスアカウント名**: `github-actions`
   - **サービスアカウント ID**: `github-actions`（自動入力される）
   - **説明**: `GitHub Actions CI/CD用`
   - **「作成して続行」をクリック**

#### ステップ 2: 権限を付与

以下の 3 つのロールを追加します：

1. **Cloud Run 管理者** (`roles/run.admin`)

   - Cloud Run サービスのデプロイと管理に必要

2. **Artifact Registry 書き込み** (`roles/artifactregistry.writer`)

   - Docker イメージを Artifact Registry にアップロードするために必要

3. **サービスアカウントユーザー** (`roles/iam.serviceAccountUser`)
   - Cloud Run がサービスアカウントとして実行するために必要

**手順**:

- 「ロールを選択」ドロップダウンから上記 3 つのロールを 1 つずつ追加
- 「続行」→「完了」をクリック

#### ステップ 3: JSON キーを生成

1. **サービスアカウント一覧から、作成した「github-actions」をクリック**

2. **「キー」タブを選択**

3. **「鍵を追加」→「新しい鍵を作成」をクリック**

4. **キーのタイプで「JSON」を選択**

5. **「作成」をクリック**
   - JSON ファイルが自動的にダウンロードされます
   - ファイル名: `プロジェクトID-xxxxxx.json`

**JSON ファイルの内容例**:

```json
{
  "type": "service_account",
  "project_id": "my-todo-app-12345",
  "private_key_id": "xxxxxxxxxxxxxxxx",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n",
  "client_email": "github-actions@my-todo-app-12345.iam.gserviceaccount.com",
  "client_id": "123456789",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "..."
}
```

**重要**: この JSON ファイルは機密情報です。GitHub Secrets に登録したら**必ず削除**してください。

### 方法 2: gcloud コマンド（ターミナル）で作成

```bash
# 1. サービスアカウント作成
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions CI/CD"

# 2. プロジェクトIDを環境変数に設定（あなたのプロジェクトIDに置き換え）
export PROJECT_ID="my-todo-app-12345"

# 3. 必要な権限を付与
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# 4. JSONキーを生成（key.jsonというファイルが作成される）
gcloud iam service-accounts keys create key.json \
  --iam-account=github-actions@${PROJECT_ID}.iam.gserviceaccount.com

# 5. key.jsonの内容を表示（これをGitHub Secretsにコピー）
cat key.json

# 6. GitHub Secretsに登録したら、JSONファイルを削除（重要！）
rm key.json
```

---

## GitHub Secrets への登録手順

サービスアカウントの JSON キーを含む、すべてのシークレットを GitHub に登録します。

### ステップ 1: GitHub リポジトリの設定画面を開く

1. **GitHub リポジトリにアクセス**

   ```
   https://github.com/あなたのユーザー名/todo-docker-app
   ```

2. **「Settings」タブをクリック**

3. **左側メニューから「Secrets and variables」→「Actions」を選択**

### ステップ 2: シークレットを 1 つずつ登録

#### GCP_SERVICE_ACCOUNT_KEY の登録

1. **「New repository secret」をクリック**

2. **Secret を入力**

   - **Name**: `GCP_SERVICE_ACCOUNT_KEY`
   - **Secret**: ダウンロードした**JSON ファイルの内容全体**をコピー&ペースト
     - ファイルをテキストエディタで開いて、`{` から `}` まで全てコピー

3. **「Add secret」をクリック**

#### GCP_PROJECT_ID の登録

1. **「New repository secret」をクリック**

2. **Secret を入力**

   - **Name**: `GCP_PROJECT_ID`
   - **Secret**: あなたの GCP プロジェクト ID（例: `my-todo-app-12345`）

3. **「Add secret」をクリック**

#### GCP_REGION の登録

1. **「New repository secret」をクリック**

2. **Secret を入力**

   - **Name**: `GCP_REGION`
   - **Secret**: `asia-northeast1`（東京リージョン）

3. **「Add secret」をクリック**

#### CLOUD_RUN_SERVICE_NAME の登録

1. **「New repository secret」をクリック**

2. **Secret を入力**

   - **Name**: `CLOUD_RUN_SERVICE_NAME`
   - **Secret**: `todo-api`

3. **「Add secret」をクリック**

#### DATABASE_URL の登録

1. **「New repository secret」をクリック**

2. **Secret を入力**

   - **Name**: `DATABASE_URL`
   - **Secret**: Cloud SQL の接続 URL（例: `postgresql://user:password@/dbname?host=/cloudsql/project:region:instance`）

3. **「Add secret」をクリック**

### ステップ 3: 登録されたシークレットを確認

Settings → Secrets and variables → Actions の画面で、以下が表示されていれば OK です：

```
Repository secrets
- CLOUD_RUN_SERVICE_NAME
- DATABASE_URL
- GCP_PROJECT_ID
- GCP_REGION
- GCP_SERVICE_ACCOUNT_KEY
```

**注意**: シークレットの値は、登録後は確認できません（セキュリティのため）。編集が必要な場合は削除して再登録してください。

---

## フロントエンド CI/CD 実装

### ワークフロー設計

- **トリガー**: `main`ブランチへの push
- **ビルド環境**: Node.js 20
- **デプロイ先**: Vercel

### ワークフローファイル例

`.github/workflows/frontend-deploy.yml`

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
      - "vercel.json"
      - ".github/workflows/frontend-deploy.yml"

jobs:
  deploy:
    name: Deploy to Vercel
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: "--prod"
          working-directory: ./
```

---

## バックエンド CI/CD 実装

### ワークフロー設計

- **トリガー**: `main`ブランチへの push
- **ビルド**: マルチステージ Docker ビルド
- **レジストリ**: Google Artifact Registry
- **デプロイ先**: Cloud Run

### Artifact Registry リポジトリ作成

```bash
gcloud artifacts repositories create todo-api \
  --repository-format=docker \
  --location=asia-northeast1 \
  --description="Docker repository for todo-api"
```

### ワークフローファイル例

`.github/workflows/backend-deploy.yml`

```yaml
name: Deploy Backend to Cloud Run

on:
  push:
    branches:
      - main
    paths:
      - "todo-api/**"
      - ".github/workflows/backend-deploy.yml"

env:
  PROJECT_ID: ${{ secrets.GCP_PROJECT_ID }}
  REGION: ${{ secrets.GCP_REGION }}
  SERVICE_NAME: ${{ secrets.CLOUD_RUN_SERVICE_NAME }}
  REPOSITORY: todo-api
  IMAGE_NAME: todo-api

jobs:
  deploy:
    name: Build and Deploy to Cloud Run
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          credentials_json: "${{ secrets.GCP_SERVICE_ACCOUNT_KEY }}"

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2

      - name: Configure Docker for Artifact Registry
        run: |
          gcloud auth configure-docker ${{ env.REGION }}-docker.pkg.dev

      - name: Build Docker image
        working-directory: ./todo-api
        run: |
          docker build -t ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} .
          docker tag ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} \
                     ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.IMAGE_NAME }}:latest

      - name: Push Docker image to Artifact Registry
        run: |
          docker push ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
          docker push ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.IMAGE_NAME }}:latest

      - name: Deploy to Cloud Run
        run: |
          gcloud run deploy ${{ env.SERVICE_NAME }} \
            --image ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} \
            --region ${{ env.REGION }} \
            --platform managed \
            --allow-unauthenticated \
            --set-env-vars "DATABASE_URL=${{ secrets.DATABASE_URL }}" \
            --port 8080 \
            --memory 512Mi \
            --cpu 1 \
            --max-instances 10 \
            --min-instances 0

      - name: Run database migrations (Optional)
        working-directory: ./todo-api
        run: |
          npx prisma migrate deploy
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

### 環境変数の具体例

上記のワークフローで使用している環境変数を具体的な値に置き換えた例：

#### 環境変数の設定（348-353 行目）

```yaml
env:
  PROJECT_ID: ${{ secrets.GCP_PROJECT_ID }} # 例: my-todo-app-12345
  REGION: ${{ secrets.GCP_REGION }} # 例: asia-northeast1（東京リージョン）
  SERVICE_NAME: ${{ secrets.CLOUD_RUN_SERVICE_NAME }} # 例: todo-api
  REPOSITORY: todo-api # 固定値（Artifact Registryのリポジトリ名）
  IMAGE_NAME: todo-api # 固定値（Dockerイメージ名）
```

#### Docker イメージビルドの実際のコマンド例

**環境変数を使用したバージョン（ワークフロー内）：**

```bash
docker build -t ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} .
```

**具体的な値に置き換えたバージョン：**

```bash
docker build -t asia-northeast1-docker.pkg.dev/my-todo-app-12345/todo-api/todo-api:a1b2c3d4e5f6 .
```

#### Docker イメージ URL の構造

```
asia-northeast1-docker.pkg.dev / my-todo-app-12345 / todo-api / todo-api : a1b2c3d4e5f6
        ↓                              ↓                ↓          ↓           ↓
     リージョン                    GCPプロジェクトID   リポジトリ名  イメージ名   タグ（コミットハッシュ）
```

- **リージョン**: `asia-northeast1`（東京）、`us-central1`（アメリカ）など
- **GCP プロジェクト ID**: あなたの GCP プロジェクトの一意な ID
- **リポジトリ名**: `todo-api`（Artifact Registry 内に作成した Docker リポジトリ）
- **イメージ名**: `todo-api`（アプリケーション名）
- **タグ**: `a1b2c3d4e5f6`（git コミットハッシュ）または `latest`

#### Cloud Run デプロイの実際のコマンド例

**環境変数を使用したバージョン：**

```bash
gcloud run deploy ${{ env.SERVICE_NAME }} \
  --image ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} \
  --region ${{ env.REGION }}
```

**具体的な値に置き換えたバージョン：**

```bash
gcloud run deploy todo-api \
  --image asia-northeast1-docker.pkg.dev/my-todo-app-12345/todo-api/todo-api:a1b2c3d4e5f6 \
  --region asia-northeast1
```

### GCP 内の Docker イメージの確認方法

Docker イメージは **Google Artifact Registry** に保存されます。確認方法は 3 つあります。

#### 方法 1: GCP コンソール（Web UI）で確認

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. 左側メニューから「**Artifact Registry**」を選択
3. リポジトリ一覧から「**todo-api**」をクリック
4. アップロードされた Docker イメージの一覧が表示される
   - イメージ名: `todo-api`
   - タグ一覧: `latest`, `a1b2c3d4e5f6`, など
   - アップロード日時、サイズ、脆弱性スキャン結果も表示

**直接アクセス URL**:

```
https://console.cloud.google.com/artifacts/docker/[PROJECT_ID]/asia-northeast1/todo-api
```

#### 方法 2: gcloud コマンドで確認

```bash
# Artifact Registryのリポジトリ一覧を表示
gcloud artifacts repositories list --location=asia-northeast1

# 特定のリポジトリ内のイメージ一覧を表示
gcloud artifacts docker images list \
  asia-northeast1-docker.pkg.dev/my-todo-app-12345/todo-api

# 特定のイメージのタグ一覧を表示
gcloud artifacts docker tags list \
  asia-northeast1-docker.pkg.dev/my-todo-app-12345/todo-api/todo-api
```

**出力例**:

```
IMAGE                                                                    TAGS                      CREATE_TIME
asia-northeast1-docker.pkg.dev/my-todo-app-12345/todo-api/todo-api     latest,a1b2c3d4e5f6       2025-12-15T10:30:00
asia-northeast1-docker.pkg.dev/my-todo-app-12345/todo-api/todo-api     b2c3d4e5f6a7              2025-12-14T15:20:00
```

#### 方法 3: Docker CLI で確認

ローカル環境から直接 Artifact Registry に接続して確認：

```bash
# Docker認証設定
gcloud auth configure-docker asia-northeast1-docker.pkg.dev

# イメージをpullして確認
docker pull asia-northeast1-docker.pkg.dev/my-todo-app-12345/todo-api/todo-api:latest

# ローカルのイメージ一覧を表示
docker images | grep todo-api
```

#### Cloud Run で使用中のイメージを確認

現在 Cloud Run で稼働しているサービスがどのイメージを使用しているか確認：

```bash
# Cloud Runサービスの詳細を表示
gcloud run services describe todo-api --region=asia-northeast1 --format="value(spec.template.spec.containers[0].image)"
```

**出力例**:

```
asia-northeast1-docker.pkg.dev/my-todo-app-12345/todo-api/todo-api:a1b2c3d4e5f6
```

---

## データベースマイグレーション戦略

### オプション 1: CI/CD パイプライン内で実行（推奨）

上記のワークフロー例の「Run database migrations」ステップで実装。

**メリット**:

- デプロイと同時に自動実行
- コードとスキーマの同期が保証される

**デメリット**:

- マイグレーションが失敗するとデプロイ全体が失敗
- ダウンタイムが発生する可能性

### オプション 2: Cloud Run Jobs で実行

マイグレーション専用の Cloud Run Job を作成し、デプロイ前に実行。

```bash
gcloud run jobs create todo-api-migrate \
  --image ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.IMAGE_NAME }}:latest \
  --region ${{ env.REGION }} \
  --set-env-vars "DATABASE_URL=${{ secrets.DATABASE_URL }}" \
  --command "npx" \
  --args "prisma,migrate,deploy"
```

### オプション 3: 手動実行

本番環境では手動でマイグレーションを実行し、安全性を確保。

---

## 環境変数管理

### 開発環境

- `.env` ファイルで管理（Git にコミットしない）
- Docker Compose で読み込み

### 本番環境（Cloud Run）

#### 方法 1: GitHub Secrets から直接設定

```yaml
--set-env-vars "DATABASE_URL=${{ secrets.DATABASE_URL }}"
```

#### 方法 2: Secret Manager を使用（推奨）

```bash
# Secret Manager にシークレット作成
gcloud secrets create database-url \
  --data-file=- <<< "postgresql://user:pass@host/db"

# Cloud Run にシークレット連携
gcloud run deploy todo-api \
  --set-secrets="DATABASE_URL=database-url:latest"
```

---

## ワークフロートリガー戦略

### 推奨設定

#### main ブランチへの push/merge 時

- 本番環境へ自動デプロイ
- フロントエンドとバックエンドは独立してトリガー

#### Pull Request 作成時

- ビルドテストのみ実行（デプロイなし）
- コード品質チェック（Lint, Test）

#### 手動トリガー

- `workflow_dispatch` イベントを使用
- 緊急時のロールバック対応

### トリガー設定例

```yaml
on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
  workflow_dispatch:
```

---

## ディレクトリ構造と paths フィルター

### フロントエンドの paths 設定

```yaml
paths:
  - "src/**"
  - "public/**"
  - "index.html"
  - "package.json"
  - "vite.config.ts"
```

### バックエンドの paths 設定

```yaml
paths:
  - "todo-api/**"
```

この設定により、変更があった部分のみがデプロイされます。

---

## トラブルシューティング

### 1. Docker build が失敗する

**原因**: マルチステージビルドの依存関係の問題

**解決方法**:

- `todo-api/Dockerfile` の `COPY` パスを確認
- `package.json` と `package-lock.json` が正しくコピーされているか確認

### 2. Cloud Run デプロイが失敗する

**原因**: サービスアカウントの権限不足

**解決方法**:

```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-actions@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"
```

### 3. DATABASE_URL 環境変数が反映されない

**原因**: Cloud Run サービスに環境変数が設定されていない

**解決方法**:

```bash
gcloud run services update todo-api \
  --set-env-vars "DATABASE_URL=your-database-url" \
  --region asia-northeast1
```

### 4. Prisma Client が見つからない

**原因**: `prisma generate` が実行されていない

**解決方法**:
Dockerfile で以下が実行されていることを確認:

```dockerfile
RUN npx prisma generate
```

### 5. Artifact Registry への push が失敗する

**原因**: 認証設定の問題

**解決方法**:

```bash
gcloud auth configure-docker asia-northeast1-docker.pkg.dev
```

---

## セキュリティベストプラクティス

### 1. シークレット管理

- GitHub Secrets に機密情報を保存
- `.env` ファイルは `.gitignore` に追加
- サービスアカウントキーは定期的にローテーション

### 2. 最小権限の原則

- CI/CD 用サービスアカウントには必要最小限の権限のみ付与
- 本番環境とステージング環境で異なるサービスアカウントを使用

### 3. イメージタグ戦略

- コミット SHA をタグとして使用（トレーサビリティ）
- `latest` タグは参照用のみ（ロールバック時は SHA を使用）

---

## 実装の順序

### フェーズ 1: バックエンド CI/CD（優先度：高）

1. Artifact Registry リポジトリ作成
2. サービスアカウント作成と権限設定
3. GitHub Secrets の登録
4. `.github/workflows/backend-deploy.yml` 作成
5. テスト push でデプロイ確認

### フェーズ 2: フロントエンド CI/CD（優先度：中）

1. Vercel アカウント作成とプロジェクトインポート
2. Vercel トークン、Organization ID、Project ID を取得
3. GitHub Secrets の登録（VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID）
4. `vercel.json` 設定ファイル作成
5. `.github/workflows/frontend-deploy.yml` 作成
6. テスト push でデプロイ確認

### フェーズ 3: 高度な機能追加（優先度：低）

1. Pull Request 時のプレビューデプロイ
2. 自動テストの追加
3. Slack 通知の追加
4. ロールバック機能の実装

---

## 次のステップ

1. **GitHub Secrets の設定**

   - 上記の必要なシークレットをすべて登録

2. **ワークフローファイルの作成**

   - バックエンド用 workflow を優先的に作成
   - フロントエンド用 workflow を作成

3. **テストデプロイ**

   - 各ワークフローを個別にテスト
   - エラーが発生した場合は上記のトラブルシューティングを参照

4. **本番運用開始**
   - main ブランチへのマージで自動デプロイ開始
   - デプロイ状況を GitHub Actions で監視

---

## 参考リンク

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Artifact Registry Documentation](https://cloud.google.com/artifact-registry/docs)
- [Vercel Documentation](https://vercel.com/docs)
- [Vercel GitHub Actions Integration](https://vercel.com/docs/deployments/git/vercel-for-github)
- [Prisma Migrate Documentation](https://www.prisma.io/docs/concepts/components/prisma-migrate)

---

## 更新履歴

- 2025-12-19: フロントエンドのデプロイ先をFirebase HostingからVercelに変更
- 2025-12-14: 初版作成
