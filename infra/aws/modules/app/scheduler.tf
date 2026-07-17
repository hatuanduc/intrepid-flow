resource "aws_scheduler_schedule" "start" {
  count = var.start_schedule_enabled ? 1 : 0
  name  = "${local.name_prefix}-start"

  flexible_time_window { mode = "OFF" }

  schedule_expression          = var.start_schedule
  schedule_expression_timezone = "UTC"

  target {
    arn      = "arn:aws:scheduler:::aws-sdk:ec2:startInstances"
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ InstanceIds = [aws_instance.app.id] })
  }
}

resource "aws_scheduler_schedule" "stop" {
  count = var.stop_schedule_enabled ? 1 : 0
  name  = "${local.name_prefix}-stop"

  flexible_time_window { mode = "OFF" }

  schedule_expression          = var.stop_schedule
  schedule_expression_timezone = "UTC"

  target {
    arn      = "arn:aws:scheduler:::aws-sdk:ec2:stopInstances"
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ InstanceIds = [aws_instance.app.id] })
  }
}
