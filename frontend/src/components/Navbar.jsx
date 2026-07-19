import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function Navbar() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <Link to="/dashboard" className="navbar-logo">
        <div className="navbar-logo-icon">⚖️</div>
        <span className="navbar-logo-text">Reconciler</span>
      </Link>

      <div className="navbar-right">
        <div className="navbar-user">
          👤 {user.email || 'User'}
        </div>
        <button id="nav-logout" className="btn btn-ghost btn-sm" onClick={handleLogout}>
          Sign out
        </button>
      </div>
    </nav>
  );
}
