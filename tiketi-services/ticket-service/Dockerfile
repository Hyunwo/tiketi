# Ticket Service Dockerfile
FROM node:18-alpine

# 작업 디렉토리 설정
WORKDIR /app

# 공통 라이브러리 복사 (먼저)
COPY ../../tiketi-common /tiketi-common
WORKDIR /tiketi-common
RUN npm install

# 서비스 디렉토리로 이동
WORKDIR /app

# package.json 복사 및 의존성 설치
COPY package*.json ./
RUN npm install --production

# 소스 코드 복사
COPY . .

# 업로드 디렉토리 생성
RUN mkdir -p uploads

# 포트 노출
EXPOSE 3002

# 헬스체크
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3002/health || exit 1

# 실행
CMD ["node", "src/server.js"]
