# CloudWatch alarms for ECS and RDS health (issue #1416).
# Every alarm publishes to the ops_alerts SNS topic, which AWS Chatbot
# forwards to the on-call Slack channel.

locals {
  alarm_actions = [aws_sns_topic.ops_alerts.arn]
  enable_slack  = var.slack_team_id != "" && var.slack_oncall_channel_id != ""
  enable_5xx    = var.alb_arn_suffix != ""
}

# ---------------------------------------------------------------------------
# SNS topic for operational alerts
# ---------------------------------------------------------------------------

resource "aws_sns_topic" "ops_alerts" {
  name = "stellarkraal-ops-alerts-${var.environment}"

  tags = {
    Environment = var.environment
  }
}

data "aws_iam_policy_document" "ops_alerts_policy" {
  statement {
    sid     = "AllowCloudWatchAlarms"
    effect  = "Allow"
    actions = ["SNS:Publish"]

    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }

    resources = [aws_sns_topic.ops_alerts.arn]
  }
}

resource "aws_sns_topic_policy" "ops_alerts" {
  arn    = aws_sns_topic.ops_alerts.arn
  policy = data.aws_iam_policy_document.ops_alerts_policy.json
}

# ---------------------------------------------------------------------------
# ECS service alarms
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "ecs_cpu_high" {
  alarm_name          = "stellarkraal-ecs-cpu-high-${var.environment}"
  alarm_description   = "ECS service CPU utilization above ${var.ecs_cpu_threshold}% for 10 minutes"
  namespace           = "AWS/ECS"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = var.ecs_cpu_threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "missing"

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.main.name
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = {
    Environment = var.environment
  }
}

resource "aws_cloudwatch_metric_alarm" "ecs_memory_high" {
  alarm_name          = "stellarkraal-ecs-memory-high-${var.environment}"
  alarm_description   = "ECS service memory utilization above ${var.ecs_memory_threshold}% for 10 minutes"
  namespace           = "AWS/ECS"
  metric_name         = "MemoryUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = var.ecs_memory_threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "missing"

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.main.name
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = {
    Environment = var.environment
  }
}

# ---------------------------------------------------------------------------
# RDS alarms
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "rds_free_storage_low" {
  alarm_name          = "stellarkraal-rds-free-storage-low-${var.environment}"
  alarm_description   = "RDS free storage below ${var.rds_free_storage_threshold_gb} GB"
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 1
  threshold           = var.rds_free_storage_threshold_gb * 1024 * 1024 * 1024
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.identifier
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = {
    Environment = var.environment
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_connections_high" {
  alarm_name          = "stellarkraal-rds-connections-high-${var.environment}"
  alarm_description   = "RDS database connections above ${var.rds_max_connections_threshold}"
  namespace           = "AWS/RDS"
  metric_name         = "DatabaseConnections"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = var.rds_max_connections_threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "missing"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.identifier
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = {
    Environment = var.environment
  }
}

# ---------------------------------------------------------------------------
# Backend 5xx error rate (ALB target responses)
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "backend_5xx_rate_high" {
  count = local.enable_5xx ? 1 : 0

  alarm_name          = "stellarkraal-backend-5xx-rate-high-${var.environment}"
  alarm_description   = "Backend 5xx error rate above ${var.backend_5xx_rate_threshold}% of requests"
  evaluation_periods  = 2
  threshold           = var.backend_5xx_rate_threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  metric_query {
    id          = "error_rate"
    expression  = "IF(requests > 0, 100 * errors / requests, 0)"
    label       = "5xx error rate (%)"
    return_data = true
  }

  metric_query {
    id = "errors"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "HTTPCode_Target_5XX_Count"
      stat        = "Sum"
      period      = 300
      dimensions = {
        LoadBalancer = var.alb_arn_suffix
      }
    }
  }

  metric_query {
    id = "requests"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "RequestCount"
      stat        = "Sum"
      period      = 300
      dimensions = {
        LoadBalancer = var.alb_arn_suffix
      }
    }
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = {
    Environment = var.environment
  }
}

# ---------------------------------------------------------------------------
# Slack delivery via AWS Chatbot
# ---------------------------------------------------------------------------

resource "aws_iam_role" "chatbot" {
  count = local.enable_slack ? 1 : 0
  name  = "stellarkraal-chatbot-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action    = "sts:AssumeRole"
        Effect    = "Allow"
        Principal = { Service = "chatbot.amazonaws.com" }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "chatbot_readonly" {
  count      = local.enable_slack ? 1 : 0
  role       = aws_iam_role.chatbot[0].name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchReadOnlyAccess"
}

resource "aws_chatbot_slack_channel_configuration" "oncall" {
  count = local.enable_slack ? 1 : 0

  configuration_name = "stellarkraal-oncall-${var.environment}"
  iam_role_arn       = aws_iam_role.chatbot[0].arn
  slack_team_id      = var.slack_team_id
  slack_channel_id   = var.slack_oncall_channel_id
  sns_topic_arns     = [aws_sns_topic.ops_alerts.arn]
  logging_level      = "ERROR"

  tags = {
    Environment = var.environment
  }
}
