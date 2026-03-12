import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
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

    // CSV用の共通SerDe設定
    const csvSerdeInfo: glue.CfnTable.SerdeInfoProperty = {
      serializationLibrary: 'org.apache.hadoop.hive.serde2.OpenCSVSerde',
      parameters: {
        'separatorChar': ',',
        'quoteChar': '"',
        'skip.header.line.count': '1',
      },
    };
    const csvInputFormat = 'org.apache.hadoop.mapred.TextInputFormat';
    const csvOutputFormat = 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat';

    // customers テーブル
    const customersTable = new glue.CfnTable(this, 'CustomersTable', {
      catalogId: cdk.Stack.of(this).account,
      databaseName: database_name,
      tableInput: {
        name: 'customers',
        description: '顧客マスタ。顧客ID・氏名・メールアドレス・年齢・性別・都道府県・登録日を管理する。',
        tableType: 'EXTERNAL_TABLE',
        parameters: {
          'classification': 'csv',
          'skip.header.line.count': '1',
        },
        storageDescriptor: {
          location: `s3://${dataBucket.bucketName}/data/customers/`,
          inputFormat: csvInputFormat,
          outputFormat: csvOutputFormat,
          serdeInfo: csvSerdeInfo,
          columns: [
            { name: 'customer_id', type: 'bigint', comment: '顧客を一意に識別するID' },
            { name: 'customer_name', type: 'string', comment: '顧客の氏名' },
            { name: 'email', type: 'string', comment: '顧客のメールアドレス' },
            { name: 'age', type: 'bigint', comment: '顧客の年齢' },
            { name: 'gender', type: 'string', comment: '性別 (M: 男性, F: 女性)' },
            { name: 'prefecture', type: 'string', comment: '顧客の居住都道府県' },
            { name: 'registered_at', type: 'string', comment: '顧客の登録日 (YYYY-MM-DD形式)' },
          ],
        },
      },
    });
    customersTable.addDependency(database);

    // products テーブル
    const productsTable = new glue.CfnTable(this, 'ProductsTable', {
      catalogId: cdk.Stack.of(this).account,
      databaseName: database_name,
      tableInput: {
        name: 'products',
        description: '商品マスタ。商品ID・商品名・カテゴリ・価格・在庫数を管理する。',
        tableType: 'EXTERNAL_TABLE',
        parameters: {
          'classification': 'csv',
          'skip.header.line.count': '1',
        },
        storageDescriptor: {
          location: `s3://${dataBucket.bucketName}/data/products/`,
          inputFormat: csvInputFormat,
          outputFormat: csvOutputFormat,
          serdeInfo: csvSerdeInfo,
          columns: [
            { name: 'product_id', type: 'bigint', comment: '商品を一意に識別するID' },
            { name: 'product_name', type: 'string', comment: '商品名' },
            { name: 'category', type: 'string', comment: '商品カテゴリ (家電, アクセサリー, PC周辺機器 など)' },
            { name: 'price', type: 'bigint', comment: '税込価格 (円)' },
            { name: 'stock_quantity', type: 'bigint', comment: '現在の在庫数' },
          ],
        },
      },
    });
    productsTable.addDependency(database);

    // orders テーブル (dt パーティション付き)
    const ordersTable = new glue.CfnTable(this, 'OrdersTable', {
      catalogId: cdk.Stack.of(this).account,
      databaseName: database_name,
      tableInput: {
        name: 'orders',
        description: '注文トランザクション。注文ID・顧客ID・商品ID・数量・合計金額・注文ステータスを記録する。dt でパーティション分割されている。',
        tableType: 'EXTERNAL_TABLE',
        parameters: {
          'classification': 'csv',
          'skip.header.line.count': '1',
        },
        storageDescriptor: {
          location: `s3://${dataBucket.bucketName}/data/orders/`,
          inputFormat: csvInputFormat,
          outputFormat: csvOutputFormat,
          serdeInfo: csvSerdeInfo,
          columns: [
            { name: 'order_id', type: 'bigint', comment: '注文を一意に識別するID' },
            { name: 'customer_id', type: 'bigint', comment: '注文した顧客のID (customers テーブルの customer_id を参照)' },
            { name: 'product_id', type: 'bigint', comment: '注文された商品のID (products テーブルの product_id を参照)' },
            { name: 'quantity', type: 'bigint', comment: '注文数量' },
            { name: 'total_amount', type: 'bigint', comment: '合計金額 (円)' },
            { name: 'order_status', type: 'string', comment: '注文ステータス (completed: 完了, shipped: 発送済み, pending: 保留中)' },
          ],
        },
        partitionKeys: [
          { name: 'dt', type: 'string', comment: '注文日 (YYYY-MM-DD形式のパーティションキー)' },
        ],
      },
    });
    ordersTable.addDependency(database);

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