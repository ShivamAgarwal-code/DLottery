# Runs a local Hardhat node and deploys USD8 + DLottery with deterministic addresses.
# Intended for local/demo stacks via docker-compose (not a production chain).
FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx hardhat compile

EXPOSE 8545

ENTRYPOINT ["sh", "docker-entrypoint.sh"]
