package common

import (
	"os"
)

type Config struct {
	DatabaseURL  string
	RedisURL     string
	RabbitmqURL  string
	JWTSecret    string
	GatewayPort  string
}

func LoadConfig() *Config {
	return &Config{
		DatabaseURL:  getEnv("DATABASE_URL", "postgres://music:music@localhost:5432/music"),
		RedisURL:     getEnv("REDIS_URL", "redis://localhost:6379"),
		RabbitmqURL:  getEnv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672"),
		JWTSecret:    getEnv("JWT_SECRET", "change-me-in-production"),
		GatewayPort:  getEnv("GATEWAY_PORT", "8080"),
	}
}

func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}
