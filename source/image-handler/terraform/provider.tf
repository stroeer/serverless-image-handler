provider "aws" {
  region = var.region

  default_tags {
    tags = {
      managed_by   = "terraform"
      map-migrated = "d-server-00fvusu7ux3q9a"
      service      = local.function_name
      source       = "https://github.com/stroeer/serverless-image-handler"
      App          = "Images"
    }
  }

}

data "aws_iam_role" "cognito_admin" {
  name = "Cognito-Authenticated-Admin"
}

provider "opensearch" {
  aws_assume_role_arn = data.aws_iam_role.cognito_admin.arn
  aws_region          = var.region
  healthcheck         = false
  url                 = "https://logs.stroeer.engineering"
}
