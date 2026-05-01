
## About

A self-hosted music streaming service built using Rust, designed around a **microservices architecture** with a strong emphasis on scalability, security, and modularity.

The system supports both **local storage** and **S3-compatible backends (Garage)** for storing audio files. It scans and ingests music into a centralized catalog, allowing users to stream, download, and organize their libraries.

Personalized recommendations are generated using machine learning models based on user behavior and listening history.

The platform is designed to scale horizontally and leverages modern infrastructure and communication patterns, including **HLS streaming, gRPC, Redis caching, and event-driven messaging**.

---

## Core Technologies

- **HLS (Adaptive Bitrate Audio Streaming)**  
  Dynamically adjusts audio bitrate based on network conditions.

- **Redis**  
  Used for caching, session storage, rate limiting, and pub/sub messaging.

- **Protocol Buffers (Proto)**  
  Defines APIs and shared data structures.

- **gRPC**  
  Internal service communication.

- **Event Bus (NATS / Kafka / RabbitMQ)**  
  Enables asynchronous communication between services.

- **Docker**  
  Containerization.

- **Kubernetes**  
  Orchestration and scaling.

- **CI/CD Pipelines**  
  Automated testing and deployment.

- **Monitoring & Logging**  
  Observability for performance and debugging.

- **Prometheus (Planned)**  
  Metrics and alerting.

- **PostgreSQL**  
  Primary relational database.

- **FFmpeg**  
  Audio processing and HLS generation.

- **NGINX**  
  Reverse proxy and load balancing.

- **UUID**  
  Unique identifiers.

- **i18n**
  Internationalization support.

- **iTunes Metadata Support**
  Used as a fallback or enrichment source when local metadata is missing or incomplete



---

## Security & Authentication
> See **Options** section for alternative approaches and design considerations.


- **JWT Authentication**
  - Short-lived tokens
  - Used for API access

- **Streaming & Download Authorization**
  - Uses **short-lived signed URLs**
  - Prevents unauthorized access and link sharing

- **OAuth (Planned)**
  - Third-party authentication

- **Service-to-Service Security (Planned)**
  - mTLS or internal auth tokens

---

## Storage

- **Garage (S3-compatible)**  
  Scalable object storage

- **Local Storage (Default)**  
  For development and small deployments

---

## Architecture Overview

- **Synchronous:** gRPC  
- **Asynchronous:** Event Bus
- **Trust Boundary:** External clients interact only through the API Gateway; internal services are not publicly exposed.

---

## Services

### API Gateway Service
- Entry point for all requests
- Handles authentication, rate limiting, routing

### Authentication Service
- Login, registration, token management

### Catalog Service
- Manages tracks, albums, artists, metadata

### Storage Service
- Abstracts storage backend
- Manages file locations and uploads
- Does not serve files directly

### Streaming Service
- Serves HLS manifests and segments
- Validates and serves content via signed URLs

### Download Service
- Generates secure download links

### Transcoding Service
- Processes audio files
- Generates multiple bitrates and HLS segments

### Ingestion Service
- Handles import pipeline:
  - Scan
  - Metadata extraction
  - Deduplication

### Search Service
- Full-text search
- PostgreSQL FTS or external engine

### Playlist Service
- Playlist management

### Recommendation Service
- ML-based recommendations
- Python + TensorFlow

### Discovery Service
- Serves recommendations and trending content

### Analytics Service
- Collects usage and playback data

### Sync Service
- Ensures consistency across services and storage

### Notification Service
- Sends alerts and updates

---

## Event-Driven Workflows

### Ingestion Flow

Upload → Ingestion → Transcoding → Catalog → Event


### Playback Tracking

Client → Gateway → Event Bus → Analytics

### Recommendation Pipeline

Analytics → Training → Recommendation → Discovery


---

## Features

- User Profiles
- Music Library
- Full-text Search
- Personalized Recommendations
- Playlists
- Offline Downloads (non-DRM)
- Gapless Playback
- Cross-platform support

---

## Frontend Applications

### Web
- React + TypeScript + Tailwind + Vite

### iOS
- Swift + SwiftUI

### Android
- Kotlin + Jetpack Compose

### Desktop
- Rust + Tauri (shared frontend)

---

## Shared Components

### Backend
- Proto definitions
- Shared utilities
- Auth middleware

### Frontend
- Shared UI components

---

## Data Model (High-Level)

- Users
- Tracks
- Albums
- Artists
- Playlists
- Playback History
- Recommendations

---

## Server Setup Flow

1. Create admin account
2. Select storage backend
3. Configure system
4. Scan and ingest music
5. Enable client access

⚠️ Server remains inaccessible until setup is complete.

---

## Configuration

- System-level: environment variables
- User-level: admin dashboard
- `.env` reserved for internal use

---

## Admin Dashboard

- System monitoring
- User management
- Configuration controls
- Analytics dashboards

---

## Scaling Strategy

- Stateless services
- Horizontal scaling
- Event-driven processing
- Kubernetes-managed infrastructure

---

## Failure Handling

- Retry mechanisms
- Event replay
- Graceful degradation
- Redundant storage

---

## Planned

- OAuth integration
- Prometheus monitoring
- Advanced ML pipelines
- mTLS between services
- External metadata enrichment

---

## Backlog

(To be defined)

---

## Not Approved

- Social features (friends, sharing, etc.)

---

# Options

Handling streaming and download authorization without introducing excessive complexity requires tradeoffs. The following approaches were considered:

---

## Option 1 — Session-bound Access

**Flow:**
User logs in → JWT issued → Gateway validates → Session cookie set

**Approach:**
- Use cookie-based authentication for streaming requests
- Avoids passing tokens in HLS manifests

**Benefits:**
- Clean client implementation
- No query parameter tokens
- Works naturally with browsers

---

## Option 2 — Signed URLs (Selected)

**Approach:**
- Use short-lived signed URLs for:
  - HLS playlists (.m3u8)
  - Download links
- Avoid per-segment authentication

**Benefits:**
- Prevents link sharing
- Keeps streaming pipeline simple
- No persistent authentication required during playback