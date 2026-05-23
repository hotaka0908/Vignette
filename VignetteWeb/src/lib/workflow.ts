import { Client } from "@upstash/workflow";

let workflowClient: Client | null = null;

export const getWorkflow = () => {
  if (!process.env.QSTASH_TOKEN) {
    throw new Error("QSTASH_TOKEN is not set");
  }

  workflowClient ??= new Client({ token: process.env.QSTASH_TOKEN });

  return workflowClient;
};
