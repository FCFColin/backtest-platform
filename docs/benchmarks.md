# Performance Benchmarks

> Baseline recorded on: 2026-06-23
> Go version: 1.22/1.23
> CPU: 12th Gen Intel Core i5-12450H

## data-fetcher

| Benchmark                      | ns/op | B/op | allocs/op |
| ------------------------------ | ----- | ---- | --------- |
| BenchmarkHandleBatch           | TBD   | TBD  | TBD       |
| BenchmarkHandleValidateTickers | TBD   | TBD  | TBD       |
| BenchmarkSearchTickers         | TBD   | TBD  | TBD       |
| BenchmarkIsValidTicker         | 99    | 0    | 0         |

## engine-go

| Benchmark                             | ns/op     | B/op      | allocs/op |
| ------------------------------------- | --------- | --------- | --------- |
| BenchmarkRunBacktest                  | 5,373,880 | 1,540,330 | 19,998    |
| BenchmarkComputeGrowthCurve           | TBD       | TBD       | TBD       |
| BenchmarkComputeStatistics            | TBD       | TBD       | TBD       |
| BenchmarkRunMonteCarlo                | TBD       | TBD       | TBD       |
| BenchmarkComputePortfolioDailyReturns | TBD       | TBD       | TBD       |

## How to run benchmarks

```bash
# data-fetcher
cd data-fetcher && go test -bench=. -benchmem -count=1 -run=^$ ./...

# engine-go
cd engine-go && go test -bench=. -benchmem -count=1 -run=^$ -timeout=120s ./...
```

## Interpreting results

- **ns/op**: Nanoseconds per operation (lower is better)
- **B/op**: Bytes allocated per operation (lower is better)
- **allocs/op**: Heap allocations per operation (lower is better)

TBD values will be filled after the next CI run on ubuntu-latest.
