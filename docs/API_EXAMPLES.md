API Examples (Gateway Layer)

These are clean, realistic REST-style endpoints (just to give a few examples)

Authentication
Login
POST /api/auth/login

Request

{
  "username": "user1",
  "password": "securepassword",
  "remember_me": false
}

Response

{
  "userId": "uuid",
  "session": "cookie-set",
  "expiresIn": 604800
}

Catalog
Get track info
GET /api/catalog/tracks/{trackId}

Response

{
  "trackId": "uuid",
  "title": "Song Name",
  "artist": "Artist Name",
  "album": "Album Name",
  "duration": 215,
  "artworkUrl": "/media/artwork/uuid.jpg"
}

Streaming
Start playback
GET /api/stream/{trackId}

Response

{
  "manifestUrl": "https://cdn.local/stream/abc.m3u8?sig=xyz",
  "expiresAt": 1712345678
}

Downloads
Request download link
GET /api/download/{trackId}

Response

{
  "downloadUrl": "https://cdn.local/download/file.flac?sig=abc",
  "expiresIn": 900
}

Playlists
Create playlist
POST /api/playlists

Request

{
  "name": "Workout Mix"
}

Add track
POST /api/playlists/{playlistId}/tracks
{
  "trackId": "uuid"
}

Search
GET /api/search?q=ambient%20music

Response
{
  "results": [
    {
      "trackId": "uuid",
      "title": "Ambient Song",
      "artist": "Artist"
    }
  ]
}

Analytics (internal event ingestion)
POST /api/events/playback
{
  "trackId": "uuid",
  "position": 120,
  "event": "pause"
}