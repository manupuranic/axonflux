resource "aws_instance" "app" {
  ami           = "ami-0f5ee92e2d63afc18" # Amazon Linux 2023
  instance_type = var.instance_type
  subnet_id     = var.subnet_id
  iam_instance_profile = aws_iam_instance_profile.ec2_profile.name
  user_data = file("${path.module}/user_data.sh")
  vpc_security_group_ids = [aws_security_group.ec2_sg.id]
  key_name = "axonflux-devops"
  tags = {
    Name = var.name
  }
}