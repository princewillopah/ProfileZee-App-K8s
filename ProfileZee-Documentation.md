# ProfileZee — Production Kubernetes Deployment Documentation

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Architecture Overview](#2-architecture-overview)
3. [Service Descriptions](#3-service-descriptions)
4. [Service Interactions](#4-service-interactions)
5. [Infrastructure](#5-infrastructure)
6. [Observability Stack](#6-observability-stack)
7. [Security](#7-security)
8. [Directory Structure](#8-directory-structure)
9. [Deployment Guide](#9-deployment-guide)
10. [Accessing the Application](#10-accessing-the-application)
11. [Environment Variables & Secrets](#11-environment-variables--secrets)

---

## 1. Project Overview

ProfileZee is a production-grade microservices user management platform deployed on Kubernetes. It demonstrates a real-world polyglot microservices architecture where multiple independent services — written in different languages and frameworks — collaborate to deliver a unified user management experience.

**Core capabilities:**
- User creation, listing, editing, and deletion with role-based access control
- Profile management including avatar uploads stored on AWS S3
- JWT-based authentication and session management
- Real-time email notifications triggered by Kafka events
- Full observability with metrics, logs, and alerting

**Technology highlights:**
- Python (FastAPI) for user, profile, and notification services
- Java (Spring Boot) for authentication
- React for the frontend
- Apache Kafka for async event-driven communication
- PostgreSQL, MySQL, and Redis for persistence and caching
- AWS S3 for object storage
- Kubernetes for container orchestration
- Prometheus, Grafana, Loki, and Alloy for observability

---

## 2. Architecture Overview

```
                         ┌─────────────────────────────┐
                         │         Browser              │
                         └────────────┬────────────────┘
                                      │ HTTP
                                      ▼
                         ┌─────────────────────────────┐
                         │     Frontend (React/Nginx)   │
                         │       NodePort :30080        │
                         └──┬──────┬──────┬──────┬─────┘
                            │      │      │      │
              /api/users    │      │      │      │ /api/auth
              /api/profiles │      │      │      │
                            ▼      ▼      ▼      ▼
              ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
              │  User   │ │ Profile  │ │  Auth    │ │Notification  │
              │ Service │ │ Service  │ │ Service  │ │  Service     │
              │ :8001   │ │  :8002   │ │  :8003   │ │   :8004      │
              │FastAPI  │ │ FastAPI  │ │Spring    │ │  FastAPI     │
              └────┬────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘
                   │           │             │               │
                   ▼           ▼             ▼               │
            ┌──────────┐ ┌──────────┐ ┌──────────┐          │
            │Postgres  │ │Postgres  │ │  MySQL   │          │
            │  Users   │ │ Profiles │ │  Auth    │          │
            └──────────┘ └────┬─────┘ └────┬─────┘          │
                              │             │                │
                              ▼             ▼                │
                           AWS S3        Redis           Kafka
                        (Avatars)      (Sessions)    (Events) ◄──┘
                                                         │
                                              ┌──────────┴──────────┐
                                              │  user.created        │
                                              │  user.updated        │
                                              │  user.deleted        │
                                              └─────────────────────┘
```

---

## 3. Service Descriptions

### 3.1 User Service
- **Language:** Python 3.12 / FastAPI
- **Port:** 8001
- **Database:** PostgreSQL (`users_db`)
- **Cache:** Redis (60s TTL on user list and individual users)
- **Messaging:** Kafka producer — publishes `user.created`, `user.updated`, `user.deleted`
- **Metrics:** `/metrics` (Prometheus FastAPI Instrumentator)
- **Responsibilities:**
  - CRUD operations for users
  - Enforces unique email constraint
  - Invalidates Redis cache on write operations
  - Publishes domain events to Kafka on every state change

### 3.2 Profile Service
- **Language:** Python 3.12 / FastAPI
- **Port:** 8002
- **Database:** PostgreSQL (`profiles_db`)
- **Storage:** AWS S3 (avatar images)
- **Messaging:** Kafka consumer — subscribes to `user.deleted` to cascade delete profiles
- **Metrics:** `/metrics`
- **Responsibilities:**
  - Manages user profile data (bio, location, avatar)
  - Uploads avatar images to S3, stores the S3 key and public URL
  - Deletes old avatar from S3 before uploading a new one
  - Auto-creates an empty profile when first accessed for a user
  - Listens to Kafka `user.deleted` events and removes the profile

### 3.3 Auth Service
- **Language:** Java 21 / Spring Boot 3.2
- **Port:** 8003
- **Database:** MySQL (`auth_db`)
- **Cache:** Redis (JWT token sessions)
- **Metrics:** `/actuator/prometheus` (Micrometer + Prometheus registry)
- **Health:** `/actuator/health`
- **Responsibilities:**
  - Registers auth credentials (`/auth/register`)
  - Validates email/password and issues JWT tokens (`/auth/login`)
  - Validates tokens (`/auth/validate`)
  - Manages logout and session invalidation via Redis
  - Stores bcrypt-hashed passwords in MySQL

### 3.4 Notification Service
- **Language:** Python 3.12 / FastAPI
- **Port:** 8004
- **Messaging:** Kafka consumer — subscribes to `user.created`, `user.updated`, `user.deleted`
- **Email:** Gmail SMTP (port 465, SSL)
- **Metrics:** `/metrics`
- **Responsibilities:**
  - Listens to all user domain events from Kafka
  - Sends templated HTML emails to users on account creation, update, and deletion
  - Falls back to dev-mode logging if SMTP credentials are not configured

### 3.5 Frontend
- **Framework:** React 18
- **Server:** Nginx 1.27
- **Port:** 80 (NodePort 30080)
- **Responsibilities:**
  - Serves the React SPA
  - Proxies all API calls to backend services via Nginx rewrite rules
  - Role-based UI — admin users see edit/delete controls, members see read-only views
  - JWT token stored in localStorage, attached to every API request via Axios interceptor

---

## 4. Service Interactions

### 4.1 User Creation Flow
```
Browser
  → POST /api/auth/login       (Frontend → Nginx → Auth Service)
  → POST /api/users            (Frontend → Nginx → User Service)
      → INSERT INTO users (PostgreSQL)
      → DELETE Redis cache
      → PUBLISH user.created (Kafka)
          → Notification Service consumes → sends welcome email
  → POST /api/auth/register    (Frontend → Nginx → Auth Service)
      → INSERT INTO auth_credentials (MySQL, bcrypt hash)
  → POST /api/profiles/{id}/avatar (Frontend → Nginx → Profile Service)
      → PUT object to S3
      → INSERT INTO profiles (PostgreSQL)
```

### 4.2 User Deletion Flow
```
Browser
  → DELETE /api/users/{id}     (Frontend → Nginx → User Service)
      → DELETE FROM users (PostgreSQL)
      → DELETE Redis cache
      → PUBLISH user.deleted (Kafka)
          → Profile Service consumes → deletes S3 avatar → deletes profile
          → Notification Service consumes → sends farewell email
```

### 4.3 Login Flow
```
Browser
  → POST /api/auth/login       (Frontend → Nginx → Auth Service)
      → SELECT FROM auth_credentials (MySQL)
      → bcrypt.verify(password, hash)
      → generate JWT token
      → store session in Redis
      → return {token, userId, role}
  → Frontend stores token in localStorage
  → All subsequent requests include Authorization: Bearer <token>
```

### 4.4 Profile View Flow
```
Browser
  → GET /api/users/{id}        (Frontend → Nginx → User Service)
      → CHECK Redis cache → HIT: return cached
      → MISS: SELECT FROM users → cache result → return
  → GET /api/profiles/{id}     (Frontend → Nginx → Profile Service)
      → SELECT FROM profiles → return avatar_url, bio, location
  → Frontend renders avatar from S3 URL directly
```

---

## 5. Infrastructure

### 5.1 Kubernetes Cluster
| Property | Value |
|---|---|
| Distribution | Kind (Kubernetes in Docker) |
| Kubernetes version | v1.30.0 |
| Nodes | 2 (control-plane + worker) |
| Container runtime | containerd 1.7.15 |
| CNI | Calico |
| OS | Debian GNU/Linux 12 (WSL2) |
| StorageClass | `standard` (rancher/local-path) |

### 5.2 Namespaces
| Namespace | Purpose |
|---|---|
| `profilezee` | All application workloads |
| `monitoring` | Observability stack |
| `sealed-secrets` | Sealed Secrets controller |

### 5.3 Application Workloads (`profilezee` namespace)

| Workload | Kind | Replicas | CPU Request | Memory Request |
|---|---|---|---|---|
| frontend | Deployment | 1 | 50m | 64Mi |
| user-service | Deployment | 1 | 100m | 128Mi |
| profile-service | Deployment | 1 | 100m | 128Mi |
| auth-service | Deployment | 1 | 200m | 512Mi |
| notification-service | Deployment | 1 | 50m | 64Mi |
| kafka | Deployment | 1 | 500m | 768Mi |
| redis | Deployment | 1 | 50m | 64Mi |
| postgres-users | StatefulSet | 1 | 100m | 128Mi |
| postgres-profiles | StatefulSet | 1 | 100m | 128Mi |
| mysql-auth | StatefulSet | 1 | 200m | 256Mi |
| zookeeper | StatefulSet | 1 | 100m | 128Mi |

### 5.4 Services (`profilezee` namespace)

| Service | Type | Port |
|---|---|---|
| frontend | NodePort | 80 → 30080 |
| user-service | ClusterIP | 8001 |
| profile-service | ClusterIP | 8002 |
| auth-service | ClusterIP | 8003 |
| notification-service | ClusterIP | 8004 |
| kafka | ClusterIP | 9092, 9093 |
| redis | ClusterIP | 6379 |
| postgres-users | ClusterIP | 5432 |
| postgres-profiles | ClusterIP | 5432 |
| mysql-auth | ClusterIP | 3306 |
| zookeeper | ClusterIP | 2181 |

### 5.5 Kafka Configuration
- **Mode:** KRaft (no Zookeeper dependency — Zookeeper is present but unused)
- **Image:** `confluentinc/cp-kafka:7.6.0`
- **Topics:** `user.created`, `user.updated`, `user.deleted`
- **Replication factor:** 1 (single node)
- **Key config:**
  - `enableServiceLinks: false` — prevents K8s from injecting `KAFKA_PORT` env var which conflicts with Confluent's entrypoint
  - `KAFKA_HEAP_OPTS: -Xmx512m -Xms256m` — JVM heap capped to stay within memory limits

### 5.6 Database Persistence
All StatefulSet databases use PersistentVolumeClaims with the `standard` StorageClass:

| Database | PVC Size | StorageClass |
|---|---|---|
| postgres-users | 1Gi | standard |
| postgres-profiles | 1Gi | standard |
| mysql-auth | 1Gi | standard |

### 5.7 ConfigMaps and Secrets

| Resource | Kind | Contents |
|---|---|---|
| `profilezee-app-config` | ConfigMap | SMTP settings, AWS region, email |
| `profilezee-infra-config` | ConfigMap | Kafka bootstrap, Redis URL, DB URLs |
| `profilezee-app-secrets` | Secret | JWT secret, DB URLs, AWS keys, SMTP credentials |
| `profilezee-infra-secrets` | Secret | DB usernames and passwords |
| `profilezee-admin-secret` | Secret | Seed user credentials |
| `grafana-secret` | Secret | Grafana admin credentials + SMTP env vars |

### 5.8 Jobs

| Job | Purpose |
|---|---|
| `db-seed` | Seeds the admin user into user-service and auth-service on first deploy |
| `kafka-topic-init` | Creates Kafka topics on cluster startup |

The `db-seed` job uses init containers to wait for `user-service` and `auth-service` to be ready before executing the seed script.

### 5.9 External Dependencies

| Service | Provider | Purpose |
|---|---|---|
| Avatar Storage | AWS S3 (`my-xxx-s3-bucket-xxx`) | Profile picture storage |
| Email | Gmail SMTP (port 465) | User notifications |

---

## 6. Observability Stack

All observability components run in the `monitoring` namespace and are deployed via Helm.

### 6.1 Components

| Component | Helm Chart | Purpose |
|---|---|---|
| Prometheus | `prometheus-community/kube-prometheus-stack` | Metrics collection and storage |
| Grafana | `grafana/grafana` | Dashboards, alerting, log exploration |
| Loki | `grafana/loki` | Log aggregation and storage |
| Alloy | `grafana/alloy` | Unified metrics scraping and log shipping |

### 6.2 Metrics Flow
```
ProfileZee Services (/metrics, /actuator/prometheus)
    │
    ├── Prometheus static scrape configs (direct)
    └── Alloy remote_write → Prometheus
```

### 6.3 Logs Flow
```
ProfileZee Pod Logs (stdout/stderr)
    │
    └── Alloy (DaemonSet)
            → loki.source.kubernetes
            → label enrichment (app, namespace, pod, container)
            → Loki
```

### 6.4 Scrape Targets

| Job | Endpoint | Metrics Path |
|---|---|---|
| profilezee-user-service | user-service.profilezee:8001 | /metrics |
| profilezee-profile-service | profile-service.profilezee:8002 | /metrics |
| profilezee-auth-service | auth-service.profilezee:8003 | /actuator/prometheus |
| profilezee-notification-service | notification-service.profilezee:8004 | /metrics |

### 6.5 Grafana Dashboards

| Dashboard | Grafana ID | Data Source |
|---|---|---|
| Node Exporter Full | 1860 | Prometheus |
| Kubernetes Cluster Overview | 7249 | Prometheus |
| FastAPI Observability | 16110 | Prometheus |
| JVM Micrometer | 4701 | Prometheus |
| ProfileZee Custom | N/A (imported JSON) | Prometheus + Loki |

### 6.6 Alert Rules

| Alert | Condition | Severity | Pending |
|---|---|---|---|
| Pod Down | `up{job=~"profilezee.*"} == 0` | Critical | 1m |
| High 5xx Error Rate | 5xx rate > 5% | Critical | 2m |
| Pod Restarting | restarts > 3 in 5m | Warning | 1m |
| High Memory | working set > 90% limit | Warning | 2m |
| JVM Heap High | heap used > 85% max | Warning | 3m |
| High Latency | p99 > 2s | Warning | 3m |

### 6.7 Monitoring Workloads

| Workload | Kind | CPU Limit | Memory Limit |
|---|---|---|---|
| prometheus-prometheus | StatefulSet | 500m | 512Mi |
| grafana | Deployment | 300m | 256Mi |
| loki | StatefulSet | 300m | 256Mi |
| alloy | DaemonSet | 300m | 256Mi |
| kube-state-metrics | Deployment | 100m | 128Mi |
| node-exporter | DaemonSet | 100m | 64Mi |
| prometheus-operator | Deployment | 200m | 256Mi |

---

## 7. Security

### 7.1 Secrets Management
- All sensitive values stored in Kubernetes Secrets
- Secrets referenced via `secretKeyRef` in deployments — never hardcoded in manifests
- Grafana admin credentials and SMTP credentials stored in `grafana-secret`
- Sealed Secrets controller installed (`sealed-secrets` namespace) for encrypting secrets at rest in Git

### 7.2 Network Security
- All inter-service communication is ClusterIP — not exposed outside the cluster
- Frontend is the only externally accessible service (NodePort)
- Services communicate using internal DNS (`service-name.namespace.svc.cluster.local`)

### 7.3 Authentication
- All API routes protected by JWT tokens issued by auth-service
- Frontend attaches `Authorization: Bearer <token>` to every request via Axios interceptor
- 401 responses automatically clear localStorage and redirect to login
- Role-based UI: `superadmin` and `admin` roles can create/edit/delete; `member` role is read-only

---

## 8. Directory Structure

```
ProfileZee-K8s/
├── App/
│   ├── frontend/
│   │   ├── Dockerfile
│   │   ├── nginx.conf
│   │   ├── package.json
│   │   └── src/
│   │       ├── App.js
│   │       ├── App.css
│   │       ├── pages/
│   │       │   ├── Login.js
│   │       │   ├── UserList.js
│   │       │   ├── UserDetail.js
│   │       │   └── UserForm.js
│   │       └── services/
│   │           └── api.js
│   ├── user-service/
│   │   ├── Dockerfile
│   │   ├── main.py
│   │   ├── seed.py
│   │   └── requirements.txt
│   ├── profile-service/
│   │   ├── Dockerfile
│   │   ├── main.py
│   │   └── requirements.txt
│   ├── auth-service/
│   │   ├── Dockerfile
│   │   ├── pom.xml
│   │   └── src/
│   └── notification-service/
│       ├── Dockerfile
│       ├── main.py
│       └── requirements.txt
│
└── kubernetes/
    ├── namespace.yaml
    ├── configmaps/
    │   ├── app-config.yaml
    │   ├── infra-config.yaml
    │   └── nginx-config.yaml
    ├── secrets/
    │   ├── app-secrets.yaml
    │   ├── infra-secrets.yaml
    │   └── admin-secret.yaml
    |   └── grafana-secret.yaml 
    ├── infra/
    │   ├── kafka/
    │   │   ├── deployment.yaml
    │   │   ├── service.yaml
    │   │   └── kafka-topic-init.yaml
    │   ├── redis/
    │   ├── postgres-users/
    │   ├── postgres-profiles/
    │   ├── mysql-auth/
    │   └── zookeeper/
    ├── apps/
    │   ├── frontend/
    │   ├── user-service/
    │   ├── profile-service/
    │   ├── auth-service/
    │   └── notification-service/
    ├── jobs/
    │   └── db-seed.yaml
    └── monitoring/
        ├── prometheus/
        │   └── values.yaml
        ├── grafana/
        │   └── values.yaml
        ├── loki/
        │   └── values.yaml
        └── alloy/
            └── values.yaml
```

---

## 9. Deployment Guide

### 9.1 Prerequisites
- Docker Desktop with Kind installed
- `kubectl` configured
- `helm` v3.19+
- AWS credentials with S3 access
- Gmail account with App Password enabled

### 9.2 Create the Cluster

```bash
kind create cluster --name dev-cluster --config kind-config.yaml
kubectl get nodes
```

### 9.3 Deploy the Application

```bash
# Create namespace
kubectl apply -f kubernetes/namespace.yaml

# Apply ConfigMaps
kubectl apply -f kubernetes/configmaps/

# Apply Secrets
kubectl apply -f kubernetes/secrets/

# Deploy infrastructure (databases, kafka, redis)
kubectl apply -f kubernetes/infra/

# Wait for databases to be ready
kubectl wait --for=condition=ready pod -l app=postgres-users -n profilezee --timeout=120s
kubectl wait --for=condition=ready pod -l app=mysql-auth -n profilezee --timeout=120s
kubectl wait --for=condition=ready pod -l app=kafka -n profilezee --timeout=120s

# Deploy applications
kubectl apply -f kubernetes/apps/

# Run seed job
kubectl apply -f kubernetes/jobs/db-seed.yaml

# Verify everything is running
kubectl get pods -n profilezee
```

### 9.4 Deploy the Observability Stack

```bash
# Add Helm repos
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

# Create monitoring namespace
kubectl create namespace monitoring

# Deploy Grafana secret
kubectl apply -f kubernetes/monitoring/grafana/grafana-secret.yaml

# Deploy Prometheus
helm install prometheus prometheus-community/kube-prometheus-stack \
  -n monitoring \
  -f kubernetes/monitoring/prometheus/values.yaml \
  --set fullnameOverride=prometheus

# Deploy Grafana
helm install grafana grafana/grafana \
  -n monitoring \
  -f kubernetes/monitoring/grafana/values.yaml

# Deploy Loki
helm install loki grafana/loki \
  -n monitoring \
  -f kubernetes/monitoring/loki/values.yaml

# Deploy Alloy
helm install alloy grafana/alloy \
  -n monitoring \
  -f kubernetes/monitoring/alloy/values.yaml

# Verify
kubectl get pods -n monitoring
```

### 9.5 Verify Health

```bash
# All app pods should be Running
kubectl get pods -n profilezee

# All monitoring pods should be Running
kubectl get pods -n monitoring

# Check Prometheus targets
kubectl port-forward svc/prometheus-prometheus 9090:9090 -n monitoring
# Open http://localhost:9090/targets — all profilezee jobs should be UP

# Check Grafana
kubectl port-forward svc/grafana 3000:80 -n monitoring
# Open http://localhost:3000 — login admin/Grafana@1234
```

### 9.6 Rebuild and Redeploy a Service

```bash
# Example: rebuild user-service after code change
cd App/user-service
docker build --no-cache -t princewillopah2/profilezee-user-service:latest .
docker push princewillopah2/profilezee-user-service:latest
cd ../..

kubectl rollout restart deployment/user-service -n profilezee
kubectl rollout status deployment/user-service -n profilezee
```

### 9.7 Re-run the Seed Job

```bash
kubectl delete job db-seed -n profilezee --ignore-not-found
kubectl apply -f kubernetes/jobs/db-seed.yaml
kubectl logs -f $(kubectl get pod -l job-name=db-seed -n profilezee -o name) -n profilezee -c seed
```

---

## 10. Accessing the Application

### Application
```bash
kubectl port-forward svc/frontend 8080:80 -n profilezee
```
Open `http://localhost:8080`

**Default credentials:**
| Field | Value |
|---|---|
| Email | admin@userapp.com |
| Password | Admin@1234 |

### Grafana
```bash
kubectl port-forward svc/grafana 3000:80 -n monitoring
```
Open `http://localhost:3000`

| Field | Value |
|---|---|
| Username | admin |
| Password | Grafana@1234 |

### Prometheus
```bash
kubectl port-forward svc/prometheus-prometheus 9090:9090 -n monitoring
```
Open `http://localhost:9090`

---

## 11. Environment Variables & Secrets

### ConfigMap: `profilezee-app-config`
| Key | Value |
|---|---|
| SMTP_HOST | smtp.gmail.com |
| SMTP_PORT | 587 |
| FROM_EMAIL | noreply@userapp.com |
| AWS_REGION | us-east-1 |

### ConfigMap: `profilezee-infra-config`
| Key | Value |
|---|---|
| KAFKA_BOOTSTRAP_SERVERS | kafka:9092 |
| REDIS_URL | redis://redis:6379 |

### Secret: `profilezee-app-secrets`
| Key | Description |
|---|---|
| JWT_SECRET | JWT signing key |
| AUTH_DATABASE_URL | MySQL JDBC URL for auth-service |
| PROFILES_DATABASE_URL | PostgreSQL asyncpg URL for profile-service |
| USERS_DATABASE_URL | PostgreSQL asyncpg URL for user-service |
| AWS_ACCESS_KEY_ID | AWS access key for S3 |
| AWS_SECRET_ACCESS_KEY | AWS secret key for S3 |
| AWS_S3_BUCKET | S3 bucket name |
| SMTP_USER | Gmail address |
| SMTP_PASSWORD | Gmail App Password |

### Secret: `profilezee-infra-secrets`
| Key | Description |
|---|---|
| POSTGRES_USER | PostgreSQL username |
| POSTGRES_PASSWORD | PostgreSQL password |
| MYSQL_USER | MySQL username |
| MYSQL_PASSWORD | MySQL password |
| MYSQL_ROOT_PASSWORD | MySQL root password |

### Secret: `profilezee-admin-secret`
| Key | Description |
|---|---|
| ADMIN_PASSWORD | Seed admin user password |

---

*ProfileZee — Microservices User Management Platform*
*Deployed on Kubernetes with full observability*
