// staff_frontend/src/components/dashboard/Admin.jsx — admin portal.
import StaffShell from "./StaffShell";
import RegisterForm from "../../pages/RegisterForm";
import DepositPage  from "../../pages/DepositPage";
import UpdateProfilePage from "../../pages/UpdateProfilePage";
import UsersPage from "../../pages/UsersPage";
import FraudPage from "../../pages/FraudPage";

const MENU = [
  { key: "consult-users", icon: "user",    label: "Users",               group: "User management", sub: "Search, edit, suspend or reactivate accounts" },
  { key: "create-user",   icon: "plus",    label: "Create user",         group: "User management", sub: "Register a customer, employee or admin" },
  { key: "deposit",       icon: "cash",    label: "Deposit",             group: "Operations",      sub: "Credit a customer account at the counter" },
  { key: "fraud-notif",   icon: "alert",   label: "Fraud alerts",        group: "Fraud",           sub: "Open High / Critical verdicts, refreshed live" },
  { key: "fraud-tx",      icon: "shield",  label: "Fraud transactions",  group: "Fraud",           sub: "Cancel with compensating entries or dismiss as benign" },
  { key: "fraud-stats",   icon: "zap",     label: "Fraud statistics",    group: "Fraud",           sub: "Pipeline KPIs and model metadata" },
  { key: "profile",       icon: "lock",    label: "Profile & security",  group: "Account",         sub: "Contact details and password" },
];

export default function AdminDashboard() {
  return (
    <StaffShell menu={MENU} initial="consult-users" portal="Admin portal" render={(k) => (
      k === "create-user"   ? <RegisterForm /> :
      k === "consult-users" ? <UsersPage /> :
      k === "deposit"       ? <DepositPage /> :
      k === "profile"       ? <UpdateProfilePage /> :
      k === "fraud-notif"   ? <FraudPage view="notifications" /> :
      k === "fraud-tx"      ? <FraudPage view="transactions" /> :
      k === "fraud-stats"   ? <FraudPage view="stats" /> : null
    )} />
  );
}
