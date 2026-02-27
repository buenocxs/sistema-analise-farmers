"""Seed script: creates admin user and default alert config."""
import asyncio
import sys
import os

# Add parent dir to path so we can import app modules
sys.path.insert(0, os.path.dirname(__file__))

from sqlalchemy import select
from app.database import async_session, engine
from app.models import User, AlertConfig
from app.auth import hash_password


async def seed():
    async with async_session() as db:
        # Admin user
        result = await db.execute(select(User).where(User.email == "admin@mave.com.br"))
        if not result.scalar_one_or_none():
            admin = User(
                email="admin@mave.com.br",
                name="Administrador",
                password_hash=hash_password("admin123"),
                role="gestor_comercial",
                is_active=True,
            )
            db.add(admin)
            print("Admin user created: admin@mave.com.br / admin123")
        else:
            print("Admin user already exists")

        # Default alert config
        result = await db.execute(select(AlertConfig).where(AlertConfig.id == 1))
        if not result.scalar_one_or_none():
            config = AlertConfig(id=1, max_response_time=300, days_without_follow_up=3, unhandled_objection_hours=24)
            db.add(config)
            print("Default alert config created")
        else:
            print("Alert config already exists")

        await db.commit()
    print("Seed complete!")


if __name__ == "__main__":
    asyncio.run(seed())
