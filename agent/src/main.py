import os
import time
import boto3
from strands import Agent, tool
from bedrock_agentcore.runtime import BedrockAgentCoreApp

DATABASE_NAME = os.environ.get("DATABASE_NAME", "csv_database")
WORKGROUP_NAME = os.environ.get("WORKGROUP_NAME", "csv-query-workgroup")

glue = boto3.client("glue")
athena = boto3.client("athena")


@tool
def list_tables() -> str:
    """指定データベースのテーブル一覧を取得する。最初に必ずこのツールを呼んで利用可能なテーブルを確認すること。"""
    res = glue.get_tables(DatabaseName=DATABASE_NAME)
    tables = [t["Name"] for t in res["TableList"]]
    return f"Tables in {DATABASE_NAME}: {', '.join(tables)}"


@tool
def get_table_schema(table_name: str) -> str:
    """Glue Data CatalogからテーブルのDDLスキーマを取得する。SQLを生成する前に必ずこのツールでスキーマを確認すること。

    Args:
        table_name: テーブル名
    """
    res = glue.get_table(DatabaseName=DATABASE_NAME, Name=table_name)
    table = res["Table"]

    cols = table["StorageDescriptor"]["Columns"]
    part_keys = table.get("PartitionKeys", [])

    col_defs = "\n".join([f"  {c['Name']} {c['Type']}" for c in cols])
    part_defs = "\n".join([f"  {c['Name']} {c['Type']} (partition)" for c in part_keys])

    return f"""Table: {DATABASE_NAME}.{table_name}
Columns:
{col_defs}
Partition Keys:
{part_defs}
Location: {table['StorageDescriptor']['Location']}"""


@tool
def execute_athena_query(sql: str) -> str:
    """AthenaでSQLを実行し結果を返す。必ずスキーマ確認後に実行すること。LIMITを必ずつけること。

    Args:
        sql: 実行するSQL文
    """
    exec_res = athena.start_query_execution(
        QueryString=sql,
        QueryExecutionContext={"Database": DATABASE_NAME},
        WorkGroup=WORKGROUP_NAME,
    )
    query_id = exec_res["QueryExecutionId"]

    for _ in range(30):
        status = athena.get_query_execution(QueryExecutionId=query_id)
        state = status["QueryExecution"]["Status"]["State"]
        if state == "SUCCEEDED":
            break
        elif state in ("FAILED", "CANCELLED"):
            reason = status["QueryExecution"]["Status"].get("StateChangeReason", "")
            return f"Query failed: {reason}"
        time.sleep(2)
    else:
        return "Query timed out"

    results = athena.get_query_results(QueryExecutionId=query_id)
    rows = results["ResultSet"]["Rows"]

    if not rows:
        return "No results"

    headers = [c["VarCharValue"] for c in rows[0]["Data"]]
    data = [
        [c.get("VarCharValue", "") for c in row["Data"]]
        for row in rows[1:]
    ]

    lines = [" | ".join(headers)]
    lines += [" | ".join(row) for row in data]
    return "\n".join(lines)


app = BedrockAgentCoreApp()


@app.entrypoint
async def invoke(payload):
    prompt = payload.get("prompt")

    agent = Agent(
        model="jp.anthropic.claude-sonnet-4-6",
        tools=[list_tables, get_table_schema, execute_athena_query],
        system_prompt="""あなたはデータアナリストアシスタントです。

## ツールの使い方
- list_tables: 最初に必ず呼んで利用可能なテーブルを確認する
- get_table_schema: SQLを生成する前に必ず対象テーブルのスキーマを確認する
- execute_athena_query: スキーマ確認後にSQLを実行する

## 必ず守るルール
- SELECT * は使わない
- パーティションキー(dt)を必ずWHEREに含める
- LIMIT 100 を必ずつける

## 手順
1. list_tablesでテーブル確認
2. get_table_schemaでスキーマ確認
3. SQLを生成してexecute_athena_queryで実行
4. 結果を自然言語で説明
""",
    )

    stream = agent.stream_async(prompt)

    async for event in stream:
        yield event


if __name__ == "__main__":
    app.run()