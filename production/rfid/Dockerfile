FROM node:22-bookworm-slim
WORKDIR /app/production/rfid
COPY production/rfid/package*.json ./
RUN npm ci --omit=dev
COPY production/rfid/*.cjs ./
COPY scripts/check-in-verifier.cjs scripts/signed-rfid-check-in.cjs /app/scripts/
USER node
ENV NODE_ENV=production
CMD ["node", "server.cjs"]
