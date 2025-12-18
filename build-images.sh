#!/bin/bash

echo "🐳 Building Docker images for MSA services..."

# tiketi-common 먼저 준비
echo "📦 Preparing tiketi-common..."
cd tiketi-common
npm install --production
cd ..

# 각 서비스 빌드
services=("auth-service" "ticket-service" "payment-service" "stats-service")

for service in "${services[@]}"; do
  echo ""
  echo "🔨 Building tiketi-$service..."
  
  docker build \
    -t tiketi-$service:latest \
    -f tiketi-services/$service/Dockerfile \
    .
  
  if [ $? -eq 0 ]; then
    echo "✅ tiketi-$service built successfully"
  else
    echo "❌ Failed to build tiketi-$service"
    exit 1
  fi
done

echo ""
echo "✅ All images built successfully!"
echo ""
echo "📋 Built images:"
docker images | grep tiketi-
