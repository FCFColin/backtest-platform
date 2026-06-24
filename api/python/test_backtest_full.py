"""测试回测API - 完整响应结构"""
import requests, json

r = requests.post('http://localhost:3001/api/backtest/portfolio', json={
    'portfolios': [{
        'name': 'Portfolio 1',
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
print(f"Top-level keys: {list(d.keys())}")
print(f"success: {d.get('success')}")

data = d.get('data')
if data:
    print(f"data keys: {list(data.keys())}")
    portfolios = data.get('portfolios', [])
    print(f"portfolios: {len(portfolios)} items")
    if portfolios:
        p = portfolios[0]
        print(f"portfolio keys: {list(p.keys())}")
        gc = p.get('growthCurve', [])
        if gc:
            print(f"growthCurve: {len(gc)} points")
            print(f"  first: {gc[0]}")
            print(f"  last: {gc[-1]}")
        
        # 检查 statistics
        stats = p.get('statistics')
        if stats:
            if isinstance(stats, dict):
                print(f"statistics: {stats}")
            elif isinstance(stats, list):
                print(f"statistics is a list! len={len(stats)}")
                print(f"  first: {stats[0]}")
    correlations = data.get('correlations')
    print(f"correlations: {type(correlations)}")
else:
    print("No data field!")
    print(f"Full response: {json.dumps(d)[:500]}")
