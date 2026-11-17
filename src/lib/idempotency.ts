import { DynamoDBDocumentClient, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

const TABLE = process.env.TABLE_NAME ?? "links";

export async function createIdempotent(
  ddb: DynamoDBDocumentClient,
  code: string,
  url: string,
  idempotencyKey: string
): Promise<{ item: any; replay: boolean }> {
  const now = new Date().toISOString();
  const idemPk = `IDEMP#${idempotencyKey}`;

  const linkItem = {
    pk: `LINK#${code}`,
    sk: "META",
    code,
    url,
    createdAt: now,
    clicks: 0,
    idempotencyKey,
  };

  // THE LOCK: one conditional write on the idempotency row.
  // Exactly one caller can create IDEMP#<key>. Losers re-read it.
  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          pk: idemPk,
          sk: "META",
          code,
          url,
          createdAt: now,
        },
        ConditionExpression: "attribute_not_exists(pk)",
      })
    );
  } catch (err: any) {
    if (err.name === "ConditionalCheckFailedException") {
      const raced = await ddb.send(
        new GetCommand({
          TableName: TABLE,
          Key: { pk: idemPk, sk: "META" },
        })
      );
      return { item: raced.Item, replay: true };
    }
    throw err;
  }

  // We won the idempotency lock. Now write the actual link.
  // PutCommand is idempotent here: if we crash between these two and retry,
  // the lock re-read returns the link and the second Put is harmless.
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: linkItem,
    })
  );

  return { item: linkItem, replay: false };
}
