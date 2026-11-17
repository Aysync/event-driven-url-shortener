import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { nanoid } from "nanoid";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { createIdempotent } from "../lib/idempotency.js";
import { CreateLinkRequest } from "../types.js";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  let body: CreateLinkRequest;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid json" }) };
  }

  if (!body.url || !/^https?:\/\//.test(body.url)) {
    return { statusCode: 400, body: JSON.stringify({ error: "url required" }) };
  }
  if (!body.idempotencyKey) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "idempotencyKey required" }),
    };
  }

  const code = nanoid(7);
  const { item, replay } = await createIdempotent(
    ddb,
    code,
    body.url,
    body.idempotencyKey
  );

  const host = event.requestContext.domainName;
  const stage = event.requestContext.stage;
  const stagePrefix = stage === "$default" ? "" : `/${stage}`;
  const baseUrl = `https://${host}${stagePrefix}`;

  return {
    statusCode: replay ? 200 : 201,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      code: item.code,
      shortUrl: `${baseUrl}/${item.code}`,
      idempotentReplay: replay,
    }),
  };
};
