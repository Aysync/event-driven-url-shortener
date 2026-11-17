output "api_url" {
  description = "Base URL for the HTTP API"
  value       = aws_apigatewayv2_api.http.api_endpoint
}

output "table_name" {
  description = "DynamoDB table name"
  value       = aws_dynamodb_table.links.name
}

output "click_queue_url" {
  description = "SQS queue the redirect fires into"
  value       = aws_sqs_queue.click_queue.id
}

output "dlq_url" {
  description = "Dead letter queue"
  value       = aws_sqs_queue.click_dlq.id
}

output "create_function" {
  value = aws_lambda_function.create.function_name
}

output "redirect_function" {
  value = aws_lambda_function.redirect.function_name
}

output "worker_function" {
  value = aws_lambda_function.worker.function_name
}

output "artifacts_bucket" {
  value = aws_s3_bucket.lambda_artifacts.bucket
}
