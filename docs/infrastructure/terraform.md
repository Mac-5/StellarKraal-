# Terraform Infrastructure Provisioning & Management Guide

This document describes how to plan, apply, maintain, and safely tear down the AWS cloud infrastructure for StellarKraal using Terraform.

StellarKraal organizes its infrastructure code into two primary directories:
- **`infrastructure/`**: The primary multi-tier infrastructure workspace containing child modules for networking (VPC/subnets), load balancing (ALB), compute (Auto Scaling Groups), persistent storage (RDS PostgreSQL), caching (ElastiCache Redis), and remote state backend bootstrapping.
- **`terraform/`**: Supplementary infrastructure configurations for AWS Backup plans, KMS backup keys, and CloudWatch metric alert integrations (PagerDuty / Slack).

---

## Prerequisites & Tooling

Before provisioning infrastructure, ensure you have the following tools installed and configured:

1. **Terraform CLI**: Version `>= 1.7.0` (matching `infrastructure/bootstrap/main.tf` and root modules).
   ```bash
   terraform version
   ```
2. **AWS CLI v2**: Configured with credentials that have sufficient IAM administrative permissions.
   ```bash
   aws --version
   aws sts get-caller-identity
   ```
3. **Target AWS Region**: `us-east-1` (default region configured in variables and backend configuration).

---

## Required AWS IAM Permissions

To manage all resources across `infrastructure/` and `terraform/`, the provisioning identity (IAM user, assumed role, or CI/CD runner) requires permissions across the following AWS services:

### 1. Remote State Management & KMS
- **Amazon S3**:
  - `s3:CreateBucket`, `s3:DeleteBucket`, `s3:ListBucket`, `s3:GetBucketLocation`
  - `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`
  - `s3:PutBucketVersioning`, `s3:GetBucketVersioning`
  - `s3:PutEncryptionConfiguration`, `s3:GetEncryptionConfiguration`
  - `s3:PutBucketPolicy`, `s3:GetBucketPolicy`
  - `s3:PutBucketPublicAccessBlock`, `s3:GetBucketPublicAccessBlock`
- **Amazon DynamoDB**:
  - `dynamodb:CreateTable`, `dynamodb:DeleteTable`, `dynamodb:DescribeTable`
  - `dynamodb:GetItem`, `dynamodb:PutItem`, `dynamodb:DeleteItem`, `dynamodb:UpdateItem`
  - `dynamodb:UpdateContinuousBackups`, `dynamodb:DescribeContinuousBackups`
- **AWS Key Management Service (KMS)**:
  - `kms:CreateKey`, `kms:DescribeKey`, `kms:EnableKeyRotation`, `kms:PutKeyPolicy`
  - `kms:CreateAlias`, `kms:DeleteAlias`, `kms:UpdateAlias`
  - `kms:Encrypt`, `kms:Decrypt`, `kms:GenerateDataKey`, `kms:GenerateDataKeyWithoutPlaintext`
  - `kms:ReEncryptFrom`, `kms:ReEncryptTo`

### 2. Networking & Load Balancing
- **Amazon VPC & EC2 Networking**:
  - `ec2:CreateVpc`, `ec2:DeleteVpc`, `ec2:ModifyVpcAttribute`, `ec2:DescribeVpcs`
  - `ec2:CreateSubnet`, `ec2:DeleteSubnet`, `ec2:ModifySubnetAttribute`, `ec2:DescribeSubnets`
  - `ec2:CreateInternetGateway`, `ec2:AttachInternetGateway`, `ec2:DetachInternetGateway`, `ec2:DeleteInternetGateway`
  - `ec2:CreateNatGateway`, `ec2:DeleteNatGateway`, `ec2:DescribeNatGateways`
  - `ec2:AllocateAddress`, `ec2:ReleaseAddress`, `ec2:DescribeAddresses`
  - `ec2:CreateRouteTable`, `ec2:DeleteRouteTable`, `ec2:CreateRoute`, `ec2:AssociateRouteTable`, `ec2:DescribeRouteTables`
  - `ec2:CreateSecurityGroup`, `ec2:DeleteSecurityGroup`, `ec2:AuthorizeSecurityGroupIngress`, `ec2:AuthorizeSecurityGroupEgress`, `ec2:RevokeSecurityGroupIngress`, `ec2:RevokeSecurityGroupEgress`, `ec2:DescribeSecurityGroups`
- **Elastic Load Balancing (ALB)**:
  - `elasticloadbalancing:CreateLoadBalancer`, `elasticloadbalancing:DeleteLoadBalancer`, `elasticloadbalancing:DescribeLoadBalancers`
  - `elasticloadbalancing:CreateTargetGroup`, `elasticloadbalancing:DeleteTargetGroup`, `elasticloadbalancing:ModifyTargetGroup`, `elasticloadbalancing:DescribeTargetGroups`
  - `elasticloadbalancing:CreateListener`, `elasticloadbalancing:DeleteListener`, `elasticloadbalancing:ModifyListener`, `elasticloadbalancing:DescribeListeners`
  - `elasticloadbalancing:AddTags`, `elasticloadbalancing:RemoveTags`

### 3. Compute & Auto Scaling
- **EC2 Compute & Auto Scaling**:
  - `ec2:CreateLaunchTemplate`, `ec2:DeleteLaunchTemplate`, `ec2:CreateLaunchTemplateVersion`, `ec2:DescribeLaunchTemplates`
  - `ec2:RunInstances`, `ec2:TerminateInstances`, `ec2:DescribeInstances`
  - `autoscaling:CreateAutoScalingGroup`, `autoscaling:UpdateAutoScalingGroup`, `autoscaling:DeleteAutoScalingGroup`, `autoscaling:DescribeAutoScalingGroups`
  - `autoscaling:PutScalingPolicy`, `autoscaling:DeletePolicy`, `autoscaling:DescribePolicies`
- **IAM Instance Profiles**:
  - `iam:CreateRole`, `iam:DeleteRole`, `iam:GetRole`, `iam:PassRole`, `iam:AttachRolePolicy`, `iam:DetachRolePolicy`
  - `iam:CreateInstanceProfile`, `iam:DeleteInstanceProfile`, `iam:AddRoleToInstanceProfile`, `iam:RemoveRoleFromInstanceProfile`

### 4. Database, Cache, Monitoring & Backup
- **Amazon RDS (PostgreSQL)**:
  - `rds:CreateDBInstance`, `rds:ModifyDBInstance`, `rds:DeleteDBInstance`, `rds:DescribeDBInstances`
  - `rds:CreateDBSubnetGroup`, `rds:DeleteDBSubnetGroup`, `rds:DescribeDBSubnetGroups`
  - `rds:CreateDBSnapshot`, `rds:DeleteDBSnapshot`, `rds:DescribeDBSnapshots`
  - `rds:AddTagsToResource`, `rds:ListTagsForResource`
- **Amazon ElastiCache (Redis)**:
  - `elasticache:CreateReplicationGroup`, `elasticache:ModifyReplicationGroup`, `elasticache:DeleteReplicationGroup`, `elasticache:DescribeReplicationGroups`
  - `elasticache:CreateCacheSubnetGroup`, `elasticache:DeleteCacheSubnetGroup`, `elasticache:DescribeCacheSubnetGroups`
  - `elasticache:CreateSnapshot`, `elasticache:DeleteSnapshot`, `elasticache:DescribeSnapshots`
- **Amazon CloudWatch & SNS**:
  - `cloudwatch:PutMetricAlarm`, `cloudwatch:DeleteAlarms`, `cloudwatch:DescribeAlarms`
  - `sns:CreateTopic`, `sns:DeleteTopic`, `sns:Subscribe`, `sns:Unsubscribe`, `sns:Publish`
- **AWS Backup**:
  - `backup:CreateBackupVault`, `backup:DeleteBackupVault`, `backup:DescribeBackupVault`
  - `backup:CreateBackupPlan`, `backup:DeleteBackupPlan`, `backup:GetBackupPlan`
  - `backup:CreateBackupSelection`, `backup:DeleteBackupSelection`

---

## Remote State Backend Configuration

Terraform uses an Amazon S3 bucket with server-side KMS encryption and Amazon DynamoDB table for distributed state locking.

### Step 1: One-Time Bootstrap

Before running commands in `infrastructure/`, the state bucket and lock table must be bootstrapped once using local state:

```bash
cd infrastructure/bootstrap
terraform init
terraform apply
```

This provisions:
- **S3 Bucket**: Versioned, private, encrypted with KMS, `prevent_destroy = true`.
- **DynamoDB Table**: `LockID` primary key with point-in-time recovery for state locking.
- **KMS Customer-Managed Key**: Key alias `alias/stellarkraal-tfstate` with policies allowing administration and CI/CD runners.

Note the output values:
```text
state_bucket_name = "stellarkraal-tfstate-prod"
lock_table_name   = "stellarkraal-tfstate-lock"
kms_key_alias     = "alias/stellarkraal-tfstate"
```

### Step 2: Backend Wiring (`infrastructure/backend.tf`)

The remote backend in `infrastructure/backend.tf` references these resources:

```hcl
terraform {
  backend "s3" {
    bucket               = "stellarkraal-tfstate-prod"
    region               = "us-east-1"
    encrypt              = true
    kms_key_id           = "alias/stellarkraal-tfstate"
    dynamodb_table       = "stellarkraal-tfstate-lock"
    key                  = "stellar-kraal/terraform.tfstate"
    workspace_key_prefix = "env"
  }
}
```

Terraform automatically segregates state by workspace under the S3 prefix:
- **Staging**: `s3://stellarkraal-tfstate-prod/env:/staging/stellar-kraal/terraform.tfstate`
- **Production**: `s3://stellarkraal-tfstate-prod/env:/production/stellar-kraal/terraform.tfstate`

---

## Workspace Setup

StellarKraal manages multiple deployment tiers (`staging` and `production`) through Terraform workspaces.

### 1. Initialize Backend

```bash
cd infrastructure
terraform init
```

### 2. Create or Select Workspace

To switch to or create an environment workspace:

```bash
# List available workspaces
terraform workspace list

# Create a new workspace (first-time setup)
terraform workspace new staging
terraform workspace new production

# Switch to an existing workspace
terraform workspace select staging
# or
terraform workspace select production
```

Environment variables and module configurations automatically prefix resource names with `stellarkraal-${terraform.workspace}` (e.g. `stellarkraal-staging-alb`, `stellarkraal-production-db`).

---

## Plan and Apply Workflows

### 1. Staging Workflow

Staging uses `infrastructure/envs/staging.tfvars` (e.g. smaller compute instances, single-AZ RDS):

```bash
cd infrastructure

# 1. Switch to staging workspace
terraform workspace select staging

# 2. Validate configuration
terraform validate

# 3. Generate and inspect execution plan
terraform plan -var-file="envs/staging.tfvars" -out=staging.tfplan

# 4. Apply the planned changes
terraform apply staging.tfplan

# 5. Clean up local plan file
rm -f staging.tfplan
```

### 2. Production Workflow

Production uses `infrastructure/envs/production.tfvars` (Multi-AZ RDS, Multi-AZ Redis, deletion protection enabled, larger ASG capacity):

```bash
cd infrastructure

# 1. Switch to production workspace
terraform workspace select production

# 2. Validate configuration
terraform validate

# 3. Generate and inspect execution plan
terraform plan -var-file="envs/production.tfvars" -out=production.tfplan

# 4. Review plan carefully before applying
terraform apply production.tfplan

# 5. Clean up local plan file
rm -f production.tfplan
```

### 3. Supplementary Alerts & Backup Stack (`terraform/`)

To provision AWS Backup vaults and CloudWatch / PagerDuty alerts:

```bash
cd terraform
terraform init
terraform plan -var="environment=production" -var="db_instance_arn=arn:aws:rds:us-east-1:123456789012:db:stellarkraal-production-db" -var="pagerduty_routing_key=YOUR_KEY" -out=backup.tfplan
terraform apply backup.tfplan
rm -f backup.tfplan
```

#### ECS & RDS health alarms (`terraform/monitoring.tf`)

All alarms publish to the `stellarkraal-ops-alerts-<env>` SNS topic (output `ops_alerts_sns_topic_arn`). AWS Chatbot forwards that topic to the on-call Slack channel.

| Alarm | Metric | Fires when | Variable |
|-------|--------|------------|----------|
| `ecs-cpu-high` | `AWS/ECS CPUUtilization` | > 80% for 2 × 5 min | `ecs_cpu_threshold` |
| `ecs-memory-high` | `AWS/ECS MemoryUtilization` | > 80% for 2 × 5 min | `ecs_memory_threshold` |
| `rds-free-storage-low` | `AWS/RDS FreeStorageSpace` | < 2 GB | `rds_free_storage_threshold_gb` |
| `rds-connections-high` | `AWS/RDS DatabaseConnections` | > 80 for 2 × 5 min | `rds_max_connections_threshold` |
| `backend-5xx-rate-high` | `HTTPCode_Target_5XX_Count / RequestCount` | > 1% for 2 × 5 min | `backend_5xx_rate_threshold` |

Extra inputs:

- `alb_arn_suffix`: ARN suffix of the backend ALB (e.g. `app/stellarkraal-alb/abc123`). The 5xx alarm is only created when this is set.
- `slack_team_id` and `slack_oncall_channel_id`: Slack workspace and on-call channel IDs. Authorize the Slack workspace in the AWS Chatbot console once before applying. Slack delivery is only created when both are set.

```bash
terraform plan \
  -var="alb_arn_suffix=app/stellarkraal-alb/abc123" \
  -var="slack_team_id=T0123456789" \
  -var="slack_oncall_channel_id=C0123456789" \
  ...
```

---

## State Management & Operations

Useful commands for inspecting and maintaining remote state:

```bash
# List all resources in the active workspace state
terraform state list

# Inspect a specific resource's attributes
terraform state show module.database.aws_db_instance.postgres

# Refresh remote state against live AWS infrastructure
terraform apply -refresh-only -var-file="envs/staging.tfvars"

# Force unlock a stale state lock (if a previous run crashed or timed out)
terraform force-unlock <LOCK-ID>
```

---

## Infrastructure Teardown & Destroy Procedure

> [!CAUTION]
> **HIGH RISK ACTION: INFRASTRUCTURE TEARDOWN**
> Running `terraform destroy` will terminate all compute instances, load balancers, caching nodes, and database instances. All services will become unavailable. Follow the pre-destroy data backup step before executing destroy.

### Mandatory Pre-Destroy Data Backup Step

Always create and verify manual snapshots of persistent data stores before destroying any environment:

#### 1. RDS PostgreSQL Database Snapshot

```bash
ENV="staging" # or "production"
DB_INSTANCE_ID="stellarkraal-${ENV}-db"
SNAPSHOT_ID="stellarkraal-${ENV}-db-pre-destroy-$(date +%Y%m%d%H%M%S)"

echo "Creating RDS manual snapshot: ${SNAPSHOT_ID}"
aws rds create-db-snapshot \
  --db-instance-identifier "$DB_INSTANCE_ID" \
  --db-snapshot-identifier "$SNAPSHOT_ID" \
  --tags Key=Environment,Value=${ENV} Key=Purpose,Value=PreDestroyBackup

# Wait until the snapshot is fully completed before proceeding
echo "Waiting for snapshot completion..."
aws rds wait db-snapshot-completed \
  --db-snapshot-identifier "$SNAPSHOT_ID"

echo "✅ Database snapshot created successfully: ${SNAPSHOT_ID}"
```

#### 2. ElastiCache Redis Snapshot

```bash
REDIS_GROUP_ID="stellarkraal-${ENV}-redis"
REDIS_SNAPSHOT_ID="stellarkraal-${ENV}-redis-pre-destroy-$(date +%Y%m%d%H%M%S)"

echo "Creating ElastiCache Redis snapshot: ${REDIS_SNAPSHOT_ID}"
aws elasticache create-snapshot \
  --replication-group-id "$REDIS_GROUP_ID" \
  --snapshot-name "$REDIS_SNAPSHOT_ID"

echo "Waiting for Redis snapshot to become available..."
aws elasticache wait snapshot-available \
  --snapshot-name "$REDIS_SNAPSHOT_ID"

echo "✅ Redis snapshot created successfully: ${REDIS_SNAPSHOT_ID}"
```

#### 3. Disable Deletion Protection

Production configurations set `db_deletion_protection = true`. Terraform will fail to destroy the database unless this flag is disabled:

- In `infrastructure/envs/production.tfvars`, set:
  ```hcl
  db_deletion_protection = false
  ```
- Or modify the RDS instance via AWS CLI:
  ```bash
  aws rds modify-db-instance \
    --db-instance-identifier "stellarkraal-production-db" \
    --no-deletion-protection \
    --apply-immediately
  ```

---

### Executing Destroy

Once all manual snapshots are confirmed and deletion protection is disabled:

```bash
cd infrastructure

# 1. Select the workspace to destroy
terraform workspace select staging   # or production

# 2. Plan the destruction
terraform plan -destroy -var-file="envs/staging.tfvars" -out=destroy.tfplan

# 3. Review all resources slated for deletion and apply
terraform apply destroy.tfplan

# 4. Clean up plan file
rm -f destroy.tfplan
```

### State and Workspace Cleanup

```bash
# Switch back to default workspace
terraform workspace select default

# Delete the emptied workspace
terraform workspace delete staging
```

---

## Troubleshooting & FAQ

- **Error acquiring state lock**:
  If a pipeline was interrupted, run `terraform force-unlock <LockID>`. The `LockID` is printed in the error message.
- **RDS instance deletion blocked**:
  Ensure `deletion_protection = false` is applied prior to running `terraform destroy`.
- **NAT Gateway / VPC dependency errors on destroy**:
  AWS may take up to 2 minutes to release elastic network interfaces (ENIs). If `terraform destroy` fails on subnet deletion, wait 60 seconds and re-run `terraform destroy`.

---

## Related Documentation

- [Production Deployment Guide](../deployment/deployment-guide.md)
- [Staging Deployment Guide](../deployment/staging-deployment.md)
- [Monitoring & Alerting Guide](../guides/alerting.md)
- [Local Development Setup](../development/local-setup.md)
