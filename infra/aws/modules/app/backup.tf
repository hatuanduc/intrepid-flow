# Daily EBS snapshots of the app instance's root volume — this is where Postgres's
# data actually lives (docker-compose's postgres_data named volume has no separate
# EBS volume of its own). Without this, an instance replacement (see the ignore_changes
# note on aws_instance.app in ec2.tf) destroys the only copy of the database with
# nothing to restore from — exactly what happened to dev on 2026-09-03.
#
# resource_types = ["INSTANCE"] snapshots every volume attached to a matching instance
# (just the root volume here, but keeps working if a data volume is ever added) and
# works whether the instance is running or stopped, so it's unaffected by the EC2
# start/stop schedule in scheduler.tf.

resource "aws_iam_role" "dlm_lifecycle" {
  name = "${local.name_prefix}-dlm-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "dlm.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "dlm_lifecycle" {
  role       = aws_iam_role.dlm_lifecycle.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSDataLifecycleManagerServiceRole"
}

resource "aws_dlm_lifecycle_policy" "app_instance_backup" {
  description        = "${local.name_prefix} daily instance volume snapshot retain 3"
  execution_role_arn = aws_iam_role.dlm_lifecycle.arn
  state              = "ENABLED"

  policy_details {
    resource_types = ["INSTANCE"]

    target_tags = {
      Name = local.name_prefix
    }

    schedule {
      name = "daily-3-retained"

      create_rule {
        interval      = 24
        interval_unit = "HOURS"
        times         = ["04:00"] # UTC — after dev's morning run window (02:00-03:00 UTC)
      }

      retain_rule {
        count = 3
      }

      variable_tags = {
        InstanceId = "$(instance-id)"
      }

      copy_tags = true
    }
  }
}
