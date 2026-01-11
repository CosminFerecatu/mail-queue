# Mail Queue Load Testing

Load testing suite using [k6](https://k6.io/) for the Mail Queue API.

## Prerequisites

1. Install k6:
   ```bash
   # macOS
   brew install k6

   # Windows (chocolatey)
   choco install k6

   # Linux
   sudo apt-get install k6
   ```

2. Set up environment variables:
   ```bash
   export BASE_URL=http://localhost:3000
   export API_KEY=your_api_key
   export ADMIN_TOKEN=your_admin_token
   export QUEUE_ID=default-queue-id
   ```

## Test Scenarios

### 1. Single Email Sending (`email-single.js`)

Tests throughput and latency for single email operations.

```bash
k6 run load-tests/k6/scenarios/email-single.js
```

**Targets:**
- p(95) latency < 300ms
- p(99) latency < 500ms
- Error rate < 1%
- Throughput > 1000 emails queued

### 2. Batch Email Sending (`email-batch.js`)

Tests batch email processing with varying batch sizes (100-1000 emails).

```bash
k6 run load-tests/k6/scenarios/email-batch.js
```

**Targets:**
- p(95) latency < 2000ms
- Error rate < 2%
- > 10,000 emails processed

### 3. Queue Operations (`queue-operations.js`)

Tests queue management CRUD operations under load.

```bash
k6 run load-tests/k6/scenarios/queue-operations.js
```

**Targets:**
- p(95) latency < 200ms
- Error rate < 1%

### 4. API Stress Test (`api-stress.js`)

Multi-endpoint stress test with weighted distribution:
- 40% email sending
- 15% queue listing
- 10% queue stats
- 10% analytics
- 8% suppression list
- 7% SMTP configs
- 5% health checks
- 5% email listing

```bash
k6 run load-tests/k6/scenarios/api-stress.js
```

**Targets:**
- p(95) latency < 300ms
- Success rate > 98%

### 5. Spike Test (`spike-test.js`)

Tests system behavior under sudden load spikes (10 -> 500 VUs).

```bash
k6 run load-tests/k6/scenarios/spike-test.js
```

**Targets:**
- Success rate during spike > 90%
- System recovery after spike
- No cascading failures

## Running All Tests

```bash
# Run all scenarios sequentially
for scenario in email-single email-batch queue-operations api-stress spike-test; do
  k6 run load-tests/k6/scenarios/${scenario}.js
done
```

## Configuration

Edit `config.js` to customize:
- Base URL
- Authentication tokens
- Default thresholds
- Test data (queue IDs, etc.)

## Output

Test results are saved to `load-tests/results/`:
- `email-single.json`
- `email-batch.json`
- `queue-operations.json`
- `api-stress.json`
- `spike-test.json`

## Integrating with CI/CD

```yaml
# GitHub Actions example
- name: Run Load Tests
  run: |
    k6 run --out json=results.json load-tests/k6/scenarios/api-stress.js

- name: Check Thresholds
  run: |
    if grep -q '"thresholds":{"http_req_duration":{"ok":false}' results.json; then
      echo "Performance thresholds not met!"
      exit 1
    fi
```

## Grafana Dashboard

For real-time monitoring, use k6 with InfluxDB and Grafana:

```bash
# Start InfluxDB and Grafana
docker-compose -f load-tests/docker-compose.k6.yml up -d

# Run k6 with InfluxDB output
k6 run --out influxdb=http://localhost:8086/k6 load-tests/k6/scenarios/api-stress.js
```

## Best Practices

1. **Warm up the system** before running intensive tests
2. **Run tests from a separate machine** to avoid resource contention
3. **Monitor system resources** during tests (CPU, memory, connections)
4. **Start with lower VU counts** and gradually increase
5. **Use realistic data** that matches production patterns
