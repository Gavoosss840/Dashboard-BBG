import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { ClientsPage } from "./pages/ClientsPage";
import { ClientDetailPage } from "./pages/ClientDetailPage";
import { PortfolioPage } from "./pages/PortfolioPage";
import { FinancierPage } from "./pages/FinancierPage";
import { MandatesPage } from "./pages/MandatesPage";
import { CrmPage } from "./pages/CrmPage";
import { MarketPage } from "./pages/MarketPage";
import { EarningsPage } from "./pages/EarningsPage";
import { ReferencePage } from "./pages/ReferencePage";
import { UsersPage } from "./pages/UsersPage";
import { AllocationPage } from "./pages/AllocationPage";

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/clients/:id" element={<ClientDetailPage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/financier" element={<FinancierPage />} />
        <Route path="/mandates" element={<MandatesPage />} />
        <Route path="/crm" element={<CrmPage />} />
        <Route path="/market" element={<MarketPage />} />
        <Route path="/earnings" element={<EarningsPage />} />
        <Route path="/reference" element={<ReferencePage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/allocation" element={<AllocationPage />} />
      </Routes>
    </Layout>
  );
}

export default App;
