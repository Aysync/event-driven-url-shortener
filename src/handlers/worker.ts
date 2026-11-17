import { SQSHandler, SQSRecord } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME ?? "links";

async function processRecord(record: SQSRecord): Promise<void> {
  const { code } = JSON.parse(record.body);
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: `LINK#${code}`, sk: "META" },
      UpdateExpression: "ADD clicks :one",
      ExpressionAttributeValues: { ":one": 1 },
    })
  );
}

export const handler: SQSHandler = async (event) => {
  for (const record of event.Records) {
    await processRecord(record);
  }
};
