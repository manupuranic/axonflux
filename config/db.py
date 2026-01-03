from urllib.parse import quote_plus
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()

user = os.getenv("user")
password = quote_plus(os.getenv("password"))
host = os.getenv("host")
port = os.getenv("port")
dbname = os.getenv("dbname")

DATABASE_URL = (
    f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{dbname}"
)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    future=True
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    future=True
)
