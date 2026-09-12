import PropTypes from "prop-types";
import { LayoutGrid, LogOut, ReceiptText, ShoppingBasket } from "lucide-react";

const roleNames = { manager: "Менеджер", cashier: "Кассир", auditor: "Аудитор" };

export default function WorkspaceNav({ tab, user, onCatalog, onReceipts, onLogout }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <ShoppingBasket /> маркет<span>36</span>
      </div>
      <p className="sidebar-caption">УПРАВЛЕНИЕ МАГАЗИНОМ</p>
      <nav>
        <button className={tab === "catalog" ? "nav-item active" : "nav-item"} onClick={onCatalog}>
          <LayoutGrid size={20} /> Каталог товаров
        </button>
        <button className={tab === "receipts" ? "nav-item active" : "nav-item"} onClick={onReceipts}>
          <ReceiptText size={20} /> История чеков
        </button>
      </nav>
      <div className="sidebar-note">
        <span className="dot" /> Единая база товаров
        <p>Точные остатки.<br />Понятные продажи.</p>
      </div>
      <div className="profile">
        <span className="avatar">{user.display_name.slice(0, 1)}</span>
        <div>
          <strong>{user.display_name}</strong>
          <small>{roleNames[user.role]}</small>
        </div>
        <button className="icon-button" onClick={onLogout} aria-label="Выйти">
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
}

WorkspaceNav.propTypes = {
  tab: PropTypes.oneOf(["catalog", "receipts"]).isRequired,
  user: PropTypes.shape({ display_name: PropTypes.string.isRequired, role: PropTypes.string.isRequired }).isRequired,
  onCatalog: PropTypes.func.isRequired,
  onReceipts: PropTypes.func.isRequired,
  onLogout: PropTypes.func.isRequired,
};
