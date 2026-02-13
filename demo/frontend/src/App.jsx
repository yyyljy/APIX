import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import DemoPage from './pages/DemoPage';
import TransactionHistoryPage from './pages/TransactionHistoryPage';

function App() {
    return (
        <Router>
            <Routes>
                <Route element={<MainLayout><DemoPage /></MainLayout>} path="/" />
                <Route element={<MainLayout><TransactionHistoryPage /></MainLayout>} path="/transactions" />
            </Routes>
        </Router>
    );
}

export default App;
