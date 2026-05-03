#!/bin/bash
set -e

# Update system
apt update -y

# Install Docker + Git + Compose
apt install -y docker.io docker-compose git

# Start Docker
systemctl start docker
systemctl enable docker

# Give ubuntu user docker access
usermod -aG docker ubuntu

# Go to home directory
cd /home/ubuntu

# Clone your repo
git clone https://github.com/AxonFluxOfficial/axonflux-private.git

cd axonflux-private

# Create .env file
cat <<EOF > .env
POSTGRES_PASSWORD=password
EOF

# Run containers
docker-compose up -d