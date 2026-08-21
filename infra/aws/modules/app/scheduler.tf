// One resource per cron expression — a single "start" and "single stop" schedule
// isn't enough once an environment needs multiple run windows in a day (e.g. a
// morning window + an afternoon window), so this fans out over a list instead.
// Keyed by index: each.key is just the list position, not the cron string itself,
// so reordering the list in a tfvars change doesn't rename/recreate schedules.
resource "aws_scheduler_schedule" "start" {
  for_each = var.start_schedule_enabled ? { for idx, expr in var.start_schedules : tostring(idx) => expr } : {}
  name     = "${local.name_prefix}-start-${each.key}"

  flexible_time_window { mode = "OFF" }

  schedule_expression          = each.value
  schedule_expression_timezone = "UTC"

  target {
    arn      = "arn:aws:scheduler:::aws-sdk:ec2:startInstances"
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ InstanceIds = [aws_instance.app.id] })
  }
}

resource "aws_scheduler_schedule" "stop" {
  for_each = var.stop_schedule_enabled ? { for idx, expr in var.stop_schedules : tostring(idx) => expr } : {}
  name     = "${local.name_prefix}-stop-${each.key}"

  flexible_time_window { mode = "OFF" }

  schedule_expression          = each.value
  schedule_expression_timezone = "UTC"

  target {
    arn      = "arn:aws:scheduler:::aws-sdk:ec2:stopInstances"
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ InstanceIds = [aws_instance.app.id] })
  }
}
