import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as agentcore from "@aws-cdk/aws-bedrock-agentcore-alpha";

export interface AgentProps {
  readonly databaseName: string;
  readonly workgroupName: string;
  readonly dataBucketArn: string;
  readonly resultsBucketArn: string;
}

export class Agent extends Construct {
  constructor(scope: Construct, id: string, props: AgentProps) {
    super(scope, id);

    const account = cdk.Stack.of(this).account;
    const region = cdk.Stack.of(this).region;

    const glueCatalogArn = `arn:aws:glue:${region}:${account}:catalog`;
    const glueDatabaseArn = `arn:aws:glue:${region}:${account}:database/${props.databaseName}`;
    const glueTableArn = `arn:aws:glue:${region}:${account}:table/${props.databaseName}/*`;
    const athenaWorkgroupArn = `arn:aws:athena:${region}:${account}:workgroup/${props.workgroupName}`;


    const agentRuntimeArtifact =
      agentcore.AgentRuntimeArtifact.fromAsset("agent");

    // AgentCoreランタイムの作成
    const runtime = new agentcore.Runtime(this, "AgentCoreRuntime", {
      agentRuntimeArtifact: agentRuntimeArtifact,
      environmentVariables: {
        DATABASE_NAME: props.databaseName,
        WORKGROUP_NAME: props.workgroupName,
      },
    });

    // Bedrockモデルの呼び出し権限
    runtime.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
        ],
        resources: [
          `arn:aws:bedrock:*::foundation-model/*`,
          `arn:aws:bedrock:*:${account}:inference-profile/*`,
        ],
      })
    );

    // Athenaクエリ実行権限
    runtime.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "athena:StartQueryExecution",
          "athena:GetQueryExecution",
          "athena:GetQueryResults",
        ],
        resources: [athenaWorkgroupArn],
      })
    );

    // Glueカタログアクセス権限
    runtime.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "glue:GetTable",
          "glue:GetTables",
          "glue:GetDatabase",
          "glue:GetPartitions",
        ],
        resources: [glueCatalogArn, glueDatabaseArn, glueTableArn],
      })
    );

    // S3データバケットの読み取り権限
    runtime.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:GetObject", "s3:ListBucket"],
        resources: [props.dataBucketArn, `${props.dataBucketArn}/*`],
      })
    );

    // S3 results bucketの読み取り/書き込み権限
    runtime.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket",
          "s3:GetBucketLocation",
        ],
        resources: [props.resultsBucketArn, `${props.resultsBucketArn}/*`],
      })
    );
  }
}