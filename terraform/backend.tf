terraform {
  backend "s3" {
    bucket         = "terraform-state-axonflux"
    key            = "devops/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-locks"
  }
}