variable "aws_region" {
  description = "AWS region for Lambda/API Gateway resources."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project prefix used in resource naming."
  type        = string
  default     = "f-or-g"
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "prod"
}

variable "lambda_function_name" {
  description = "Lambda function name."
  type        = string
  default     = "f-or-g-backend"
}

variable "route53_zone_name" {
  description = "Route53 hosted zone name (example: example.com)."
  type        = string
  default     = "aionyourside.net"
}

variable "api_domain_name" {
  description = "Full API domain to create (example: api.example.com)."
  type        = string
  default     = "forg.aionyourside.net"
}

variable "mta_feed_urls" {
  description = "Comma-separated GTFS-RT feed URLs."
  type        = string
  default     = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm,https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g"
}

variable "mta_api_key" {
  description = "Optional MTA API key."
  type        = string
  default     = ""
  sensitive   = true
}

variable "mta_boarding_stop_ids_f" {
  description = "Comma-separated F boarding stop IDs."
  type        = string
  default     = "A41S"
}

variable "mta_boarding_stop_ids_g" {
  description = "Comma-separated G boarding stop IDs."
  type        = string
  default     = "A42S"
}

variable "mta_destination_stop_id" {
  description = "Destination stop ID."
  type        = string
  default     = "F21S"
}

variable "max_feed_age_seconds" {
  description = "Max feed age before low confidence."
  type        = number
  default     = 60
}

variable "tie_window_seconds" {
  description = "Tie window in seconds where F wins tie-break."
  type        = number
  default     = 60
}

variable "feed_cache_seconds" {
  description = "Feed cache lifetime in seconds."
  type        = number
  default     = 20
}

variable "tags" {
  description = "Optional extra tags."
  type        = map(string)
  default     = {}
}
