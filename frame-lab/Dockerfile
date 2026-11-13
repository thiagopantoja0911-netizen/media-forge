FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY frame-lab/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY frame-lab/ ./
ENV NODE_ENV=production FRAME_LAB_HOST=0.0.0.0 PORT=8791
EXPOSE 8791
CMD ["node","server.mjs"]
