import { WalletBar } from "./components/WalletBar";
import { Dashboard } from "./components/Dashboard";
import { History } from "./components/History";

export default function App() {
  return (
    <div className="app">
      <WalletBar />
      <main className="content">
        <Dashboard />
        <History />
      </main>
      <footer className="footer">
        <span>DLottery · decentralized on-chain lottery · settlement by smart contract</span>
      </footer>
    </div>
  );
}
