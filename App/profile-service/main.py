from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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

# ─── Config ──────────────────────────────────────────────
DATABASE_URL = os.environ["DATABASE_URL"]
KAFKA_SERVERS = os.environ["KAFKA_BOOTSTRAP_SERVERS"]
AWS_ACCESS_KEY = os.environ["AWS_ACCESS_KEY_ID"]
AWS_SECRET_KEY = os.environ["AWS_SECRET_ACCESS_KEY"]
S3_BUCKET = os.environ["AWS_S3_BUCKET"]
AWS_REGION = os.environ["AWS_REGION"]

# ─── DB ──────────────────────────────────────────────────
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

# ─── App ─────────────────────────────────────────────────
app = FastAPI(title="Profile Service", version="1.0.0")

Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

kafka_producer: AIOKafkaProducer = None

# ─── S3 Client ───────────────────────────────────────────
def get_s3():
    return boto3.client(
        "s3",
        region_name=AWS_REGION,
        aws_access_key_id=AWS_ACCESS_KEY,
        aws_secret_access_key=AWS_SECRET_KEY,
    )

# ─── Dependencies ────────────────────────────────────────
async def get_db():
    async with SessionLocal() as s:
        yield s

# ─── Kafka Consumer ──────────────────────────────────────
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
                        # delete avatar from S3 if exists
                        if profile.avatar_s3_key:
                            try:
                                get_s3().delete_object(Bucket=S3_BUCKET, Key=profile.avatar_s3_key)
                            except Exception as e:
                                logger.error(f"S3 delete error: {e}")

                        await db.delete(profile)
                        await db.commit()
                        logger.info(f"Deleted profile for {user_id}")

        except Exception as e:
            logger.error(f"Kafka consumer error: {e}")
            await asyncio.sleep(5)

# ─── Startup / Shutdown ──────────────────────────────────
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
        except Exception as e:
            logger.warning(f"Kafka retry: {e}")
            await asyncio.sleep(3)

    asyncio.create_task(consume_delete_events())

@app.on_event("shutdown")
async def shutdown():
    if kafka_producer:
        await kafka_producer.stop()

# ─── Routes ──────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "service": "profile-service"}

@app.get("/profiles/{user_id}", response_model=ProfileResponse)
async def get_profile(user_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Profile).where(Profile.user_id == user_id))
    profile = result.scalar_one_or_none()
    if not profile:
        # auto-create empty profile if not exists
        profile = Profile(user_id=user_id)
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
    return profile

@app.post("/profiles/{user_id}/avatar", response_model=ProfileResponse)
async def upload_avatar(
    user_id: str,
    file: UploadFile = File(...),
    bio: str = Form(None),
    location: str = Form(None),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Profile).where(Profile.user_id == user_id))
    profile = result.scalar_one_or_none()
    if not profile:
        profile = Profile(user_id=user_id)
        db.add(profile)

    # delete old avatar from S3
    if profile.avatar_s3_key:
        try:
            get_s3().delete_object(Bucket=S3_BUCKET, Key=profile.avatar_s3_key)
        except Exception as e:
            logger.warning(f"Could not delete old avatar: {e}")

    # upload new avatar to S3
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "jpg"
    s3_key = f"profiles/{user_id}/{uuid.uuid4()}.{ext}"
    content = await file.read()

    try:
        get_s3().put_object(
            Bucket=S3_BUCKET,
            Key=s3_key,
            Body=content,
            ContentType=file.content_type,
        )
    except Exception as e:
        logger.error(f"S3 upload error: {e}")
        raise HTTPException(500, f"S3 upload failed: {str(e)}")

    avatar_url = f"https://{S3_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{s3_key}"

    profile.avatar_url = avatar_url
    profile.avatar_s3_key = s3_key
    profile.updated_at = datetime.now(timezone.utc)
    if bio is not None:
        profile.bio = bio
    if location is not None:
        profile.location = location

    await db.commit()
    await db.refresh(profile)
    return profile

@app.put("/profiles/{user_id}", response_model=ProfileResponse)
async def update_profile(
    user_id: str,
    bio: str = Form(None),
    location: str = Form(None),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Profile).where(Profile.user_id == user_id))
    profile = result.scalar_one_or_none()
    if not profile:
        profile = Profile(user_id=user_id)
        db.add(profile)

    if bio is not None:
        profile.bio = bio
    if location is not None:
        profile.location = location
    profile.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(profile)
    return profile

@app.delete("/profiles/{user_id}/avatar", response_model=ProfileResponse)
async def delete_avatar(user_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Profile).where(Profile.user_id == user_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(404, "Profile not found")

    if profile.avatar_s3_key:
        try:
            get_s3().delete_object(Bucket=S3_BUCKET, Key=profile.avatar_s3_key)
        except Exception as e:
            logger.warning(f"S3 delete error: {e}")

    profile.avatar_url = None
    profile.avatar_s3_key = None
    profile.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(profile)
    return profile