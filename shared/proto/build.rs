fn main() -> Result<(), Box<dyn std::error::Error>> {
    use std::path::{Path, PathBuf};

    let protos = &[
        "proto/common/v1/common.proto",
        "proto/auth/v1/auth.proto",
        "proto/catalog/v1/catalog.proto",
        "proto/storage/v1/storage.proto",
        "proto/stream/v1/stream.proto",
        "proto/downloads/v1/downloads.proto",
        "proto/search/v1/search.proto",
        "proto/playlist/v1/playlist.proto",
        "proto/analytics/v1/analytics.proto",
        "proto/discovery/v1/discovery.proto",
        "proto/recommend/v1/recommend.proto",
        "proto/transcoding/v1/transcoding.proto",
        "proto/ingestion/v1/ingestion.proto",
        "proto/heartbeat/v1/heartbeat.proto",
        "proto/notification/v1/notification.proto",
        "proto/sync/v1/sync.proto",
    ];

    let mut includes: Vec<PathBuf> = vec![PathBuf::from("proto")];

    // Ensure protoc can resolve well-known Google protobuf types when available.
    for candidate in ["/usr/include", "/usr/local/include"] {
        if Path::new(candidate).exists() {
            includes.push(PathBuf::from(candidate));
        }
    }

    if let Ok(extra_include) = std::env::var("PROTOBUF_INCLUDE") {
        let path = PathBuf::from(extra_include);
        if path.exists() {
            includes.push(path);
        }
    }

    tonic_build::configure()
        .build_server(true)
        .build_client(true)
        .compile_protos(protos, &includes)?;

    Ok(())
}
