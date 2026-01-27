import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import LandingPage from './pages/LandingPage';
import DashboardLayout from './pages/Dashboard';
import ProvidersPage from './pages/ProvidersPage';
import DocsPage from './pages/DocsPage';

// Dashboard Components
import Overview from './components/dashboard/Overview';
import Portfolio from './components/dashboard/Portfolio';
import History from './components/dashboard/History';
import Settings from './components/dashboard/Settings';

function App() {
    return (
        <Router>
            <Routes>
                {/* Public Pages wrapped in MainLayout */}
                <Route element={<MainLayout><LandingPage /></MainLayout>} path="/" />
                <Route element={<MainLayout><ProvidersPage /></MainLayout>} path="/providers" />
                <Route element={<MainLayout><DocsPage /></MainLayout>} path="/docs" />

                {/* Dashboard Routes (Layout handles the shell) */}
                <Route path="/dashboard" element={<DashboardLayout />}>
                    <Route index element={<Overview />} />
                    <Route path="market" element={<Overview />} /> {/* Reuse Overview for Market for now */}
                    <Route path="portfolio" element={<Portfolio />} />
                    <Route path="history" element={<History />} />
                    <Route path="settings" element={<Settings />} />
                </Route>
            </Routes>
        </Router>
    );
}

export default App;
