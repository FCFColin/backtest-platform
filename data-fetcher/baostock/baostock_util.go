package baostock

import (
	"bytes"
	"compress/zlib"
	"io"
)

// padLeft 左侧填充字符到指定长度。
func padLeft(s, pad string, length int) string {
	for len(s) < length {
		s = pad + s
	}
	return s
}

// truncate 截断字符串到指定长度并添加省略号。
func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

// crc32 计算字符串的 CRC32 校验值。
func crc32(data string) uint32 {
	return standardCRC32([]byte(data))
}

// standardCRC32 使用 IEEE 多项式计算 CRC32，和 Python 的 zlib.crc32 一致。
func standardCRC32(data []byte) uint32 {
	crc := uint32(0xFFFFFFFF)
	for _, b := range data {
		crc ^= uint32(b)
		for i := 0; i < 8; i++ {
			if crc&1 != 0 {
				crc = (crc >> 1) ^ 0xEDB88320
			} else {
				crc >>= 1
			}
		}
	}
	return crc ^ 0xFFFFFFFF
}

// zlibDecompress 解压 zlib 压缩数据。
func zlibDecompress(data []byte) ([]byte, error) {
	r, err := zlib.NewReader(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	defer r.Close()
	return io.ReadAll(r)
}
