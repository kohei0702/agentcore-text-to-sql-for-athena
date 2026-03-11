#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { AgentcoreTextToSqlStack } from '../lib/agentcore-text-to-sql-stack';

const app = new cdk.App();
new AgentcoreTextToSqlStack(app, 'AgentcoreTextToSqlStack');
