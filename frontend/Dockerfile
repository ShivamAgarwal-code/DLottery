# ---- Build ----
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Build-time config (browser talks to host-mapped ports). Override with build args.
ARG VITE_CHAIN_ID=31337
ARG VITE_RPC_URL=http://localhost:8545
ARG VITE_USD8_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
ARG VITE_CONTRACT_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
ARG VITE_BACKEND_URL=http://localhost:8080
ENV VITE_CHAIN_ID=$VITE_CHAIN_ID \
    VITE_RPC_URL=$VITE_RPC_URL \
    VITE_USD8_ADDRESS=$VITE_USD8_ADDRESS \
    VITE_CONTRACT_ADDRESS=$VITE_CONTRACT_ADDRESS \
    VITE_BACKEND_URL=$VITE_BACKEND_URL
RUN npm run build

# ---- Serve ----
FROM nginx:1.27-alpine AS serve
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
