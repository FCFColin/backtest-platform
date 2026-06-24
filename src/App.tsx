import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import ErrorBoundary from "@/components/ErrorBoundary";
import Navbar from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import Toast from "@/components/Toast";
import BacktestPage from "@/pages/BacktestPage";
import AnalysisPage from "@/pages/AnalysisPage";
import MonteCarloPage from "@/pages/MonteCarloPage";
import OptimizerPage from "@/pages/OptimizerPage";
import EfficientFrontierPage from "@/pages/EfficientFrontierPage";
import DataEnginePage from "@/pages/DataEnginePage";
import AboutPage from "@/pages/AboutPage";
import ContactPage from "@/pages/ContactPage";
import RebalancingSensitivityPage from "@/pages/RebalancingSensitivityPage";
import LumpSumVsDCAPage from "@/pages/LumpSumVsDCAPage";
import FactorRegressionPage from "@/pages/FactorRegressionPage";
import CalculatorsPage from "@/pages/CalculatorsPage";
import TacticalPage from "@/pages/TacticalPage";
import BacktestOptimizerPage from "@/pages/BacktestOptimizerPage";
import PCAPage from "@/pages/PCAPage";
import SignalAnalyzerPage from "@/pages/SignalAnalyzerPage";
import DualSignalPage from "@/pages/DualSignalPage";
import MultiSignalPage from "@/pages/MultiSignalPage";
import LETFSlippagePage from "@/pages/LETFSlippagePage";
import TacticalGridPage from "@/pages/TacticalGridPage";
import GoalOptimizerPage from "@/pages/GoalOptimizerPage";
import HelpPage from "@/pages/HelpPage";
import ChangelogPage from "@/pages/ChangelogPage";
import PricingPage from "@/pages/PricingPage";
import AccountPage from "@/pages/AccountPage";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import SystemMonitor from "@/pages/admin/SystemMonitor";
import DataManagement from "@/pages/admin/DataManagement";
import SystemSettings from "@/pages/admin/SystemSettings";

function AppLayout() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith("/admin");

  return (
    <>
      {!isAdmin && <Navbar />}
      <Toast />
      <Routes>
        <Route path="/" element={<BacktestPage />} />
        <Route path="/analysis" element={<AnalysisPage />} />
        <Route path="/monte-carlo" element={<MonteCarloPage />} />
        <Route path="/optimizer" element={<OptimizerPage />} />
        <Route path="/efficient-frontier" element={<EfficientFrontierPage />} />
        <Route path="/data-engine" element={<DataEnginePage />} />
        <Route path="/rebalancing-sensitivity" element={<RebalancingSensitivityPage />} />
        <Route path="/lumpsum-vs-dca" element={<LumpSumVsDCAPage />} />
        <Route path="/factor-regression" element={<FactorRegressionPage />} />
        <Route path="/calculators" element={<CalculatorsPage />} />
        <Route path="/tactical" element={<TacticalPage />} />
        <Route path="/backtest-optimizer" element={<BacktestOptimizerPage />} />
        <Route path="/pca" element={<PCAPage />} />
        <Route path="/signal-analyzer" element={<SignalAnalyzerPage />} />
        <Route path="/dual-signal" element={<DualSignalPage />} />
        <Route path="/multi-signal" element={<MultiSignalPage />} />
        <Route path="/letf-slippage" element={<LETFSlippagePage />} />
        <Route path="/tactical-grid" element={<TacticalGridPage />} />
        <Route path="/goal-optimizer" element={<GoalOptimizerPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/changelog" element={<ChangelogPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/limits" element={<AboutPage section="limits" />} />
        <Route path="/upgrade" element={<AboutPage section="upgrade" />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="monitor" element={<SystemMonitor />} />
          <Route path="data" element={<DataManagement />} />
          <Route path="settings" element={<SystemSettings />} />
        </Route>
      </Routes>
      {!isAdmin && <Footer />}
    </>
  );
}

export default function App() {
  return (
    <Router>
      <ErrorBoundary>
        <AppLayout />
      </ErrorBoundary>
    </Router>
  );
}
