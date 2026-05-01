pub mod common {
    pub mod v1 {
        tonic::include_proto!("common.v1");
    }
}

pub mod auth {
    pub mod v1 {
        tonic::include_proto!("auth.v1");
    }
}

pub mod catalog {
    pub mod v1 {
        tonic::include_proto!("catalog.v1");
    }
}

pub mod storage {
    pub mod v1 {
        tonic::include_proto!("storage.v1");
    }
}

pub mod stream {
    pub mod v1 {
        tonic::include_proto!("stream.v1");
    }
}

pub mod downloads {
    pub mod v1 {
        tonic::include_proto!("downloads.v1");
    }
}

pub mod search {
    pub mod v1 {
        tonic::include_proto!("search.v1");
    }
}

pub mod playlist {
    pub mod v1 {
        tonic::include_proto!("playlist.v1");
    }
}

pub mod analytics {
    pub mod v1 {
        tonic::include_proto!("analytics.v1");
    }
}

pub mod discovery {
    pub mod v1 {
        tonic::include_proto!("discovery.v1");
    }
}

pub mod recommend {
    pub mod v1 {
        tonic::include_proto!("recommend.v1");
    }
}

pub mod transcoding {
    pub mod v1 {
        tonic::include_proto!("transcoding.v1");
    }
}

pub mod ingestion {
    pub mod v1 {
        tonic::include_proto!("ingestion.v1");
    }
}

pub mod heartbeat {
    pub mod v1 {
        tonic::include_proto!("heartbeat.v1");
    }
}

pub mod notification {
    pub mod v1 {
        tonic::include_proto!("notification.v1");
    }
}

pub mod sync {
    pub mod v1 {
        tonic::include_proto!("sync.v1");
    }
}
