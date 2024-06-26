locals {
  # idea here is to provide each team with its own distinct role
  # to allow them publishing static assets under their team directory, e.g. /s/dcp/
  teams = {
    "newbiz-product-images" = {
      account_id = 786771379108
    }
  }
}

resource "aws_iam_role" "s3_org_access" {
  for_each = var.app_suffix == "" ? local.teams : { /*noop*/ }

  name = "s3-images-access-team-${each.key}-${var.region}"
  path = "/cdn/"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = "sts:AssumeRole",
        Principal = {
          "AWS" : "arn:aws:iam::${each.value["account_id"]}:root"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "s3_org_access" {
  for_each = var.app_suffix == "" ? local.teams : { /*noop*/ }

  role       = aws_iam_role.s3_org_access[each.key].name
  policy_arn = aws_iam_policy.s3_org_access[each.key].arn
}

resource "aws_iam_policy" "s3_org_access" {
  for_each = var.app_suffix == "" ? local.teams : { /*noop*/ }

  path = "/cdn/"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action   = ["s3:*Object"] # FIXME (MaNa, buzz-end): can we restrict this to concrete actions?  https://aquasecurity.github.io/tfsec/v1.28.1/checks/aws/iam/no-policy-wildcards/
        Effect   = "Allow"
        Resource = "${aws_s3_bucket.images[0].arn}/${each.key}/*"
        Sid : "ImageWriteAssetsAccessTeam${replace(title(each.key), "-", "")}"
      },
      {
        Action   = ["kms:GenerateDataKey", "kms:Decrypt", "kms:Encrypt"]
        Effect   = "Allow"
        Resource = aws_kms_key.images[0].arn
      }
    ]
  })
}