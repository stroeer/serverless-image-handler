data "aws_iam_policy_document" "lambda" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["arn:aws:s3:::master-images-${var.account_id}-${var.region}/*"]
  }
  statement {
    actions   = ["s3:ListBucket"]
    resources = ["arn:aws:s3:::master-images-${var.account_id}-${var.region}"]
  }
}

resource "aws_iam_policy" "lambda" {
  description = "${local.function_name} Permissions"
  name        = "${module.lambda.function_name}-${var.region}"
  policy      = data.aws_iam_policy_document.lambda.json
}

resource "aws_iam_role_policy_attachment" "lambda" {
  role       = module.lambda.role_name
  policy_arn = aws_iam_policy.lambda.arn
}

module "github-oidc-role" {
  source  = "stroeer/github-oidc-role/aws"
  version = "0.2.0"

  github_repository = "stroeer/serverless-image-handler"
  github_refs       = ["main"]
  s3_prefixes = [
    "ci-${var.account_id}-${var.region}/image-handler"
  ]
}
