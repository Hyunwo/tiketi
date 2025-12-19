FROM node:18-alpine AS builder

WORKDIR /app

# 의존성 설치
COPY package*.json ./
RUN npm install

# 소스 및 환경변수 복사
COPY . .

# 환경변수 설정
ENV REACT_APP_API_URL=http://localhost:8080

# 빌드
RUN npm run build

# Production
FROM node:18-alpine

WORKDIR /app

# serve 설치
RUN npm install -g serve

# 빌드된 파일 복사
COPY --from=builder /app/build ./build

EXPOSE 3000

CMD ["serve", "-s", "build", "-l", "3000"]
