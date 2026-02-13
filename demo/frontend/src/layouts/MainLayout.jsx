import { Link, useLocation } from "react-router-dom";

export default function MainLayout({ children }) {
  const location = useLocation();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-slate-900 text-sm font-bold text-white">
              A
            </div>
            <div>
              <p className="text-sm font-extrabold tracking-wide text-slate-900">
                APIX DEMO
              </p>
              <p className="text-xs text-slate-500">
                Machine-to-Machine Payment Gateway
              </p>
            </div>
          </div>
          <nav className="flex items-center gap-2 text-sm font-semibold">
            <Link
              to="/"
              className={`rounded-md px-3 py-2 transition ${
                location.pathname === "/"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Demo
            </Link>
            <Link
              to="/transactions"
              className={`rounded-md px-3 py-2 transition ${
                location.pathname === "/transactions"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Transactions
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-10 pt-8 md:px-6 md:pt-10">
        {children}
      </main>

      <footer className="border-t border-slate-200 bg-white/70">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-slate-500 md:flex-row md:items-center md:justify-between md:px-6">
          <span>2026 APIX Marketplace Demo Environment</span>
          <span>Identical Resource, Dual Payment Rails</span>
        </div>
      </footer>
    </div>
  );
}
