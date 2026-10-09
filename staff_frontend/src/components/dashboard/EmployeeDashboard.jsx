// staff_frontend/src/components/dashboard/EmployeeDashboard.jsx — teller portal.
import StaffShell from "./StaffShell";
import DepositPage from "../../pages/DepositPage";
import UpdateProfilePage from "../../pages/UpdateProfilePage";
import FraudPage from "../../pages/FraudPage";

const MENU = [
  { key: "deposit",     icon: "cash",   label: "Deposit",            group: "Operations", sub: "Credit a customer account at the counter" },
  { key: "fraud-notif", icon: "alert",  label: "Fraud alerts",       group: "Fraud",      sub: "Open High / Critical verdicts, refreshed live" },
  { key: "fraud-tx",    icon: "shield", label: "Treat fraud",        group: "Fraud",      sub: "Cancel with compensating entries or dismiss as benign" },
  { key: "fraud-stats", icon: "zap",    label: "Fraud statistics",   group: "Fraud",      sub: "Pipeline KPIs and model metadata" },
  { key: "profile",     icon: "lock",   label: "Profile & security", group: "Account",    sub: "Contact details and password" },
];

export default function EmployeeDashboard() {
  return (
    <StaffShell menu={MENU} initial="deposit" portal="Staff portal" render={(k) => (
      k === "deposit"     ? <DepositPage /> :
      k === "profile"     ? <UpdateProfilePage /> :
      k === "fraud-notif" ? <FraudPage view="notifications" /> :
      k === "fraud-tx"    ? <FraudPage view="transactions" /> :
      k === "fraud-stats" ? <FraudPage view="stats" /> : null
    )} />
  );
}
