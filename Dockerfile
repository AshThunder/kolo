# Kolo API + keeper + scanner + CCTP relayer (Bun). Build context is whitelisted by .dockerignore.
FROM oven/bun:1.3-slim
WORKDIR /app
COPY server/package.json ./package.json
RUN bun install --production --no-save
COPY server/src ./server/src
COPY src/network.ts src/addresses.ts ./src/
COPY src/abi ./src/abi
ENV NODE_ENV=production KOLO_NETWORK=mainnet PORT=8080 \
    KOLO_META_FILE=/data/meta.json KOLO_PAYEES_FILE=/data/payees.json \
    KOLO_APPLICATIONS_FILE=/data/applications.json KOLO_CCTP_FILE=/data/cctp.json
EXPOSE 8080
CMD ["bun", "run", "server/src/index.ts"]
