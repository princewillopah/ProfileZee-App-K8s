from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from aiokafka import AIOKafkaConsumer
from prometheus_fastapi_instrumentator import Instrumentator
from pythonjsonlogger import jsonlogger
import smtplib, ssl, json, os, asyncio, logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# ─── Logging ─────────────────────────────────────────────
def setup_logging():
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)
    handler = logging.StreamHandler()
    handler.setFormatter(jsonlogger.JsonFormatter("%(asctime)s %(levelname)s %(message)s"))
    logger.handlers.clear()
    logger.addHandler(handler)

setup_logging()
logger = logging.getLogger("notification-service")

# ─── Config ──────────────────────────────────────────────
KAFKA_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", "noreply@userapp.com")

# ─── App ─────────────────────────────────────────────────
app = FastAPI(title="Notification Service", version="1.0.0")

Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ─── Email Templates ─────────────────────────────────────
def build_email(action: str, name: str, email: str) -> tuple[str, str]:
    templates = {
        "created": (
            "Welcome to UserApp! 🎉",
            f"""
            <h2>Welcome, {name}!</h2>
            <p>Your account has been successfully created.</p>
            <p>You can now log in and complete your profile.</p>
            <br><p>– The UserApp Team</p>
            """
        ),
        "updated": (
            "Your profile was updated",
            f"""
            <h2>Hello {name},</h2>
            <p>Your profile information was recently updated.</p>
            <p>If you did not make this change, please contact support immediately.</p>
            <br><p>– The UserApp Team</p>
            """
        ),
        "avatar_updated": (
            "Profile picture updated",
            f"""
            <h2>Hello {name},</h2>
            <p>Your profile picture has been updated successfully.</p>
            <br><p>– The UserApp Team</p>
            """
        ),
        "deleted": (
            "Your account has been deleted",
            f"""
            <h2>Hello {name},</h2>
            <p>Your account has been permanently deleted from our system.</p>
            <p>We're sorry to see you go. If this was a mistake, please contact support.</p>
            <br><p>– The UserApp Team</p>
            """
        ),
    }
    return templates.get(action, ("Account notification", f"<p>Hello {name}, your account status has changed.</p>"))

# ─── Email Sender ────────────────────────────────────────
def send_email(to_email: str, name: str, action: str):
    subject, html_body = build_email(action, name, to_email)

    if not SMTP_USER or not SMTP_PASSWORD:
        logger.info(f"[EMAIL - DEV MODE] To: {to_email} | Subject: {subject}")
        logger.info(f"Body preview: {html_body[:120]}")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = FROM_EMAIL
    msg["To"] = to_email
    msg.attach(MIMEText(html_body, "html"))

    try:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(SMTP_HOST, 465, context=context) as server:  # ← changed
            server.login(SMTP_USER, SMTP_PASSWORD)                          # ← no starttls
            server.sendmail(FROM_EMAIL, to_email, msg.as_string())
        logger.info(f"Email sent to {to_email} for action: {action}")
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
    # try:
    #     context = ssl.create_default_context()
    #     with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
    #         server.ehlo()
    #         server.starttls(context=context)
    #         server.login(SMTP_USER, SMTP_PASSWORD)
    #         server.sendmail(FROM_EMAIL, to_email, msg.as_string())
    #     logger.info(f"Email sent to {to_email} for action: {action}")
    # except Exception as e:
    #     logger.error(f"Failed to send email to {to_email}: {e}")

# ─── Kafka Consumer ──────────────────────────────────────
async def consume_kafka_events():
    for attempt in range(15):
        try:
            consumer = AIOKafkaConsumer(
                "user.created",
                "user.updated",
                "user.deleted",
                bootstrap_servers=KAFKA_SERVERS,
                group_id="notification-service-group",
                value_deserializer=lambda m: json.loads(m.decode()),
                auto_offset_reset="earliest",
            )
            await consumer.start()
            logger.info("Kafka consumer started — listening for user events")

            async for message in consumer:
                event = message.value
                logger.info(f"Received event on topic '{message.topic}': {event}")

                name = event.get("name", "User")
                email = event.get("email")
                action = event.get("action", "updated")

                if email:
                    send_email(email, name, action)

        except Exception as e:
            logger.warning(f"Kafka connection attempt {attempt + 1} failed: {e}")
            await asyncio.sleep(5)

# ─── Lifecycle ───────────────────────────────────────────
@app.on_event("startup")
async def startup():
    asyncio.create_task(consume_kafka_events())

@app.get("/health")
async def health():
    return {"status": "ok", "service": "notification-service"}

@app.get("/")
async def root():
    return {"message": "Notification Service is running. Consuming Kafka events."}