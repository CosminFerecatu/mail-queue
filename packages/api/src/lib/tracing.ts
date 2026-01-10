import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';

// Enable debug logging for OpenTelemetry (only in development)
if (process.env['NODE_ENV'] === 'development' && process.env['OTEL_DEBUG'] === 'true') {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
}

let sdk: NodeSDK | null = null;

/**
 * Initialize OpenTelemetry tracing.
 * This should be called as early as possible in the application startup,
 * before any other imports to ensure auto-instrumentation works correctly.
 */
export function initTracing(): void {
  // Check if OTEL is enabled via environment variable
  const otlpEndpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
  const tracingEnabled = process.env['OTEL_TRACING_ENABLED'] !== 'false';

  if (!tracingEnabled) {
    return;
  }

  const serviceName = process.env['OTEL_SERVICE_NAME'] ?? 'mail-queue-api';
  const serviceVersion = process.env['npm_package_version'] ?? '0.0.1';
  const environment = process.env['NODE_ENV'] ?? 'development';

  // Create resource with service information
  const resource = new Resource({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: serviceVersion,
    'deployment.environment': environment,
  });

  // Configure the exporter
  const traceExporter = otlpEndpoint
    ? new OTLPTraceExporter({
        url: `${otlpEndpoint}/v1/traces`,
      })
    : undefined;

  // Create and configure the SDK
  sdk = new NodeSDK({
    resource,
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable fs instrumentation (too noisy)
        '@opentelemetry/instrumentation-fs': {
          enabled: false,
        },
        // Configure HTTP instrumentation
        '@opentelemetry/instrumentation-http': {
          enabled: true,
          ignoreIncomingRequestHook: (request) => {
            // Ignore health check and metrics endpoints
            const url = request.url ?? '';
            return url.includes('/health') || url.includes('/metrics') || url.includes('/favicon');
          },
        },
        // Configure Fastify instrumentation
        '@opentelemetry/instrumentation-fastify': {
          enabled: true,
        },
        // Configure Redis instrumentation
        '@opentelemetry/instrumentation-redis-4': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-ioredis': {
          enabled: true,
        },
        // Configure PostgreSQL instrumentation
        '@opentelemetry/instrumentation-pg': {
          enabled: true,
        },
      }),
    ],
  });

  // Start the SDK
  sdk.start();

  // Graceful shutdown
  process.on('SIGTERM', () => {
    shutdown();
  });
}

/**
 * Shutdown the OpenTelemetry SDK gracefully.
 */
export async function shutdown(): Promise<void> {
  if (sdk) {
    try {
      await sdk.shutdown();
    } catch (error) {
      console.error('Error shutting down OpenTelemetry SDK:', error);
    }
  }
}
