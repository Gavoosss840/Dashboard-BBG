import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ClientsPage } from "./pages/ClientsPage";
import { ClientDetailPage } from "./pages/ClientDetailPage";
import { PortfolioPage } from "./pages/PortfolioPage";
import { FinancierPage } from "./pages/FinancierPage";
import { CompliancePage } from "./pages/CompliancePage";
import { MandatesPage } from "./pages/MandatesPage";
import { CrmPage } from "./pages/CrmPage";
import { MarketPage } from "./pages/MarketPage";
import { MarketsPage } from "./pages/MarketsPage";
import { ResearchPage } from "./pages/ResearchPage";
import { SecurityPage } from "./pages/SecurityPage";
import { EarningsPage } from "./pages/EarningsPage";
import { ReferencePage } from "./pages/ReferencePage";
import { UsersPage } from "./pages/UsersPage";
import { AllocationPage } from "./pages/AllocationPage";
import { DataSyncPage } from "./pages/DataSyncPage";
import { AuditPage } from "./pages/AuditPage";
import { useAuth } from "./context/AuthContext";
import { LoadingState } from "./components/ui/States";

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[var(--surface-0)]">
        <LoadingState />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/clients/:id" element={<ClientDetailPage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/financier" element={<FinancierPage />} />
        <Route path="/compliance" element={<CompliancePage />} />
        <Route path="/mandates" element={<MandatesPage />} />
        <Route path="/crm" element={<CrmPage />} />
        <Route path="/markets" element={<MarketsPage />} />
        <Route path="/market" element={<MarketPage />} />
        <Route path="/security/:symbol" element={<SecurityPage />} />
        <Route path="/research" element={<ResearchPage />} />
        <Route path="/research/:symbol" element={<ResearchPage />} />
        <Route path="/earnings" element={<EarningsPage />} />
        <Route path="/reference" element={<ReferencePage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/allocation" element={<AllocationPage />} />
        <Route path="/data" element={<DataSyncPage />} />
        <Route path="/audit" element={<AuditPage />} />
      </Routes>
    </Layout>
  );
}

export default App;
