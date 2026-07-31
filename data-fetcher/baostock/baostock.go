package baostock

import (
	"bytes"
	"compress/zlib"
	"encoding/json"
	"fmt"
	"hash/crc32"
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

const (
	ServerIP                   = "public-api.baostock.com"
	ServerPort                 = 10030
	ClientVersion              = "00.9.10"
	MsgSplit                   = "\x01" // \1 消息内部分隔符
	MsgEnd                     = "\n"   // 消息间分隔符
	ResponseEnd                = "<![CDATA[]]>\n"
	HeaderBodyLength           = 10 // 消息头中消息体长度占位数
	HeaderLength               = 21 // 消息头固定长度
	PerPageCount               = 10000
	MsgLoginRequest            = "00"
	MsgLoginResponse           = "01"
	MsgLogoutRequest           = "02"
	MsgLogoutResponse          = "03"
	MsgGetKDataPlusRequest     = "95"
	MsgGetKDataPlusResponse    = "96" // zlib压缩
	MsgQueryAllStockRequest    = "35"
	MsgQueryAllStockResponse   = "36"
	MsgQueryTradeDatesRequest  = "33"
	MsgQueryTradeDatesResponse = "34"
	MsgAdjustFactorRequest     = "15"
	MsgAdjustFactorResponse    = "16"
)

type KLineData struct {
	Date        string
	Open        string
	High        string
	Low         string
	Close       string
	PreClose    string
	Volume      string
	Amount      string
	AdjustFlag  string
	Turn        string
	TradeStatus string
	PctChg      string
	IsST        string
}
type StockInfo struct {
	Code        string
	TradeStatus string
	CodeName    string
}
type Client struct {
	conn   net.Conn
	mu     sync.Mutex
	userID string
}

func NewClient() *Client {
	return &Client{userID: "anonymous"}
}
func (c *Client) Connect() error {
	addr := net.JoinHostPort(ServerIP, strconv.Itoa(ServerPort))
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
	bodyStr := resp[HeaderLength:]
	bodyArr := strings.Split(bodyStr, MsgSplit)
	if len(bodyArr) > 0 && bodyArr[0] != "0" {
		return fmt.Errorf("登录失败: %s (%s)", bodyArr[1], bodyArr[0])
	}
	return nil
}
func (c *Client) QueryHistoryKDataPlus(code, fields, startDate, endDate, frequency, adjustFlag string) ([]map[string]string, error) {
	var allData []map[string]string
	curPage := 1
	fieldNames := strings.Split(fields, ",")
	for {
		body := strings.Join([]string{
			"query_history_k_data_plus", c.userID, strconv.Itoa(curPage), strconv.Itoa(PerPageCount),
			code, fields, startDate, endDate, frequency, adjustFlag,
		}, MsgSplit)
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
func (c *Client) QueryAllStock(date string) ([]StockInfo, error) {
	resp, err := c.sendMsg(MsgQueryAllStockRequest, c.pagedBody("query_all_stock", date))
	if err != nil {
		return nil, fmt.Errorf("查询股票列表失败: %w", err)
	}
	return c.parseAllStockResponse(resp)
}
func (c *Client) QueryTradeDates(startDate, endDate string) ([]string, error) {
	resp, err := c.sendMsg(MsgQueryTradeDatesRequest, c.pagedBody("query_trade_dates", startDate, endDate))
	if err != nil {
		return nil, fmt.Errorf("查询交易日历失败: %w", err)
	}
	return c.parseTradeDatesResponse(resp)
}

// pagedBody 构造分页查询请求体：命令 + userID + page=1 + 页大小 + 业务参数
func (c *Client) pagedBody(cmd string, args ...string) string {
	parts := make([]string, 0, 4+len(args))
	parts = append(parts, cmd, c.userID, "1", strconv.Itoa(PerPageCount))
	parts = append(parts, args...)
	return strings.Join(parts, MsgSplit)
}

// parseBody 剥离消息头并按 MsgSplit 切分响应体；业务码非 0 或格式错误时返回 ok=false
func parseBody(resp string) ([]string, bool) {
	if len(resp) <= HeaderLength {
		return nil, false
	}
	bodyArr := strings.Split(resp[HeaderLength:], MsgSplit)
	if len(bodyArr) < 2 || bodyArr[0] != "0" {
		return nil, false
	}
	return bodyArr, true
}

// splitCsvRows 提取非 JSON 回退格式的 CSV 行（跳过空行与 CDATA 结尾标记）
func splitCsvRows(bodyArr []string) [][]string {
	var rows [][]string
	for i := 2; i < len(bodyArr); i++ {
		line := strings.TrimSpace(bodyArr[i])
		if line == "" || strings.HasPrefix(line, "<![CDATA") {
			continue
		}
		rows = append(rows, strings.Split(line, ","))
	}
	return rows
}

type recordResponse struct {
	Record [][]string `json:"record"`
}

func findRecordResponse(bodyArr []string) *recordResponse {
	for i := 1; i < len(bodyArr); i++ {
		if strings.Contains(bodyArr[i], `"record"`) {
			var respData recordResponse
			if err := json.Unmarshal([]byte(bodyArr[i]), &respData); err == nil {
				return &respData
			}
		}
	}
	return nil
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
	if errorCode := bodyArr[0]; errorCode != "0" {
		return nil, true, fmt.Errorf("baostock错误码: %s", errorCode)
	}
	if respData := findRecordResponse(bodyArr); respData != nil {
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
	return nil, true, nil
}
func (c *Client) parseAllStockResponse(resp string) ([]StockInfo, error) {
	bodyArr, ok := parseBody(resp)
	if !ok {
		if len(resp) <= HeaderLength {
			return nil, nil
		}
		return nil, fmt.Errorf("查询股票列表失败")
	}
	if respData := findRecordResponse(bodyArr); respData != nil {
		stocks := make([]StockInfo, 0, len(respData.Record))
		for _, row := range respData.Record {
			si := StockInfo{}
			if len(row) > 0 {
				si.Code = row[0]
			}
			if len(row) > 1 {
				si.TradeStatus = row[1]
			}
			if len(row) > 2 {
				si.CodeName = row[2]
			}
			stocks = append(stocks, si)
		}
		return stocks, nil
	}
	var stocks []StockInfo
	for _, fields := range splitCsvRows(bodyArr) {
		if len(fields) >= 3 {
			stocks = append(stocks, StockInfo{Code: fields[0], TradeStatus: fields[1], CodeName: fields[2]})
		}
	}
	return stocks, nil
}
func (c *Client) parseTradeDatesResponse(resp string) ([]string, error) {
	bodyArr, ok := parseBody(resp)
	if !ok {
		if len(resp) <= HeaderLength {
			return nil, nil
		}
		return nil, fmt.Errorf("查询交易日历失败")
	}
	if respData := findRecordResponse(bodyArr); respData != nil {
		dates := make([]string, 0, len(respData.Record))
		for _, row := range respData.Record {
			if len(row) >= 2 && row[1] == "1" { // is_trading_day == "1"
				dates = append(dates, row[0])
			}
		}
		return dates, nil
	}
	var dates []string
	for _, fields := range splitCsvRows(bodyArr) {
		if len(fields) >= 1 {
			dates = append(dates, fields[0])
		}
	}
	return dates, nil
}
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
	crc32Val := crc32.ChecksumIEEE([]byte(headBody))
	fullMsg := headBody + MsgSplit + strconv.FormatUint(uint64(crc32Val), 10) + MsgEnd
	debugLog("[BaoStock] 发送消息: type=%s bodyLen=%d crc=%d headerLen=%d",
		msgType, len(msgBody), crc32Val, len(header))
	debugLog("[BaoStock] 消息头: %q", header)
	debugLog("[BaoStock] 消息体前100字符: %q", truncate(msgBody, 100))
	_, err := c.conn.Write([]byte(fullMsg))
	if err != nil {
		return "", fmt.Errorf("发送失败: %w", err)
	}
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
		if len(receive) > 10*1024*1024 { // 10MB
			return "", fmt.Errorf("响应数据过大")
		}
	}
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
	bodyStart := HeaderLength
	bodyEnd := bodyStart + bodyLength
	if bodyEnd > len(receive) {
		bodyEnd = len(receive)
	}
	if bodyStart < len(receive) {
		debugLog("[BaoStock] 响应体: %q", string(receive[bodyStart:bodyEnd]))
	}
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
func zlibDecompress(data []byte) ([]byte, error) {
	r, err := zlib.NewReader(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	defer r.Close()
	return io.ReadAll(r)
}
