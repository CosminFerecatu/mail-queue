# Troubleshooting Guide

Common issues and solutions for Mail Queue deployments.

## Quick Diagnostics

```bash
# Check all pods status
kubectl get pods -n mail-queue -o wide

# Check recent events
kubectl get events -n mail-queue --sort-by='.lastTimestamp' | tail -20

# Check resource usage
kubectl top pods -n mail-queue
```

## Common Issues

### 1. Pods Stuck in Pending

**Symptoms**: Pods remain in `Pending` state

**Causes & Solutions**:

| Cause | Solution |
|-------|----------|
| Insufficient resources | Increase node count or reduce resource requests |
| Node selector mismatch | Check node labels match pod affinity rules |
| PVC not bound | Verify storage class and PVC configuration |

```bash
# Diagnose
kubectl describe pod <pod-name> -n mail-queue

# Check node resources
kubectl describe nodes | grep -A 5 "Allocated resources"
```

### 2. CrashLoopBackOff

**Symptoms**: Pods repeatedly crash and restart

**Common Causes**:

1. **Missing environment variables**
   ```bash
   kubectl logs <pod-name> -n mail-queue --previous
   # Look for "undefined" or "missing" errors
   ```

2. **Database connection failure**
   ```bash
   # Test database connectivity
   kubectl exec -it <pod-name> -n mail-queue -- \
     node -e "console.log(process.env.DATABASE_URL)"
   ```

3. **Invalid configuration**
   ```bash
   # Check configmap
   kubectl get configmap mail-queue-config -n mail-queue -o yaml
   ```

### 3. Database Connection Errors

**Symptoms**: `ECONNREFUSED`, `connection timeout`, or `too many connections`

**Solutions**:

```bash
# Verify DATABASE_URL
kubectl get secret mail-queue-secrets -n mail-queue -o jsonpath='{.data.DATABASE_URL}' | base64 -d

# Test connection from pod
kubectl exec -it <api-pod> -n mail-queue -- sh -c '
  apk add --no-cache postgresql-client
  psql "$DATABASE_URL" -c "SELECT 1"
'
```

**Too Many Connections**:
- Increase `max_connections` in PostgreSQL
- Reduce pod replicas
- Implement connection pooling (PgBouncer)

### 4. Redis Connection Errors

**Symptoms**: `ECONNREFUSED`, `NOAUTH`, or `MOVED` errors

**Solutions**:

```bash
# Verify REDIS_URL
kubectl get secret mail-queue-secrets -n mail-queue -o jsonpath='{.data.REDIS_URL}' | base64 -d

# Test connection
kubectl exec -it <worker-pod> -n mail-queue -- sh -c '
  apk add --no-cache redis
  redis-cli -u "$REDIS_URL" PING
'
```

**MOVED errors** (Redis Cluster):
- Ensure using cluster-aware client (ioredis Cluster)
- Use hash tags for BullMQ keys

### 5. Health Check Failures

**Symptoms**: Pods marked as unhealthy, restarts

**Diagnose**:
```bash
# Check health endpoint
kubectl exec -it <api-pod> -n mail-queue -- \
  wget -qO- http://localhost:3000/v1/health/detailed

# Check probe configuration
kubectl get deployment mail-queue-api -n mail-queue -o yaml | grep -A 10 "livenessProbe"
```

**Solutions**:
- Increase `initialDelaySeconds` if startup is slow
- Increase `timeoutSeconds` for slow endpoints
- Check if health endpoint checks external dependencies

### 6. High Memory Usage

**Symptoms**: OOMKilled, memory limit exceeded

**Diagnose**:
```bash
# Check current usage
kubectl top pods -n mail-queue

# Check limits
kubectl describe pod <pod-name> -n mail-queue | grep -A 5 "Limits"
```

**Solutions**:
- Increase memory limits in deployment
- Check for memory leaks in application
- Reduce `WORKER_CONCURRENCY` for workers
- Enable swap (not recommended for production)

### 7. Slow API Response

**Symptoms**: High latency, timeouts

**Diagnose**:
```bash
# Check response times
kubectl exec -it <api-pod> -n mail-queue -- \
  time wget -qO- http://localhost:3000/v1/health

# Check database query times
kubectl logs <api-pod> -n mail-queue | grep "slow query"
```

**Solutions**:
- Add database indexes
- Increase replica count (HPA)
- Check for N+1 query problems
- Enable response caching

### 8. Queue Backlog Growing

**Symptoms**: Jobs not processing, queue depth increasing

**Diagnose**:
```bash
# Check queue stats
kubectl exec -it <worker-pod> -n mail-queue -- \
  node -e "
    const Redis = require('ioredis');
    const r = new Redis(process.env.REDIS_URL);
    r.llen('bull:email:wait').then(console.log);
  "

# Check worker logs
kubectl logs -l app.kubernetes.io/component=worker -n mail-queue --tail=100
```

**Solutions**:
- Increase worker replicas
- Increase `WORKER_CONCURRENCY`
- Check for stuck jobs (connection timeouts)
- Pause low-priority queues

### 9. Emails Not Sending

**Symptoms**: Emails queued but not delivered

**Diagnose**:
```bash
# Check email status via API
curl -H "Authorization: Bearer $API_KEY" \
  https://api.mail-queue.example.com/v1/emails?status=failed

# Check worker errors
kubectl logs -l app.kubernetes.io/component=worker -n mail-queue | grep -i error
```

**Common Causes**:
- SMTP configuration incorrect
- SMTP rate limits exceeded
- Network policy blocking outbound SMTP
- Invalid sender domain (SPF/DKIM)

### 10. TLS/Certificate Errors

**Symptoms**: `certificate verify failed`, TLS handshake errors

**Solutions**:
```bash
# Check certificate status
kubectl get certificate -n mail-queue

# Check cert-manager logs
kubectl logs -l app=cert-manager -n cert-manager

# Force certificate renewal
kubectl delete certificate mail-queue-tls -n mail-queue
```

## Performance Tuning

### API Performance

```yaml
# Increase connection pool
env:
  - name: DB_POOL_SIZE
    value: "20"
```

### Worker Performance

```yaml
# Tune concurrency
env:
  - name: WORKER_CONCURRENCY
    value: "25"
  - name: WORKER_LIMITER_MAX
    value: "100"
  - name: WORKER_LIMITER_DURATION
    value: "1000"
```

### Database Optimization

```sql
-- Check slow queries
SELECT query, mean_time, calls
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;

-- Add missing indexes
CREATE INDEX CONCURRENTLY idx_emails_status ON emails(status);
CREATE INDEX CONCURRENTLY idx_emails_scheduled ON emails(scheduled_at);
```

## Log Analysis

### Finding Errors

```bash
# All errors
kubectl logs -l app.kubernetes.io/name=mail-queue -n mail-queue | grep -i error

# Specific time range
kubectl logs --since=1h -l app.kubernetes.io/component=api -n mail-queue

# Follow live
kubectl logs -f -l app.kubernetes.io/component=worker -n mail-queue
```

### Log Aggregation

For production, use centralized logging:

```yaml
# Fluentd/Fluent Bit sidecar
containers:
  - name: fluent-bit
    image: fluent/fluent-bit:latest
    volumeMounts:
      - name: varlog
        mountPath: /var/log
```

## Emergency Procedures

### Rolling Back

```bash
kubectl rollout undo deployment/mail-queue-api -n mail-queue
kubectl rollout undo deployment/mail-queue-worker -n mail-queue
```

### Pausing Processing

```bash
# Scale workers to 0
kubectl scale deployment mail-queue-worker --replicas=0 -n mail-queue

# Or pause specific queue via API
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.mail-queue.example.com/v1/queues/$QUEUE_ID/pause
```

### Emergency Maintenance Mode

```bash
# Block all traffic at ingress
kubectl annotate ingress mail-queue-ingress \
  nginx.ingress.kubernetes.io/server-snippet="return 503;" \
  -n mail-queue
```
