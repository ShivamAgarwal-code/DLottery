//! DLottery backend: blockchain event indexer + REST query service (PRD section 3).
//!
//! The backend is a passive indexer: it never determines lottery results or controls
//! funds. It listens to contract events, maintains lottery history in Postgres, and serves
//! read-only query APIs.

mod api;
mod config;
mod contract;
mod db;
mod indexer;
mod models;
mod rpc;

use anyhow::Result;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

#[tokio::main]
async fn main() -> Result<()> {
    // BE-06: production-ready structured logging controlled by RUST_LOG.
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| {
            EnvFilter::new("info,dlottery_backend=debug,sqlx=warn")
        }))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load .env when present (local/dev); in containers env vars are injected directly.
    let _ = dotenvy::dotenv();

    let cfg = config::Config::from_env()?;
    info!(?cfg.http_addr, rpc = %cfg.rpc_url, "booting dlottery-backend");

    // BE-03: Postgres connectivity + schema migration.
    let pool = db::connect(&cfg.database_url).await?;
    db::migrate(&pool).await?;
    info!("database ready");

    // BE-05: spawn the blockchain event listener.
    let indexer_cfg = cfg.clone();
    let indexer_pool = pool.clone();
    tokio::spawn(async move {
        indexer::run(indexer_cfg, indexer_pool).await;
    });

    // BE-04: REST API service.
    let state = api::AppState { pool };
    let app = api::router(state);

    let listener = tokio::net::TcpListener::bind(&cfg.http_addr).await?;
    info!(addr = %cfg.http_addr, "REST API listening");
    axum::serve(listener, app).await?;

    Ok(())
}
