output "lambda_function_name" {
  description = "Deployed Lambda function name."
  value       = aws_lambda_function.backend.function_name
}

output "api_gateway_invoke_url" {
  description = "Default API Gateway invoke URL."
  value       = aws_apigatewayv2_api.http.api_endpoint
}

output "api_base_url" {
  description = "Custom domain URL to use from mobile app."
  value       = "https://${var.api_domain_name}"
}
