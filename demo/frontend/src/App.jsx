import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import DemoPage from './pages/DemoPage';

function App() {
    return (
        <Router>
            <Routes>
                <Route element={<MainLayout><DemoPage /></MainLayout>} path="/" />
            </Routes>
        </Router>
    );
}

export default App;
