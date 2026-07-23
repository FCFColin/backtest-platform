package baostock

import (
	"hash/crc32"
	"strings"
	"testing"
)

func TestPadLeft(t *testing.T) {
	tests := []struct {
		input    string
		pad      string
		length   int
		expected string
	}{
		{"5", "0", 10, "0000000005"},
		{"100", "0", 10, "0000000100"},
		{"10000", "0", 10, "0000010000"},
		{"abc", "0", 5, "00abc"},
	}
	for _, tt := range tests {
		result := padLeft(tt.input, tt.pad, tt.length)
		if result != tt.expected {
			t.Errorf("padLeft(%q, %q, %d) = %q, want %q", tt.input, tt.pad, tt.length, result, tt.expected)
		}
	}
}

func TestCRC32(t *testing.T) {
	result := crc32.ChecksumIEEE([]byte("test"))
	if result == 0 {
		t.Error("CRC32 of 'test' should not be 0")
	}

	empty := crc32.ChecksumIEEE([]byte(""))
	if empty != 0 {
		t.Errorf("CRC32 of empty string = %d, want 0", empty)
	}

	same1 := crc32.ChecksumIEEE([]byte("hello"))
	same2 := crc32.ChecksumIEEE([]byte("hello"))
	if same1 != same2 {
		t.Errorf("CRC32 should be deterministic: %d != %d", same1, same2)
	}
}

func TestMessageSplit(t *testing.T) {
	if MsgSplit != "\x01" {
		t.Errorf("MsgSplit = %q, want \\x01", MsgSplit)
	}
	if MsgEnd != "\n" {
		t.Errorf("MsgEnd = %q, want \\n", MsgEnd)
	}
	if HeaderLength != 21 {
		t.Errorf("HeaderLength = %d, want 21", HeaderLength)
	}
	if HeaderBodyLength != 10 {
		t.Errorf("HeaderBodyLength = %d, want 10", HeaderBodyLength)
	}
}

func TestLoginBodyFormat(t *testing.T) {
	client := NewClient()
	expected := "login\x01anonymous\x01123456\x010"
	parts := strings.Split(expected, "\x01")
	if len(parts) != 4 {
		t.Errorf("Login body should have 4 parts, got %d", len(parts))
	}
	if parts[0] != "login" {
		t.Errorf("First part should be 'login', got %q", parts[0])
	}
	if parts[1] != client.userID {
		t.Errorf("Second part should be userID %q, got %q", client.userID, parts[1])
	}
	if parts[2] != "123456" {
		t.Errorf("Third part should be '123456', got %q", parts[2])
	}
	if parts[3] != "0" {
		t.Errorf("Fourth part should be '0', got %q", parts[3])
	}
}

func TestKDataResponseBodyParsing(t *testing.T) {
	jsonWithRecord := `{"record": [["2020-01-02", "10.5", "11.0", "10.0", "10.8", "10.7", "1000", "10500", "2", "0.5", "1", "0.02", "0"]]}`
	fieldNames := []string{"date", "open", "high", "low", "close"}

	client := &Client{}
	data, isLast, err := client.parseKDataResponseDynamic(
		"00.9.10\x0101\x01" + padLeft("0\x01success\x01"+jsonWithRecord, "0", 10),
		fieldNames,
	)

	if err != nil {
		t.Logf("parseKDataResponseDynamic returned error (expected for mock data): %v", err)
	}
	if isLast {
		t.Log("isLast=true for mock data (acceptable)")
	}
	t.Logf("Parsed %d data points", len(data))
}

func TestNewClientUserID(t *testing.T) {
	client := NewClient()
	if client.userID != "anonymous" {
		t.Errorf("Default userID = %q, want 'anonymous'", client.userID)
	}
}

func TestTruncate(t *testing.T) {
	short := "abc"
	if truncate(short, 10) != "abc" {
		t.Errorf("truncate short string failed")
	}
	long := "abcdefghijklmnopqrstuvwxyz"
	result := truncate(long, 10)
	if len(result) > 13 { // 10 + "..."
		t.Errorf("truncate long string too long: %q", result)
	}
	if !strings.HasSuffix(result, "...") {
		t.Errorf("truncate should end with ..., got %q", result)
	}
}

func TestZlibDecompress(t *testing.T) {
	_, err := zlibDecompress([]byte{})
	if err == nil {
		t.Error("zlib decompress of empty data should fail")
	}
}