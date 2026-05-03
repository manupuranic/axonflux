provider "aws" {
  region = "ap-south-1"
}

module "vpc" {
  source = "./modules/vpc"
}

module "ec2" {
  source        = "./modules/ec2"
  instance_type = "t3.medium"
  subnet_id     = module.vpc.public_subnet_1
  name          = "staging-server"
  vpc_id        = module.vpc.vpc_id
}