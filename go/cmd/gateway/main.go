package main

import (
	"log"

	"github.com/music-server/music-go/internal/common"
)

func main() {
	config := common.LoadConfig()
	log.Printf("Starting API Gateway on port %s", config.GatewayPort)

	// TODO: Initialize gRPC clients to internal services
	// TODO: Set up Gin router with routes
	// TODO: Start HTTP server
}
