from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import String, DateTime, select
from pydantic import BaseModel, EmailStr
from aiokafka import AIOKafkaProducer
from datetime import datetime, timezone
from prometheus_fastapi_instrumentator import Instrumentator
import uuid, json, os, asyncio, redis.asyncio as aioredis
import logging
from pythonjsonlogger import jsonlogger
import time
from contextlib import asynccontextmanager
# from prometheus_fastapi_instrumentator import Instrumentator

# ─── Config ───────────────────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://admin:secret@localhost:5432/users_db")
KAFKA_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

# ─── Database ─────────────────────────────────────────────────────────
engine = create_async_engine(DATABASE_URL, echo=False)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase): pass

class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(200), unique=True)
    phone: Mapped[str] = mapped_column(String(20), nullable=True)
    department: Mapped[str] = mapped_column(String(100), nullable=True)
    role: Mapped[str] = mapped_column(String(50), default="member")
    # created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    # updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
# ─── Schemas ───────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    name: str
    email: EmailStr
    phone: str | None = None
    department: str | None = None
    role: str = "member"

class UserUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    department: str | None = None
    role: str | None = None

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    phone: str | None
    department: str | None
    role: str
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

# ─── App ──────────────────────────────────────────────────────────────
app = FastAPI(title="User Service", version="1.0.0")
Instrumentator().instrument(app).expose(app)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

kafka_producer: AIOKafkaProducer = None
redis_client = None

async def get_db():
    async with SessionLocal() as session:
        yield session

async def publish_event(topic: str, data: dict):
    """Publish an event to Kafka so other services react to it."""
    if kafka_producer:
        await kafka_producer.send_and_wait(topic, json.dumps(data).encode())

@app.on_event("startup")
async def startup():
    global kafka_producer, redis_client
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Retry Kafka connection (it may take a moment to start)
    for _ in range(10):
        try:
            kafka_producer = AIOKafkaProducer(bootstrap_servers=KAFKA_SERVERS)
            await kafka_producer.start()
            break
        except Exception:
            await asyncio.sleep(3)
    redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)

@app.on_event("shutdown")
async def shutdown():
    if kafka_producer:
        await kafka_producer.stop()

# ─── Routes ───────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "service": "user-service"}

@app.post("/users", response_model=UserResponse, status_code=201)
async def create_user(data: UserCreate, db: AsyncSession = Depends(get_db)):
    # Check duplicate email
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(**data.model_dump())
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Invalidate cache
    if redis_client:
        await redis_client.delete("all_users")

    # Publish event — Notification Service will pick this up
    await publish_event("user.created", {
        "user_id": user.id,
        "name": user.name,
        "email": user.email,
        "action": "created"
    })

    return user

@app.get("/users", response_model=list[UserResponse])
async def list_users(db: AsyncSession = Depends(get_db)):
    # Try Redis cache first
    if redis_client:
        cached = await redis_client.get("all_users")
        if cached:
            return json.loads(cached)

    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    users_data = [UserResponse.model_validate(u).model_dump(mode="json") for u in users]

    # Cache for 60 seconds
    if redis_client:
        await redis_client.setex("all_users", 60, json.dumps(users_data))

    return users_data

@app.get("/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: str, db: AsyncSession = Depends(get_db)):
    # Check Redis first
    if redis_client:
        cached = await redis_client.get(f"user:{user_id}")
        if cached:
            return json.loads(cached)

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user_data = UserResponse.model_validate(user).model_dump(mode="json")
    if redis_client:
        await redis_client.setex(f"user:{user_id}", 120, json.dumps(user_data))
    return user

@app.put("/users/{user_id}", response_model=UserResponse)
@app.put("/users/{user_id}", response_model=UserResponse)
async def update_user(user_id: str, data: UserUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Protect superadmin from being edited
    if user.role == "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin cannot be modified")

    # Prevent role from being changed to superadmin via API
    if data.role == "superadmin":
        raise HTTPException(status_code=403, detail="Cannot assign superadmin role")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(user, field, value)
    user.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(user)

    if redis_client:
        await redis_client.delete(f"user:{user_id}", "all_users")

    await publish_event("user.updated", {
        "user_id": user.id,
        "name": user.name,
        "email": user.email,
        "action": "updated"
    })

    return user

@app.delete("/users/{user_id}", status_code=204)
@app.delete("/users/{user_id}", status_code=204)
async def delete_user(user_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Protect superadmin from being deleted by anyone
    if user.role == "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin cannot be deleted")

    email = user.email
    name = user.name
    await db.delete(user)
    await db.commit()

    if redis_client:
        await redis_client.delete(f"user:{user_id}", "all_users")

    await publish_event("user.deleted", {
        "user_id": user_id,
        "name": name,
        "email": email,
        "action": "deleted"
    })