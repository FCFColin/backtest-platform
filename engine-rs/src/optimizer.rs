use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use rand::Rng;
use nalgebra::{DMatrix, DVector};

// ===== 数据结构 =====

/// 组合优化请求体，包含标的、价格数据、目标函数及约束条件。
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OptimizeRequest {
    pub tickers: Vec<String>,
    pub price_data: HashMap<String, HashMap<String, f64>>,
    pub objective: String,
    #[serde(default)]
    pub constraints: OptimizeConstraints,
    #[serde(default = "default_iterations")]
    pub num_iterations: Option<usize>,
}

fn default_iterations() -> Option<usize> { Some(10000) }

/// 优化约束条件，支持设置单资产权重的上下限。
#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct OptimizeConstraints {
    #[serde(default)]
    pub min_weight: Option<f64>,
    #[serde(default)]
    pub max_weight: Option<f64>,
}

/// 组合优化结果，包含最优权重及对应的预期收益、波动率与夏普比率。
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OptimizationResult {
    pub optimal_weights: HashMap<String, f64>,
    pub expected_return: f64,
    pub expected_volatility: f64,
    pub sharpe_ratio: f64,
}

/// 有效前沿上的一个点，记录权重、预期收益、波动率与夏普比率。
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EfficientFrontierPoint {
    pub weights: HashMap<String, f64>,
    pub expected_return: f64,
    pub expected_volatility: f64,
    pub sharpe_ratio: f64,
}

/// 有效前沿计算请求体，包含标的、价格数据及采样点数。
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EfficientFrontierRequest {
    pub tickers: Vec<String>,
    pub price_data: HashMap<String, HashMap<String, f64>>,
    #[serde(default = "default_num_points")]
    pub num_points: usize,
}

fn default_num_points() -> usize { 20 }

/// 有效前沿计算结果，包含前沿上各采样点的集合。
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EfficientFrontierResult {
    pub frontier: Vec<EfficientFrontierPoint>,
}

// ===== 核心逻辑 =====

/// 计算各资产年化收益率和协方差矩阵
fn calc_return_and_cov(
    tickers: &[String],
    price_data: &HashMap<String, HashMap<String, f64>>,
) -> (Vec<f64>, Vec<Vec<f64>>, Vec<String>) {
    let mut valid_tickers: Vec<String> = Vec::new();
    let mut ticker_date_prices: Vec<(&String, HashMap<&String, f64>)> = Vec::new();

    for ticker in tickers {
        let Some(prices) = price_data.get(ticker) else { continue };
        let date_map: HashMap<&String, f64> = prices.iter()
            .filter(|(_, &p)| p > 0.0)
            .map(|(d, &p)| (d, p))
            .collect();
        if date_map.len() < 2 { continue; }
        ticker_date_prices.push((ticker, date_map));
        valid_tickers.push(ticker.clone());
    }

    if valid_tickers.is_empty() {
        return (Vec::new(), Vec::new(), Vec::new());
    }

    // 找到所有标的共有的交易日（按日期对齐，避免不同标的价格序列错位）
    let first_map = &ticker_date_prices[0].1;
    let mut common_dates: Vec<&String> = first_map.keys().copied().collect();
    for i in 1..ticker_date_prices.len() {
        let map = &ticker_date_prices[i].1;
        common_dates.retain(|d| map.contains_key(d));
    }
    common_dates.sort();

    if common_dates.len() < 2 {
        return (Vec::new(), Vec::new(), valid_tickers);
    }

    // 按共有日期计算各标的的日收益率
    let mut all_returns: Vec<Vec<f64>> = Vec::new();
    for (_, date_map) in &ticker_date_prices {
        let mut returns = Vec::with_capacity(common_dates.len() - 1);
        for i in 1..common_dates.len() {
            let prev = date_map[common_dates[i - 1]];
            let curr = date_map[common_dates[i]];
            if prev > 0.0 {
                returns.push((curr - prev) / prev);
            }
        }
        all_returns.push(returns);
    }

    let aligned: Vec<&[f64]> = all_returns.iter().map(|r| r.as_slice()).collect();

    // 年化平均收益率（几何平均/复合年化）
    let mean_returns: Vec<f64> = aligned.iter().map(|r| {
        let cum_prod: f64 = r.iter().fold(1.0_f64, |acc, &ret| acc * (1.0 + ret));
        if cum_prod <= 0.0 { 0.0 } else { cum_prod.powf(252.0 / r.len() as f64) - 1.0 }
    }).collect();

    // 协方差矩阵
    let n = aligned.len();
    let mut cov_matrix = vec![vec![0.0_f64; n]; n];
    for i in 0..n {
        for j in i..n {
            let cov = calc_covariance(aligned[i], aligned[j]) * 252.0;
            cov_matrix[i][j] = cov;
            cov_matrix[j][i] = cov;
        }
    }

    (mean_returns, cov_matrix, valid_tickers)
}

/// 计算协方差
fn calc_covariance(x: &[f64], y: &[f64]) -> f64 {
    let n = x.len().min(y.len());
    if n < 2 { return 0.0; }
    let mean_x = x[..n].iter().sum::<f64>() / n as f64;
    let mean_y = y[..n].iter().sum::<f64>() / n as f64;
    let cov: f64 = (0..n).map(|i| (x[i] - mean_x) * (y[i] - mean_y)).sum();
    cov / (n - 1) as f64
}

/// 投影到单纯形+边界约束
fn project_to_simplex_and_bounds(w: &mut DVector<f64>, min_w: f64, max_w: f64) {
    let n = w.len();
    for _ in 0..100 {
        for i in 0..n {
            w[i] = w[i].clamp(min_w, max_w);
        }
        let sum: f64 = (0..n).map(|i| w[i]).sum();
        if sum.abs() < 1e-12 {
            // 全零兜底：闭式解产生极端权重（如全负）clamp 后全零，回退到等权重
            // 前提：min_w ≤ 1/n ≤ max_w（调用方需保证，否则保持全零由上层处理）
            let eq = 1.0 / n as f64;
            if eq >= min_w && eq <= max_w {
                for i in 0..n { w[i] = eq; }
            }
            break;
        }
        for i in 0..n { w[i] /= sum; }
    }
}

/// 生成随机权重（约束条件下）
fn generate_random_weights(n: usize, min_w: f64, max_w: f64, rng: &mut impl Rng) -> Vec<f64> {
    if n == 0 { return vec![]; }
    if n == 1 { return vec![1.0]; }
    let mut weights = Vec::with_capacity(n);
    let mut remaining = 1.0;

    for i in 0..n - 1 {
        let max_possible = max_w.min(remaining - (n - 1 - i) as f64 * min_w);
        let min_possible = min_w.max(remaining - (n - 1 - i) as f64 * max_w);
        if min_possible > max_possible {
            return vec![1.0 / n as f64; n];
        }
        let w = min_possible + rng.random::<f64>() * (max_possible - min_possible);
        weights.push(w);
        remaining -= w;
    }
    weights.push(remaining);

    // 归一化
    let sum: f64 = weights.iter().sum();
    weights.iter_mut().for_each(|w| *w /= sum);
    weights
}

/// 组合预期收益率
fn calc_portfolio_return(weights: &[f64], mean_returns: &[f64]) -> f64 {
    weights.iter().zip(mean_returns.iter()).map(|(w, r)| w * r).sum()
}

/// 组合波动率
fn calc_portfolio_volatility(weights: &[f64], cov_matrix: &[Vec<f64>]) -> f64 {
    let n = weights.len();
    let mut variance = 0.0;
    for i in 0..n {
        for j in 0..n {
            variance += weights[i] * weights[j] * cov_matrix[i][j];
        }
    }
    variance.max(0.0).sqrt()
}

// ===== 二次规划闭式解 =====

/// 确保协方差矩阵正定，通过Cholesky分解检查
/// 如果不正定，逐步添加正则化项使其正定
fn ensure_positive_definite(cov: &DMatrix<f64>) -> DMatrix<f64> {
    let n = cov.nrows();
    if cov.clone().cholesky().is_some() {
        return cov.clone();
    }
    // 逐步增加正则化项
    let mut reg = 1e-8;
    for _ in 0..20 {
        let regularized = cov.clone() + DMatrix::from_diagonal(&DVector::from_element(n, reg));
        if regularized.clone().cholesky().is_some() {
            return regularized;
        }
        reg *= 10.0;
    }
    // 兜底：返回原始矩阵（后续 try_inverse 会失败，回退到随机搜索）
    cov.clone()
}

/// 估计矩阵最大特征值（幂迭代法），用于计算迭代投影的最优步长
fn estimate_largest_eigenvalue(mat: &DMatrix<f64>, n: usize) -> f64 {
    let mut v = DVector::from_element(n, 1.0 / (n as f64).sqrt());
    for _ in 0..50 {
        let mv = mat * &v;
        let norm = mv.norm();
        if norm < 1e-15 { break; }
        v = mv / norm;
    }
    let mv = mat * &v;
    let norm_sq = v.dot(&v);
    if norm_sq < 1e-15 { 1.0 } else { v.dot(&mv) / norm_sq }
}

/// 最小波动率：二次规划闭式解
/// min w'Σw  s.t. w'1=1, min_w≤w≤max_w
///
/// 无不等式约束激活时，闭式解为：w = Σ^(-1) * 1 / (1' * Σ^(-1) * 1)
/// 有约束激活时，使用迭代投影法（比梯度下降更稳定，步长基于Lipschitz常数）
fn solve_min_volatility_qp(cov: &DMatrix<f64>, n: usize, min_w: f64, max_w: f64) -> Vec<f64> {
    if n == 0 { return vec![]; }
    if n == 1 { return vec![1.0_f64.clamp(min_w, max_w)]; }

    let cov_pd = ensure_positive_definite(cov);
    let ones = DVector::from_element(n, 1.0);

    // 尝试闭式解：w = Σ^(-1) * 1 / (1' * Σ^(-1) * 1)
    if let Some(cov_inv) = cov_pd.clone().try_inverse() {
        let cov_inv_ones = &cov_inv * &ones;
        let denom = ones.dot(&cov_inv_ones);
        if denom.abs() > 1e-15 {
            let w = cov_inv_ones / denom;
            let all_in_bounds = w.iter().all(|&wi| wi >= min_w - 1e-8 && wi <= max_w + 1e-8);
            if all_in_bounds {
                return w.iter().map(|&wi| wi.clamp(min_w, max_w)).collect();
            }
        }
    }

    // 闭式解违反边界约束，使用迭代投影法
    let mut w = DVector::from_element(n, 1.0 / n as f64);
    let lip = estimate_largest_eigenvalue(&cov_pd, n).max(1e-10);
    let step_size = 1.0 / lip;

    for iter in 0..500 {
        let grad = &cov_pd * &w;
        let mut y = w.clone() - step_size * &grad;

        // 投影到边界约束
        for i in 0..n { y[i] = y[i].clamp(min_w, max_w); }

        // 投影到等式约束 w'1 = 1
        let sum: f64 = y.iter().sum();
        if sum.abs() > 1e-12 {
            let deviation = (sum - 1.0) / n as f64;
            for i in 0..n { y[i] -= deviation; }
        }

        // 再次确保边界约束
        for i in 0..n { y[i] = y[i].clamp(min_w, max_w); }

        // 归一化
        let sum: f64 = y.iter().sum();
        if sum.abs() > 1e-12 {
            for i in 0..n { y[i] /= sum; }
        }

        let diff = (&y - &w).norm();
        w = y;
        if diff < 1e-10 && iter > 10 { break; }
    }

    project_to_simplex_and_bounds(&mut w, min_w, max_w);
    w.iter().copied().collect()
}

/// 给定目标收益率求解最小方差组合（闭式解，无边界约束）
/// min w'Σw  s.t. w'1=1, w'μ=target_ret
///
/// 利用Lagrange乘子法，化简为2×2线性系统：
/// [a b] [λ1]   [-1         ]
/// [b c] [λ2] = [-target_ret]
/// 其中 a=1'Σ^(-1)1, b=1'Σ^(-1)μ, c=μ'Σ^(-1)μ
fn solve_target_return_closed_form(
    cov_inv: &DMatrix<f64>,
    mu: &DVector<f64>,
    n: usize,
    target_ret: f64,
) -> Option<Vec<f64>> {
    let ones = DVector::from_element(n, 1.0);
    let cov_inv_ones = cov_inv * &ones;
    let cov_inv_mu = cov_inv * mu;

    let a = ones.dot(&cov_inv_ones);  // 1'Σ^(-1)1
    let b = ones.dot(&cov_inv_mu);    // 1'Σ^(-1)μ
    let c = mu.dot(&cov_inv_mu);      // μ'Σ^(-1)μ

    let det = a * c - b * b;
    if det.abs() < 1e-15 { return None; }

    let lambda1 = (-c + b * target_ret) / det;
    let lambda2 = (a * target_ret - b) / det;

    let w = -lambda1 * &cov_inv_ones + lambda2 * &cov_inv_mu;
    Some(w.iter().copied().collect())
}

/// 最大夏普比率：子集枚举法
///
/// 枚举所有非空资产子集，对每个子集求无约束切线组合，
/// 若权重均非负则计算 Sharpe，取全局最优。
/// 对于 N≤15 的组合优化，2^N-1 次枚举完全可行，
/// 且保证找到全局最优解，不会陷入迭代投影法的局部最优。
fn solve_max_sharpe_qp(mu: &DVector<f64>, cov: &DMatrix<f64>, n: usize, min_w: f64, max_w: f64) -> Vec<f64> {
    if n == 0 { return vec![]; }
    if n == 1 { return vec![1.0_f64.clamp(min_w, max_w)]; }

    let rf = 0.02_f64;

    // N>15 时回退到闭式解+裁剪（实际组合优化 N 通常 ≤10）
    if n > 15 {
        return solve_max_sharpe_closed_form(mu, cov, n, min_w, max_w, rf);
    }

    let mut best_sharpe = f64::NEG_INFINITY;
    let mut best_weights: Vec<f64> = vec![1.0 / n as f64; n];

    // 枚举所有非空子集 (mask 从 1 到 2^N - 1)
    for mask in 1..(1u32 << n) {
        let active_idx: Vec<usize> = (0..n).filter(|&i| mask & (1 << i) != 0).collect();
        let active_n = active_idx.len();

        let sub_mean: Vec<f64> = active_idx.iter().map(|&i| mu[i]).collect();
        let sub_cov: DMatrix<f64> = DMatrix::from_row_slice(
            active_n, active_n,
            &active_idx.iter()
                .flat_map(|&i| active_idx.iter().map(move |&j| cov[(i, j)]))
                .collect::<Vec<f64>>(),
        );

        let sub_weights: Vec<f64>;

        if active_n == 1 {
            // 单资产组合
            sub_weights = vec![1.0];
        } else {
            // 无约束切线组合：w ∝ Σ⁻¹(μ - rf·1)
            let excess: Vec<f64> = sub_mean.iter().map(|&r| r - rf).collect();
            let sub_cov_pd = ensure_positive_definite(&sub_cov);
            let Some(sub_inv) = sub_cov_pd.try_inverse() else { continue };
            let excess_vec = DVector::from_column_slice(&excess);
            let sub_inv_excess = &sub_inv * &excess_vec;
            let denom: f64 = sub_inv_excess.iter().sum();

            // 超额收益之和 ≤ 0，此子集无有效切线组合
            if denom <= 1e-12 { continue; }

            let w: Vec<f64> = sub_inv_excess.iter().map(|&v| v / denom).collect();

            // 有负权重，不满足非负约束，跳过
            if w.iter().any(|&wi| wi < -1e-8) { continue; }

            sub_weights = w;
        }

        // 计算 Sharpe ratio
        let port_ret: f64 = sub_weights.iter().zip(sub_mean.iter()).map(|(wi, ri)| wi * ri).sum();
        let w_dvec = DVector::from_column_slice(&sub_weights);
        let port_vol_sq = (&w_dvec.transpose() * &sub_cov * &w_dvec)[(0, 0)];
        let port_vol = port_vol_sq.max(0.0).sqrt();
        let sharpe = if port_vol > 1e-10 { (port_ret - rf) / port_vol } else { f64::NEG_INFINITY };

        if sharpe > best_sharpe {
            best_sharpe = sharpe;
            best_weights = vec![0.0; n];
            for (k, &idx) in active_idx.iter().enumerate() {
                best_weights[idx] = sub_weights[k];
            }
        }
    }

    // 应用边界约束
    for w in &mut best_weights {
        *w = w.clamp(min_w, max_w);
    }
    let sum: f64 = best_weights.iter().sum();
    if sum > 0.0 {
        for w in &mut best_weights { *w /= sum; }
    }

    best_weights
}

/// 闭式切线组合 + 裁剪（仅用于 N>15 的大规模场景）
fn solve_max_sharpe_closed_form(
    mu: &DVector<f64>,
    cov: &DMatrix<f64>,
    n: usize,
    min_w: f64,
    max_w: f64,
    rf: f64,
) -> Vec<f64> {
    let cov_pd = ensure_positive_definite(cov);
    let ones = DVector::from_element(n, 1.0);

    if let Some(cov_inv) = cov_pd.clone().try_inverse() {
        let excess_ret = mu - DVector::from_element(n, rf);
        let cov_inv_excess = &cov_inv * &excess_ret;
        let denom = ones.dot(&cov_inv_excess);

        if denom > 1e-12 {
            let w = &cov_inv_excess / denom;
            let all_in_bounds = w.iter().all(|&wi| wi >= min_w - 1e-8 && wi <= max_w + 1e-8);
            if all_in_bounds {
                return w.iter().map(|&wi| wi.clamp(min_w, max_w)).collect();
            }
            // 有负权重，裁剪到非负后归一化
            let clipped: Vec<f64> = w.iter().map(|&wi| wi.max(0.0)).collect();
            let sum: f64 = clipped.iter().sum();
            if sum > 1e-12 {
                return clipped.iter().map(|&wi| wi / sum).collect();
            }
        }
    }

    // 回退到最小方差
    solve_min_volatility_qp(&cov_pd, n, min_w, max_w)
}

/// 最大收益：贪心分配（线性目标，无需梯度下降）
fn solve_max_return_qp(mu: &DVector<f64>, n: usize, min_w: f64, max_w: f64) -> Vec<f64> {
    if n == 0 { return vec![]; }
    if n == 1 { return vec![1.0_f64.clamp(min_w, max_w)]; }

    // 按收益率降序排列，贪心分配权重
    let mut indices: Vec<usize> = (0..n).collect();
    indices.sort_by(|&a, &b| mu[b].partial_cmp(&mu[a]).unwrap_or(std::cmp::Ordering::Equal));

    let mut weights = vec![min_w; n];
    let mut remaining = 1.0 - min_w * n as f64;

    for &idx in &indices {
        let add = remaining.min(max_w - min_w);
        weights[idx] += add;
        remaining -= add;
        if remaining <= 1e-12 { break; }
    }

    weights
}

/// 解析优化入口
fn optimize_analytical(
    mean_returns: &[f64],
    cov_matrix: &[Vec<f64>],
    objective: &str,
    min_weight: f64,
    max_weight: f64,
) -> Vec<f64> {
    let n = mean_returns.len();
    if n == 0 { return vec![]; }
    if n == 1 { return vec![1.0]; }

    let cov_data: Vec<f64> = cov_matrix.iter().flat_map(|r| r.iter().copied()).collect();
    let cov = DMatrix::from_row_slice(n, n, &cov_data);
    let mu = DVector::from_column_slice(mean_returns);

    match objective {
        "minVolatility" => solve_min_volatility_qp(&cov, n, min_weight, max_weight),
        "maxReturn" => solve_max_return_qp(&mu, n, min_weight, max_weight),
        _ => solve_max_sharpe_qp(&mu, &cov, n, min_weight, max_weight),
    }
}

/// 组合优化 - 优先二次规划闭式解，随机搜索作为fallback
pub fn optimize_portfolio(req: &OptimizeRequest) -> OptimizationResult {
    let min_weight = req.constraints.min_weight.unwrap_or(0.0);
    let max_weight = req.constraints.max_weight.unwrap_or(1.0);
    let (mean_returns, cov_matrix, valid_tickers) = calc_return_and_cov(&req.tickers, &req.price_data);

    if valid_tickers.is_empty() {
        return OptimizationResult {
            optimal_weights: HashMap::new(),
            expected_return: 0.0,
            expected_volatility: 0.0,
            sharpe_ratio: 0.0,
        };
    }

    let n = valid_tickers.len();
    let risk_free_rate = 0.02;

    let analytical_weights = optimize_analytical(
        &mean_returns, &cov_matrix, &req.objective, min_weight, max_weight,
    );

    let analytical_valid = !analytical_weights.is_empty()
        && (analytical_weights.iter().sum::<f64>() - 1.0).abs() < 0.01
        && analytical_weights.iter().all(|&w| w >= min_weight - 0.001 && w <= max_weight + 0.001);

    let best_weights = if analytical_valid {
        analytical_weights
    } else {
        // QP闭式解失败（如协方差矩阵严重不正定），回退到随机搜索
        let num_iterations = req.num_iterations.unwrap_or(10000);
        let mut rng = rand::rng();
        let mut best = vec![1.0 / n as f64; n];
        let mut best_score = f64::NEG_INFINITY;
        for _ in 0..num_iterations {
            let weights = generate_random_weights(n, min_weight, max_weight, &mut rng);
            let ret = calc_portfolio_return(&weights, &mean_returns);
            let vol = calc_portfolio_volatility(&weights, &cov_matrix);
            let sharpe = if vol > 0.0 { (ret - risk_free_rate) / vol } else { 0.0 };
            let score = match req.objective.as_str() {
                "minVolatility" => -vol,
                "maxReturn" => ret,
                _ => sharpe,
            };
            if score > best_score {
                best_score = score;
                best = weights;
            }
        }
        best
    };

    let mut optimal_weights = HashMap::new();
    for (i, ticker) in valid_tickers.iter().enumerate() {
        optimal_weights.insert(ticker.clone(), (best_weights[i] * 10000.0).round() / 10000.0);
    }

    let expected_return = calc_portfolio_return(&best_weights, &mean_returns);
    let expected_volatility = calc_portfolio_volatility(&best_weights, &cov_matrix);
    let sharpe_ratio = if expected_volatility > 0.0 {
        (expected_return - risk_free_rate) / expected_volatility
    } else { 0.0 };

    OptimizationResult {
        optimal_weights,
        expected_return,
        expected_volatility,
        sharpe_ratio,
    }
}

/// 计算有效前沿 - 使用二次规划闭式解
pub fn calc_efficient_frontier(req: &EfficientFrontierRequest) -> EfficientFrontierResult {
    let (mean_returns, cov_matrix, valid_tickers) = calc_return_and_cov(&req.tickers, &req.price_data);

    if valid_tickers.is_empty() {
        return EfficientFrontierResult { frontier: Vec::new() };
    }

    let n = valid_tickers.len();
    let risk_free_rate = 0.02;

    let cov_data: Vec<f64> = cov_matrix.iter().flat_map(|r| r.iter().copied()).collect();
    let cov = DMatrix::from_row_slice(n, n, &cov_data);
    let mu = DVector::from_column_slice(&mean_returns);
    let cov_pd = ensure_positive_definite(&cov);

    // 求最小波动率组合
    let min_vol_weights = solve_min_volatility_qp(&cov_pd, n, 0.0, 1.0);
    // 求最大收益组合
    let max_ret_weights = solve_max_return_qp(&mu, n, 0.0, 1.0);

    let min_vol_ret = calc_portfolio_return(&min_vol_weights, &mean_returns);
    let max_ret = calc_portfolio_return(&max_ret_weights, &mean_returns);

    if (max_ret - min_vol_ret).abs() < 1e-10 {
        let vol = calc_portfolio_volatility(&min_vol_weights, &cov_matrix);
        let sharpe = if vol > 0.0 { (min_vol_ret - risk_free_rate) / vol } else { 0.0 };
        let mut weight_map = HashMap::new();
        for (j, ticker) in valid_tickers.iter().enumerate() {
            weight_map.insert(ticker.clone(), (min_vol_weights[j] * 10000.0).round() / 10000.0);
        }
        return EfficientFrontierResult {
            frontier: vec![EfficientFrontierPoint {
                weights: weight_map,
                expected_return: min_vol_ret,
                expected_volatility: vol,
                sharpe_ratio: sharpe,
            }],
        };
    }

    let mut frontier = Vec::with_capacity(req.num_points);

    // 尝试用闭式解生成有效前沿
    if let Some(cov_inv) = cov_pd.clone().try_inverse() {
        for i in 0..req.num_points {
            let alpha = i as f64 / (req.num_points - 1).max(1) as f64;
            let target_ret = min_vol_ret + alpha * (max_ret - min_vol_ret);

            let weights: Vec<f64> = if let Some(w) = solve_target_return_closed_form(&cov_inv, &mu, n, target_ret) {
                // 检查闭式解是否满足非负约束
                if w.iter().all(|&wi| wi >= -1e-8) {
                    // 满足约束，归一化后使用
                    let sum: f64 = w.iter().map(|v| v.max(0.0)).sum();
                    if sum > 1e-12 {
                        w.iter().map(|&v| v.max(0.0) / sum).collect()
                    } else {
                        // 闭式解失败，线性插值兜底
                        (0..n)
                            .map(|j| (1.0 - alpha) * min_vol_weights[j] + alpha * max_ret_weights[j])
                            .collect()
                    }
                } else {
                    // 闭式解有负权重，投影法会严重扭曲权重，
                    // 改用线性插值（minVol → maxReturn）保证 VTI 等高收益资产被包含
                    (0..n)
                        .map(|j| (1.0 - alpha) * min_vol_weights[j] + alpha * max_ret_weights[j])
                        .collect()
                }
            } else {
                // 闭式解失败，线性插值兜底
                (0..n)
                    .map(|j| (1.0 - alpha) * min_vol_weights[j] + alpha * max_ret_weights[j])
                    .collect()
            };

            let ret = calc_portfolio_return(&weights, &mean_returns);
            let vol = calc_portfolio_volatility(&weights, &cov_matrix);
            let sharpe = if vol > 0.0 { (ret - risk_free_rate) / vol } else { 0.0 };

            let mut weight_map = HashMap::new();
            for (j, ticker) in valid_tickers.iter().enumerate() {
                weight_map.insert(ticker.clone(), (weights[j] * 10000.0).round() / 10000.0);
            }

            frontier.push(EfficientFrontierPoint {
                weights: weight_map,
                expected_return: ret,
                expected_volatility: vol,
                sharpe_ratio: sharpe,
            });
        }
    } else {
        // 协方差矩阵不可逆，使用线性插值
        for i in 0..req.num_points {
            let alpha = i as f64 / (req.num_points - 1).max(1) as f64;
            let mut weights: Vec<f64> = (0..n)
                .map(|j| (1.0 - alpha) * min_vol_weights[j] + alpha * max_ret_weights[j])
                .collect();
            let sum: f64 = weights.iter().sum();
            if sum.abs() > 1e-12 {
                for w in &mut weights { *w /= sum; }
            }

            let ret = calc_portfolio_return(&weights, &mean_returns);
            let vol = calc_portfolio_volatility(&weights, &cov_matrix);
            let sharpe = if vol > 0.0 { (ret - risk_free_rate) / vol } else { 0.0 };

            let mut weight_map = HashMap::new();
            for (j, ticker) in valid_tickers.iter().enumerate() {
                weight_map.insert(ticker.clone(), (weights[j] * 10000.0).round() / 10000.0);
            }

            frontier.push(EfficientFrontierPoint {
                weights: weight_map,
                expected_return: ret,
                expected_volatility: vol,
                sharpe_ratio: sharpe,
            });
        }
    }

    EfficientFrontierResult { frontier }
}
