import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { Data } from './constructs/data';
import { Agent } from './constructs/agent';

export class AgentcoreTextToSqlStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // データ関連のリソースを作成
    const data = new Data(this, 'Data');

    // エージェントの作成（ツールは直接エージェント内で実行）
    new Agent(this, 'Agent', {
      databaseName: data.databaseName,
      workgroupName: data.workgroupName,
      dataBucketArn: data.dataBucket.bucketArn,
      resultsBucketArn: data.resultsBucket.bucketArn,
    });

  }
}
