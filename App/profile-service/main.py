from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import String, DateTime, select
from pydantic import BaseModel
from aiokafka import AIOKafkaProducer, AIOKafkaConsumer
from prometheus_fastapi_instrumentator import Instrumentator
from datetime import datetime, timezone
import boto3, uuid, json, os, asyncio, logging
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
logger = logging.getLogger("profile-service")

# ─── Config ─────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://admin:secret@localhost:5433/profiles_db")
KAFKA_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")

engine = create_async_engine(DATABASE_URL, echo=False)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase): pass

class Profile(Base):
    __tablename__ = "profiles"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, unique=True)
    avatar_url: Mapped[str] = mapped_column(String, nullable=True)
    avatar_s3_key: Mapped[str] = mapped_column(String, nullable=True)
    bio: Mapped[str] = mapped_column(String, nullable=True)
    location: Mapped[str] = mapped_column(String, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class ProfileResponse(BaseModel):
    id: str
    user_id: str
    avatar_url: str | None
    bio: str | None
    location: str | None
    updated_at: datetime
    model_config = {"from_attributes": True}

app = FastAPI(title="Profile Service", version="1.0.0")

Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

kafka_producer: AIOKafkaProducer = None

async def get_db():
    async with SessionLocal() as s:
        yield s

# ─── SAFE Kafka Consumer ───────────────────────────────
async def consume_delete_events():
    while True:
        try:
            consumer = AIOKafkaConsumer(
                "user.deleted",
                bootstrap_servers=KAFKA_SERVERS,
                group_id="profile-service",
                value_deserializer=lambda m: json.loads(m.decode()),
            )
            await consumer.start()

            async for msg in consumer:
                event = msg.value
                user_id = event.get("user_id")

                async with SessionLocal() as db:
                    result = await db.execute(select(Profile).where(Profile.user_id == user_id))
                    profile = result.scalar_one_or_none()

                    if profile:
                        db.delete(profile)
                        await db.commit()
                        logger.info(f"Deleted profile for {user_id}")

        except Exception as e:
            logger.error(f"Kafka error: {e}")
            await asyncio.sleep(5)

@app.on_event("startup")
async def startup():
    global kafka_producer

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    for _ in range(10):
        try:
            kafka_producer = AIOKafkaProducer(bootstrap_servers=KAFKA_SERVERS)
            await kafka_producer.start()
            break
        except:
            await asyncio.sleep(3)

    asyncio.create_task(consume_delete_events())