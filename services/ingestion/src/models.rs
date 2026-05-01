use std::path::PathBuf;

/// Information about an audio file discovered during a directory scan.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct AudioFileInfo {
    pub path: PathBuf,
    pub file_name: String,
    pub extension: String,
    pub size_bytes: u64,
}

/// Metadata extracted from an audio file using lofty.
#[derive(Debug, Clone, Default)]
pub struct ExtractedMetadata {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub track_number: i32,
    pub disc_number: i32,
    pub genre: String,
    pub year: i32,
    pub duration_secs: i32,
    pub format: String,
    pub bitrate: i32,
    pub sample_rate: i32,
    pub artwork_data: Option<Vec<u8>>,
}

/// The set of supported audio file extensions.
pub const AUDIO_EXTENSIONS: &[&str] = &["mp3", "flac", "wav", "m4a", "ogg", "aac"];

/// Returns true if the extension (lowercase, no dot) is a supported audio format.
pub fn is_audio_extension(ext: &str) -> bool {
    AUDIO_EXTENSIONS.contains(&ext.to_lowercase().as_str())
}
