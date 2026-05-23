from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import String, DateTime, select
from pydantic import BaseModel
from aiokafka import AIOKafkaProducer, AIOKafkaConsumer
from prometheus_fastapi_instrumentator import Instrumentator
from datetime import datetime, timezone
import boto3, uuid, json, os, asyncio
import logging
from pythonjsonlogger import jsonlogger


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ─── Config ───────────────────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://admin:secret@localhost:5433/profiles_db")
KAFKA_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
AWS_ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
S3_BUCKET = os.getenv("AWS_S3_BUCKET", "my-user-profiles")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")

# ─── Database ─────────────────────────────────────────────────────────
engine = create_async_engine(DATABASE_URL, echo=False)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase): pass

class Profile(Base):
    __tablename__ = "profiles"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(100), unique=True)
    avatar_url: Mapped[str] = mapped_column(String(500), nullable=True)
    avatar_s3_key: Mapped[str] = mapped_column(String(300), nullable=True)
    bio: Mapped[str] = mapped_column(String(1000), nullable=True)
    location: Mapped[str] = mapped_column(String(200), nullable=True)
    # updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class ProfileResponse(BaseModel):
    id: str
    user_id: str
    avatar_url: str | None
    bio: str | None
    location: str | None
    updated_at: datetime
    model_config = {"from_attributes": True}

# ─── S3 Helper ────────────────────────────────────────────────────────
def get_s3_client():
    return boto3.client(
        "s3",
        aws_access_key_id=AWS_ACCESS_KEY,
        aws_secret_access_key=AWS_SECRET_KEY,
        region_name=AWS_REGION,
    )

async def upload_to_s3(file: UploadFile, user_id: str) -> tuple[str, str]:
    """Upload file to S3, return (public_url, s3_key)."""
    ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    key = f"profiles/{user_id}/{uuid.uuid4()}.{ext}"
    content = await file.read()

    s3 = get_s3_client()
    s3.put_object(
        Bucket=S3_BUCKET,
        Key=key,
        Body=content,
        ContentType=file.content_type or "image/jpeg",
    )
    url = f"https://{S3_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{key}"
    return url, key

def delete_from_s3(key: str):
    """Delete old profile picture from S3."""
    try:
        s3 = get_s3_client()
        s3.delete_object(Bucket=S3_BUCKET, Key=key)
    except Exception:
        pass  # Non-critical

# ─── App ──────────────────────────────────────────────────────────────
app = FastAPI(title="Profile Service", version="1.0.0")
Instrumentator().instrument(app).expose(app)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

kafka_producer: AIOKafkaProducer = None

async def get_db():
    async with SessionLocal() as session:
        yield session
# /////////////////// Cleanup on shutdown //////////////////
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
        except Exception:
            await asyncio.sleep(3)
    # Start the delete event consumer in background
    asyncio.create_task(consume_delete_events())


# @app.on_event("startup")
# async def startup():
#     global kafka_producer
#     async with engine.begin() as conn:
#         await conn.run_sync(Base.metadata.create_all)
#     for _ in range(10):
#         try:
#             kafka_producer = AIOKafkaProducer(bootstrap_servers=KAFKA_SERVERS)
#             await kafka_producer.start()
#             break
#         except Exception:
#             await asyncio.sleep(3)
# /////////////////// Cleanup on shutdown //////////////////
async def consume_delete_events():
    """Listen for user.deleted events and clean up S3."""
    for attempt in range(15):
        try:
            consumer = AIOKafkaConsumer(
                "user.deleted",
                bootstrap_servers=KAFKA_SERVERS,
                group_id="profile-service-cleanup-group",
                value_deserializer=lambda m: json.loads(m.decode()),
                auto_offset_reset="earliest",
            )
            await consumer.start()
            async for message in consumer:
                event = message.value
                user_id = event.get("user_id")
                if not user_id:
                    continue

                # Find and delete the profile + S3 object
                async with SessionLocal() as db:
                    result = await db.execute(
                        select(Profile).where(Profile.user_id == user_id)
                    )
                    profile = result.scalar_one_or_none()
                    if profile:
                        if profile.avatar_s3_key:
                            delete_from_s3(profile.avatar_s3_key)
                        await db.delete(profile)
                        await db.commit()
                        logger.info(f"Cleaned up profile and S3 for deleted user {user_id}")
        except Exception as e:
            logger.warning(f"Delete consumer attempt {attempt + 1} failed: {e}")
            await asyncio.sleep(5)

# /////////////////// Cleanup on shutdown //////////////////
@app.on_event("shutdown")
async def shutdown():
    if kafka_producer:
        await kafka_producer.stop()

# ─── Routes ───────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "service": "profile-service"}

@app.get("/profiles/{user_id}", response_model=ProfileResponse)
async def get_profile(user_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Profile).where(Profile.user_id == user_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile

@app.post("/profiles/{user_id}/avatar", response_model=ProfileResponse)
async def upload_avatar(
    user_id: str,
    file: UploadFile = File(...),
    bio: str = Form(None),
    location: str = Form(None),
    db: AsyncSession = Depends(get_db)
):
    # Validate file type
    allowed = {"image/jpeg", "image/png", "image/webp", "image/gif"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP, or GIF allowed")

    # Upload to S3
    avatar_url, s3_key = await upload_to_s3(file, user_id)

    # Find or create profile
    result = await db.execute(select(Profile).where(Profile.user_id == user_id))
    profile = result.scalar_one_or_none()

    if profile:
        # Delete old S3 object
        if profile.avatar_s3_key:
            delete_from_s3(profile.avatar_s3_key)
        profile.avatar_url = avatar_url
        profile.avatar_s3_key = s3_key
        if bio is not None: profile.bio = bio
        if location is not None: profile.location = location
        profile.updated_at = datetime.now(timezone.utc)
    else:
        profile = Profile(
            user_id=user_id,
            avatar_url=avatar_url,
            avatar_s3_key=s3_key,
            bio=bio,
            location=location,
        )
        db.add(profile)

    await db.commit()
    await db.refresh(profile)

    # Notify other services
    if kafka_producer:
        await kafka_producer.send_and_wait("user.updated", json.dumps({
            "user_id": user_id,
            "action": "avatar_updated",
            "avatar_url": avatar_url,
        }).encode())

    return profile

@app.put("/profiles/{user_id}", response_model=ProfileResponse)
async def update_profile(
    user_id: str,
    bio: str = Form(None),
    location: str = Form(None),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Profile).where(Profile.user_id == user_id))
    profile = result.scalar_one_or_none()

    if not profile:
        profile = Profile(user_id=user_id, bio=bio, location=location)
        db.add(profile)
    else:
        if bio is not None: profile.bio = bio
        if location is not None: profile.location = location
        profile.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(profile)
    return profile

@app.delete("/profiles/{user_id}/avatar", status_code=204)
async def delete_avatar(user_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Profile).where(Profile.user_id == user_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    if profile.avatar_s3_key:
        delete_from_s3(profile.avatar_s3_key)
    profile.avatar_url = None
    profile.avatar_s3_key = None
    profile.updated_at = datetime.now(timezone.utc)
    await db.commit()
