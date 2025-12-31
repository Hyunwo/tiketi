# EKS 배포 가이드 (Local Kind → AWS EKS)

## 🎯 목표
로컬 Kind 클러스터에서 작동하는 Tiketi MSA를 AWS EKS에 배포

---

## 📋 사전 준비

### 1. 필요한 도구 설치
```bash
# Terraform
brew install terraform

# AWS CLI
brew install awscli

# kubectl (이미 설치됨)
```

### 2. AWS 자격 증명 설정
```bash
aws configure
# AWS Access Key ID: [입력]
# AWS Secret Access Key: [입력]
# Default region: ap-northeast-2
# Default output format: json

# 확인
aws sts get-caller-identity
```

---

## Step 1: Terraform 인프라 구축 (15분)

### 1-1. Terraform 코드 확인
```bash
cd ~/tiketi/terraform

# 디렉토리 구조
tree -L 2
```

**구조:**
```
terraform/
├── main.tf          # VPC, EKS, ECR 모듈 호출
├── provider.tf      # AWS Provider 설정
├── variables.tf     # 변수 정의
├── outputs.tf       # 출력값
└── modules/
    ├── vpc/         # VPC, Subnet, NAT Gateway
    ├── eks/         # EKS Cluster, Spot Node Group
    └── ecr/         # Docker 이미지 저장소
```

### 1-2. 인프라 생성
```bash
cd ~/tiketi/terraform

# 초기화
terraform init

# 실행 계획 확인
terraform plan

# 생성 (약 15분 소요)
terraform apply
# yes 입력
```

**생성되는 리소스:**
- VPC + Public/Private Subnet (2 AZ)
- NAT Gateway (1개)
- EKS Cluster (Kubernetes 1.31)
- Spot Instance Node Group (t3.medium x2)
- ECR Repositories (5개)

### 1-3. kubectl 연결
```bash
# EKS 클러스터 접근 설정
aws eks update-kubeconfig --region ap-northeast-2 --name tiketi-cluster

# 노드 확인
kubectl get nodes
```

**예상 출력:**
```
NAME                          STATUS   ROLES    AGE   VERSION
ip-10-0-10-xxx...             Ready    <none>   5m    v1.31.x
ip-10-0-11-xxx...             Ready    <none>   5m    v1.31.x
```

---

## Step 2: Docker 이미지 빌드 & ECR 푸시 (10분)

### 2-1. ECR 로그인
```bash
cd ~/tiketi

# ECR 정보 가져오기
ECR_REGISTRY=$(cd terraform && terraform output -json ecr_repositories | jq -r '."auth-service"' | cut -d'/' -f1)

# ECR 로그인
aws ecr get-login-password --region ap-northeast-2 | \
  docker login --username AWS --password-stdin ${ECR_REGISTRY}
```

### 2-2. AMD64 플랫폼으로 빌드 & 푸시
```bash
ECR_REGISTRY="<YOUR_AWS_ACCOUNT_ID>.dkr.ecr.ap-northeast-2.amazonaws.com"

# 서비스 빌드 & 푸시
for service in auth-service ticket-service payment-service stats-service; do
  echo "📦 ${service}"
  
  docker buildx build \
    --platform linux/amd64 \
    -f services/${service}/Dockerfile \
    -t ${ECR_REGISTRY}/tiketi-${service}:v1.0.0 \
    --push \
    .
done

# Frontend
docker buildx build \
  --platform linux/amd64 \
  -f frontend/Dockerfile \
  -t ${ECR_REGISTRY}/tiketi-frontend:v1.0.0 \
  --push \
  ./frontend
```

**⚠️ 중요:** Mac에서는 `--platform linux/amd64` 필수!

---

## Step 3: K8s YAML 수정 (5분)

### 3-1. 이미지 경로 수정
```bash
cd ~/tiketi

ECR_REGISTRY="<YOUR_AWS_ACCOUNT_ID>.dkr.ecr.ap-northeast-2.amazonaws.com"

# 모든 서비스 이미지 경로 변경
for file in k8s/06-auth-service.yaml k8s/07-ticket-service.yaml k8s/08-payment-service.yaml k8s/09-stats-service.yaml k8s/10-frontend.yaml; do
  sed -i '' "s|image: tiketi-.*:.*|image: ${ECR_REGISTRY}/tiketi-XXX:v1.0.0|g" $file
done
```

### 3-2. StorageClass 수정
```bash
# PVC의 storageClassName을 gp2로 변경
sed -i '' 's/storageClassName: standard/storageClassName: gp2/g' k8s/03-pvc.yaml
```

---

## Step 4: EBS CSI Driver 설치 (5분)

### 4-1. OIDC Provider 생성
```bash
eksctl utils associate-iam-oidc-provider \
  --region ap-northeast-2 \
  --cluster tiketi-cluster \
  --approve
```

### 4-2. IAM 역할 생성
```bash
eksctl create iamserviceaccount \
  --name ebs-csi-controller-sa \
  --namespace kube-system \
  --cluster tiketi-cluster \
  --region ap-northeast-2 \
  --attach-policy-arn arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy \
  --approve \
  --role-name AmazonEKS_EBS_CSI_DriverRole
```

### 4-3. EBS CSI Driver 설치
```bash
# 수동 설치 (애드온 실패 시)
kubectl apply -k "github.com/kubernetes-sigs/aws-ebs-csi-driver/deploy/kubernetes/overlays/stable/?ref=release-1.37"

# 확인
kubectl get pods -n kube-system | grep ebs-csi
```

---

## Step 5: 애플리케이션 배포 (10분)

### 5-1. Namespace & 기본 리소스
```bash
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/01-configmap.yaml
kubectl apply -f k8s/02-secret.yaml
kubectl apply -f k8s/03-pvc.yaml
```

### 5-2. Database
```bash
kubectl apply -f k8s/04-postgres.yaml
kubectl apply -f k8s/05-dragonfly.yaml

# DB 준비 대기
sleep 30

# DB 초기화
POSTGRES_POD=$(kubectl get pod -n tiketi -l app=postgres -o jsonpath='{.items[0].metadata.name}')
kubectl cp database/init.sql tiketi/${POSTGRES_POD}:/tmp/init.sql
kubectl exec -n tiketi ${POSTGRES_POD} -- psql -U tiketi_user -d tiketi -f /tmp/init.sql
```

### 5-3. 마이크로서비스
```bash
kubectl apply -f k8s/06-auth-service.yaml
kubectl apply -f k8s/07-ticket-service.yaml
kubectl apply -f k8s/08-payment-service.yaml
kubectl apply -f k8s/09-stats-service.yaml
kubectl apply -f k8s/10-frontend.yaml

# Pod 시작 대기
sleep 60

kubectl get pods -n tiketi
```

**모든 Pod가 Running이어야 합니다.**

---

## Step 6: Ingress 설정 (5분)

### 6-1. Ingress NGINX Controller 설치
```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.11.3/deploy/static/provider/aws/deploy.yaml

# 설치 대기
sleep 60

kubectl get pods -n ingress-nginx
```

### 6-2. Ingress 리소스 배포
```bash
kubectl apply -f k8s/14-ingress.yaml

# LoadBalancer 주소 확인
kubectl get svc -n ingress-nginx ingress-nginx-controller
```

**External URL 복사:**
```
aec40e3...elb.ap-northeast-2.amazonaws.com
```

---

## Step 7: 접속 테스트
```bash
INGRESS_URL="<YOUR_ELB_URL>"

# API 테스트
curl http://${INGRESS_URL}/api/v1/events

# 브라우저 접속
echo "http://${INGRESS_URL}"
```

---

## 💰 비용 관리

### 현재 비용 (월)
```
EKS Cluster:      $73
Spot Nodes x2:    $36
NAT Gateway:      $33
EBS Volumes:      $4
──────────────────────
총 예상:          ~$146/월
```

### 사용 안 할 때: 노드 스케일 다운
```bash
# 정지
aws eks update-nodegroup-config \
  --cluster-name tiketi-cluster \
  --nodegroup-name tiketi-cluster-spot-node-group \
  --scaling-config minSize=0,maxSize=4,desiredSize=0 \
  --region ap-northeast-2

# 재시작
aws eks update-nodegroup-config \
  --cluster-name tiketi-cluster \
  --nodegroup-name tiketi-cluster-spot-node-group \
  --scaling-config minSize=1,maxSize=4,desiredSize=2 \
  --region ap-northeast-2
```

### 완전 삭제
```bash
cd ~/tiketi/terraform
terraform destroy
# yes 입력
```

---

## 🔧 주요 트러블슈팅

### 1. ImagePullBackOff
**원인:** ARM64로 빌드 (Mac M1/M2/M3)  
**해결:** `--platform linux/amd64` 플래그 사용

### 2. PVC Pending
**원인:** EBS CSI Driver 미설치  
**해결:** Step 4 실행

### 3. CORS 에러
**원인:** Frontend가 localhost로 API 호출  
**해결:** Frontend 재빌드 (환경변수 제거)

### 4. DB 테이블 없음
**원인:** init.sql 미실행  
**해결:** Step 5-2 DB 초기화 실행

---

## 📊 검증 체크리스트

- [ ] `kubectl get nodes` - 2개 Ready
- [ ] `kubectl get pods -n tiketi` - 모두 Running
- [ ] `curl http://<ELB>/api/v1/events` - JSON 응답
- [ ] 브라우저 접속 - Frontend 표시
- [ ] 로그인 테스트 - admin@tiketi.gg / admin123
- [ ] 이벤트 목록 조회 - 데이터 표시

---

## 🚀 다음 단계

1. **도메인 연결:** Route53 + ACM 인증서
2. **모니터링:** Prometheus + Grafana 설치
3. **CI/CD:** GitHub Actions + ArgoCD
4. **Auto Scaling:** HPA 설정
5. **보안:** Network Policy, Secret 암호화

---

## 📝 참고 자료

- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [EKS User Guide](https://docs.aws.amazon.com/eks/latest/userguide/)
- [EBS CSI Driver](https://github.com/kubernetes-sigs/aws-ebs-csi-driver)
- [Ingress NGINX](https://kubernetes.github.io/ingress-nginx/)
