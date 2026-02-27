import { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  UsersRound,
  Bot,
  Settings,
  Menu,
  X,
  LogOut,
  ChevronLeft,
} from 'lucide-react';
import { useAuth } from '../App';
import clsx from 'clsx';

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/sellers', icon: Users, label: 'Vendedores' },
  { to: '/conversations', icon: MessageSquare, label: 'Conversas' },
  { to: '/team', icon: UsersRound, label: 'Equipes' },
  { to: '/agent', icon: Bot, label: 'Agente IA' },
  { to: '/settings', icon: Settings, label: 'Configurações' },
];

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/sellers': 'Vendedores',
  '/conversations': 'Conversas',
  '/team': 'Equipes',
  '/agent': 'Agente IA',
  '/settings': 'Configurações',
};

function getPageTitle(pathname) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (pathname.startsWith('/sellers/')) return 'Perfil do Vendedor';
  if (pathname.startsWith('/conversations/')) return 'Detalhes da Conversa';
  return 'MAVE';
}

function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { user, logoutUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Close mobile sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logoutUser();
    navigate('/login');
  };

  const pageTitle = getPageTitle(location.pathname);

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo area */}
      <div
        className={clsx(
          'flex items-center border-b border-gray-100 h-16 flex-shrink-0',
          collapsed ? 'justify-center px-2' : 'px-5 justify-between'
        )}
      >
        <div className={clsx('flex items-center gap-2.5', collapsed && 'justify-center w-full')}>
          <div className="w-8 h-8 bg-mave-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">M</span>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="text-base font-bold text-gray-900 leading-tight">MAVE</h1>
              <p className="text-[10px] text-gray-400 font-medium tracking-wide uppercase">Monitoramento</p>
            </div>
          )}
        </div>

        {/* Collapse toggle - desktop */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex items-center justify-center w-7 h-7 rounded-md hover:bg-gray-100 transition-colors"
        >
          <ChevronLeft
            className={clsx(
              'w-4 h-4 text-gray-400 transition-transform duration-200',
              collapsed && 'rotate-180'
            )}
          />
        </button>

        {/* Close button - mobile */}
        <button
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden flex items-center justify-center w-7 h-7 rounded-md hover:bg-gray-100 transition-colors"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              clsx(
                'sidebar-link',
                isActive
                  ? 'bg-mave-50 text-mave-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                collapsed && 'justify-center px-2'
              )
            }
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* User info */}
      <div className="border-t border-gray-100 flex-shrink-0 p-3">
        {!collapsed ? (
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-mave-100 flex items-center justify-center flex-shrink-0">
              <span className="text-mave-700 text-xs font-bold">
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user?.name || 'Usuário'}</p>
              <p className="text-xs text-gray-500 truncate">{user?.email || ''}</p>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
              title="Sair"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-mave-100 flex items-center justify-center">
              <span className="text-mave-700 text-xs font-bold">
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center py-2 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
              title="Sair"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 lg:hidden',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={clsx(
          'hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-gray-200 transition-all duration-200',
          collapsed ? 'lg:w-[72px]' : 'lg:w-64'
        )}
      >
        {sidebarContent}
      </aside>

      {/* Main content */}
      <div
        className={clsx(
          'transition-all duration-200',
          collapsed ? 'lg:pl-[72px]' : 'lg:pl-64'
        )}
      >
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-gray-200 flex items-center px-4 lg:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 -ml-2 mr-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-semibold text-gray-900">{pageTitle}</h2>
        </header>

        {/* Page content */}
        <main className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default Layout;
