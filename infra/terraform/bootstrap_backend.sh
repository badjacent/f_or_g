#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-355854622119}"
STATE_BUCKET="${STATE_BUCKET:-f-or-g-terraform-state-${AWS_ACCOUNT_ID}}"
LOCK_TABLE="${LOCK_TABLE:-f-or-g-terraform-locks}"

if ! aws s3api head-bucket --bucket "$STATE_BUCKET" 2>/dev/null; then
  aws s3api create-bucket --bucket "$STATE_BUCKET" --region "$AWS_REGION"
fi

aws s3api put-bucket-versioning \
  --bucket "$STATE_BUCKET" \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption \
  --bucket "$STATE_BUCKET" \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

if ! aws dynamodb describe-table --table-name "$LOCK_TABLE" >/dev/null 2>&1; then
  aws dynamodb create-table \
    --table-name "$LOCK_TABLE" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "$AWS_REGION"

  aws dynamodb wait table-exists --table-name "$LOCK_TABLE" --region "$AWS_REGION"
fi

echo "Terraform backend bootstrap complete"
echo "S3 bucket: $STATE_BUCKET"
echo "DynamoDB table: $LOCK_TABLE"
