import type { IncomingMessage } from 'node:http';
import {
  type AnyValue,
  context,
  metrics,
  type ObservableResult,
  propagation,
  trace,
} from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  CompositePropagator,
  isTracingSuppressed,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from '@opentelemetry/core';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { ExpressInstrumentation, ExpressLayerType } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import {
  defaultResource,
  detectResources,
  envDetector,
  resourceFromAttributes,
  serviceInstanceIdDetector,
} from '@opentelemetry/resources';
import {
  MeterProvider,
  PeriodicExportingMetricReader,
  type PushMetricExporter,
} from '@opentelemetry/sdk-metrics';
import {
  AlwaysOffSampler,
  AlwaysOnSampler,
  BatchSpanProcessor,
  ParentBasedSampler,
  type Sampler,
  type Span,
  type SpanExporter,
  type SpanProcessor,
  TraceIdRatioBasedSampler,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { OpenTelemetry as RedisTelemetry } from '@redis/client';
import { register as registerEsmHooks } from 'import-in-the-middle/register-hooks.mjs';
import type { Env } from '../env/env.schema.js';
import { isSensitiveKey, REDACTED, redactText, redactUrl } from './redact.js';
import type { Telemetry } from './telemetry.js';

// The OpenTelemetry SDK, imported only when telemetry is on (telemetry.ts).
// Traces and metrics go over OTLP/HTTP (JSON) to OTEL_EXPORTER_OTLP_ENDPOINT
// + /v1/traces and /v1/metrics: a collector or a provider
// (docs/observability.md#opentelemetry). Credentials (OTEL_EXPORTER_OTLP_HEADERS)
// are read by the exporters themselves and never pass through this code.
//
// Instrumented, and nothing else: incoming HTTP (server spans and the request
// duration histogram), Express routing (the route of each request, where the
// time went), PostgreSQL (query spans without values, connection pool
// metrics), outgoing fetch (external services), Redis (node-redis's own
// metrics), the Node.js runtime (event loop, heap, GC) and process CPU and
// memory. NestJS handler spans are not included: the official instrumentation
// does not support Nest 12 yet.

export interface OpenTelemetryOptions {
  /** OTLP/HTTP base URL; the signal paths are appended. */
  endpoint: string;
  serviceName: string;
  environment: string;
  release: string;
  metricExportIntervalMs: number;
  /** OTEL_TRACES_SAMPLER and OTEL_TRACES_SAMPLER_ARG (samplerFor). */
  sampler?: TraceSamplerName | undefined;
  samplerArg?: number | undefined;
  /** Tests pass in-memory exporters; production uses OTLP. */
  spanExporter?: SpanExporter;
  metricExporter?: PushMetricExporter;
}

export type TraceSamplerName = NonNullable<Env['OTEL_TRACES_SAMPLER']>;

/**
 * The sampler OTEL_TRACES_SAMPLER and OTEL_TRACES_SAMPLER_ARG name (the
 * values env.schema.ts accepts), as SDK 2.x's tracer provider built it from
 * the environment: unset, every trace (parent-based, always on); a ratio
 * without its argument, 1. SDK 3.0's provider reads no environment variable,
 * so the API passes them in.
 */
export function samplerFor(name: TraceSamplerName | undefined, ratio = 1): Sampler {
  switch (name) {
    case 'always_on':
      return new AlwaysOnSampler();
    case 'always_off':
      return new AlwaysOffSampler();
    case 'traceidratio':
      return new TraceIdRatioBasedSampler(ratio);
    case 'parentbased_always_off':
      return new ParentBasedSampler({ root: new AlwaysOffSampler() });
    case 'parentbased_traceidratio':
      return new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(ratio) });
    case 'parentbased_always_on':
    case undefined:
      return new ParentBasedSampler({ root: new AlwaysOnSampler() });
  }
}

/** The OTLP/HTTP URL of a signal: <endpoint>/v1/<signal>, keeping any base path. */
export function signalUrl(endpoint: string, signal: 'traces' | 'metrics'): string {
  return new URL(`v1/${signal}`, endpoint.endsWith('/') ? endpoint : `${endpoint}/`).toString();
}

/**
 * A request the telemetry sends about itself: the SDK exports with tracing
 * suppressed (OTLP over node:http), and so does the error tracker (fetch).
 * The HTTP and fetch instrumentations would still count them in
 * http.client.request.duration, and the collector would show up as an
 * external service on the dashboards.
 */
export function isTelemetryRequest(): boolean {
  return isTracingSuppressed(context.active());
}

/** Health probes run every few seconds: never traced, never in the request metrics. */
export function isHealthProbe(request: IncomingMessage): boolean {
  return request.url?.toLowerCase().startsWith('/api/health/') ?? false;
}

export function startOpenTelemetry(options: OpenTelemetryOptions): Telemetry {
  // The process is identified by a random service.instance.id (the `instance`
  // label the dashboards and alerts group by). No host detector: in a
  // container the host name is the container's id, and on a developer's
  // computer it is often the person's name, sent with a stable machine id to
  // whatever backend the endpoint points at. An operator who wants the
  // server's name sets OTEL_RESOURCE_ATTRIBUTES=host.name=<name>, which wins
  // over the detected values.
  const resource = defaultResource()
    .merge(detectResources({ detectors: [serviceInstanceIdDetector, envDetector] }))
    .merge(
      resourceFromAttributes({
        [ATTR_SERVICE_NAME]: options.serviceName,
        [ATTR_SERVICE_VERSION]: options.release,
        'deployment.environment.name': options.environment,
      }),
    );

  const tracerProvider = new TracerProvider({
    resource,
    sampler: samplerFor(options.sampler, options.samplerArg),
    // Redaction runs first, while the span can still be changed.
    spanProcessors: [
      new RedactingSpanProcessor(),
      new BatchSpanProcessor({
        exporter:
          options.spanExporter ??
          new OTLPTraceExporter({ url: signalUrl(options.endpoint, 'traces') }),
      }),
    ],
  });
  // What NodeTracerProvider#register() did before SDK 3.0, which dropped the
  // Node.js provider: the global tracer, AsyncLocalStorage context, and W3C
  // trace context and baggage propagation.
  trace.setGlobalTracerProvider(tracerProvider);
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  propagation.setGlobalPropagator(
    new CompositePropagator({
      propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
    }),
  );

  const meterProvider = new MeterProvider({
    resource,
    readers: [
      new PeriodicExportingMetricReader({
        exporter:
          options.metricExporter ??
          new OTLPMetricExporter({ url: signalUrl(options.endpoint, 'metrics') }),
        exportIntervalMillis: options.metricExportIntervalMs,
      }),
    ],
  });
  metrics.setGlobalMeterProvider(meterProvider);

  const instrumentations = [
    new HttpInstrumentation({
      ignoreIncomingRequestHook: isHealthProbe,
      ignoreOutgoingRequestHook: isTelemetryRequest,
    }),
    // Routers and handlers; the dozen middleware layers of every request
    // (helmet, cookies, body parsing) would only add noise.
    new ExpressInstrumentation({ ignoreLayersType: [ExpressLayerType.MIDDLEWARE] }),
    // Statements are recorded with their placeholders ($1), never values.
    new PgInstrumentation({ requireParentSpan: true, enhancedDatabaseReporting: false }),
    new UndiciInstrumentation({ ignoreRequestHook: isTelemetryRequest }),
    new RuntimeNodeInstrumentation(),
  ];
  interceptEsmImports(
    instrumentations.flatMap((instrumentation) =>
      instrumentation.getModuleDefinitions().map((definition) => definition.name),
    ),
  );
  const unregister = registerInstrumentations({ instrumentations });
  startRedisMetrics();
  observeProcess();

  return {
    enabled: true,
    async flush() {
      await Promise.allSettled([tracerProvider.forceFlush(), meterProvider.forceFlush()]);
    },
    async shutdown() {
      unregister();
      await Promise.allSettled([tracerProvider.shutdown(), meterProvider.shutdown()]);
    },
  };
}

// The instrumentations patch modules as they load. `require()` is hooked by
// default, but Nest 12 loads its HTTP platform (and with it Express) with
// `import()`, which only an ESM loader hook sees. This one runs in-thread
// (module.registerHooks, available on every Node.js version package.json
// "engines" allows) and intercepts exactly the instrumented modules, nothing
// else. Registered once per process: hooks cannot be removed.
const ESM_HOOKS = Symbol.for('app.telemetry.esm-hooks');
function interceptEsmImports(modules: string[]): void {
  const registry = globalThis as typeof globalThis & { [ESM_HOOKS]?: true };
  if (registry[ESM_HOOKS]) return;
  registry[ESM_HOOKS] = true;
  registerEsmHooks({ include: [...new Set(modules)] });
}

// node-redis records its own metrics (command duration, errors, connections)
// once initialized, before any client exists. It can be initialized once per
// process: a second start (tests) keeps the first registration.
function startRedisMetrics(): void {
  try {
    RedisTelemetry.init({
      metrics: {
        enabled: true,
        enabledMetricGroups: ['command', 'connection-basic', 'resiliency'],
      },
    });
  } catch (error) {
    if (!(error instanceof Error && error.message.includes('already initialized'))) throw error;
  }
}

/** CPU time and resident memory of this process (OpenTelemetry process semantic conventions). */
function observeProcess(): void {
  const meter = metrics.getMeter('app.process');
  meter
    .createObservableCounter('process.cpu.time', { description: 'CPU time used', unit: 's' })
    .addCallback((result: ObservableResult) => {
      const usage = process.cpuUsage();
      result.observe(usage.user / 1e6, { 'cpu.mode': 'user' });
      result.observe(usage.system / 1e6, { 'cpu.mode': 'system' });
    });
  meter
    .createObservableUpDownCounter('process.memory.usage', {
      description: 'Resident set size',
      unit: 'By',
    })
    .addCallback((result: ObservableResult) => {
      result.observe(process.memoryUsage.rss());
    });
}

const URL_ATTRIBUTES = new Set(['url.full', 'http.url', 'http.target', 'url.query']);
/** How deep redaction walks an attribute's arrays and maps; deeper values are masked whole. */
const MAX_ATTRIBUTE_DEPTH = 8;

/**
 * The last word on what a span may carry: query strings and URL credentials
 * are removed (tokens and personal data travel there), values under a
 * sensitive name are masked whole, and every other string (in string arrays
 * too) is redacted like a log line: the span's attributes, those of its
 * events (an exception event carries the error's message and stack trace,
 * written by whatever threw it) and its status message. Runs in onEnding, the
 * last moment a span can still be changed, so it covers every instrumentation.
 */
export class RedactingSpanProcessor implements SpanProcessor {
  onStart(): void {
    // Attributes are set during the span's life; redaction waits for its end.
  }

  onEnding(span: Span): void {
    for (const [key, value] of Object.entries(span.attributes)) {
      const redacted = redactAttribute(key, value);
      if (redacted !== value) span.setAttribute(key, redacted);
    }
    // Events have no setter: their attributes are rewritten in place, before
    // any processor or exporter reads them.
    for (const event of span.events) {
      const attributes = event.attributes;
      if (attributes === undefined) continue;
      for (const [key, value] of Object.entries(attributes)) {
        attributes[key] = redactAttribute(key, value);
      }
    }
    // Only an ERROR status keeps a message (the SDK drops it on the others),
    // and setStatus still accepts it: the span has not ended yet.
    const { code, message } = span.status;
    if (message !== undefined) {
      const redacted = redactText(message);
      if (redacted !== message) span.setStatus({ code, message: redacted });
    }
  }

  onEnd(): void {
    // Exporting is the next processor's job.
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * An attribute value safe to export. Since API 1.10 an attribute may hold any
 * value (AnyValue): text, numbers, booleans, null and bytes, and arrays and
 * maps of them, nested. Text is redacted wherever it sits. A value that
 * carries data under a sensitive name (authorization, cookie, password,
 * token, api key...: the log redaction's list) is masked whole, since a bare
 * secret has no "key=value" shape to find; inside a map, each entry's own
 * name counts. URLs lose their credentials and query; any other text is
 * redacted like a log line. Numbers, booleans and null carry no credential
 * and keep their value, so counts named "...tokens" stay usable; bytes keep
 * theirs too, under a name that is not sensitive. Anything else, and anything
 * deeper than MAX_ATTRIBUTE_DEPTH, is masked whole.
 */
function redactAttribute(key: string, value: AnyValue, depth = 0): AnyValue {
  if (!carriesData(value, depth)) return value;
  if (key === 'url.query' || isSensitiveKey(key) || depth >= MAX_ATTRIBUTE_DEPTH) return REDACTED;
  if (typeof value === 'string') return redactAttributeText(key, value);
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) {
    return value.map((item: AnyValue) => redactAttribute(key, item, depth + 1));
  }
  if (isPlainMap(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [name, redactAttribute(name, item, depth + 1)]),
    );
  }
  return REDACTED;
}

/** Whether a value holds anything but numbers, booleans and null (or undefined). */
function carriesData(value: AnyValue, depth: number): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'number' || typeof value === 'boolean') return false;
  if (depth >= MAX_ATTRIBUTE_DEPTH) return true;
  if (Array.isArray(value)) return value.some((item: AnyValue) => carriesData(item, depth + 1));
  if (isPlainMap(value)) return Object.values(value).some((item) => carriesData(item, depth + 1));
  return true;
}

function isPlainMap(value: AnyValue): value is Record<string, AnyValue> {
  if (typeof value !== 'object' || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function redactAttributeText(key: string, value: string): string {
  if (URL_ATTRIBUTES.has(key)) {
    return key === 'http.target' ? (value.split('?', 1)[0] ?? '') : redactUrl(value);
  }
  return redactText(value);
}
