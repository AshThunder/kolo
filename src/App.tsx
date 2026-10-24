import { BrowserRouter, Routes, Route } from 'react-router-dom'

// Kolo pages
import Landing from './pages/kolo/Landing'
import CreateWizard from './pages/kolo/CreateWizard'
import PotPage from './pages/kolo/PotPage'
import PublicPot from './pages/kolo/PublicPot'
import VerifyReceipt from './pages/kolo/VerifyReceipt'
import PayeesDirectory from './pages/kolo/PayeesDirectory'
import PayeeDetail from './pages/kolo/PayeeDetail'
import PayeeStatus from './pages/kolo/PayeeStatus'
import PayeeApply from './pages/kolo/PayeeApply'
import OrganizerDashboard from './pages/kolo/OrganizerDashboard'
import CosignerApprove from './pages/kolo/CosignerApprove'
import RefundClaim from './pages/kolo/RefundClaim'
import SchoolPortal from './pages/kolo/SchoolPortal'
import MyPots from './pages/kolo/MyPots'
import HowItWorks from './pages/kolo/HowItWorks'
import AdminRegistry from './pages/kolo/AdminRegistry'
import WalletPage from './pages/kolo/WalletPage'
import PayLink from './pages/kolo/PayLink'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Landing */}
        <Route path="/" element={<Landing />} />

        {/* Create wizard */}
        <Route path="/create" element={<CreateWizard />} />

        {/* Pot pages */}
        <Route path="/pot/:slug" element={<PotPage />} />
        <Route path="/p/:slug" element={<PublicPot />} />
        <Route path="/pay/:slug" element={<PayLink />} />

        {/* Organiser / co-signer flows */}
        <Route path="/organizer/:slug" element={<OrganizerDashboard />} />
        <Route path="/cosign/:slug/:invoiceId" element={<CosignerApprove />} />
        <Route path="/refund/:slug" element={<RefundClaim />} />

        {/* Receipt verification */}
        <Route path="/verify/r/:chain/:tx/:log" element={<VerifyReceipt />} />

        {/* Payee registry */}
        <Route path="/payees" element={<PayeesDirectory />} />
        <Route path="/payees/apply" element={<PayeeApply />} />
        <Route path="/payees/status" element={<PayeeStatus />} />
        <Route path="/payees/:id" element={<PayeeDetail />} />

        {/* User flows */}
        <Route path="/my-pots" element={<MyPots />} />
        <Route path="/wallet" element={<WalletPage />} />
        <Route path="/school-portal" element={<SchoolPortal />} />

        {/* Info */}
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/admin" element={<AdminRegistry />} />
      </Routes>
    </BrowserRouter>
  )
}
