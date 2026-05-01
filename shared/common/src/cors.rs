use anyhow::{Context, Result, anyhow};
use axum::http::HeaderValue;
use axum::http::Method;
use tower_http::cors::CorsLayer;

/// Build a `CorsLayer` from a list of allowed origins.
///
/// Empty list disables cross-origin access (no `Access-Control-Allow-Origin`
/// header is sent, so browsers reject cross-origin requests).
///
/// Wildcards (`*`) are rejected — they are incompatible with credentialed
/// requests (cookie-backed auth). The startup validator in `config::validate`
/// rejects them as well; this is defense-in-depth.
pub fn build_layer(origins: &[String]) -> Result<CorsLayer> {
    if origins.is_empty() {
        return Ok(CorsLayer::new());
    }

    let mut parsed = Vec::with_capacity(origins.len());
    for origin in origins {
        if origin == "*" {
            return Err(anyhow!(
                "cors origin '*' is not allowed — credentialed requests require \
                 an explicit origin list"
            ));
        }
        let value = HeaderValue::from_str(origin)
            .with_context(|| format!("invalid cors origin: {origin}"))?;
        parsed.push(value);
    }

    Ok(CorsLayer::new()
        .allow_origin(parsed)
        .allow_credentials(true)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([
            axum::http::header::CONTENT_TYPE,
            axum::http::header::AUTHORIZATION,
            axum::http::header::ACCEPT,
        ]))
}
