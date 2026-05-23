from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from aiokafka import AIOKafkaConsumer
import smtplib, ssl, json, os, asyncio, logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from prometheus_fastapi_instrumentator import Instrumentator
from pythonjsonlogger import jsonlogger

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

KAFKA_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")

app = FastAPI(title="Notification Service")

Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def send_email(to_email, name, action):
    logger.info(f"Email sent simulation: {to_email} - {action}")

async def consume_events():
    while True:
        try:
            consumer = AIOKafkaConsumer(
                "user.created",
                "user.updated",
                "user.deleted",
                bootstrap_servers=KAFKA_SERVERS,
                group_id="notification-service",
                value_deserializer=lambda m: json.loads(m.decode()),
            )
            await consumer.start()

            async for msg in consumer:
                event = msg.value
                name = event.get("name", "User")
                email = event.get("email")
                action = event.get("action")

                if email:
                    send_email(email, name, action)

        except Exception as e:
            logger.error(f"Kafka error: {e}")
            await asyncio.sleep(5)

@app.on_event("startup")
async def startup():
    asyncio.create_task(consume_events())

@app.get("/health")
async def health():
    return {"status": "ok"}