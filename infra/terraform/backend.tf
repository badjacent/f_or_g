terraform {
  backend "s3" {
    bucket         = "f-or-g-terraform-state-355854622119"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "f-or-g-terraform-locks"
    encrypt        = true
  }
}
