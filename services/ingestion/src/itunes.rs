use std::sync::Arc;
use std::time::{Duration, Instant};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::PgPool;
use tokio::sync::{Mutex, Semaphore};

use crate::metadata_repo;

const ENDPOINT_TRACK: &str = "itunes:track";
const ENDPOINT_LOOKUP: &str = "itunes:lookup";

const ITUNES_SEARCH_URL: &str = "https://itunes.apple.com/search";
const ITUNES_LOOKUP_URL: &str = "https://itunes.apple.com/lookup";

const REFILL_RATE_PER_SEC: f64 = 15.0 / 60.0;
const BUCKET_CAPACITY: f64 = 5.0;
const MAX_CONCURRENCY: usize = 2;
const PAUSE_AFTER_RATE_LIMIT_SECS: i64 = 10 * 60;
const CACHE_TTL_DAYS: i64 = 30;


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ItunesRaw {
    pub raw: Value, // full untouched JSON
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ItunesTrack {
    #[serde(rename = "trackId")]
    pub track_id: i64,

    #[serde(rename = "trackName")]
    pub track_name: String,

    #[serde(rename = "artistId")]
    pub artist_id: i64,

    #[serde(rename = "artistName")]
    pub artist_name: String,

    #[serde(rename = "collectionId")]
    pub collection_id: i64,

    #[serde(rename = "collectionName")]
    pub collection_name: String,

    #[serde(rename = "primaryGenreName")]
    pub genre: String,

    #[serde(rename = "releaseDate")]
    pub release_date: String,

    #[serde(rename = "trackTimeMillis")]
    pub duration_ms: i64,

    #[serde(rename = "trackNumber")]
    pub track_number: i32,

    #[serde(rename = "discNumber")]
    pub disc_number: i32,

    #[serde(rename = "trackExplicitness")]
    pub explicitness: String,

    #[serde(rename = "artworkUrl100")]
    pub artwork_url: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ItunesCollection {
    #[serde(rename = "collectionId")]
    pub collection_id: i64,

    #[serde(rename = "collectionName")]
    pub collection_name: String,

    #[serde(rename = "artistName")]
    pub artist_name: String,

    #[serde(rename = "primaryGenreName")]
    pub genre: String,

    #[serde(rename = "releaseDate")]
    pub release_date: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ItunesArtist {
    #[serde(rename = "artistId")]
    pub artist_id: i64,

    #[serde(rename = "artistName")]
    pub artist_name: String,

    #[serde(rename = "primaryGenreName")]
    pub genre: String,
}

/// FULL GRAPH RESULT (what you actually want)
#[derive(Debug, Clone)]
pub struct ItunesFullMetadata {
    pub track: ItunesTrack,
    pub album: Option<ItunesCollection>,
    pub artist: Option<ItunesArtist>,
    pub album_tracks: Vec<ItunesTrack>,
    pub artist_albums: Vec<ItunesCollection>,
    pub raw_responses: Vec<Value>, // EVERYTHING
}

struct TokenBucket {
    tokens: f64,
    last_refill: Instant,
}

impl TokenBucket {
    fn new() -> Self {
        Self {
            tokens: BUCKET_CAPACITY,
            last_refill: Instant::now(),
        }
    }

    async fn acquire(bucket: &Mutex<TokenBucket>) {
        loop {
            let wait_for = {
                let mut b = bucket.lock().await;
                let now = Instant::now();
                let elapsed = now.duration_since(b.last_refill).as_secs_f64();
                b.tokens = (b.tokens + elapsed * REFILL_RATE_PER_SEC).min(BUCKET_CAPACITY);
                b.last_refill = now;

                if b.tokens >= 1.0 {
                    b.tokens -= 1.0;
                    None
                } else {
                    let needed = 1.0 - b.tokens;
                    Some(Duration::from_secs_f64(needed / REFILL_RATE_PER_SEC))
                }
            };

            if let Some(d) = wait_for {
                tokio::time::sleep(d).await;
            } else {
                return;
            }
        }
    }
}

pub struct ItunesClient {
    http: reqwest::Client,
    pool: PgPool,
    bucket: Mutex<TokenBucket>,
    semaphore: Arc<Semaphore>,
}

impl ItunesClient {
    pub fn new(pool: PgPool, http: reqwest::Client) -> Self {
        Self {
            http,
            pool,
            bucket: Mutex::new(TokenBucket::new()),
            semaphore: Arc::new(Semaphore::new(MAX_CONCURRENCY)),
        }
    }

    /// 🔥 MAIN ENTRY POINT (what you wanted)
    pub async fn fetch_full_metadata(
        &self,
        title: &str,
        artist: &str,
    ) -> Option<ItunesFullMetadata> {
        let query = format!("{} {}", artist, title);

        // search
        let search = self.search(&query).await?;
        let first = search.get("results")?.as_array()?.first()?.clone();

        let track: ItunesTrack = serde_json::from_value(first.clone()).ok()?;

        let mut raw_responses = vec![search.clone()];

        // track lookup
        let track_lookup = self.lookup(track.track_id, None).await?;
        raw_responses.push(track_lookup.clone());

        // album group
        let album_lookup = self.lookup(track.collection_id, Some("song")).await?;
        raw_responses.push(album_lookup.clone());

        let mut album = None;
        let mut album_tracks = vec![];

        if let Some(results) = album_lookup.get("results").and_then(|v| v.as_array()) {
            for item in results {
                match item.get("wrapperType")?.as_str()? {
                    "collection" => {
                        album = serde_json::from_value(item.clone()).ok();
                    }
                    "track" => {
                        if let Ok(t) = serde_json::from_value::<ItunesTrack>(item.clone()) {
                            album_tracks.push(t);
                        }
                    }
                    _ => {}
                }
            }
        }

        // artist lookup
        let artist_lookup = self.lookup(track.artist_id, Some("album")).await?;
        raw_responses.push(artist_lookup.clone());

        let mut artist = None;
        let mut artist_albums = vec![];

        if let Some(results) = artist_lookup.get("results").and_then(|v| v.as_array()) {
            for item in results {
                match item.get("wrapperType")?.as_str()? {
                    "artist" => {
                        artist = serde_json::from_value(item.clone()).ok();
                    }
                    "collection" => {
                        if let Ok(a) = serde_json::from_value::<ItunesCollection>(item.clone()) {
                            artist_albums.push(a);
                        }
                    }
                    _ => {}
                }
            }
        }

        Some(ItunesFullMetadata {
            track,
            album,
            artist,
            album_tracks,
            artist_albums,
            raw_responses,
        })
    }

    async fn search(&self, query: &str) -> Option<Value> {
        self.request(
            ITUNES_SEARCH_URL,
            vec![
                ("term", query),
                ("entity", "song"),
                ("limit", "5"),
            ],
        )
        .await
    }

    async fn lookup(&self, id: i64, entity: Option<&str>) -> Option<Value> {
        let mut params = vec![("id", &id.to_string())];

        if let Some(e) = entity {
            params.push(("entity", e));
        }

        self.request(ITUNES_LOOKUP_URL, params).await
    }

    async fn request(
        &self,
        url: &str,
        params: Vec<(&str, &str)>,
    ) -> Option<Value> {
        let _permit = self.semaphore.acquire().await.ok()?;
        TokenBucket::acquire(&self.bucket).await;

        let resp = self.http.get(url).query(&params).send().await.ok()?;

        if !resp.status().is_success() {
            return None;
        }

        resp.json::<Value>().await.ok()
    }
}