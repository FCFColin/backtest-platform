"""测试防限流方案"""
import time
from engine.fetcher import fetch_ticker, fetch_batch_yfinance

# 测试1：单个标的
print("=== 测试1：单个标的 ===")
start = time.time()
r = fetch_ticker("SPY", "2020-01-01", "2026-06-01")
elapsed = time.time() - start
if r:
    print(f"SPY: {len(r['prices'])} prices, first={r['meta']['first_date']}, {elapsed:.1f}s")
else:
    print(f"SPY: failed, {elapsed:.1f}s")

# 测试2：批量下载
print("\n=== 测试2：批量下载5个标的 ===")
tickers = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA"]
start = time.time()
results = fetch_batch_yfinance(tickers, start_date="2020-01-01", batch_size=5)
elapsed = time.time() - start
success = sum(1 for v in results.values() if v is not None)
print(f"批量: {success}/{len(tickers)} ok, {elapsed:.1f}s")
for t, d in results.items():
    if d:
        print(f"  {t}: {len(d['prices'])} prices")
    else:
        print(f"  {t}: failed")
