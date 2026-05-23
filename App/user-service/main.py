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

# ─── Logging (FIXED) ─────────────────────────────────────────────
def setup_logging():
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)

    handler = logging.StreamHandler()
    formatter = jsonlogger.JsonFormatter(
        "%(asctime)s %(levelname)s %(name)s %(message)s"
    )

    handler.setFormatter(formatter)
    logger.handlers.clear()
    logger.addHandler(handler)

setup_logging()
logger = logging.getLogger("user-service")

# ─── Config ──────────────────────────────────────────────────────
DATABASE_URL = os.environ["DATABASE_URL"]
KAFKA_SERVERS = os.environ["KAFKA_BOOTSTRAP_SERVERS"]
REDIS_URL = os.environ["REDIS_URL"]

# ─── DB ─────────────────────────────────────────────────────────
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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

# ─── Schemas ─────────────────────────────────────────────────────
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

# ─── App ─────────────────────────────────────────────────────────
app = FastAPI(title="User Service", version="1.0.0")

Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

kafka_producer: AIOKafkaProducer = None
redis_client = None

# ─── DB Dependency ───────────────────────────────────────────────
async def get_db():
    async with SessionLocal() as session:
        yield session

# ─── Kafka Helper ────────────────────────────────────────────────
async def publish_event(topic: str, data: dict):
    if kafka_producer:
        await kafka_producer.send_and_wait(topic, json.dumps(data).encode())

# ─── Startup / Shutdown ──────────────────────────────────────────
@app.on_event("startup")
async def startup():
    global kafka_producer, redis_client

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

    redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)

@app.on_event("shutdown")
async def shutdown():
    if kafka_producer:
        await kafka_producer.stop()

# ─── Routes ──────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "service": "user-service"}

@app.post("/users", response_model=UserResponse, status_code=201)
async def create_user(data: UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none():
        raise HTTPException(400, "Email already registered")

    user = User(**data.model_dump())
    db.add(user)
    await db.commit()
    await db.refresh(user)

    if redis_client:
        await redis_client.delete("all_users")

    await publish_event("user.created", {
        "user_id": user.id,
        "name": user.name,
        "email": user.email,
        "action": "created"
    })

    return user

@app.get("/users", response_model=list[UserResponse])
async def list_users(db: AsyncSession = Depends(get_db)):
    if redis_client:
        cached = await redis_client.get("all_users")
        if cached:
            return json.loads(cached)

    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()

    data = [UserResponse.model_validate(u).model_dump(mode="json") for u in users]

    if redis_client:
        await redis_client.setex("all_users", 60, json.dumps(data))

    return data