import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sqs = new SQSClient({});
const TABLE = process.env.TABLE_NAME ?? "links";
const QUEUE_URL = process.env.CLICK_QUEUE_URL ?? "";

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  const code = event.pathParameters?.code;
  if (!code) return { statusCode: 400, body: "code required" };

  const res = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { pk: `LINK#${code}`, sk: "META" } })
  );
  if (!res.Item) return { statusCode: 404, body: "not found" };

  if (QUEUE_URL) {
    try {
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: QUEUE_URL,
          MessageBody: JSON.stringify({ code, at: new Date().toISOString() }),
        })
      );
    } catch {
      // swallow — redirect must not fail on a counter write
    }
  }

  return {
    statusCode: 302,
    headers: { location: res.Item.url },
  };
};
