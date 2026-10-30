# ---- Builder ----
FROM rust:1.90-slim-bookworm AS builder

WORKDIR /app

# System deps for building (rustls needs no OpenSSL; keep minimal).
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Cache dependencies: copy manifests + ABI (needed by the sol! macro) first.
COPY Cargo.toml ./
COPY abi ./abi
COPY migrations ./migrations
COPY src ./src

RUN cargo build --release --locked || cargo build --release

# ---- Runtime ----
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/target/release/dlottery-backend /usr/local/bin/dlottery-backend

EXPOSE 8080
ENV RUST_LOG=info,dlottery_backend=debug,sqlx=warn

ENTRYPOINT ["/usr/local/bin/dlottery-backend"]
