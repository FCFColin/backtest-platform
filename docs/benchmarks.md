# Performance Benchmarks

> Baseline: 2026-06-23；Go 1.22/1.23；CPU: i5-12450H

## data-fetcher

| Benchmark                                              | ns/op | B/op | allocs/op |
| ------------------------------------------------------ | ----- | ---- | --------- |
| BenchmarkIsValidTicker                                 | 99    | 0    | 0         |
| BenchmarkHandleBatch / ValidateTickers / SearchTickers | TBD   | TBD  | TBD       |

## engine-go

| Benchmark                                                                                      | ns/op     | B/op      | allocs/op |
| ---------------------------------------------------------------------------------------------- | --------- | --------- | --------- |
| BenchmarkRunBacktest                                                                           | 5,373,880 | 1,540,330 | 19,998    |
| BenchmarkComputeGrowthCurve / ComputeStatistics / RunMonteCarlo / ComputePortfolioDailyReturns | TBD       | TBD       | TBD       |

## 运行与解读

```bash
cd data-fetcher && go test -bench=. -benchmem -count=1 -run=^$ ./...
cd engine-go && go test -bench=. -benchmem -count=1 -run=^$ -timeout=120s ./...
```

ns/op（每操作纳秒）、B/op（字节）、allocs/op（堆分配）——越低越好。TBD 将在下次 CI（ubuntu-latest）后填充。
