# ---------------------------------------------------------------------------
# Deployment package — the compiled handlers from ../dist
# ---------------------------------------------------------------------------
data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../dist"
  output_path = "${path.module}/build/lambda.zip"
}

# ---------------------------------------------------------------------------
# create — POST /links. Writes DynamoDB, nothing else.
# ---------------------------------------------------------------------------
resource "aws_iam_role" "create" {
  name = "${var.project_name}-create-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "create" {
  role = aws_iam_role.create.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:GetItem"]
        Resource = aws_dynamodb_table.links.arn
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:${var.aws_region}:*:*"
      }
    ]
  })
}

resource "aws_lambda_function" "create" {
  function_name    = "${var.project_name}-create"
  role             = aws_iam_role.create.arn
  runtime          = var.lambda_runtime
  handler          = "handlers/create.handler"
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  timeout          = var.lambda_timeout
  memory_size      = var.lambda_memory

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.links.name
    }
  }
}

# ---------------------------------------------------------------------------
# redirect — GET /{code}. Reads DynamoDB, sends to SQS. Never waits on SQS.
# ---------------------------------------------------------------------------
resource "aws_iam_role" "redirect" {
  name = "${var.project_name}-redirect-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "redirect" {
  role = aws_iam_role.redirect.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem"]
        Resource = aws_dynamodb_table.links.arn
      },
      {
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = aws_sqs_queue.click_queue.arn
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:${var.aws_region}:*:*"
      }
    ]
  })
}

resource "aws_lambda_function" "redirect" {
  function_name    = "${var.project_name}-redirect"
  role             = aws_iam_role.redirect.arn
  runtime          = var.lambda_runtime
  handler          = "handlers/redirect.handler"
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  timeout          = var.lambda_timeout
  memory_size      = var.lambda_memory

  environment {
    variables = {
      TABLE_NAME      = aws_dynamodb_table.links.name
      CLICK_QUEUE_URL = aws_sqs_queue.click_queue.id
    }
  }
}

# ---------------------------------------------------------------------------
# worker — SQS triggered. Updates DynamoDB. Nothing else.
# ---------------------------------------------------------------------------
resource "aws_iam_role" "worker" {
  name = "${var.project_name}-worker-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "worker" {
  role = aws_iam_role.worker.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:UpdateItem"]
        Resource = aws_dynamodb_table.links.arn
      },
      {
        Effect   = "Allow"
        Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
        Resource = aws_sqs_queue.click_queue.arn
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:${var.aws_region}:*:*"
      }
    ]
  })
}

resource "aws_lambda_function" "worker" {
  function_name    = "${var.project_name}-worker"
  role             = aws_iam_role.worker.arn
  runtime          = var.lambda_runtime
  handler          = "handlers/worker.handler"
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  timeout          = var.lambda_timeout
  memory_size      = var.lambda_memory

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.links.name
    }
  }
}

# Wire the queue to the worker. batch_size 10, and on failure the whole
# batch is retried (worker is idempotent, so that's safe).
resource "aws_lambda_event_source_mapping" "worker_sqs" {
  event_source_arn = aws_sqs_queue.click_queue.arn
  function_name    = aws_lambda_function.worker.arn
  batch_size       = 10
}
