# Observability Stack

StellarKraal uses a three-pillar observability stack: **Prometheus** for
metrics, **Loki + Promtail** for logs, and **Grafana** for dashboards and
alerting. This document covers architecture, configuration, every custom
metric, and how to extend the stack.

---

## Local Observability Stack Quick-Start

This section gives you a complete, step-by-step walkthrough for spinning up the
local observability stack, importing the pre-built dashboards, and writing your
first Loki log query. If you only want reference material, skip ahead to
[Architecture](#architecture).

### 1 — Prerequisites

- [Docker](https://docs.docker.com/get-docker/) **24+** and Docker Compose
  **v2** (included with Docker Desktop).
- The repository cloned and a valid `.env` file (copy `.env.example`).

Verify Docker is running:

```bash
docker info
```

### 2 — Start the full stack

Run the following from the repository root. The `--build` flag rebuilds the
backend/frontend images if you have local code changes:

```bash
docker compose up --build
```

On first run Docker pulls the Grafana, Loki, and Promtail images (~600 MB).
Subsequent starts are much faster.

Expected output once everything is healthy:

```
loki_1     | level=info ts=... msg="Loki started"
promtail_1 | level=info ts=... msg="Promtail started"
backend_1  | Server running on port 3001
grafana_1  | logger=http.server t=... msg="HTTP Server Listen" address=[::]:3000
```

> **Tip:** Run `docker compose up -d` to start in detached mode and keep your
> terminal free.

### 3 — Verify each service

| Service | URL | Expected response |
|---------|-----|-------------------|
| **Grafana** | http://localhost:3200 | Grafana login / home page |
| **Loki** | http://localhost:3100/ready | `ready` |
| **Backend API** | http://localhost:3001/api/v1/health | `{"status":"ok"}` |
| **Backend metrics** | http://localhost:3001/metrics | Prometheus text format |

> **Authentication:** The local Grafana instance is pre-configured with
> anonymous viewer access — you can browse dashboards without logging in.
> The default admin credentials are `admin` / `admin` (you will be prompted
> to change the password on first login).

### 4 — Access Grafana and open a dashboard

1. Open http://localhost:3200 in your browser.
2. Click the **Dashboards** icon (four squares) in the left sidebar.
3. You will see two pre-provisioned dashboards:

   | Dashboard | Description |
   |-----------|-------------|
   | **StellarKraal Backend** | HTTP request rate, error rate, latency percentiles, DB pool, RPC latency |
   | **StellarKraal Logs** | Live log streams from all containers |

4. Click **StellarKraal Logs** to open the log dashboard.

> **No data on metric panels?** Prometheus is not yet provisioned in
> `docker-compose.yml` (see [Known Gaps](#known-gaps)). Log panels work
> immediately without Prometheus.

### 5 — Import the pre-built Grafana dashboards

The dashboards live in `grafana/dashboards/` and are auto-provisioned via the
mounted volume. To reproduce the monitoring setup in a **new environment**
(staging, production, or a fresh local clone), follow these steps.

#### 5a — Provision automatically (recommended)

Grafana reads dashboard JSON from the directory configured in
`grafana/provisioning/dashboards/dashboards.yml`. The default provider points
at `/var/lib/grafana/dashboards`, which is bind-mounted from
`grafana/dashboards/` in `docker-compose.yml`:

```yaml
# docker-compose.yml (grafana service excerpt)
services:
  grafana:
    image: grafana/grafana:10.4.2
    volumes:
      - ./grafana/provisioning:/etc/grafana/provisioning
      - ./grafana/dashboards:/var/lib/grafana/dashboards
```

```yaml
# grafana/provisioning/dashboards/dashboards.yml
apiVersion: 1
providers:
  - name: 'StellarKraal'
    orgId: 1
    folder: 'StellarKraal'
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    options:
      path: /var/lib/grafana/dashboards
```

To deploy to a new environment:

1. Copy `grafana/provisioning/` and `grafana/dashboards/` to the target host
   (or bake them into your image / Helm chart).
2. Mount them at the paths above.
3. Restart Grafana. Dashboards appear under the **StellarKraal** folder within
   ~30 seconds.

#### 5b — Import manually via the UI

Use this when you have a dashboard JSON file outside the provisioned directory
or want to tweak a copy without touching the repo:

1. In Grafana, click **Dashboards → Import**.
2. Click **Upload JSON file** and select your dashboard JSON.
3. Under **Options**, set the datasource to `Loki` (for log dashboards) or
   `Prometheus` (for metric dashboards).
4. Click **Import**.

To make the dashboard permanent (survive container restarts), save the JSON to
`grafana/dashboards/<name>.json` and restart Grafana:

```bash
docker compose restart grafana
```

Grafana reloads dashboard files from the mounted volume every 30 seconds, so
a restart is only needed if you add a new file.

#### 5c — Import via the HTTP API (CI / automation)

For scripted environments, import with the Grafana API. The dashboard JSON
must be wrapped in a `dashboard` object and given an `overwrite` flag:

```bash
curl -sS -X POST "$GRAFANA_URL/api/dashboards/db" \
  -H "Authorization: Bearer $GRAFANA_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @<(jq '{dashboard: ., overwrite: true, folderUid: "stellarkraal"}' \
    grafana/dashboards/backend.json)
```

> **Datasource UIDs:** Dashboards reference datasources by UID. Ensure the
target environment has datasources named `Prometheus` and `Loki` (see
`grafana/provisioning/datasources/`), or update the `datasource` fields in the
JSON before importing.

### 6 — Write your first Loki log query

Loki queries use **LogQL** — a log query language similar to PromQL. Follow
these steps to explore logs in the Grafana Explore view:

1. Click the **Explore** icon (compass) in the left sidebar.
2. Make sure the datasource selector (top-left) shows **Loki**.
3. Enter a query in the query editor.

#### Basic queries

**All backend logs:**

```logql
{container="backend"}
```

**Only error-level lines:**

```logql
{container="backend"} | json | level="error"
```

**Lines containing a keyword** (loan liquidations):

```logql
{container="backend"} |= "liquidat"
```

**Structured field filter** (slow requests over 500 ms):

```logql
{service="backend"} | json | duration > 500
```

**Rate of errors per minute** (metric query):

```logql
sum(rate({container="backend"} | json | level="error" [1m]))
```

#### Filtering by time range

Use the time-range picker in the top-right corner of the Explore view. For
active development, **Last 15 minutes** or **Last 1 hour** works well. For
incident review, set an absolute range that covers the event window.

#### Useful label selectors

| Goal | LogQL |
|------|-------|
| All container logs | `{container=~"backend\|frontend"}` |
| Promtail errors | `{container="promtail"}` |
| Specific request ID | `{container="backend"} \|= "req-abc123"` |
| Auth failures | `{container="backend"} \|= "Unauthorized"` |
| RPC failures | `{service="backend"} \|= "rpc" \| level="error"` |
| Rate-limited requests | `{container="backend"} \|= "Too many requests"` |

> **Full LogQL reference:** https://grafana.com/docs/loki/latest/logql/

### 7 — Tear down

Stop all containers and remove the network:

```bash
docker compose down
```

To also delete the Grafana volume (resets all dashboard customisations):

```bash
docker compose down -v
```

---

## Promtail → Loki Log Pipeline

Promtail tails Docker's `json-file` logs, attaches labels, and pushes entries
to Loki. Understanding this pipeline is essential when logs are missing or
labels are wrong.

```
Docker json-file logs (/var/lib/docker/containers/*/*-json.log)
        │
        ▼
Promtail  ── scrape_configs: relabel container name → `container` label
        │   pipeline_stages: parse JSON, extract level, drop noise
        ▼
Loki      ── stores streams keyed by label set (container, service, level)
        │
        ▼
Grafana   ── queries via LogQL
```

### Annotated Promtail configuration

```yaml
# promtail/promtail-config.yml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  # Tracks how far Promtail has read each file so restarts don't re-send logs.
  filename: /tmp/positions.yaml

clients:
  # Loki push endpoint. Use the Docker service name locally; the staging
  # endpoint in deployed environments.
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: docker
    docker_sd_configs:
      # Service discovery: Promtail asks the Docker socket for running containers.
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
    relabel_configs:
      # Use the container name as the `container` label (strips leading '/')
      - source_labels: ['__meta_docker_container_name']
        regex: '/(.*)'
        target_label: 'container'
      # Expose the compose service name as `service`
      - source_labels: ['__meta_docker_container_label_com_docker_compose_service']
        target_label: 'service'
    pipeline_stages:
      # Parse the Docker json-file wrapper (log, stream, time)
      - json:
          expressions:
            level: level
      # Promote the parsed level to a Loki label for fast filtering
      - labels:
          level:
      # Drop health-check noise so it doesn't pollute streams
      - drop:
          source: log
          expression: '.*GET /api/v1/health.*'
```

### Key pipeline stages

| Stage | Purpose |
|-------|---------|
| `docker_sd_configs` | Discovers containers automatically; no static file paths |
| `relabel_configs` | Maps Docker metadata to Loki labels (`container`, `service`) |
| `json` | Parses structured log lines into fields |
| `labels` | Promotes a parsed field (e.g. `level`) to an indexed label |
| `drop` | Discards noisy lines before they reach Loki |

> **Cardinality warning:** Only promote low-cardinality fields to labels.
> Never label by request ID, user ID, or free-form message — it explodes the
> Loki index. Use `|=` line filters or `| json` instead.

### Verifying the pipeline

1. Check Promtail is scraping: http://localhost:9080/targets
2. Confirm Loki received data: http://localhost:3100/metrics (look for
   `loki_distributor_lines_received_total`).
3. Query in Grafana Explore: `{container="backend"}` should return lines.

---

## Custom Prometheus Alert Rules

Alert rules live in `prometheus/alerts/` and are loaded via `rule_files` in
`prometheus/prometheus.yml`. Each rule evaluates a PromQL expression and fires
when the condition holds for a configured `for` duration.

### Rule file structure

```yaml
# prometheus/alerts/backend.yml
groups:
  - name: stellarkraal-backend
    rules:
      - alert: HighErrorRate
        # Fires when >5% of requests are 5xx over a 5-minute window.
        expr: |
          sum(rate(http_requests_total{status_code=~"5.."}[5m]))
            / sum(rate(http_requests_total[5m])) > 0.05
        for: 5m
        labels:
          severity: critical
          team: backend
        annotations:
          summary: "High 5xx error rate ({{ $value | humanizePercentage }})"
          description: "Error rate exceeded 5% for 5 minutes."
          runbook_url: "https://github.com/.../docs/observability.md#runbook-high-error-rate"
```

### Authoring a new rule

1. **Pick a metric** from the [Custom metrics](#custom-metrics) tables.
2. **Prototype the PromQL** in the Prometheus UI (`/graph`) or Grafana
   Explore with the Prometheus datasource. Confirm it returns the expected
   series before writing the rule.
3. **Add the rule** to the appropriate file under `prometheus/alerts/`.
   Use a descriptive `alert` name, a `severity` label (`warning` or
   `critical`), and a `runbook_url` annotation.
4. **Validate the syntax** with `promtool`:

   ```bash
   promtool check rules prometheus/alerts/backend.yml
   ```

5. **Reload Prometheus** without a restart (requires `--web.enable-lifecycle`):

   ```bash
   curl -X POST http://localhost:9090/-/reload
   ```

6. **Confirm the rule loaded** at http://localhost:9090/rules — it should
   appear under its group with state `inactive`.

### Testing a rule

- **Unit tests:** `promtool test rules` runs rule expressions against synthetic
  time series. Place tests in `prometheus/alerts/tests/`:

  ```yaml
  # prometheus/alerts/tests/backend_test.yml
  rule_files:
    - ../backend.yml
  evaluation_interval: 1m
  tests:
    - interval: 1m
      input_series:
        - series: 'http_requests_total{status_code="500"}'
          values: '0+10x10'
        - series: 'http_requests_total{status_code="200"}'
          values: '0+90x10'
      alert_rule_test:
        - eval_time: 10m
          alertname: HighErrorRate
          exp_alerts:
            - exp_labels:
                severity: critical
                team: backend
  ```

  Run with:

  ```bash
  promtool test rules prometheus/alerts/tests/backend_test.yml
  ```

- **Live testing:** temporarily lower the threshold or `for` duration in a
  scratch rule, trigger the condition, and watch the rule transition to
  `pending` then `firing` at `/rules`.

---

## Runbook: Responding to Pre-defined Alerts

Each pre-defined alert links here via its `runbook_url` annotation. Work
through the steps in order; escalate if the issue is not resolved within the
stated window.

### Runbook: HighErrorRate

**Meaning:** More than 5% of HTTP requests returned 5xx for 5 minutes.

1. Open the **StellarKraal Backend** dashboard and check the error-rate panel
   to confirm the spike and identify the affected `route`.
2. In Grafana Explore, query the failing route's logs:
   `{container="backend"} | json | level="error"`.
3. Check backend health: `curl http://localhost:3001/api/v1/health`.
4. If errors correlate with a recent deploy, roll back.
5. If errors are DB-related, check the DB pool metrics and RDS status.

### Runbook: HighLatency

**Meaning:** p95 request latency exceeded the threshold for 10 minutes.

1. Check the latency-percentile panel on the backend dashboard.
2. Identify slow routes via `http_request_duration_seconds` breakdown.
3. Inspect RPC latency metrics — a slow Stellar RPC can dominate latency.
4. Check DB pool saturation (`db_pool_*` metrics).

### Runbook: BackendDown

**Meaning:** Prometheus cannot scrape `/metrics` for 2 minutes.

1. Verify the container is running: `docker compose ps backend`.
2. Check logs: `{container="backend"}` in Explore, or
   `docker compose logs backend`.
3. Confirm the metrics endpoint responds:
   `curl http://localhost:3001/metrics`.
4. Restart if crashed: `docker compose restart backend`.

### Runbook: DBPoolExhausted

**Meaning:** The DB connection pool has no free connections.

1. Check `db_pool_active_connections` vs `db_pool_max_connections`.
2. Look for long-running queries in the backend logs.
3. If sustained, scale the pool size or investigate connection leaks.

> **Adding a runbook:** When you add a new alert, add a matching
> `### Runbook: <AlertName>` section here and point the rule's
> `runbook_url` annotation at its anchor.

---

## Architecture

```
backend ──┐
           ├─► Docker json-file logs ──► Promtail ──► Loki ──► Grafana
frontend ──┘

backend ──► prom-client registry ──► GET /metrics ──► Prometheus ──► Grafana
```

| Pillar | Tool | Purpose |
|--------|------|---------|
| Metrics | [Prometheus](https://prometheus.io/) | Scrapes numeric time-series from the backend `/metrics` endpoint |
| Logs | [Loki](https://grafana.com/oss/loki/) + [Promtail](https://grafana.com/docs/loki/latest/send-data/promtail/) | Aggregates structured logs from all Docker containers |
| Dashboards | [Grafana](https://grafana.com/oss/grafana/) | Visualises metrics and logs, fires alert notifications |

---

## Service URLs

### Local development

All services are defined in `docker-compose.yml`. Start the full stack:

```bash
docker compose up --build
```

| Service | URL | Credentials |
|---------|-----|-------------|
| Grafana | http://localhost:3200 | Anonymous viewer (no login) |
| Loki | http://localhost:3100 | — |
| Backend API | http://localhost:3001 | — |
| Prometheus | (not yet provisioned — see [Known Gaps](#known-gaps)) | — |

### Staging

Staging mirrors production. Observability services are deployed separately
(via Kubernetes Helm charts or equivalent). Access is restricted to VPN/SSO.

| Service | URL |
|---------|-----|
| Grafana | `https://grafana-staging.stellarkraal.example.com` |
| Prometheus | `https://prometheus-staging.stellarkraal.example.com` |
| Loki | `https://loki-staging.stellarkraal.example.com` |

Staging uses the same dashboard JSON files as local dev. Datasource URLs
point to the staging Loki/Prometheus endpoints rather than Docker service
names.

---

## Metrics (Prometheus)

### How it works

The backend uses [`prom-client`](https://github.com/siimon/prom-client) to
expose a Prometheus-compatible metrics registry. A middleware instruments
every HTTP request, and the connection pool reports DB metrics in real time.

The registry is exported at `GET /metrics` (exposed on port 3001 alongside
the API).

### Custom metrics

All custom metrics are defined in
[`backend/src/metrics.ts`](../backend/src/metrics.ts) and registered on a
dedicated `Registry` instance.

#### HTTP metrics

| Metric | Type | Labels | Buckets | Description |
|--------|------|--------|---------|-------------|
| `http_requests_total` | Counter | `method`, `route`, `status_code` | — | Total HTTP requests served since process start |
| `http_request_duration_seconds` | Histogram | `method`, `route` | — | Request latency distribution |
