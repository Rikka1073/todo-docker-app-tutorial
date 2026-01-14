# デプロイ完了確認チェックリスト

このドキュメントでは、以下のタスクが正しく完了したかを確認する方法を説明します。

## タスク一覧

1. フロントエンドCI/CDをVercelに変更
2. Reactアプリをデプロイ（Vercel）
3. HonoをコンテナでCloud Runにデプロイ
4. CI/CDを作成して、イメージビルド、push、デプロイを自動化

---

## 1. フロントエンドCI/CD（Vercel）の完了確認

### 必要な設定ファイル

#### ✅ チェック項目

- [ ] `vercel.json` ファイルが存在する
- [ ] `.github/workflows/frontend-deploy.yml` が存在し、Vercel用の設定になっている
- [ ] GitHub Secrets に以下が登録されている：
  - `VERCEL_TOKEN`
  - `VERCEL_ORG_ID`
  - `VERCEL_PROJECT_ID`

### 確認方法

#### ローカルで確認

```bash
# 設定ファイルの存在確認
ls -la vercel.json
cat .github/workflows/frontend-deploy.yml | grep "vercel"
```

#### GitHubで確認

1. GitHubリポジトリにアクセス: `https://github.com/<username>/<repository>`
2. `Settings` → `Secrets and variables` → `Actions` を開く
3. 以下のSecretsが登録されているか確認：
   - `VERCEL_TOKEN`
   - `VERCEL_ORG_ID`
   - `VERCEL_PROJECT_ID`

#### GitHub Actionsで確認

1. GitHubリポジトリの `Actions` タブを開く
2. `Deploy Frontend to Vercel` ワークフローが存在するか確認
3. 最新のワークフロー実行が成功（緑のチェックマーク）しているか確認

---

## 2. Reactアプリのデプロイ確認（Vercel）

### ✅ チェック項目

- [ ] Vercel Dashboardにプロジェクトが表示されている
- [ ] デプロイが成功している
- [ ] 本番URLからアプリにアクセスできる
- [ ] アプリが正常に動作する

### 確認方法

#### Vercel Dashboardで確認

1. [Vercel Dashboard](https://vercel.com/dashboard) にアクセス
2. プロジェクト一覧に `todo-docker-app` が表示されているか確認
3. プロジェクトをクリック
4. `Deployments` タブで最新のデプロイが "Ready" になっているか確認
5. Production URLをコピー

#### ブラウザで確認

```bash
# Production URLにアクセス
# 例: https://todo-docker-app.vercel.app
```

**確認ポイント**:
- ページが正常に表示される
- 画像やスタイルが読み込まれている
- 基本的な機能（タスク追加、表示など）が動作する

#### コマンドラインで確認

```bash
# ステータスコード200が返ってくるか確認
curl -I https://your-app.vercel.app
```

---

## 3. Hono（バックエンド）のCloud Runデプロイ確認

### ✅ チェック項目

- [ ] `todo-api/Dockerfile` が存在する
- [ ] `.github/workflows/backend-deploy.yml` が存在し、Cloud Run用の設定になっている
- [ ] GitHub Secrets に以下が登録されている：
  - `GCP_PROJECT_ID`
  - `GCP_SERVICE_ACCOUNT_KEY`
  - `GCP_REGION`
  - `CLOUD_RUN_SERVICE_NAME`
  - `DATABASE_URL`

### 確認方法

#### ローカルで確認

```bash
# Dockerfileの存在確認
ls -la todo-api/Dockerfile

# ワークフローファイルの確認
cat .github/workflows/backend-deploy.yml | grep "Cloud Run"
```

#### GCP Consoleで確認

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. 左側メニューから `Cloud Run` を選択
3. サービス一覧に `todo-api` (または設定したサービス名) が表示されているか確認
4. サービスをクリックして詳細を確認：
   - ステータスが "Ready" になっている
   - 最新のリビジョンが稼働中
   - URLが発行されている（例: `https://todo-api-xxxxx.run.app`）

#### Cloud Run URLでテスト

```bash
# バックエンドAPIのヘルスチェック
curl https://todo-api-xxxxx.run.app

# 特定のエンドポイントのテスト（例: /api/todos）
curl https://todo-api-xxxxx.run.app/api/todos
```

**期待される結果**:
- ステータスコード200
- JSON形式のレスポンスが返ってくる

#### Artifact Registryでイメージ確認

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. 左側メニューから `Artifact Registry` を選択
3. リポジトリ一覧に `docker-todo-app` (または設定したリポジトリ名) が表示されているか確認
4. リポジトリをクリック
5. `todo-api` イメージが存在し、タグ（`latest`, コミットハッシュ）が付いているか確認

---

## 4. CI/CDパイプラインの自動化確認

### ✅ チェック項目

- [ ] コードをpushすると自動的にワークフローが起動する
- [ ] フロントエンドとバックエンドが独立してデプロイされる
- [ ] ワークフローが成功している

### 確認方法

#### テストデプロイを実行

```bash
# 1. 簡単な変更を加える（例: READMEを編集）
echo "# Test deployment" >> README.md

# 2. コミット
git add .
git commit -m "test: CI/CDの動作確認"

# 3. プッシュ
git push origin main
```

#### GitHub Actionsで確認

1. GitHubリポジトリの `Actions` タブを開く
2. 最新のワークフロー実行を確認
3. 以下の2つのワークフローが表示されているか確認：
   - `Deploy Frontend to Vercel`
   - `Deploy Backend to Cloud Run`

**確認ポイント**:
- 各ステップが緑のチェックマークになっている
- エラーが発生していない
- デプロイが完了している

#### 各ワークフローの詳細確認

##### フロントエンドワークフロー

```
✓ Checkout code
✓ Setup Node.js
✓ Install dependencies
✓ Build
✓ Deploy to Vercel
```

##### バックエンドワークフロー

```
✓ Checkout code
✓ Authenticate to Google Cloud
✓ Set up Cloud SDK
✓ Configure Docker for Artifact Registry
✓ Build Docker image
✓ Push Docker image to Artifact Registry
✓ Deploy to Cloud Run
✓ Run database migrations (Optional)
```

---

## 5. エンドツーエンドテスト

### 完全な動作確認

#### ✅ チェック項目

- [ ] フロントエンドとバックエンドが正しく連携している
- [ ] データベースへの接続が成功している
- [ ] CRUD操作（作成、読み取り、更新、削除）が動作する

### 確認方法

1. **Vercelにデプロイされたフロントエンドにアクセス**
   ```
   https://your-app.vercel.app
   ```

2. **タスクを作成してみる**
   - 新しいタスクを追加
   - ページをリロードしてもタスクが保存されているか確認

3. **開発者ツールでネットワークタブを確認**
   - ブラウザの開発者ツール（F12）を開く
   - Network タブを開く
   - APIリクエストがCloud RunのURLに送信されているか確認
   - レスポンスが正常に返ってくるか確認

4. **データベース接続の確認**
   ```bash
   # Cloud Run ログを確認
   gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=todo-api" --limit 50
   ```

---

## トラブルシューティング

### フロントエンドがデプロイできない場合

1. **GitHub Secretsを確認**
   - `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` が正しく設定されているか

2. **ビルドエラーを確認**
   ```bash
   # ローカルでビルドしてエラーを確認
   npm run build
   ```

3. **Vercel Dashboard を確認**
   - プロジェクトが正しくインポートされているか
   - ビルド設定が正しいか（Framework Preset: Vite）

### バックエンドがデプロイできない場合

1. **GitHub Secretsを確認**
   - GCP関連のSecretsが正しく設定されているか

2. **サービスアカウントの権限を確認**
   ```bash
   # サービスアカウントの権限一覧を表示
   gcloud projects get-iam-policy YOUR_PROJECT_ID \
     --flatten="bindings[].members" \
     --filter="bindings.members:serviceAccount:github-actions@*"
   ```

3. **Docker イメージのビルドを確認**
   ```bash
   # ローカルでDockerイメージをビルドしてエラーを確認
   cd todo-api
   docker build -t test-todo-api .
   ```

4. **Cloud Run ログを確認**
   ```bash
   gcloud logging read "resource.type=cloud_run_revision" --limit 50
   ```

### CI/CDが自動実行されない場合

1. **paths フィルターを確認**
   - 変更したファイルが `paths` に含まれているか確認
   - `.github/workflows/frontend-deploy.yml` と `backend-deploy.yml` の `paths` 設定を確認

2. **ブランチ名を確認**
   - プッシュ先が `main` ブランチになっているか確認

3. **ワークフローファイルの文法エラーを確認**
   - YAML形式が正しいか確認
   - インデントが正しいか確認

---

## 完了条件まとめ

### すべてのタスクが完了したと言える条件

以下のすべての条件を満たしている場合、タスクは完了です：

1. ✅ **Vercel Dashboard** にプロジェクトが表示され、デプロイが成功している
2. ✅ **Cloud Run Console** に `todo-api` サービスが表示され、稼働している
3. ✅ **Artifact Registry** に Docker イメージがアップロードされている
4. ✅ **GitHub Actions** のワークフローが両方とも成功している
5. ✅ **フロントエンドURL** からアプリにアクセスでき、正常に動作する
6. ✅ **バックエンドURL** から API レスポンスが返ってくる
7. ✅ フロントエンドとバックエンドが正しく連携し、データベースへの操作が成功する
8. ✅ コードを `main` ブランチにpushすると、自動的にデプロイが実行される

---

## 完了確認用クイックコマンド集

```bash
# 1. ローカルファイル確認
ls -la vercel.json
ls -la .github/workflows/frontend-deploy.yml
ls -la .github/workflows/backend-deploy.yml
ls -la todo-api/Dockerfile

# 2. GitHub Actionsの状態確認（gh CLI使用）
gh workflow list
gh run list --limit 5

# 3. Cloud Runサービスの確認
gcloud run services list --region=asia-northeast1

# 4. Cloud Runの詳細情報取得
gcloud run services describe todo-api --region=asia-northeast1

# 5. Artifact Registryのイメージ一覧
gcloud artifacts docker images list asia-northeast1-docker.pkg.dev/YOUR_PROJECT_ID/docker-todo-app

# 6. フロントエンドのアクセステスト
curl -I https://your-app.vercel.app

# 7. バックエンドのアクセステスト
curl https://todo-api-xxxxx.run.app

# 8. Cloud Runのログ確認（最新50件）
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=todo-api" --limit 50 --format=json
```

---

## 次のステップ

すべてのタスクが完了したら、以下を検討してください：

1. **カスタムドメインの設定**
   - Vercel: カスタムドメインを追加
   - Cloud Run: カスタムドメインマッピング

2. **環境変数の最適化**
   - Secret Manager の活用
   - 環境ごとの設定分離

3. **モニタリングとアラート**
   - Vercel Analytics の設定
   - GCP Cloud Monitoring の設定
   - エラー通知の設定

4. **パフォーマンス最適化**
   - Cloud Run のメモリ/CPU設定の調整
   - Vercel の Edge Functions 活用
   - CDN の活用

5. **セキュリティ強化**
   - HTTPS の強制
   - CORS 設定の見直し
   - 認証/認可の実装

---

## 更新履歴

- 2025-12-19: 初版作成（Vercel + Cloud Run 構成）
