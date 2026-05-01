package main

import (
	"log"

	"github.com/music-server/music-go/internal/common"
)

func main() {
	config := common.LoadConfig()
	_ = config

	log.Println("Starting ingestion service...")

	// TODO: Initialize database connection
	// TODO: Register gRPC service
	// TODO: Start gRPC server
}
