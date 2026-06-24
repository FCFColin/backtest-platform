"""测试回测API返回数据 - 详细检查"""
import requests, json

r = requests.post('http://localhost:3001/api/backtest/portfolio', json={
    'portfolios': [{
        'name': 'P1',
        'assets': [
            {'ticker': 'VTI', 'weight': 0.6},
            {'ticker': 'BND', 'weight': 0.4},
        ],
        'rebalanceFrequency': 'annual',
    }],
    'parameters': {
        'startDate': '2010-01-01',
        'endDate': '2024-12-31',
        'startingValue': 10000,
    },
})

d = r.json()
data = d.get('data', d)
portfolios = data.get('portfolios', [])

# 检查每个portfolio的所有字段
if portfolios:
    p = portfolios[0]
    print(f"Portfolio keys: {list(p.keys())}")
    print(f"Name: {p.get('name')}")
    
    gc = p.get('growthCurve', [])
    print(f"\nGrowth curve: {len(gc)} points")
    if gc:
        # 检查NaN/Infinity
        import math
        nan_count = sum(1 for g in gc if math.isnan(g.get('value', 0)) or math.isinf(g.get('value', 0)))
        print(f"NaN/Inf count: {nan_count}")
        
        # 检查极端值
        values = [g.get('value', 0) for g in gc]
        print(f"Min: {min(values):.2f}")
        print(f"Max: {max(values):.2f}")
        print(f"Mean: {sum(values)/len(values):.2f}")
    
    # 检查其他字段
    for key in ['annualReturns', 'monthlyReturns', 'drawdowns', 'statistics']:
        val = p.get(key)
        if val is None:
            print(f"\n{key}: None/missing")
        elif isinstance(val, list):
            print(f"\n{key}: {len(val)} items")
            if val and len(val) > 0:
                print(f"  First: {val[0]}")
        elif isinstance(val, dict):
            print(f"\n{key}: {list(val.keys())}")

# 检查 correlations
corr = data.get('correlations', [])
print(f"\nCorrelations: {type(corr)} len={len(corr) if isinstance(corr, list) else 'N/A'}")

# 检查 benchmarkGrowth
bg = data.get('benchmarkGrowth', [])
print(f"BenchmarkGrowth: {len(bg) if isinstance(bg, list) else type(bg)}")
if bg and len(bg) > 0:
    print(f"  First: {bg[0]}")
    print(f"  Last: {bg[-1]}")
