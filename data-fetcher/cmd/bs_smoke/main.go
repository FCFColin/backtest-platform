package main

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"data-fetcher/baostock"
)

func main() {
	start := time.Now()

	client := baostock.NewClient()
	defer client.Close()

	fmt.Println("连接baostock服务器...")
	if err := client.Connect(); err != nil {
		log.Fatalf("连接失败: %v", err)
	}
	fmt.Printf("连接成功: %dms\n", time.Since(start).Milliseconds())

	if err := client.Login(); err != nil {
		log.Fatalf("登录失败: %v", err)
	}
	fmt.Printf("登录成功: %dms\n", time.Since(start).Milliseconds())

	// 查询上证指数最近1个月数据
	fmt.Println("\n查询上证指数 sh.000001...")
	data, err := client.QueryHistoryKDataPlus(
		"sh.600000",
		"date,close",
		"2024-01-01", "2024-06-01",
		"d", "3",
	)
	if err != nil {
		log.Fatalf("查询失败: %v", err)
	}
	fmt.Printf("查询完成: %dms, %d条数据\n\n", time.Since(start).Milliseconds(), len(data))

	if len(data) > 0 {
		fmt.Println("前3条数据:")
		for i := 0; i < 3 && i < len(data); i++ {
			b, _ := json.Marshal(data[i])
			fmt.Println(string(b))
		}
		fmt.Printf("\n最后1条: ")
		b, _ := json.Marshal(data[len(data)-1])
		fmt.Println(string(b))
	}

	// 查询所有股票
	fmt.Println("\n查询今日所有股票...")
	stocks, err := client.QueryAllStock("2026-06-06")
	if err != nil {
		fmt.Printf("查询股票列表失败: %v\n", err)
	} else {
		fmt.Printf("股票列表: %d只\n", len(stocks))
		if len(stocks) > 0 {
			b, _ := json.Marshal(stocks[0])
			fmt.Println("样例:", string(b))
		}
	}

	// 查询交易日历
	fmt.Println("\n查询最近交易日历...")
	dates, err := client.QueryTradeDates("2026-05-01", "2026-06-09")
	if err != nil {
		fmt.Printf("查询交易日历失败: %v\n", err)
	} else {
		fmt.Printf("交易日: %d天\n", len(dates))
		if len(dates) > 0 {
			fmt.Println("最近5个:", dates[0], dates[1], dates[2], dates[3], dates[4])
		}
	}

	fmt.Printf("\n总耗时: %dms\n", time.Since(start).Milliseconds())
}
