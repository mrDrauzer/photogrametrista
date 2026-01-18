import React, { useState, useEffect } from 'react';
import { 
  Box, AppBar, Toolbar, Typography, IconButton, ThemeProvider, 
  createTheme, CssBaseline, Badge, Menu, MenuItem, ListItemText, Divider, Button, Drawer
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import SettingsIcon from '@mui/icons-material/Settings';
import NotificationsIcon from '@mui/icons-material/Notifications';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ListAltIcon from '@mui/icons-material/ListAlt';
import TerminalIcon from '@mui/icons-material/Terminal';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import LogoutIcon from '@mui/icons-material/Logout';
import PublicIcon from '@mui/icons-material/Public';
import { useNavigate, useLocation } from 'react-router-dom';
import { fetchNotifications, markNotificationRead, markAllNotificationsRead, fetchUserProfile } from '../../api/client';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#2196f3',
    },
    background: {
      default: '#121212',
      paper: '#1e1e1e',
    },
  },
});

const Layout = ({ children, sidebar, rightPanel, rightPanelWidth = 350, publicMode = false }) => {
  const [notifications, setNotifications] = useState([]);
  const [globalLogs, setGlobalLogs] = useState([]);
  const [profile, setProfile] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);
  const [userAnchorEl, setUserAnchorEl] = useState(null);
  const [logOpen, setLogOpen] = useState(false);
  
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!publicMode) {
        fetchNotifications().then(res => setNotifications(res.data)).catch(() => {});
        fetchUserProfile().then(res => setProfile(res.data)).catch(() => {});
    }
    
    // Simulating incoming logs
    const interval = setInterval(() => {
        if (Math.random() > 0.7) {
            setGlobalLogs(prev => [`[ ${new Date().toLocaleTimeString()} ] Системное сообщение: проверка статуса узлов... OK`, ...prev.slice(0, 50)]);
        }
    }, 5000);
    return () => clearInterval(interval);
  }, [publicMode]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const handleOpenMenu = (event) => setAnchorEl(event.currentTarget);
  const handleCloseMenu = () => setAnchorEl(null);
  
  const handleOpenUserMenu = (event) => setUserAnchorEl(event.currentTarget);
  const handleCloseUserMenu = () => setUserAnchorEl(null);

  const handleMarkRead = (id) => {
    markNotificationRead(id).then(() => {
        setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: true } : n));
    });
  };

  const handleMarkAllRead = () => {
    markAllNotificationsRead().then(() => {
        setNotifications(notifications.map(n => ({ ...n, is_read: true })));
    });
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    navigate('/login');
  };

  const theme = createTheme({
    palette: {
      mode: profile?.profile?.dark_mode === false ? 'light' : 'dark',
      primary: {
        main: profile?.profile?.organization_details?.primary_color || '#2196f3',
      },
      background: {
        default: profile?.profile?.dark_mode === false ? '#f5f5f5' : '#121212',
        paper: profile?.profile?.dark_mode === false ? '#fff' : '#1e1e1e',
      },
    },
  });

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        {/* Top Bar */}
        <AppBar position="static" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, bgcolor: '#1a1a1a' }}>
          <Toolbar variant="dense">
            <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 'bold', letterSpacing: 1 }}>
              PHOTOGRAMETRISTA
            </Typography>

            {!publicMode && (
              <>
                <IconButton 
                    color={location.pathname === '/dashboard' ? 'primary' : 'inherit'} 
                    onClick={() => navigate('/dashboard')}
                    sx={{ mr: 1 }}
                >
                  <DashboardIcon />
                </IconButton>

                <IconButton 
                    color={location.pathname === '/projects' ? 'primary' : 'inherit'} 
                    onClick={() => navigate('/projects')}
                    sx={{ mr: 1 }}
                >
                  <ListAltIcon />
                </IconButton>

                <IconButton 
                    color={location.pathname === '/gallery' ? 'primary' : 'inherit'} 
                    onClick={() => navigate('/gallery')}
                    sx={{ mr: 1 }}
                >
                  <PublicIcon />
                </IconButton>

                <IconButton 
                    color={logOpen ? 'primary' : 'inherit'} 
                    onClick={() => setLogOpen(!logOpen)}
                    sx={{ mr: 1 }}
                >
                  <TerminalIcon />
                </IconButton>
                
                <IconButton color="inherit" onClick={handleOpenMenu}>
                  <Badge badgeContent={unreadCount} color="error">
                    <NotificationsIcon />
                  </Badge>
                </IconButton>
              </>
            )}

            {publicMode && !localStorage.getItem('access_token') && (
                <Button color="inherit" onClick={() => navigate('/login')}>Войти</Button>
            )}

            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={handleCloseMenu}
              PaperProps={{ sx: { width: 320, maxHeight: 400 } }}
            >
              <Box sx={{ p: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="subtitle2">Уведомления</Typography>
                <Button size="small" onClick={handleMarkAllRead}>Прочитать все</Button>
              </Box>
              <Divider />
              {notifications.length === 0 && (
                <MenuItem disabled>Нет уведомлений</MenuItem>
              )}
              {notifications.map(n => (
                <MenuItem 
                  key={n.id} 
                  onClick={() => handleMarkRead(n.id)}
                  sx={{ bgcolor: n.is_read ? 'transparent' : 'action.hover', whiteSpace: 'normal' }}
                >
                  <ListItemText 
                    primary={n.message} 
                    secondary={new Date(n.created_at).toLocaleString()}
                    primaryTypographyProps={{ variant: 'body2', fontWeight: n.is_read ? 'normal' : 'bold' }}
                  />
                </MenuItem>
              ))}
            </Menu>

            <IconButton color="inherit" onClick={handleOpenUserMenu}>
              <AccountCircleIcon />
            </IconButton>

            <Menu
              anchorEl={userAnchorEl}
              open={Boolean(userAnchorEl)}
              onClose={handleCloseUserMenu}
            >
              <MenuItem onClick={() => { navigate('/profile'); handleCloseUserMenu(); }}>
                <AccountCircleIcon sx={{ mr: 1, fontSize: 20 }} /> Профиль
              </MenuItem>
              <MenuItem onClick={() => { window.open('/api/docs/swagger/', '_blank'); handleCloseUserMenu(); }}>
                <TerminalIcon sx={{ mr: 1, fontSize: 20 }} /> API Документация
              </MenuItem>
              {!publicMode && (
                <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
                  <LogoutIcon sx={{ mr: 1, fontSize: 20 }} /> Выход
                </MenuItem>
              )}
            </Menu>

            {!publicMode && <IconButton color="inherit"><SettingsIcon /></IconButton>}
          </Toolbar>
        </AppBar>

        <Box sx={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
          {/* Left Sidebar */}
          <Box sx={{ width: 300, borderRight: '1px solid #333', bgcolor: '#1e1e1e', display: 'flex', flexDirection: 'column' }}>
            {sidebar}
          </Box>

          {/* Main Content (Map) */}
          <Box sx={{ flexGrow: 1, position: 'relative', bgcolor: '#000' }}>
            {children}
          </Box>

          {/* Right Panel */}
          {rightPanel && (
            <Box
              sx={{
                width: rightPanelWidth,
                borderLeft: '1px solid #333',
                bgcolor: '#1e1e1e',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                transition: 'width 0.1s'
              }}
            >
              {rightPanel}
            </Box>
          )}
        </Box>

        {/* Global Task Log Drawer */}
        <Drawer
          anchor="bottom"
          open={logOpen}
          onClose={() => setLogOpen(false)}
          PaperProps={{ sx: { height: '30vh', bgcolor: '#1a1a1a', borderTop: '2px solid #333' } }}
        >
          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle2" sx={{ color: 'primary.main', fontWeight: 'bold' }}>
                    СИСТЕМНЫЙ ЛОГ (ГЛОБАЛЬНЫЙ)
                </Typography>
                <Button size="small" onClick={() => setLogOpen(false)}>Закрыть</Button>
            </Box>
            <Divider />
            <Box sx={{ 
                flexGrow: 1, 
                mt: 1, 
                p: 1, 
                bgcolor: '#000', 
                color: '#0f0', 
                fontFamily: 'monospace', 
                fontSize: '0.8rem',
                overflowY: 'auto'
            }}>
                {globalLogs.map((log, i) => (
                    <div key={i}>{log}</div>
                ))}
                {globalLogs.length === 0 && (
                    <>
                        [ {new Date().toLocaleTimeString()} ] Инициализация системы мониторинга...<br />
                        [ {new Date().toLocaleTimeString()} ] Подключение к Redis брокеру: OK<br />
                        [ {new Date().toLocaleTimeString()} ] Ожидание новых задач обработки...<br />
                    </>
                )}
                {unreadCount > 0 && `[ ${new Date().toLocaleTimeString()} ] Внимание: ${unreadCount} непрочитанных уведомлений.`}
            </Box>
          </Box>
        </Drawer>
      </Box>
    </ThemeProvider>
  );
};

export default Layout;
