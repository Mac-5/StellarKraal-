output "backup_vault_arn" {
  value = aws_backup_vault.db_backup_vault.arn
}

output "backup_kms_key_arn" {
  value = aws_kms_key.backup_key.arn
}

output "backup_storage_bucket" {
  value = aws_s3_bucket.backup_storage.id
}

output "sns_topic_arn" {
  value = aws_sns_topic.backup_notifications.arn
}

output "ops_alerts_sns_topic_arn" {
  description = "SNS topic that receives all CloudWatch health alarms"
  value       = aws_sns_topic.ops_alerts.arn
}
