# DLQ first — the main queue references it, so it must exist.
resource "aws_sqs_queue" "click_dlq" {
  name                      = "${var.project_name}-click-dlq"
  message_retention_seconds = 1209600 # 14 days, the max — time to notice and replay
}

resource "aws_sqs_queue" "click_queue" {
  name                       = "${var.project_name}-click-queue"
  visibility_timeout_seconds = 30     # longer than lambda_timeout, or the worker gets duplicate deliveries mid-run
  message_retention_seconds  = 345600 # 4 days

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.click_dlq.arn
    maxReceiveCount     = 3 # after 3 failed attempts, message goes to DLQ
  })
}
