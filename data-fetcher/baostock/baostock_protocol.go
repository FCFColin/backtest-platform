package baostock

import (
	"bytes"
	"fmt"
	"io"
	"net"
	"strconv"
	"strings"
	"time"
)

// sendMsg 发送消息并接收响应。
func (c *Client) sendMsg(msgType, msgBody string) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.conn == nil {
		return "", fmt.Errorf("未连接")
	}

	header := fmt.Sprintf("%s%s%s%s%s",
		ClientVersion,
		MsgSplit,
		msgType,
		MsgSplit,
		padLeft(strconv.Itoa(len(msgBody)), "0", HeaderBodyLength),
	)

	headBody := header + msgBody

	crc32Val := crc32(headBody)

	fullMsg := headBody + MsgSplit + strconv.FormatUint(uint64(crc32Val), 10) + MsgEnd

	debugLog("[BaoStock] 发送消息: type=%s bodyLen=%d crc=%d headerLen=%d",
		msgType, len(msgBody), crc32Val, len(header))
	debugLog("[BaoStock] 消息头: %q", header)
	debugLog("[BaoStock] 消息体前100字符: %q", truncate(msgBody, 100))

	_, err := c.conn.Write([]byte(fullMsg))
	if err != nil {
		return "", fmt.Errorf("发送失败: %w", err)
	}

	// 接收
	var receive []byte
	buf := make([]byte, 8192)
	endMarker := []byte(ResponseEnd)

	for {
		n, err := c.conn.Read(buf)
		if err != nil {
			if err == io.EOF {
				break
			}
			if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
				return "", fmt.Errorf("读取超时(30s): 已接收 %d 字节", len(receive))
			}
			return "", fmt.Errorf("接收失败: %w", err)
		}
		c.conn.SetReadDeadline(time.Now().Add(30 * time.Second))
		receive = append(receive, buf[:n]...)
		if bytes.HasSuffix(receive, endMarker) {
			break
		}
		// 超时保护
		if len(receive) > 10*1024*1024 { // 10MB
			return "", fmt.Errorf("响应数据过大")
		}
	}

	// 解析响应
	if len(receive) < HeaderLength {
		return "", fmt.Errorf("响应过短: %d < %d", len(receive), HeaderLength)
	}
	headerStr := string(receive[:HeaderLength])
	headerArr := strings.Split(headerStr, MsgSplit)
	if len(headerArr) < 3 {
		return "", fmt.Errorf("响应头格式错误: %q", headerStr)
	}

	respType := headerArr[1]
	bodyLength, err := strconv.Atoi(headerArr[2])
	if err != nil {
		return "", fmt.Errorf("响应体长度解析失败: %q, %w", headerArr[2], err)
	}

	debugLog("[BaoStock] 响应: type=%s bodyLen=%d totalLen=%d", respType, bodyLength, len(receive))

	// 输出完整响应body用于调试
	bodyStart := HeaderLength
	bodyEnd := bodyStart + bodyLength
	if bodyEnd > len(receive) {
		bodyEnd = len(receive)
	}
	if bodyStart < len(receive) {
		debugLog("[BaoStock] 响应体: %q", string(receive[bodyStart:bodyEnd]))
	}

	// K线Plus响应需要zlib解压
	if respType == MsgGetKDataPlusResponse {
		compressedBody := receive[HeaderLength : HeaderLength+bodyLength]
		decompressed, err := zlibDecompress(compressedBody)
		if err != nil {
			return "", fmt.Errorf("zlib解压失败: %w", err)
		}
		return headerStr + string(decompressed), nil
	}

	return string(receive), nil
}
