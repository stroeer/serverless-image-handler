variable "region" {
  type = string

  validation {
    condition     = var.region == "eu-west-1"
    error_message = "Only Ireland region is currently supported."
  }
}

variable "account_id" {
  type = string
}

variable "app_suffix" {
  description = "Deployment variant"
  type        = string
}