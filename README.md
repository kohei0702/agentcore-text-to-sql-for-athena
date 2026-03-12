# AgentCore Text-to-SQL

Amazon Bedrock AgentCore と Strands Agents を使用して、自然言語から Amazon Athena に対する SQL クエリを生成・実行するエージェントを構築するサンプルプロジェクト

## アーキテクチャ

```
ユーザー ──> AgentCore Runtime (Strands Agent)
                 │
                 ├── Bedrock ── LLM推論
                 │
                 ├── Glue Data Catalog ── テーブル一覧 / スキーマ取得
                 │
                 └── Athena ── SQLクエリ実行
                       │
                       ├── S3 (データバケット) ── CSV データ
                       └── S3 (結果バケット) ── クエリ結果
```

### 構成リソース

| リソース | 説明 |
|---|---|
| **AgentCore Runtime** | Strands Agent を実行するランタイム |
| **S3 (データバケット)** | サンプル CSV データを格納 |
| **S3 (結果バケット)** | Athena クエリ結果を格納 |
| **Glue Database / Crawler** | CSV からテーブルスキーマを自動検出 |
| **Athena WorkGroup** | SQL クエリの実行環境 |

## サンプルデータ

3 つのテーブル（CSV）が含まれる。

| テーブル | 内容 | 主なカラム |
|---|---|---|
| `customers` | 顧客情報 | customer_id, customer_name, email, age, gender, prefecture |
| `products` | 商品情報 | product_id, product_name, category, price, stock_quantity |
| `orders` | 注文情報（日付パーティション） | order_id, customer_id, product_id, quantity, total_amount, order_status |

`orders` テーブルは `dt` カラムでパーティション分割されている（2025-01 / 02 / 03）。

## エージェントの動作

エージェントは以下の 3 つのツールを使い、段階的にクエリを生成・実行する。

1. **`list_tables`** – データベース内のテーブル一覧を取得
2. **`get_table_schema`** – 対象テーブルのスキーマ（カラム名・型・パーティションキー）を取得
3. **`execute_athena_query`** – 生成した SQL を Athena で実行し、結果を返却

## 前提条件

- [Node.js](https://nodejs.org/) (v18 以上)
- [AWS CDK CLI](https://docs.aws.amazon.com/cdk/v2/guide/cli.html) (`npm install -g aws-cdk`)
- [Docker](https://www.docker.com/)
- AWS アカウントおよび認証情報の設定済み環境
- Amazon Bedrock で `jp.anthropic.claude-sonnet-4-6` モデルへのアクセスが有効であること

## デプロイ

```bash
# 依存パッケージのインストール
npm install

# CDK ブートストラップ（初回のみ）
npx cdk bootstrap

# デプロイ
npx cdk deploy
```

### Glue Crawler の実行

デプロイ後、Glue Crawler を実行してテーブルスキーマを作成する。

```bash
aws glue start-crawler --name csv-crawler
```

Crawler の完了は以下で確認できる。

```bash
aws glue get-crawler --name csv-crawler --query 'Crawler.State'
```

## 使い方

デプロイ後、AgentCore Runtime のエンドポイントに対してプロンプトを送信する。

```json
{
  "prompt": "2025年1月の売上合計を教えて"
}
```

エージェントは自動的にテーブル一覧の確認 → スキーマの取得 → SQL の生成・実行 → 結果の自然言語での説明、という流れで応答する。

### プロンプト例

- 「カテゴリ別の商品数を教えて」
- 「2025年1月の売上トップ3の商品は？」

## プロジェクト構成

```
.
├── agent/                    # エージェント
│   ├── Dockerfile
│   ├── requirements.txt
│   └── src/
│       └── main.py           # Strands Agent・ツール実装
├── bin/
│   └── agentcore-text-to-sql.ts
├── lib/
│   ├── agentcore-text-to-sql-stack.ts
│   └── constructs/
│       ├── agent.ts          # AgentCore Runtime
│       └── data.ts           # S3 / Glue / Athena
├── sample-data/              # サンプル CSV データ
│   ├── customers/
│   ├── orders/
│   └── products/
├── cdk.json
├── package.json
└── tsconfig.json
```

## クリーンアップ

```bash
npx cdk destroy
```
