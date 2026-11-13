FROM node:22-bookworm-slim
WORKDIR /app
COPY frame-lab/package.json frame-lab/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY frame-lab/ ./
ENV NODE_ENV=production FRAME_LAB_HOST=0.0.0.0 PORT=8791
EXPOSE 8791
# Supply FRAME_LAB_KEY and private FRAME_LAB_DATA_DIR via container secrets/mount.
CMD ["node","server.mjs"]
