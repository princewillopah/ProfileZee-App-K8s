# User Management — Microservices Learning App

A full microservices application built to teach you how real production apps work.
Study this, then apply the same patterns at work.

---

## Architecture

```
[React Frontend :3000]
        |
[Nginx API Gateway :8080]  ← single entry point for all APIs
        |
   ┌────┴──────────────────────────────────────┐
   │                                           │
[User Service]    [Profile Service]    [Auth Service]    [Notification Service]
 FastAPI :8001     FastAPI :8002        Java :8003         FastAPI :8004
 PostgreSQL        PostgreSQL + S3      MySQL + Redis       Kafka consumer
        │                │                   │
        └────────────────┴───────────────────┘
                         │
                    [Kafka Bus]  ← services publish events here
                         │
                [Notification Service]  ← consumes events, sends emails
```

---

## Services Explained

### 1. User Service (FastAPI + PostgreSQL)
**What it does:** Handles core CRUD for user records — name, email, phone, department, role.
**Key patterns:**
- Uses Redis to cache user lists (avoids hitting DB on every request)
- Publishes Kafka events on every create/update/delete
- Other services react to those events — they don't call each other directly

**Kafka topics published:**
- `user.created` → triggers welcome email
- `user.updated` → triggers update notification email
- `user.deleted` → triggers farewell email

### 2. Profile Service (FastAPI + PostgreSQL + AWS S3)
**What it does:** Manages profile pictures and bio/location data separately from core user data.
**Key patterns:**
- Profile pictures upload directly to S3 — never stored in the app
- Returns an S3 URL that the frontend uses to display the image
- Deletes old S3 object when a user uploads a new picture (avoids orphaned files)

**Why separate from User Service?**
In real apps, different services own different data. Profile data changes for different reasons than core user data. This is called the Single Responsibility Principle.

### 3. Auth Service (Java Spring Boot + MySQL + Redis)
**What it does:** Issues JWT tokens, validates them, manages sessions.
**Key patterns:**
- Passwords hashed with BCrypt (never stored in plain text)
- JWT token stored in Redis with 24h expiry — this is the "session"
- When user logs out, token deleted from Redis immediately
- MySQL stores the credential records; Redis stores active sessions

**Why Java?**
Shows you that services can use completely different languages. In real companies, different teams often use different stacks.

### 4. Notification Service (FastAPI + Kafka)
**What it does:** Listens to ALL user events on Kafka and sends emails.
**Key patterns:**
- Never called directly by any other service
- Pure event consumer — it only reacts
- This is decoupling: User Service doesn't know or care who receives its events
- In dev mode (no SMTP config), it logs emails to console

---

## How Services Communicate

### Synchronous (HTTP) — Request/Response
```
Frontend → Nginx → User Service → responds with user data
```
Used when: you need an immediate answer

### Asynchronous (Kafka) — Event-Driven
```
User Service → publishes "user.created" event
Notification Service → consumes event → sends email
```
Used when: the sender doesn't need to wait for the result

### Redis Cache Flow
```
GET /users request
  → Check Redis for "all_users" key
  → If HIT: return cached data (fast, no DB)
  → If MISS: query PostgreSQL, store in Redis, return data
POST /users
  → Create in DB
  → Delete "all_users" cache key (force refresh)
```

---

## Prerequisites

- Docker Desktop (with Docker Compose)
- AWS account with an S3 bucket (for profile pictures)
- Gmail account with App Password (for emails in dev)

---

## Setup

1. Clone and configure environment:
```bash
cd user-management
cp .env.example .env
# Edit .env with your AWS and SMTP credentials

# for example:
# AWS S3 — required for profile picture uploads
AWS_ACCESS_KEY_ID=HDSUHEFHGGBFFR7F8FE # this is fake 
AWS_SECRET_ACCESS_KEY=g+0xksdhihfhfesbrGHGuhvsrhsfruhfsguhiusrt # this is fake 
AWS_S3_BUCKET=my-xxxGT-s3-bucket-xxx
AWS_REGION=us-east-1

# Email — use Gmail App Password or SendGrid
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=johndoe@gmail.com
SMTP_PASSWORD=gbrgbrynhynhynytnyt #this is fake
FROM_EMAIL=noreply@userapp.com
```
<br><br>

During viewing of the users, the profile icon needs to be show on the browser. howeve, the AWS S3 bucket(where the images are stored) are private by default.
we can make the images public using the commands:
```yaml
# Run:
aws s3api put-public-access-block \
  --bucket my-xxx-s3-bucket-xxx \
  --public-access-block-configuration "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

#Run:
aws s3api put-bucket-policy --bucket my-xxx-s3-bucket-xxx --policy '{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::my-xxx-s3-bucket-xxx/*"
    }
  ]
}'

```





2. Start everything:
```bash
docker-compose up --build
```

3. Wait ~90 seconds for all services to start (Java takes longest).

4. Open http://localhost:13000

---

## URLs

| URL | What it is |
|-----|-----------|
| http://localhost:13000 | React Frontend |
| http://localhost:18080/api/users | User Service via Nginx gateway |
| http://localhost:18080/api/profiles/{id} | Profile Service via gateway |
| http://localhost:18080/api/auth/health | Auth Service via gateway |
| http://localhost:18001/docs | User Service Swagger UI (direct) |
| http://localhost:18002/docs | Profile Service Swagger UI (direct) |
| http://localhost:18003 | Auth Service direct |
| http://localhost:18004/docs | Notification Service Swagger UI (direct) |

---

## Learning Guide — What to Study

### Week 1: Understand this app
1. Read each service's `main.py` / Java files top to bottom
2. Test the APIs directly via Swagger UI at `/docs`
3. Run `docker-compose logs -f user-service` and create a user. Watch the Kafka event appear in notification-service logs.

### Week 2: Service communication
1. Create a user → check notification-service logs for the email
2. Find where Redis is used in user-service — understand why
3. Change a user → watch the cache invalidation in logs
4. Look at nginx.conf — understand how routing works

### Week 3: Apply to real app
Ask your team:
1. Which service mesh do they use? (Istio / AWS App Mesh)
2. Read the VirtualService and DestinationRule YAML files
3. Those are like nginx.conf but for Kubernetes with extra features

---

## Kubernetes Next Steps

When you're ready to deploy this to Kubernetes (like your real company uses):

Each service becomes:
- A `Deployment` (runs the Docker container)
- A `Service` (gives it a stable DNS name inside K8s)

Services find each other by K8s DNS:
```
http://user-service.default.svc.cluster.local:8001
```

Instead of our nginx.conf, you'd use:
- An `Ingress` resource (routes external traffic)
- A service mesh `VirtualService` (routes internal traffic with advanced rules)

The code stays the same. Only the infrastructure layer changes.

---

## Stopping the App

```bash
docker-compose down           # stop
docker-compose down -v        # stop and delete all data
docker-compose logs -f        # view all logs
docker-compose logs -f kafka  # view kafka logs only
```


The app is now in a solid state:

<br>✅ Users CRUD working
<br>✅ Profile pictures uploading to S3
<br>✅ Images displaying from S3
<br>✅ Kafka events firing
<br>✅ Emails sending via notification service
<br>✅ S3 cleanup on user delete
<br>✅ Parallel update fix