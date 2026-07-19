package baostock

import (
	"fmt"
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

