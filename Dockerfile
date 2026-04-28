# Base image
FROM python:3.11-slim

# Prevent Python buffering issues (important for logs)
ENV PYTHONUNBUFFERED=1

# Set working directory
WORKDIR /app

# Install system dependencies (needed for postgres + builds)
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (better caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy entire project
COPY . .

# Make sure scripts are executable (important for entrypoint scripts)
RUN chmod +x scripts/*.py || true

# Expose FastAPI port
EXPOSE 8000

# Default command (docker-compose overrides this anyway)
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]