package baostock

import (
	"bytes"
	"compress/zlib"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

var debugEnabled = os.Getenv("BAO_STOCK_DEBUG") == "1"

func debugLog(format string, args ...interface{}) {
	if debugEnabled {
		log.Printf(format, args...)
	}
}

// ============================================================
// 常量 - 从Python baostock源码提取
// ============================================================

const (
	ServerIP   = "public-api.baostock.com"
	ServerPort = 10030

	ClientVersion = "00.9.10"
	MsgSplit      = "\x01" // \1 消息内部分隔符
	MsgEnd        = "\n"   // 消息间分隔符
	ResponseEnd   = "<![CDATA[]]>\n"

	HeaderBodyLength = 10   // 消息头中消息体长度占位数
	HeaderLength     = 21   // 消息头固定长度
	PerPageCount     = 10000

	// 消息类型
	MsgLoginRequest        = "00"
	MsgLoginResponse       = "01"
	MsgLogoutRequest       = "02"
	MsgLogoutResponse      = "03"
	MsgGetKDataPlusRequest = "95"
	MsgGetKDataPlusResponse = "96" // zlib压缩
	MsgQueryAllStockRequest  = "35"
	MsgQueryAllStockResponse = "36"
	MsgQueryTradeDatesRequest  = "33"
	MsgQueryTradeDatesResponse = "34"
	MsgAdjustFactorRequest  = "15"
	MsgAdjustFactorResponse = "16"
)

// ============================================================
// 数据结构
// ============================================================

type KLineData struct {
	Date       string
	Open       string
	High       string
	Low        string
	Close      string
	PreClose   string
	Volume     string
	Amount     string
	AdjustFlag string
	Turn       string
	TradeStatus string
	PctChg     string
	IsST       string
}

type StockInfo struct {
	Code       string
	TradeStatus string
	CodeName   string
}

// ============================================================
// 客户端
// ============================================================

type Client struct {
	conn   net.Conn
	mu     sync.Mutex
	userID string
}

func NewClient() *Client {
	return &Client{
		userID: "anonymous",
	}
}

func (c *Client) Connect() error {
	addr := fmt.Sprintf("%s:%d", ServerIP, ServerPort)
	conn, err := net.DialTimeout("tcp", addr, 10*time.Second)
	if err != nil {
		return fmt.Errorf("连接baostock服务器失败: %w", err)
	}
	c.conn = conn
	c.conn.SetReadDeadline(time.Now().Add(30 * time.Second))
	return nil
}

func (c *Client) Close() error {
	if c.conn != nil {
		nowTime := time.Now().Format("20060102150405")
		c.sendMsg(MsgLogoutRequest, "logout"+MsgSplit+c.userID+MsgSplit+nowTime)
		c.conn.Close()
		c.conn = nil
	}
	return nil
}

// Login 登录baostock
func (c *Client) Login() error {
	body := "login" + MsgSplit + c.userID + MsgSplit + "123456" + MsgSplit + "0"
	resp, err := c.sendMsg(MsgLoginRequest, body)
	if err != nil {
		return fmt.Errorf("登录失败: %w", err)
	}
	if len(resp) < HeaderLength {
		return fmt.Errorf("登录响应过短: %d < %d", len(resp), HeaderLength)
	}
	headerArr := strings.Split(resp[:HeaderLength], MsgSplit)
	if len(headerArr) < 2 {
		return fmt.Errorf("登录响应格式错误")
	}
	if headerArr[1] != MsgLoginResponse {
		return fmt.Errorf("登录响应类型错误: %s", headerArr[1])
	}
	// 检查body中的error_code
	bodyStr := resp[HeaderLength:]
	bodyArr := strings.Split(bodyStr, MsgSplit)
	if len(bodyArr) > 0 && bodyArr[0] != "0" {
		return fmt.Errorf("登录失败: %s (%s)", bodyArr[1], bodyArr[0])
	}
	return nil
}

// QueryHistoryKDataPlus 查询历史K线数据(Plus版, zlib压缩)
func (c *Client) QueryHistoryKDataPlus(code, fields, startDate, endDate, frequency, adjustFlag string) ([]map[string]string, error) {
	var allData []map[string]string
	curPage := 1
	fieldNames := strings.Split(fields, ",")

	for {
		body := "query_history_k_data_plus" +
			MsgSplit + c.userID +
			MsgSplit + strconv.Itoa(curPage) +
			MsgSplit + strconv.Itoa(PerPageCount) +
			MsgSplit + code +
			MsgSplit + fields +
			MsgSplit + startDate +
			MsgSplit + endDate +
			MsgSplit + frequency +
			MsgSplit + adjustFlag

		debugLog("[BaoStock] K线请求: code=%s fields=%s start=%s end=%s freq=%s adjust=%s",
			code, fields, startDate, endDate, frequency, adjustFlag)

		resp, err := c.sendMsg(MsgGetKDataPlusRequest, body)
		if err != nil {
			return nil, fmt.Errorf("查询K线失败: %w", err)
		}

		data, isLast, err := c.parseKDataResponseDynamic(resp, fieldNames)
		if err != nil {
			return nil, err
		}
		allData = append(allData, data...)

		if isLast || len(data) < PerPageCount {
			break
		}
		curPage++
	}

	return allData, nil
}

// QueryAllStock 查询指定日期所有股票
func (c *Client) QueryAllStock(date string) ([]StockInfo, error) {
	body := "query_all_stock" +
		MsgSplit + c.userID +
		MsgSplit + "1" +
		MsgSplit + strconv.Itoa(PerPageCount) +
		MsgSplit + date

	resp, err := c.sendMsg(MsgQueryAllStockRequest, body)
	if err != nil {
		return nil, fmt.Errorf("查询股票列表失败: %w", err)
	}

	return c.parseAllStockResponse(resp)
}

// QueryTradeDates 查询交易日历
func (c *Client) QueryTradeDates(startDate, endDate string) ([]string, error) {
	body := "query_trade_dates" +
		MsgSplit + c.userID +
		MsgSplit + "1" +
		MsgSplit + strconv.Itoa(PerPageCount) +
		MsgSplit + startDate +
		MsgSplit + endDate

	resp, err := c.sendMsg(MsgQueryTradeDatesRequest, body)
	if err != nil {
		return nil, fmt.Errorf("查询交易日历失败: %w", err)
	}

	return c.parseTradeDatesResponse(resp)
}

// ============================================================
// 内部方法
// ============================================================

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

func (c *Client) parseKDataResponseDynamic(resp string, fieldNames []string) ([]map[string]string, bool, error) {
	if len(resp) <= HeaderLength {
		return nil, true, nil
	}

	bodyStr := resp[HeaderLength:]
	bodyArr := strings.Split(bodyStr, MsgSplit)

	if len(bodyArr) < 2 {
		return nil, true, nil
	}

	errorCode := bodyArr[0]
	if errorCode != "0" {
		return nil, true, fmt.Errorf("baostock错误码: %s", errorCode)
	}

	// Plus版K线响应是JSON格式
	for i := 1; i < len(bodyArr); i++ {
		if strings.Contains(bodyArr[i], `"record"`) {
			type RecordResponse struct {
				Record [][]string `json:"record"`
			}
			var respData RecordResponse
			if err := json.Unmarshal([]byte(bodyArr[i]), &respData); err == nil {
				var data []map[string]string
				for _, row := range respData.Record {
					rowMap := make(map[string]string)
					for j, name := range fieldNames {
						if j < len(row) {
							rowMap[name] = row[j]
						}
					}
					data = append(data, rowMap)
				}
				return data, false, nil
			}
		}
	}

	return nil, true, nil
}

func (c *Client) parseAllStockResponse(resp string) ([]StockInfo, error) {
	if len(resp) <= HeaderLength {
		return nil, nil
	}

	bodyStr := resp[HeaderLength:]
	bodyArr := strings.Split(bodyStr, MsgSplit)

	if len(bodyArr) < 2 || bodyArr[0] != "0" {
		return nil, fmt.Errorf("查询股票列表失败")
	}

	// Plus版响应是JSON格式
	for i := 1; i < len(bodyArr); i++ {
		if strings.Contains(bodyArr[i], `"record"`) {
			type RecordResponse struct {
				Record [][]string `json:"record"`
			}
			var respData RecordResponse
			if err := json.Unmarshal([]byte(bodyArr[i]), &respData); err == nil {
				var stocks []StockInfo
				for _, row := range respData.Record {
					si := StockInfo{}
					if len(row) > 0 { si.Code = row[0] }
					if len(row) > 1 { si.TradeStatus = row[1] }
					if len(row) > 2 { si.CodeName = row[2] }
					stocks = append(stocks, si)
				}
				return stocks, nil
			}
		}
	}

	// 降级：逗号分隔
	var stocks []StockInfo
	for i := 2; i < len(bodyArr); i++ {
		line := strings.TrimSpace(bodyArr[i])
		if line == "" || strings.HasPrefix(line, "<![CDATA") {
			continue
		}
		fields := strings.Split(line, ",")
		if len(fields) >= 3 {
			stocks = append(stocks, StockInfo{
				Code:        fields[0],
				TradeStatus: fields[1],
				CodeName:    fields[2],
			})
		}
	}
	return stocks, nil
}

func (c *Client) parseTradeDatesResponse(resp string) ([]string, error) {
	if len(resp) <= HeaderLength {
		return nil, nil
	}

	bodyStr := resp[HeaderLength:]
	bodyArr := strings.Split(bodyStr, MsgSplit)

	if len(bodyArr) < 2 || bodyArr[0] != "0" {
		return nil, fmt.Errorf("查询交易日历失败")
	}

	// Plus版响应是JSON格式
	for i := 1; i < len(bodyArr); i++ {
		if strings.Contains(bodyArr[i], `"record"`) {
			type RecordResponse struct {
				Record [][]string `json:"record"`
			}
			var respData RecordResponse
			if err := json.Unmarshal([]byte(bodyArr[i]), &respData); err == nil {
				var dates []string
				for _, row := range respData.Record {
					if len(row) >= 2 && row[1] == "1" { // is_trading_day == "1"
						dates = append(dates, row[0])
					}
				}
				return dates, nil
			}
		}
	}

	// 降级
	var dates []string
	for i := 2; i < len(bodyArr); i++ {
		line := strings.TrimSpace(bodyArr[i])
		if line == "" || strings.HasPrefix(line, "<![CDATA") {
			continue
		}
		fields := strings.Split(line, ",")
		if len(fields) >= 1 {
			dates = append(dates, fields[0])
		}
	}
	return dates, nil
}

// ============================================================
// 工具函数
// ============================================================

func padLeft(s, pad string, length int) string {
	for len(s) < length {
		s = pad + s
	}
	return s
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

func crc32(data string) uint32 {
	return standardCRC32([]byte(data))
}

func standardCRC32(data []byte) uint32 {
	// 使用IEEE多项式，和Python的zlib.crc32一致
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

func zlibDecompress(data []byte) ([]byte, error) {
	r, err := zlib.NewReader(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	defer r.Close()
	return io.ReadAll(r)
}
