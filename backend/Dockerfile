FROM python:3.11-slim

WORKDIR /app

# 安装系统依赖（kreuzberg 需要 libmagic）
RUN apt-get update && apt-get install -y --no-install-recommends \
    libmagic1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 先装 CPU-only torch，避免 sentence-transformers 默认拉下 ~10GB CUDA/NVIDIA 死重（Oracle 无 GPU）
# Install CPU-only torch first — Oracle Free Tier has no GPU, default CUDA torch wheel pulls ~10GB of unused deps
RUN pip install --no-cache-dir torch==2.10.0 --index-url https://download.pytorch.org/whl/cpu

# 先复制依赖文件，利用 Docker 缓存层
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制源码
COPY . .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
