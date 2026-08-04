package testutil

import (
	"testing"

	"data-fetcher/internal/providerutil"
)

func TestDateToUnix(t *testing.T) {
	ts, err := providerutil.DateToUnix("2024-01-01")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ts != 1704067200 {
		t.Errorf("DateToUnix(%q) = %d, want 1704067200", "2024-01-01", ts)
	}
}

func TestDateToUnix_Invalid(t *testing.T) {
	if _, err := providerutil.DateToUnix("invalid-date"); err == nil {
		t.Fatal("expected error for invalid date, got nil")
	}
}
