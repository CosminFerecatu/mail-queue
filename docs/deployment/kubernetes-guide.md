# Kubernetes Deployment Guide

This guide covers deploying Mail Queue to Kubernetes using the provided manifests.

## Prerequisites

- Kubernetes cluster 1.25+
- kubectl configured
- Kustomize 4.5+
- PostgreSQL 16 database
- Redis 7 instance
- Container registry access (GHCR, Docker Hub, etc.)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Ingress (nginx)                           │
│                 api.mail-queue.example.com                       │
│              dashboard.mail-queue.example.com                    │
└─────────────────────────────┬───────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     │
┌───────────────┐    ┌───────────────┐             │
│   API (3-20)  │    │  Dashboard    │             │
│   Fastify     │    │  (Next.js)    │             │
│   Port 3000   │    │  Port 3000    │             │
└───────┬───────┘    └───────────────┘             │
        │                                          │
        │  ┌───────────────────────────────────────┘
        │  │
        ▼  ▼
┌───────────────┐    ┌───────────────┐
│ Worker (5-50) │    │  PostgreSQL   │
│   BullMQ      │◄──►│    (RDS)      │
│  Port 9090    │    └───────────────┘
└───────┬───────┘
        │
        ▼
┌───────────────┐
│    Redis      │
│  (Elasticache)│
└───────────────┘
```

## Quick Start

### 1. Configure Secrets

Create a secrets file (do not commit to version control):

```bash
# k8s/overlays/production/secrets.env
DATABASE_URL=postgresql://user:pass@host:5432/mailqueue?sslmode=require
REDIS_URL=redis://:password@host:6379
ADMIN_SECRET=your-admin-secret-min-16-chars
ENCRYPTION_KEY=your-64-char-hex-encryption-key-for-aes256
JWT_SECRET=your-jwt-secret-min-32-chars
```

Apply the secret:

```bash
kubectl create namespace mail-queue
kubectl create secret generic mail-queue-secrets \
  --from-env-file=k8s/overlays/production/secrets.env \
  -n mail-queue
```

### 2. Deploy with Kustomize

**Staging:**
```bash
kubectl apply -k k8s/overlays/staging
```

**Production:**
```bash
kubectl apply -k k8s/overlays/production
```

### 3. Verify Deployment

```bash
# Check pods
kubectl get pods -n mail-queue

# Check services
kubectl get svc -n mail-queue

# Check HPA
kubectl get hpa -n mail-queue

# View logs
kubectl logs -l app.kubernetes.io/component=api -n mail-queue
```

## Configuration

### Environment-Specific Settings

| Setting | Staging | Production |
|---------|---------|------------|
| API Replicas | 2 | 5 |
| Worker Replicas | 2 | 10 |
| Dashboard Replicas | 1 | 3 |
| API CPU Request | 50m | 250m |
| Worker CPU Request | 100m | 500m |
| Worker Concurrency | 5 | 25 |
| Rate Limit | 1,000 | 50,000 |

### Updating Image Tags

```bash
# Update to specific version
cd k8s/overlays/production
kustomize edit set image \
  ghcr.io/your-org/mail-queue-api:v1.2.0 \
  ghcr.io/your-org/mail-queue-worker:v1.2.0 \
  ghcr.io/your-org/mail-queue-dashboard:v1.2.0
```

### Resource Scaling

**Manual Scaling:**
```bash
kubectl scale deployment mail-queue-worker --replicas=20 -n mail-queue
```

**HPA Tuning:**
```yaml
# Edit HPA directly
kubectl edit hpa mail-queue-worker -n mail-queue
```

## Ingress Configuration

### TLS Certificate Setup

Using cert-manager:

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.14.0/cert-manager.yaml

# Create ClusterIssuer
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@your-domain.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

### Custom Domain

Edit `k8s/overlays/production/kustomization.yaml`:

```yaml
patches:
  - target:
      kind: Ingress
      name: mail-queue-ingress
    patch: |
      - op: replace
        path: /spec/rules/0/host
        value: api.your-domain.com
      - op: replace
        path: /spec/rules/1/host
        value: dashboard.your-domain.com
```

## Monitoring

### Prometheus Metrics

The API and Worker expose Prometheus metrics:

- API: `http://mail-queue-api:80/metrics`
- Worker: `http://mail-queue-worker:9090/metrics`

**ServiceMonitor (if using Prometheus Operator):**

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: mail-queue
  namespace: mail-queue
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: mail-queue
  endpoints:
    - port: http
      path: /metrics
      interval: 30s
```

### Health Checks

- **Liveness**: `/v1/health` - Is the process running?
- **Readiness**: `/v1/health/detailed` - Can it handle traffic?

## Troubleshooting

### Pod Not Starting

```bash
# Check events
kubectl describe pod <pod-name> -n mail-queue

# Check logs
kubectl logs <pod-name> -n mail-queue --previous
```

### Database Connection Issues

```bash
# Test from a pod
kubectl exec -it <api-pod> -n mail-queue -- \
  node -e "require('pg').Pool({connectionString: process.env.DATABASE_URL}).query('SELECT 1')"
```

### Redis Connection Issues

```bash
# Test from a pod
kubectl exec -it <worker-pod> -n mail-queue -- \
  node -e "require('ioredis')().ping().then(console.log)"
```

### HPA Not Scaling

```bash
# Check metrics server
kubectl get --raw /apis/metrics.k8s.io/v1beta1/namespaces/mail-queue/pods

# Check HPA status
kubectl describe hpa mail-queue-api -n mail-queue
```

## Rollback

```bash
# View rollout history
kubectl rollout history deployment/mail-queue-api -n mail-queue

# Rollback to previous
kubectl rollout undo deployment/mail-queue-api -n mail-queue

# Rollback to specific revision
kubectl rollout undo deployment/mail-queue-api --to-revision=2 -n mail-queue
```

## Backup and Restore

See [Backup and Restore Guide](../operations/backup-restore.md) for database backup procedures.

## Security Checklist

- [ ] Secrets stored in external secret manager
- [ ] Network policies enabled
- [ ] Pod security standards applied
- [ ] TLS enabled for all external traffic
- [ ] RBAC configured for service accounts
- [ ] Image scanning enabled in CI/CD
- [ ] Resource limits set on all containers
