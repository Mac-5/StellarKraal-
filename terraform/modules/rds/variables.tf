variable "identifier" {
  description = "Identifier for the RDS PostgreSQL instance"
  type        = string
}

variable "engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "15.4"
}

variable "instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "allocated_storage" {
  description = "Allocated storage in GB"
  type        = number
  default     = 20
}

variable "db_name" {
  description = "Name of the database to create"
  type        = string
}

variable "username" {
  description = "Master username for the database"
  type        = string
}

variable "password" {
  description = "Master password for the database"
  type        = string
  sensitive   = true
}

variable "vpc_security_group_ids" {
  description = "List of VPC security group IDs to associate"
  type        = list(string)
}

variable "subnet_ids" {
  description = "List of subnet IDs for the DB subnet group"
  type        = list(string)
}

variable "environment" {
  description = "Deployment environment (e.g. production, staging)"
  type        = string
  default     = "production"
}

variable "backup_retention_period" {
  description = "Number of days to retain automated backups (must be at least 7 for production)"
  type        = number
  default     = 7

  validation {
    condition     = var.backup_retention_period >= 7
    error_message = "backup_retention_period must be at least 7 days to protect production data."
  }
}

variable "preferred_backup_window" {
  description = "Daily time range (UTC) during which automated backups are created"
  type        = string
  default     = "03:00-04:00"
}

variable "preferred_maintenance_window" {
  description = "Weekly time range (UTC) during which system maintenance can occur"
  type        = string
  default     = "sun:05:00-sun:06:00"
}

variable "multi_az" {
  description = "Enable Multi-AZ deployment. Defaults to true for production."
  type        = bool
  default     = true
}

variable "parameter_group_family" {
  description = "Family of the RDS parameter group (e.g. postgres15)"
  type        = string
  default     = "postgres15"
}

variable "parameters" {
  description = "List of parameters to apply to the managed RDS parameter group"
  type = list(object({
    name  = string
    value = string
  }))
  default = []
}

variable "tags" {
  description = "Tags to apply to all RDS resources"
  type        = map(string)
  default     = {}
}
