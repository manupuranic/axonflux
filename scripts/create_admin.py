"""
Create the first AxonFlux admin user.

Two modes:

  Non-interactive (Docker entrypoint / CI):
    Set ADMIN_USERNAME and ADMIN_PASSWORD in environment.
    Script creates the user if it doesn't exist, silently skips if it does.
    Exit 0 in both cases — safe to run on every startup.

  Interactive (manual one-time setup):
    Run without those env vars and it prompts for credentials.
    python scripts/create_admin.py
"""
import getpass
import os
import sys
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from api.core.security import hash_password
from api.models.app import AppUser
from config.db import SessionLocal


def _create_user(username: str, password: str, full_name: str | None) -> None:
    session = SessionLocal()
    try:
        existing = session.query(AppUser).filter(AppUser.username == username).first()
        if existing:
            print(f"[create_admin] User '{username}' already exists — skipping.")
            return
        user = AppUser(
            username=username,
            full_name=full_name,
            hashed_password=hash_password(password),
            role="admin",
            is_active=True,
        )
        session.add(user)
        session.commit()
        print(f"[create_admin] Admin user '{username}' created.")
    except Exception as e:
        session.rollback()
        print(f"[create_admin] Error: {e}")
        sys.exit(1)
    finally:
        session.close()


def main() -> None:
    username = os.getenv("ADMIN_USERNAME", "").strip()
    password = os.getenv("ADMIN_PASSWORD", "").strip()

    if username and password:
        _create_user(username, password, full_name=None)
        return

    # Interactive fallback
    print("Create AxonFlux admin user")
    username = input("Username: ").strip()
    full_name = input("Full name (optional): ").strip() or None
    password = getpass.getpass("Password: ")
    confirm = getpass.getpass("Confirm password: ")

    if password != confirm:
        print("Passwords do not match.")
        sys.exit(1)

    _create_user(username, password, full_name)


if __name__ == "__main__":
    main()
