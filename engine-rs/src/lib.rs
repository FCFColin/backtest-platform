//! Rust 回测引擎库入口。
//!
//! 对外暴露回测（[`engine`]）、蒙特卡洛模拟（[`monte_carlo`]）与
//! 组合优化（[`optimizer`]）三个核心模块，供二进制或其他 crate 调用。

pub mod engine;
pub mod monte_carlo;
pub mod optimizer;
pub mod analysis;
