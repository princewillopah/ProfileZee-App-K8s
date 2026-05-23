import asyncio
import httpx
import os
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

USER_SERVICE_URL = os.getenv("USER_SERVICE_URL", "http://localhost:8001")
AUTH_SERVICE_URL = os.getenv("AUTH_SERVICE_URL", "http://auth-service:8003")

ADMIN_USER = {
    "name": "Popo Ola",
    "email": "admin@userapp.com",
    "phone": "08076543256",
    "department": "IT",
    "role": "superadmin",
}
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "Admin@1234")


async def seed():
    async with httpx.AsyncClient(timeout=30) as client:

        # Wait for user-service to be ready
        for attempt in range(20):
            try:
                r = await client.get(f"{USER_SERVICE_URL}/health")
                if r.status_code == 200:
                    break
            except Exception:
                pass
            logger.info(f"Waiting for user-service... attempt {attempt + 1}")
            await asyncio.sleep(3)

        # Check if admin already exists
        try:
            r = await client.get(f"{USER_SERVICE_URL}/users")
            users = r.json()
            if any(u["email"] == ADMIN_USER["email"] for u in users):
                logger.info("Admin already exists — skipping seed")
                return
        except Exception as e:
            logger.error(f"Could not check existing users: {e}")
            return

        # Create admin user
        try:
            r = await client.post(f"{USER_SERVICE_URL}/users", json=ADMIN_USER)
            r.raise_for_status()
            user_id = r.json()["id"]
            logger.info(f"Admin user created with id {user_id}")
        except Exception as e:
            logger.error(f"Failed to create admin user: {e}")
            return

        # Register auth credentials
        for attempt in range(10):
            try:
                r = await client.post(
                    f"{AUTH_SERVICE_URL}/auth/register",
                    json={
                        "userId": user_id,
                        "email": ADMIN_USER["email"],
                        "password": ADMIN_PASSWORD,
                        "role": "admin",
                    },
                )
                r.raise_for_status()
                logger.info("Admin auth credentials registered successfully")
                return
            except Exception as e:
                logger.warning(f"Auth register attempt {attempt + 1} failed: {e}")
                await asyncio.sleep(3)

        logger.error("Failed to register admin auth credentials after retries")


if __name__ == "__main__":
    asyncio.run(seed())