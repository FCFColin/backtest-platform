"""检查BND的adj_close数据"""
import json

d = json.load(open('data/market/tickers/BND.json'))
prices = d['prices']

print("adj_close vs close (every 500th):")
for p in prices[::500]:
    print(f"  {p['date']}: close={p['close']:.2f}, adj_close={p.get('adj_close', 0):.2f}, ratio={p.get('adj_close', 0)/p['close'] if p['close'] > 0 else 0:.3f}")

# 检查adj_close异常值
max_adj = max(p.get('adj_close', 0) for p in prices)
min_adj = min(p.get('adj_close', float('inf')) for p in prices if p.get('adj_close', 0) > 0)
print(f"\nadj_close range: {min_adj:.2f} ~ {max_adj:.2f}")

# 检查adj_close < close 的情况
bad_count = sum(1 for p in prices if p.get('adj_close', 0) < p['close'] and p.get('adj_close', 0) > 0)
print(f"adj_close < close: {bad_count} / {len(prices)}")

# 检查adj_close极端值
extreme = [p for p in prices if p.get('adj_close', 0) > 1000]
print(f"adj_close > 1000: {len(extreme)}")
