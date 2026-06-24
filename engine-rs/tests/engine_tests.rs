use engine_rs::engine::{self, *};
use engine_rs::monte_carlo::{self, *};
use engine_rs::optimizer::{self, *};
use chrono::Datelike;
use std::collections::HashMap;

fn make_prices(base: f64, daily_ret: f64, days: usize) -> HashMap<String, f64> {
    let mut prices = HashMap::new();
    let mut price = base;
    let mut date = chrono::NaiveDate::from_ymd_opt(2020, 1, 2).unwrap();
    let mut count = 0;
    while count < days {
        let day = date.weekday().num_days_from_monday();
        if day < 5 {
            prices.insert(date.format("%Y-%m-%d").to_string(), (price * 10000.0).round() / 10000.0);
            price *= 1.0 + daily_ret;
            count += 1;
        }
        date += chrono::Duration::days(1);
    }
    prices
}

fn make_params(start: &str, end: &str) -> BacktestParams {
    BacktestParams {
        start_date: start.to_string(),
        end_date: end.to_string(),
        starting_value: 10000.0,
        adjust_for_inflation: false,
        rolling_window_months: 12,
        benchmark_ticker: String::new(),
        extended_withdrawal_stats: false,
        cashflow_legs: vec![],
        one_time_cashflows: vec![],
    }
}

fn make_backtest_req(portfolios: Vec<PortfolioInput>, price_data: HashMap<String, HashMap<String, f64>>, params: BacktestParams) -> BacktestRequest {
    BacktestRequest { portfolios, price_data, params, cpi_data: HashMap::new(), exchange_rates: HashMap::new() }
}

// ===== 回测核心 =====

#[test]
fn test_basic_60_40() {
    let vti = make_prices(150.0, 0.0004, 252);
    let bnd = make_prices(85.0, 0.0001, 252);
    let req = make_backtest_req(
        vec![PortfolioInput {
            name: "60/40".into(),
            assets: vec![AssetInput { ticker: "VTI".into(), weight: 60.0 }, AssetInput { ticker: "BND".into(), weight: 40.0 }],
            rebalance_frequency: "quarterly".into(),
            rebalance_threshold: None,
            drag: None, rebalance_offset: None, total_return: None,
            rebalance_bands: None,
            glidepath_to_weights: None,
            glidepath_years: None,
        }],
        HashMap::from([("VTI".into(), vti), ("BND".into(), bnd)]),
        make_params("2020-01-02", "2020-12-31"),
    );
    let result = run_backtest_internal(&req);
    let p = &result.portfolios[0];
    assert!(p.growth_curve.len() > 100);
    assert!(p.statistics.cagr > 0.0);
    assert!(p.statistics.stdev > 0.0);
    assert!(p.statistics.sharpe > 0.0);
    assert!(p.statistics.max_drawdown >= 0.0);
    // 新增指标验证
    assert!(p.statistics.calmar >= 0.0, "Calmar应>=0");
    assert!(p.statistics.var_5.is_finite(), "VaR5应为有限值");
    assert!(p.statistics.cvar_5.is_finite(), "CVaR应为有限值");
    // SWR/PWR需要足够长的数据（30年），1年数据可能为0
    assert!(p.statistics.swr >= 0.0, "SWR应>=0");
    assert!(p.statistics.pwr >= 0.0, "PWR应>=0");
}

#[test]
fn test_empty_portfolio() {
    let req = make_backtest_req(
        vec![PortfolioInput { name: "空".into(), assets: vec![], rebalance_frequency: "none".into(), rebalance_threshold: None, drag: None, rebalance_offset: None, total_return: None, rebalance_bands: None, glidepath_to_weights: None, glidepath_years: None }],
        HashMap::new(),
        make_params("2020-01-02", "2020-12-31"),
    );
    let result = run_backtest_internal(&req);
    assert_eq!(result.portfolios[0].growth_curve.len(), 0);
    assert_eq!(result.portfolios[0].statistics.cagr, 0.0);
}

#[test]
fn test_liquidation() {
    let a = make_prices(100.0, -0.05, 50);
    let b = make_prices(100.0, 0.0001, 50);
    let req = make_backtest_req(
        vec![PortfolioInput {
            name: "爆仓".into(),
            assets: vec![AssetInput { ticker: "A".into(), weight: 150.0 }, AssetInput { ticker: "B".into(), weight: -50.0 }],
            rebalance_frequency: "none".into(),
            rebalance_threshold: None,
            drag: None, rebalance_offset: None, total_return: None,
            rebalance_bands: None,
            glidepath_to_weights: None,
            glidepath_years: None,
        }],
        HashMap::from([("A".into(), a), ("B".into(), b)]),
        make_params("2020-01-02", "2020-04-01"),
    );
    let result = run_backtest_internal(&req);
    assert!(result.portfolios[0].statistics.cagr <= 0.0);
}

#[test]
fn test_float_precision_weights() {
    let a = make_prices(100.0, 0.001, 100);
    let b = make_prices(100.0, 0.0005, 100);
    let req = make_backtest_req(
        vec![PortfolioInput {
            name: "60.1/39.9".into(),
            assets: vec![AssetInput { ticker: "A".into(), weight: 60.1 }, AssetInput { ticker: "B".into(), weight: 39.9 }],
            rebalance_frequency: "none".into(),
            rebalance_threshold: None,
            drag: None, rebalance_offset: None, total_return: None,
            rebalance_bands: None,
            glidepath_to_weights: None,
            glidepath_years: None,
        }],
        HashMap::from([("A".into(), a), ("B".into(), b)]),
        make_params("2020-01-02", "2020-06-01"),
    );
    let result = run_backtest_internal(&req);
    assert!(result.portfolios[0].statistics.cagr > 0.0);
    assert!(result.portfolios[0].growth_curve.len() > 50);
}

#[test]
fn test_rebalance_frequency_comparison() {
    let a = make_prices(100.0, 0.001, 252);
    let b = make_prices(100.0, 0.0005, 252);
    let frequencies = ["daily", "weekly", "monthly", "quarterly", "annual", "none"];
    let mut results = HashMap::new();
    for freq in frequencies {
        let req = make_backtest_req(
            vec![PortfolioInput {
                name: freq.into(),
                assets: vec![AssetInput { ticker: "A".into(), weight: 60.0 }, AssetInput { ticker: "B".into(), weight: 40.0 }],
                rebalance_frequency: freq.into(),
                rebalance_threshold: None,
                drag: None, rebalance_offset: None, total_return: None,
            rebalance_bands: None,
            glidepath_to_weights: None,
            glidepath_years: None,
            }],
            HashMap::from([("A".into(), a.clone()), ("B".into(), b.clone())]),
            make_params("2020-01-02", "2020-12-31"),
        );
        let result = run_backtest_internal(&req);
        assert!(result.portfolios[0].statistics.cagr > 0.0, "CAGR should be > 0 for freq={}", freq);
        results.insert(freq, result.portfolios[0].growth_curve.last().unwrap().value);
    }
    assert_ne!(results["daily"], results["none"]);
}

#[test]
fn test_correlation_matrix() {
    let a = make_prices(100.0, 0.001, 200);
    let b = make_prices(100.0, 0.0005, 200);
    let req = make_backtest_req(
        vec![
            PortfolioInput { name: "P1".into(), assets: vec![AssetInput { ticker: "A".into(), weight: 100.0 }], rebalance_frequency: "none".into(), rebalance_threshold: None, drag: None, rebalance_offset: None, total_return: None, rebalance_bands: None, glidepath_to_weights: None, glidepath_years: None },
            PortfolioInput { name: "P2".into(), assets: vec![AssetInput { ticker: "B".into(), weight: 100.0 }], rebalance_frequency: "none".into(), rebalance_threshold: None, drag: None, rebalance_offset: None, total_return: None, rebalance_bands: None, glidepath_to_weights: None, glidepath_years: None },
        ],
        HashMap::from([("A".into(), a), ("B".into(), b)]),
        make_params("2020-01-02", "2020-09-01"),
    );
    let result = run_backtest_internal(&req);
    assert_eq!(result.correlations.len(), 2);
    assert!((result.correlations[0][0] - 1.0).abs() < 0.01);
}

// ===== 蒙特卡洛 =====

#[test]
fn test_monte_carlo_basic() {
    let a = make_prices(100.0, 0.001, 200);
    let req = MonteCarloRequest {
        portfolio: PortfolioInput { name: "test".into(), assets: vec![AssetInput { ticker: "A".into(), weight: 100.0 }], rebalance_frequency: "none".into(), rebalance_threshold: None, drag: None, rebalance_offset: None, total_return: None, rebalance_bands: None, glidepath_to_weights: None, glidepath_years: None },
        price_data: HashMap::from([("A".into(), a)]),
        params: make_params("2020-01-02", "2020-09-01"),
        mc_params: MonteCarloParams { num_simulations: 50, num_years: 5, min_block_years: 1, max_block_years: 5, with_replacement: true, block_size: 20, success_threshold: 1.0 },
    };
    let result = run_monte_carlo(&req);
    assert!(result.percentiles.p50.len() > 0);
    assert!(result.statistics.success_rate >= 0.0);
    assert_eq!(result.final_distribution.len(), 50);
}

// ===== 优化器 =====

#[test]
fn test_optimize_max_sharpe() {
    let a = make_prices(100.0, 0.001, 200);
    let b = make_prices(100.0, 0.0005, 200);
    let req = OptimizeRequest {
        tickers: vec!["A".into(), "B".into()],
        price_data: HashMap::from([("A".into(), a), ("B".into(), b)]),
        objective: "maxSharpe".into(),
        constraints: OptimizeConstraints { min_weight: Some(0.1), max_weight: Some(0.9) },
        num_iterations: None,
    };
    let result = optimize_portfolio(&req);
    assert!(result.optimal_weights.contains_key("A"));
    assert!(result.optimal_weights.contains_key("B"));
    assert!(result.sharpe_ratio > 0.0);
}

#[test]
fn test_efficient_frontier() {
    let a = make_prices(100.0, 0.001, 200);
    let b = make_prices(100.0, 0.0005, 200);
    let req = EfficientFrontierRequest {
        tickers: vec!["A".into(), "B".into()],
        price_data: HashMap::from([("A".into(), a), ("B".into(), b)]),
        num_points: 10,
    };
    let result = calc_efficient_frontier(&req);
    assert_eq!(result.frontier.len(), 10);
    for point in &result.frontier {
        assert!(point.expected_volatility > 0.0);
    }
}

// ===== 对抗性测试 =====

#[test]
fn test_zero_starting_value() {
    let a = make_prices(100.0, 0.001, 50);
    let req = make_backtest_req(
        vec![PortfolioInput { name: "zero".into(), assets: vec![AssetInput { ticker: "A".into(), weight: 100.0 }], rebalance_frequency: "none".into(), rebalance_threshold: None, drag: None, rebalance_offset: None, total_return: None, rebalance_bands: None, glidepath_to_weights: None, glidepath_years: None }],
        HashMap::from([("A".into(), a)]),
        BacktestParams { start_date: "2020-01-02".into(), end_date: "2020-06-01".into(), starting_value: 0.0, adjust_for_inflation: false, rolling_window_months: 12, benchmark_ticker: String::new(), extended_withdrawal_stats: false, cashflow_legs: vec![], one_time_cashflows: vec![] },
    );
    let result = run_backtest_internal(&req);
    // starting_value=0 时组合值为0，CAGR无意义
    assert!(result.portfolios[0].statistics.cagr <= 0.0);
}

#[test]
fn test_negative_weights() {
    let a = make_prices(100.0, 0.001, 100);
    let b = make_prices(100.0, 0.0005, 100);
    let req = make_backtest_req(
        vec![PortfolioInput { name: "杠杆".into(), assets: vec![AssetInput { ticker: "A".into(), weight: 120.0 }, AssetInput { ticker: "B".into(), weight: -20.0 }], rebalance_frequency: "none".into(), rebalance_threshold: None, drag: None, rebalance_offset: None, total_return: None, rebalance_bands: None, glidepath_to_weights: None, glidepath_years: None }],
        HashMap::from([("A".into(), a), ("B".into(), b)]),
        make_params("2020-01-02", "2020-06-01"),
    );
    let result = run_backtest_internal(&req);
    assert!(result.portfolios[0].growth_curve.len() > 0);
}

#[test]
fn test_very_short_period() {
    let mut a = HashMap::new();
    a.insert("2020-01-02".into(), 100.0);
    a.insert("2020-01-03".into(), 101.0);
    let req = make_backtest_req(
        vec![PortfolioInput { name: "short".into(), assets: vec![AssetInput { ticker: "A".into(), weight: 100.0 }], rebalance_frequency: "none".into(), rebalance_threshold: None, drag: None, rebalance_offset: None, total_return: None, rebalance_bands: None, glidepath_to_weights: None, glidepath_years: None }],
        HashMap::from([("A".into(), a)]),
        make_params("2020-01-02", "2020-01-03"),
    );
    let result = run_backtest_internal(&req);
    assert_eq!(result.portfolios[0].growth_curve.len(), 2);
}

#[test]
fn test_three_assets_equal_weight() {
    let a = make_prices(100.0, 0.001, 100);
    let b = make_prices(100.0, 0.0005, 100);
    let c = make_prices(100.0, -0.0002, 100);
    let req = make_backtest_req(
        vec![PortfolioInput { name: "3eq".into(), assets: vec![AssetInput { ticker: "A".into(), weight: 33.33 }, AssetInput { ticker: "B".into(), weight: 33.33 }, AssetInput { ticker: "C".into(), weight: 33.34 }], rebalance_frequency: "none".into(), rebalance_threshold: None, drag: None, rebalance_offset: None, total_return: None, rebalance_bands: None, glidepath_to_weights: None, glidepath_years: None }],
        HashMap::from([("A".into(), a), ("B".into(), b), ("C".into(), c)]),
        make_params("2020-01-02", "2020-06-01"),
    );
    let result = run_backtest_internal(&req);
    assert!(result.portfolios[0].statistics.cagr > 0.0);
}

#[test]
fn test_invalid_date_format_no_panic() {
    let mut a = HashMap::new();
    a.insert("bad-date".into(), 100.0);
    a.insert("also-bad".into(), 101.0);
    let req = make_backtest_req(
        vec![PortfolioInput { name: "bad_date".into(), assets: vec![AssetInput { ticker: "A".into(), weight: 100.0 }], rebalance_frequency: "monthly".into(), rebalance_threshold: None, drag: None, rebalance_offset: None, total_return: None, rebalance_bands: None, glidepath_to_weights: None, glidepath_years: None }],
        HashMap::from([("A".into(), a)]),
        BacktestParams { start_date: "bad".into(), end_date: "dates".into(), starting_value: 10000.0, adjust_for_inflation: false, rolling_window_months: 12, benchmark_ticker: String::new(), extended_withdrawal_stats: false, cashflow_legs: vec![], one_time_cashflows: vec![] },
    );
    let _ = run_backtest_internal(&req);
}

// ===== 对抗性测试（基于自检发现的问题） =====

#[test]
fn test_monthly_returns_no_panic_on_short_dates() {
    // 自检发现：calc_monthly_returns 还在用 d[0..4] 字符串切片
    // 短日期字符串会导致 panic
    let mut a = HashMap::new();
    a.insert("2020-01-02".into(), 100.0);
    a.insert("20".into(), 101.0); // 故意短日期
    a.insert("bad".into(), 102.0); // 完全无效
    let req = make_backtest_req(
        vec![PortfolioInput { name: "short_date".into(), assets: vec![AssetInput { ticker: "A".into(), weight: 100.0 }], rebalance_frequency: "none".into(), rebalance_threshold: None, drag: None, rebalance_offset: None, total_return: None, rebalance_bands: None, glidepath_to_weights: None, glidepath_years: None }],
        HashMap::from([("A".into(), a)]),
        make_params("20", "2020-12-31"),
    );
    let result = run_backtest_internal(&req);
    // 不应panic，月度收益应跳过无效日期
    assert!(!result.portfolios[0].monthly_returns.iter().any(|m| m.year == 0), "不应有year=0的月度收益");
}

#[test]
fn test_monte_carlo_zero_returns_no_panic() {
    // 自检发现：simulate_path 中 random_range(0..n) 如果n=0会panic
    let mut a = HashMap::new();
    a.insert("2020-01-02".into(), 100.0);
    a.insert("2020-01-03".into(), 100.0); // 0% return
    let req = MonteCarloRequest {
        portfolio: PortfolioInput { name: "flat".into(), assets: vec![AssetInput { ticker: "A".into(), weight: 100.0 }], rebalance_frequency: "none".into(), rebalance_threshold: None, drag: None, rebalance_offset: None, total_return: None, rebalance_bands: None, glidepath_to_weights: None, glidepath_years: None },
        price_data: HashMap::from([("A".into(), a)]),
        params: make_params("2020-01-02", "2020-01-03"),
        mc_params: MonteCarloParams { num_simulations: 10, num_years: 1, min_block_years: 1, max_block_years: 5, with_replacement: true, block_size: 1, success_threshold: 1.0 },
    };
    let result = run_monte_carlo(&req);
    // 不应panic
    assert!(result.percentiles.p50.len() > 0);
}

#[test]
fn test_optimizer_single_asset_no_underflow() {
    // 自检发现：generate_random_weights 中 0..n-1 当n=1时usize下溢
    let a = make_prices(100.0, 0.001, 100);
    let req = OptimizeRequest {
        tickers: vec!["A".into()],
        price_data: HashMap::from([("A".into(), a)]),
        objective: "maxSharpe".into(),
        constraints: OptimizeConstraints { min_weight: None, max_weight: None },
        num_iterations: None,
    };
    let result = optimize_portfolio(&req);
    // 不应panic
    assert!(result.optimal_weights.contains_key("A"));
    let w = result.optimal_weights["A"];
    assert!((w - 1.0).abs() < 0.01, "单资产权重应≈1.0，实际={}", w);
}

#[test]
fn test_price_gap_forward_fill() {
    // 自检发现：价格缺失时前向填充逻辑是否生效
    let mut a = HashMap::new();
    a.insert("2020-01-02".into(), 100.0);
    a.insert("2020-01-03".into(), 101.0);
    // 01-04/05 是周末，跳过
    // 01-06 缺失！测试前向填充
    a.insert("2020-01-07".into(), 103.0);
    let mut b = HashMap::new();
    b.insert("2020-01-02".into(), 80.0);
    b.insert("2020-01-03".into(), 81.0);
    b.insert("2020-01-07".into(), 83.0);
    let req = make_backtest_req(
        vec![PortfolioInput {
            name: "gap".into(),
            assets: vec![AssetInput { ticker: "A".into(), weight: 50.0 }, AssetInput { ticker: "B".into(), weight: 50.0 }],
            rebalance_frequency: "none".into(),
            rebalance_threshold: None,
            drag: None, rebalance_offset: None, total_return: None,
            rebalance_bands: None,
            glidepath_to_weights: None,
            glidepath_years: None,
        }],
        HashMap::from([("A".into(), a), ("B".into(), b)]),
        make_params("2020-01-02", "2020-01-07"),
    );
    let result = run_backtest_internal(&req);
    // 不应panic，且净值曲线不应有0值（前向填充生效）
    assert!(result.portfolios[0].growth_curve.len() >= 3);
    for gp in &result.portfolios[0].growth_curve {
        assert!(gp.value > 0.0, "净值不应为0（前向填充应生效）: date={} value={}", gp.date, gp.value);
    }
}

#[test]
fn test_weight_normalization() {
    // 自检发现：权重60+40=100归一化后应为0.6+0.4
    // 但如果权重总和≠100（如50+30=80），归一化后应仍为0.625+0.375
    let a = make_prices(100.0, 0.001, 50);
    let b = make_prices(100.0, 0.0005, 50);
    let req = make_backtest_req(
        vec![PortfolioInput {
            name: "80pct".into(),
            assets: vec![AssetInput { ticker: "A".into(), weight: 50.0 }, AssetInput { ticker: "B".into(), weight: 30.0 }],
            rebalance_frequency: "none".into(),
            rebalance_threshold: None,
            drag: None, rebalance_offset: None, total_return: None,
            rebalance_bands: None,
            glidepath_to_weights: None,
            glidepath_years: None,
        }],
        HashMap::from([("A".into(), a), ("B".into(), b)]),
        make_params("2020-01-02", "2020-03-01"),
    );
    let result = run_backtest_internal(&req);
    // 归一化后首日净值应≈10000
    let first_val = result.portfolios[0].growth_curve[0].value;
    assert!((first_val - 10000.0).abs() < 100.0, "归一化后首日净值应≈10000，实际={}", first_val);
}

#[test]
fn test_monte_carlo_median_even_count() {
    // 自检发现：中位数计算偶数路径数时取偏
    let a = make_prices(100.0, 0.001, 200);
    let req = MonteCarloRequest {
        portfolio: PortfolioInput { name: "test".into(), assets: vec![AssetInput { ticker: "A".into(), weight: 100.0 }], rebalance_frequency: "none".into(), rebalance_threshold: None, drag: None, rebalance_offset: None, total_return: None, rebalance_bands: None, glidepath_to_weights: None, glidepath_years: None },
        price_data: HashMap::from([("A".into(), a)]),
        params: make_params("2020-01-02", "2020-09-01"),
        mc_params: MonteCarloParams { num_simulations: 100, num_years: 5, min_block_years: 1, max_block_years: 5, with_replacement: true, block_size: 20, success_threshold: 1.0 },
    };
    let result = run_monte_carlo(&req);
    // 中位数应在合理范围内
    assert!(result.statistics.median_final_value > 0.0);
    assert!(result.statistics.mean_final_value > 0.0);
    // 成功率应在[0,1]范围
    assert!(result.statistics.success_rate >= 0.0 && result.statistics.success_rate <= 1.0);
}

#[test]
fn test_optimizer_extreme_negative_returns() {
    // 自检发现：(1.0 + mean).powi(252) 当mean < -1.0时行为异常
    let a = make_prices(100.0, -0.5, 50); // 极端负收益
    let b = make_prices(100.0, 0.001, 50);
    let req = OptimizeRequest {
        tickers: vec!["A".into(), "B".into()],
        price_data: HashMap::from([("A".into(), a), ("B".into(), b)]),
        objective: "maxSharpe".into(),
        constraints: OptimizeConstraints { min_weight: Some(0.1), max_weight: Some(0.9) },
        num_iterations: None,
    };
    let result = optimize_portfolio(&req);
    // 不应panic，结果应合理
    assert!(result.expected_volatility >= 0.0);
    assert!(result.sharpe_ratio.is_finite());
}

#[test]
fn test_efficient_frontier_single_point() {
    // 自检发现：num_points=1时 (num_points-1).max(1) 逻辑
    let a = make_prices(100.0, 0.001, 200);
    let b = make_prices(100.0, 0.0005, 200);
    let req = EfficientFrontierRequest {
        tickers: vec!["A".into(), "B".into()],
        price_data: HashMap::from([("A".into(), a), ("B".into(), b)]),
        num_points: 1,
    };
    let result = calc_efficient_frontier(&req);
    // 不应panic
    assert_eq!(result.frontier.len(), 1);
}

#[test]
fn test_all_zero_prices() {
    // 对抗性：所有价格为0
    let mut a = HashMap::new();
    a.insert("2020-01-02".into(), 0.0);
    a.insert("2020-01-03".into(), 0.0);
    let req = make_backtest_req(
        vec![PortfolioInput { name: "zero_price".into(), assets: vec![AssetInput { ticker: "A".into(), weight: 100.0 }], rebalance_frequency: "none".into(), rebalance_threshold: None, drag: None, rebalance_offset: None, total_return: None, rebalance_bands: None, glidepath_to_weights: None, glidepath_years: None }],
        HashMap::from([("A".into(), a)]),
        make_params("2020-01-02", "2020-01-03"),
    );
    let result = run_backtest_internal(&req);
    // 不应panic
    assert!(result.portfolios[0].statistics.cagr <= 0.0);
}

#[test]
fn test_single_day_backtest() {
    // 对抗性：只有1天数据
    let mut a = HashMap::new();
    a.insert("2020-01-02".into(), 100.0);
    let req = make_backtest_req(
        vec![PortfolioInput { name: "1day".into(), assets: vec![AssetInput { ticker: "A".into(), weight: 100.0 }], rebalance_frequency: "none".into(), rebalance_threshold: None, drag: None, rebalance_offset: None, total_return: None, rebalance_bands: None, glidepath_to_weights: None, glidepath_years: None }],
        HashMap::from([("A".into(), a)]),
        make_params("2020-01-02", "2020-01-02"),
    );
    let result = run_backtest_internal(&req);
    // 不应panic
    assert_eq!(result.portfolios[0].growth_curve.len(), 1);
    assert!((result.portfolios[0].growth_curve[0].value - 10000.0).abs() < 1.0);
}

#[test]
fn test_very_large_weight_sum() {
    // 对抗性：权重总和远超100（如200+200=400）
    let a = make_prices(100.0, 0.001, 50);
    let b = make_prices(100.0, 0.0005, 50);
    let req = make_backtest_req(
        vec![PortfolioInput {
            name: "big_weights".into(),
            assets: vec![AssetInput { ticker: "A".into(), weight: 200.0 }, AssetInput { ticker: "B".into(), weight: 200.0 }],
            rebalance_frequency: "none".into(),
            rebalance_threshold: None,
            drag: None, rebalance_offset: None, total_return: None,
            rebalance_bands: None,
            glidepath_to_weights: None,
            glidepath_years: None,
        }],
        HashMap::from([("A".into(), a), ("B".into(), b)]),
        make_params("2020-01-02", "2020-03-01"),
    );
    let result = run_backtest_internal(&req);
    // 归一化后首日净值应≈10000
    let first_val = result.portfolios[0].growth_curve[0].value;
    assert!((first_val - 10000.0).abs() < 100.0, "大权重归一化后首日净值应≈10000，实际={}", first_val);
}
