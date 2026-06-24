"""测试回测API返回数据"""
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
print(f'Portfolios: {len(portfolios)}')

if portfolios:
    p = portfolios[0]
    gc = p.get('growthCurve', [])
    print(f'Growth curve: {len(gc)} points')
    if gc:
        print(f'First: {gc[0]}')
        print(f'Last: {gc[-1]}')
        # 检查异常值
        max_val = max(g.get('value', 0) for g in gc)
        min_val = min(g.get('value', float('inf')) for g in gc)
        print(f'Max value: {max_val}')
        print(f'Min value: {min_val}')
        # 打印前10个
        for g in gc[:10]:
            print(f"  {g['date']}: {g['value']}")
