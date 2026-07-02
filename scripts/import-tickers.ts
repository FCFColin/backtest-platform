/** 导入行情数据到 PostgreSQL prices 表 */
import { importAllTickers, importTickersBySymbols } from '../api/db/import.js';

const PRIORITY_TICKERS = ['VTI', 'BND', 'SPY', 'TLT', 'GLD', 'QQQ', 'IWM', 'AGG', 'VXUS', 'VEA'];

const isPriority = process.argv.slice(2).includes('--priority');

const main = isPriority ? importTickersBySymbols(PRIORITY_TICKERS) : importAllTickers();

main
  .then((r) => {
    console.log(r);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
