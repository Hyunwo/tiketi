FROM node:18-alpine

RUN apk add --no-cache python3 make g++ wget

WORKDIR /app

# 프로젝트 전체 복사
COPY . .

# tiketi-common 설치
WORKDIR /app/tiketi-common
RUN rm -rf node_modules package-lock.json && npm install

# 서비스 설치
WORKDIR /app/tiketi-services/payment-service
RUN rm -rf node_modules package-lock.json && npm install

EXPOSE 3003

CMD ["node", "src/server.js"]
