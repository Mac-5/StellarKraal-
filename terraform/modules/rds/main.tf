# RDS PostgreSQL module
#
# Provisions a PostgreSQL instance with automated backups, a defined
# retention window, explicit backup/maintenance windows, Multi-AZ for
# production, and a Terraform-managed parameter group.

terraform {
  required_version = ">= 1.3.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 4.0"
    }
  }
}

locals {
  is_production = var.environment == "production"

  # Production keeps at least 7 days of automated backups; non-prod uses a
  # shorter window but never below the 7-day production floor when overridden.
  backup_retention_period = local.is_production ? max(var.backup_retention_period, 7) : var.backup_retention_period
}

# Parameter group managed by Terraform so instance tuning is versioned and
# documented alongside the database itself.
resource "aws_db_parameter_group" "postgres" {
  name        = "${var.name}-${var.environment}-pg"
  family      = var.parameter_group_family
  description = "Parameter group for ${var.name} (${var.environment}) PostgreSQL instance"

  dynamic "parameter" {
    for_each = var.parameters

    content {
      name  = parameter.value.name
      value = parameter.value.value
    }
  }

  tags = merge(var.tags, {
    Name        = "${var.name}-${var.environment}-pg"
    Environment = var.environment
  })
}

resource "aws_db_instance" "postgres" {
  identifier = "${var.name}-${var.environment}"

  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type          = var.storage_type
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.username
  password = var.password
  port     = var.port

  parameter_group_name = aws_db_parameter_group.postgres.name

  # Automated backups and retention policy.
  backup_retention_period = local.backup_retention_period
  backup_window           = var.preferred_backup_window
  maintenance_window      = var.preferred_maintenance_window

  # Multi-AZ is required for production to survive an AZ failure.
  multi_az = local.is_production ? true : var.multi_az

  vpc_security_group_ids = var.vpc_security_group_ids
  db_subnet_group_name   = var.db_subnet_group_name

  deletion_protection       = local.is_production
  skip_final_snapshot       = local.is_production ? false : true
  final_snapshot_identifier = local.is_production ? "${var.name}-${var.environment}-final" : null

  apply_immediately = var.apply_immediately

  tags = merge(var.tags, {
    Name        = "${var.name}-${var.environment}"
    Environment = var.environment
  })
}
