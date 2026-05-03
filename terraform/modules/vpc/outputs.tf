output "public_subnet_1" {
  value = aws_subnet.public_1.id
}

output "vpc_id" {
  value = aws_vpc.main.id
}