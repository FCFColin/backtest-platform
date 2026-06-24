"""测试VTI+BND回测 - 检查数据"""
import requests, json, math

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

if portfolios:
    p = portfolios[0]
    gc = p.get('growthCurve', [])
    print(f'Growth curve: {len(gc)} points')
    if gc:
        values = [g.get('value', 0) for g in gc]
        print(f'Min: {min(values)}')
        print(f'Max: {max(values)}')
        # 检查NaN/Inf
        nan_count = sum(1 for v in values if math.isnan(v) or math.isinf(v))
        print(f'NaN/Inf: {nan_count}')
        # 打印前5和后5
        for g in gc[:5]:
            print(f"  {g['date']}: {g['value']:.2f}")
        print('  ...')
        for g in gc[-5:]:
            print(f"  {g['date']}: {g['value']:.2f}")
else:
    print(f'No portfolios! Response: {json.dumps(d)[:500]}')
