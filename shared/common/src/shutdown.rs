use tokio::signal;

/// Resolves when Ctrl-C (SIGINT) or SIGTERM (Unix) is received.
///
/// Pass to `axum::serve(...).with_graceful_shutdown(shutdown_signal())` or
/// `tonic::transport::Server::serve_with_shutdown(addr, shutdown_signal())`
/// so in-flight requests drain instead of being killed mid-response.
pub async fn shutdown_signal() {
    #[cfg(unix)]
    {
        use signal::unix::{SignalKind, signal as unix_signal};
        let mut term = match unix_signal(SignalKind::terminate()) {
            Ok(s) => s,
            Err(e) => {
                tracing::warn!(error = %e, "failed to install SIGTERM handler; relying on SIGINT only");
                let _ = signal::ctrl_c().await;
                tracing::info!("shutdown signal received (ctrl-c)");
                return;
            }
        };

        tokio::select! {
            _ = signal::ctrl_c() => tracing::info!("shutdown signal received (ctrl-c)"),
            _ = term.recv() => tracing::info!("shutdown signal received (SIGTERM)"),
        }
    }

    #[cfg(not(unix))]
    {
        let _ = signal::ctrl_c().await;
        tracing::info!("shutdown signal received (ctrl-c)");
    }
}
