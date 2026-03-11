import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as glue from 'aws-cdk-lib/aws-glue';
import * as athena from 'aws-cdk-lib/aws-athena';
import * as path from 'path';

export class Data extends Construct {
  readonly databaseName: string;
  readonly workgroupName: string;
  readonly dataBucket: s3.Bucket;
  readonly resultsBucket: s3.Bucket;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // S3バケットの作成
    const dataBucket = new s3.Bucket(this, 'DataBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: false,
    });

    // サンプルCSVのアップロード
    new s3deploy.BucketDeployment(this, 'DeploySampleData', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../sample-data'))],
      destinationBucket: dataBucket,
      destinationKeyPrefix: 'data/',
    });

    const resultsBucket = new s3.Bucket(this, 'ResultsBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: false,
    });

    this.dataBucket = dataBucket;
    this.resultsBucket = resultsBucket;

    // Glueデータベースの作成
    const database_name = 'csv_database';
    this.databaseName = database_name;
    const database = new glue.CfnDatabase(this, 'GlueDatabase', {
      catalogId: cdk.Stack.of(this).account,
      databaseInput: {
        name: database_name,
      },
    });

    // Glueクローラー用IAMロールの作成
    const crawlerRole = new iam.Role(this, 'GlueCrawlerRole', {
      assumedBy: new iam.ServicePrincipal('glue.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSGlueServiceRole'),
      ],
    });
    dataBucket.grantRead(crawlerRole);

    // Glueクローラーの作成
    const crawler = new glue.CfnCrawler(this, 'GlueCrawler', {
      name: 'csv-crawler',
      role: crawlerRole.roleArn,
      databaseName: database_name,
      targets: {
        s3Targets: [
          {
            path: `s3://${dataBucket.bucketName}/data/`,
          },
        ],
      },
      configuration: JSON.stringify({
        Version: 1.0,
        CrawlerOutput: {

        }
      })
    });
    crawler.addDependency(database);

    // Athenaワークグループの作成
    const workgroupName = 'csv-query-workgroup';
    this.workgroupName = workgroupName;
    new athena.CfnWorkGroup(this, 'AthenaWorkGroup', {
      name: workgroupName,
      workGroupConfiguration: {
        resultConfiguration: {
          outputLocation: `s3://${resultsBucket.bucketName}/results/`,
        },
        enforceWorkGroupConfiguration: true,
      }, 
      recursiveDeleteOption: true,
    });

  }
};