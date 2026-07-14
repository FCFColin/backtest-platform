package baostock

import (
	"encoding/json"
	"fmt"
	"strings"
)

// parseKDataResponseDynamic 动态解析K线响应（支持JSON格式）。
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

// parseAllStockResponse 解析股票列表响应。
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

// parseTradeDatesResponse 解析交易日历响应。
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
