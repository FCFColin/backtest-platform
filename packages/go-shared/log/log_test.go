package log

import (
	"log/slog"
	"testing"
)

func TestInitDefault_SetsJSONLogger(t *testing.T) {
	InitDefault()
	h := slog.Default().Handler()
	if _, ok := h.(*slog.JSONHandler); !ok {
		t.Fatalf("期望默认 logger 为 JSONHandler，实际 %T", h)
	}
}
