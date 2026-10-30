//! REST API service (PRD 3.4, BE-04).

use crate::db;
use crate::models::{CurrentDrawResponse, HistoryResponse};
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::json;
use sqlx::postgres::PgPool;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
}

pub fn router(state: AppState) -> Router {
    let cors = CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any);
    Router::new()
        .route("/health", get(health))
        .route("/api/v1/draws/current", get(current_draw))
        .route("/api/v1/draws/history", get(history))
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(state)
}

async fn health() -> impl IntoResponse {
    Json(json!({ "status": "ok" }))
}

/// GET /api/v1/draws/current
async fn current_draw(State(state): State<AppState>) -> Result<Response, ApiError> {
    let Some(draw) = db::current_draw(&state.pool).await? else {
        return Ok((StatusCode::NOT_FOUND, Json(json!({ "error": "no draws indexed yet" })))
            .into_response());
    };

    let allocation = db::allocation(&state.pool, draw.draw_id).await?;
    let participants = db::participants(&state.pool, draw.draw_id).await?;

    let now = chrono::Utc::now().timestamp();
    let remaining_seconds = (draw.end_time - now).max(0);
    let is_eligible_for_draw = draw.status == "ACTIVE"
        && (draw.participant_count >= 5 || now > draw.end_time);

    let resp = CurrentDrawResponse {
        draw,
        remaining_seconds,
        is_eligible_for_draw,
        allocation,
        participants,
    };
    Ok(Json(resp).into_response())
}

#[derive(Debug, Deserialize)]
struct Pagination {
    page: Option<i64>,
    page_size: Option<i64>,
}

/// GET /api/v1/draws/history?page=1&page_size=20
async fn history(
    State(state): State<AppState>,
    Query(p): Query<Pagination>,
) -> Result<Response, ApiError> {
    let page = p.page.unwrap_or(1).max(1);
    let page_size = p.page_size.unwrap_or(20).clamp(1, 100);

    let (draws, total) = db::history(&state.pool, page, page_size).await?;
    Ok(Json(HistoryResponse {
        page,
        page_size,
        total,
        draws,
    })
    .into_response())
}

/// Error wrapper mapping internal errors to HTTP 500 with structured logging (BE-06).
pub struct ApiError(anyhow::Error);

impl<E> From<E> for ApiError
where
    E: Into<anyhow::Error>,
{
    fn from(e: E) -> Self {
        ApiError(e.into())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        tracing::error!("api error: {:#}", self.0);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "internal server error" })),
        )
            .into_response()
    }
}
