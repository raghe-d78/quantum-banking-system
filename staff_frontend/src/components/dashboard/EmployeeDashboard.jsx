// staff_frontend/src/components/dashboard/EmployeeDashboard.jsx — teller portal.
import StaffShell from "./StaffShell";
import DepositPage from "../../pages/DepositPage";
import UpdateProfilePage from "../../pages/UpdateProfilePage";
import FraudPage from "../../pages/FraudPage";
import DocumentReviewPage from "../../pages/DocumentReviewPage";

const MENU = [
  { key: "deposit",     icon: "cash",   label: "Deposit",            group: "Operations", sub: "Credit a customer account at the counter" },
  { key: "fraud-notif", icon: "alert",  label: "Fraud alerts",       group: "Fraud",      sub: "Open High / Critical verdicts, refreshed live" },
  { key: "fraud-tx",    icon: "shield", label: "Treat fraud",        group: "Fraud",      sub: "Cancel with compensating entries or dismiss as benign" },
  { key: "fraud-stats", icon: "zap",    label: "Fraud statistics",   group: "Fraud",      sub: "Pipeline KPIs and model metadata" },
  { key: "doc-holds",   icon: "receipt", label: "Document review",   group: "Documents",  sub: "Transactions held by the document-risk policy: inspect, release or reject" },
  { key: "doc-all",     icon: "search",  label: "Analysed documents", group: "Documents", sub: "Every uploaded document with OCR fields and integrity signals" },
  { key: "doc-sign",    icon: "lock",    label: "Signature enrolment", group: "Documents", sub: "Reference signatures used for similarity checks" },
  { key: "profile",     icon: "lock",   label: "Profile & security", group: "Account",    sub: "Contact details and password" },
];

export default function EmployeeDashboard() {
  return (
    <StaffShell menu={MENU} initial="deposit" portal="Staff portal" render={(k) => (
      k === "deposit"     ? <DepositPage /> :
      k === "profile"     ? <UpdateProfilePage /> :
      k === "fraud-notif" ? <FraudPage view="notifications" /> :
      k === "fraud-tx"    ? <FraudPage view="transactions" /> :
      k === "fraud-stats" ? <FraudPage view="stats" /> :
      k === "doc-holds"   ? <DocumentReviewPage view="holds" /> :
      k === "doc-all"     ? <DocumentReviewPage view="documents" /> :
      k === "doc-sign"    ? <DocumentReviewPage view="signatures" /> : null
    )} />
  );
}
