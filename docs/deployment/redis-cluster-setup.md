# Redis Cluster Setup Guide

This guide covers setting up Redis Cluster for Mail Queue in production environments.

## Cluster vs Sentinel Comparison

| Feature | Redis Cluster | Redis Sentinel |
|---------|---------------|----------------|
| **Horizontal Scaling** | Yes (sharding) | No |
| **Data Distribution** | Automatic | N/A |
| **Failover** | Automatic | Automatic |
| **Min Nodes** | 6 (3 master + 3 replica) | 3 Sentinels + 3 Redis |
| **Complexity** | Higher | Lower |
| **Use Case** | Large datasets, high throughput | HA without sharding |
| **BullMQ Support** | Yes (with hash tags) | Yes |

**Recommendation**: For Mail Queue at 1M+ emails/day, use **Redis Cluster**.

## Minimum Cluster Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                     Redis Cluster (6 nodes)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│   │   Master 1   │    │   Master 2   │    │   Master 3   │     │
│   │ Slots 0-5460 │    │Slots 5461-   │    │Slots 10923-  │     │
│   │              │    │   10922      │    │   16383      │     │
│   │  Port: 7000  │    │  Port: 7001  │    │  Port: 7002  │     │
│   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘     │
│          │                   │                   │              │
│          │ replication       │ replication       │ replication  │
│          ▼                   ▼                   ▼              │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│   │   Replica 1  │    │   Replica 2  │    │   Replica 3  │     │
│   │  Port: 7003  │    │  Port: 7004  │    │  Port: 7005  │     │
│   └──────────────┘    └──────────────┘    └──────────────┘     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Cluster Setup

### 1. Node Configuration

Create `redis-cluster.conf` for each node:

```conf
# Common settings
port 7000  # Change for each node: 7000-7005
cluster-enabled yes
cluster-config-file nodes-7000.conf
cluster-node-timeout 5000
appendonly yes
appendfsync everysec

# Memory
maxmemory 4gb
maxmemory-policy noeviction

# Security
requirepass your-cluster-password
masterauth your-cluster-password

# Network
bind 0.0.0.0
protected-mode no

# Persistence
dir /var/lib/redis/7000
dbfilename dump-7000.rdb
```

### 2. Start Cluster Nodes

```bash
# Start each node
for port in 7000 7001 7002 7003 7004 7005; do
    redis-server /etc/redis/cluster-${port}.conf &
done
```

### 3. Create Cluster

```bash
redis-cli --cluster create \
    redis-node1:7000 redis-node1:7001 \
    redis-node2:7002 redis-node2:7003 \
    redis-node3:7004 redis-node3:7005 \
    --cluster-replicas 1 \
    -a your-cluster-password
```

### 4. Verify Cluster

```bash
redis-cli -c -h redis-node1 -p 7000 -a your-cluster-password CLUSTER INFO
redis-cli -c -h redis-node1 -p 7000 -a your-cluster-password CLUSTER NODES
```

## BullMQ Configuration

### ioredis Cluster Setup

```typescript
// packages/api/src/lib/redis-cluster.ts
import { Cluster } from 'ioredis';

const redisClusterNodes = [
  { host: 'redis-node1', port: 7000 },
  { host: 'redis-node1', port: 7001 },
  { host: 'redis-node2', port: 7002 },
  { host: 'redis-node2', port: 7003 },
  { host: 'redis-node3', port: 7004 },
  { host: 'redis-node3', port: 7005 },
];

export function createRedisCluster(): Cluster {
  return new Cluster(redisClusterNodes, {
    redisOptions: {
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: null, // Required for BullMQ
      enableReadyCheck: true,
    },
    clusterRetryStrategy: (times) => {
      if (times > 10) return null;
      return Math.min(times * 100, 3000);
    },
    enableOfflineQueue: true,
    scaleReads: 'slave',
  });
}
```

### Hash Tags for BullMQ

BullMQ requires related keys to be on the same shard. Use hash tags:

```typescript
// Queue names with hash tags
const QUEUE_NAMES = {
  EMAIL: '{mail-queue}:email',
  WEBHOOK: '{mail-queue}:webhook',
  BOUNCE: '{mail-queue}:bounce',
  ANALYTICS: '{mail-queue}:analytics',
  TRACKING: '{mail-queue}:tracking',
};
```

The `{mail-queue}` hash tag ensures all queue-related keys hash to the same slot.

## Migration from Single Instance

### Step 1: Prepare

1. Set up cluster nodes (don't create cluster yet)
2. Update application config to support both modes
3. Plan maintenance window (5-10 minutes)

### Step 2: Drain Existing Queues

```bash
# Pause all queue processing
# Wait for in-flight jobs to complete
# Verify queue is empty
redis-cli LLEN bull:email:wait
```

### Step 3: Export Data (Optional)

```bash
# Create RDB snapshot
redis-cli BGSAVE
cp /var/lib/redis/dump.rdb ./backup-before-migration.rdb
```

### Step 4: Create Cluster

```bash
redis-cli --cluster create \
    node1:7000 node2:7000 node3:7000 \
    node1:7001 node2:7001 node3:7001 \
    --cluster-replicas 1
```

### Step 5: Update Application

```typescript
// Environment variable switch
const useCluster = process.env.REDIS_CLUSTER === 'true';

export function getRedisConnection() {
  if (useCluster) {
    return createRedisCluster();
  }
  return new Redis(process.env.REDIS_URL);
}
```

### Step 6: Deploy and Verify

```bash
# Deploy with REDIS_CLUSTER=true
kubectl set env deployment/mail-queue-api REDIS_CLUSTER=true
kubectl set env deployment/mail-queue-worker REDIS_CLUSTER=true

# Verify
kubectl logs -l app.kubernetes.io/component=worker | grep "Redis"
```

## Monitoring

### Health Check Script

```bash
#!/bin/bash
# check-cluster-health.sh

CLUSTER_NODES="redis-node1:7000 redis-node2:7002 redis-node3:7004"

for node in $CLUSTER_NODES; do
    host=$(echo $node | cut -d: -f1)
    port=$(echo $node | cut -d: -f2)

    state=$(redis-cli -h $host -p $port -a $REDIS_PASSWORD \
        CLUSTER INFO | grep cluster_state | cut -d: -f2 | tr -d '\r')

    if [[ "$state" != "ok" ]]; then
        echo "ALERT: Cluster state is $state on $node"
        # Send alert
    fi
done
```

### Key Metrics to Monitor

- `cluster_state` - Should be "ok"
- `cluster_slots_assigned` - Should be 16384
- `cluster_slots_ok` - Should equal assigned
- `cluster_known_nodes` - Should be 6 for 3+3 setup

## Troubleshooting

### CROSSSLOT Error

**Cause**: Multi-key operation across slots
**Fix**: Use hash tags for related keys

```
CROSSSLOT Keys in request don't hash to the same slot
```

### CLUSTERDOWN

**Cause**: Not enough masters available
**Fix**: Ensure 3+ masters are running

### Connection Timeouts

**Cause**: Network issues or overloaded nodes
**Fix**: Check network, increase `cluster-node-timeout`

### Debug Commands

```bash
# Check slot distribution
redis-cli -c -h redis-node1 -p 7000 CLUSTER SLOTS

# Check specific key's slot
redis-cli -c CLUSTER KEYSLOT "bull:{mail-queue}:email:1"

# Reshard slots
redis-cli --cluster reshard redis-node1:7000
```

## AWS ElastiCache Cluster Mode

For AWS deployments, use ElastiCache with cluster mode enabled:

```yaml
# CloudFormation snippet
ElastiCacheCluster:
  Type: AWS::ElastiCache::ReplicationGroup
  Properties:
    ReplicationGroupDescription: Mail Queue Redis Cluster
    Engine: redis
    EngineVersion: '7.0'
    CacheNodeType: cache.r6g.large
    NumNodeGroups: 3
    ReplicasPerNodeGroup: 1
    AutomaticFailoverEnabled: true
    MultiAZEnabled: true
    AtRestEncryptionEnabled: true
    TransitEncryptionEnabled: true
```
