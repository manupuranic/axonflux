import os
from logging.config import fileConfig
from urllib.parse import quote_plus

from alembic import context
from dotenv import load_dotenv
from sqlalchemy import create_engine, pool, text

load_dotenv()

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Import all models so Alembic can see the metadata.
# Only app.* schema — raw.*, derived.*, recon.* are managed by the pipeline.
from api.models.app import AppBase  # noqa: F401, E402
import api.tools.cash_closure.models  # noqa: F401, E402
import api.tools.pamphlets.models     # noqa: F401, E402

target_metadata = AppBase.metadata

# Build DATABASE_URL from .env (same pattern as config/db.py)
_user = os.getenv("user")
_password = quote_plus(os.getenv("password", ""))
_host = os.getenv("host", "localhost")
_port = os.getenv("port", "5432")
_dbname = os.getenv("dbname")
DATABASE_URL = f"postgresql+psycopg2://{_user}:{_password}@{_host}:{_port}/{_dbname}"


def include_object(object, name, type_, reflected, compare_to):
    """Only manage objects in the app schema; ignore raw/derived/recon."""
    if type_ == "table":
        return object.schema == "app"
    return True


def run_migrations_offline() -> None:
    context.configure(
        url=DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_schemas=True,
        include_object=include_object,
        version_table_schema="app",
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(DATABASE_URL, poolclass=pool.NullPool)
    with engine.connect() as connection:
        # Bootstrap: ensure app schema exists before Alembic tries to read/write
        # the version table (app.alembic_version). Safe on re-runs — IF NOT EXISTS.
        connection.execute(text("CREATE SCHEMA IF NOT EXISTS app"))
        connection.commit()

        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_schemas=True,
            include_object=include_object,
            version_table_schema="app",
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
