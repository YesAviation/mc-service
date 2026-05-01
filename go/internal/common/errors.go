package common

import (
	"fmt"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type AppError struct {
	Code    int
	Message string
}

func (e *AppError) Error() string {
	return fmt.Sprintf("error %d: %s", e.Code, e.Message)
}

func NotFoundError(msg string) *AppError {
	return &AppError{Code: 404, Message: msg}
}

func UnauthorizedError(msg string) *AppError {
	return &AppError{Code: 401, Message: msg}
}

func BadRequestError(msg string) *AppError {
	return &AppError{Code: 400, Message: msg}
}

func InternalError(msg string) *AppError {
	return &AppError{Code: 500, Message: msg}
}

func ToGRPCStatus(err *AppError) error {
	switch err.Code {
	case 404:
		return status.Error(codes.NotFound, err.Message)
	case 401:
		return status.Error(codes.Unauthenticated, err.Message)
	case 400:
		return status.Error(codes.InvalidArgument, err.Message)
	default:
		return status.Error(codes.Internal, err.Message)
	}
}
