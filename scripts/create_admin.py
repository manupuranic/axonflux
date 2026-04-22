"""
One-time script to create the first admin user.
Run from anywhere in the project:
    python scripts/create_admin.py
"""
import getpass
import sys
from pathlib import Path

# Add project root to sys.path so imports work from any directory
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from api.core.security import hash_password
from api.models.app import AppUser
from config.db import SessionLocal


def main():
    print("Create AxonFlux admin user")
    username = input("Username: ").strip()
    full_name = input("Full name (optional): ").strip() or None
    password = getpass.getpass("Password: ")
    confirm = getpass.getpass("Confirm password: ")

    if password != confirm:
        print("Passwords do not match.")
        sys.exit(1)

    session = SessionLocal()
    try:
        existing = session.query(AppUser).filter(AppUser.username == username).first()
        if existing:
            print(f"User '{username}' already exists.")
            sys.exit(1)

        user = AppUser(
            username=username,
            full_name=full_name,
            hashed_password=hash_password(password),
            role="admin",
            is_active=True,
        )
        session.add(user)
        session.commit()
        print(f"Admin user '{username}' created successfully.")
    except Exception as e:
        session.rollback()
        print(f"Error: {e}")
        sys.exit(1)
    finally:
        session.close()


if __name__ == "__main__":
    main()
