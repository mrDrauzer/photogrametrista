import React, { useState, useEffect } from 'react';
import { Box, Grid, Paper, Typography, CircularProgress, Card, CardContent, List, ListItem, ListItemText, Divider, Button as MuiButton } from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import ImageIcon from '@mui/icons-material/Image';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import StorageIcon from '@mui/icons-material/Storage';
import { fetchGlobalStats } from '../api/client';
import Layout from '../components/layout/Layout';
import { 
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area 
} from 'recharts';

const Dashboard = () => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isAdminMode, setIsAdminMode] = useState(false);
    const [clusterLoad, setClusterLoad] = useState({ cpu: 45, ram: 70 });

    useEffect(() => {
        const interval = setInterval(() => {
            setClusterLoad({
                cpu: Math.floor(Math.random() * 30) + 20, // 20-50%
                ram: Math.floor(Math.random() * 10) + 65, // 65-75%
            });
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        fetchGlobalStats()
            .then(res => {
                setStats(res.data);
                // Простая имитация проверки на админа (в реальном приложении - через токен или профиль)
                if (res.data.total_projects > 5) { // Пример условия
                    // setIsAdminMode(true);
                }
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>;

    const statItems = [
        { label: 'Всего проектов', value: stats?.total_projects || 0, icon: <FolderIcon color="primary" fontSize="large" /> },
        { label: 'Загружено снимков', value: stats?.total_files || 0, icon: <ImageIcon color="secondary" fontSize="large" /> },
        { label: 'Активных задач', value: stats?.active_tasks || 0, icon: <AutorenewIcon color="info" fontSize="large" /> },
        { label: 'Использовано памяти', value: `${stats?.storage_usage_mb || 0} MB`, icon: <StorageIcon color="warning" fontSize="large" /> },
    ];

    const chartData = [
        { name: 'Пн', tasks: 4, processing_time: 120, storage: 450 },
        { name: 'Вт', tasks: 7, processing_time: 210, storage: 520 },
        { name: 'Ср', tasks: 5, processing_time: 150, storage: 580 },
        { name: 'Чт', tasks: 12, processing_time: 320, storage: 750 },
        { name: 'Пт', tasks: 8, processing_time: 240, storage: 820 },
        { name: 'Сб', tasks: 3, processing_time: 90, storage: 850 },
        { name: 'Вс', tasks: 6, processing_time: 180, storage: 910 },
    ];

    return (
        <Layout>
            <Box sx={{ p: 4, height: '100%', overflowY: 'auto', bgcolor: '#121212', color: 'white' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Box>
                    <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold' }}>
                        ПАНЕЛЬ УПРАВЛЕНИЯ
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 4, color: 'grey.500' }}>
                        Обзор состояния системы и последних активностей
                    </Typography>
                </Box>
                <MuiButton 
                    variant="outlined" 
                    size="small" 
                    color={isAdminMode ? "secondary" : "primary"}
                    onClick={() => setIsAdminMode(!isAdminMode)}
                >
                    {isAdminMode ? "ВЕРНУТЬСЯ" : "АДМИН. ПАНЕЛЬ"}
                </MuiButton>
            </Box>

            {!isAdminMode ? (
                <Grid container spacing={3}>
                    {statItems.map((item, index) => (
                        <Grid item xs={12} sm={6} md={3} key={index}>
                            <Paper sx={{ p: 3, display: 'flex', alignItems: 'center', bgcolor: '#1e1e1e', border: '1px solid #333' }}>
                                <Box sx={{ mr: 2 }}>{item.icon}</Box>
                                <Box>
                                    <Typography variant="h4" sx={{ fontWeight: 'bold' }}>{item.value}</Typography>
                                    <Typography variant="caption" sx={{ color: 'grey.500' }}>{item.label}</Typography>
                                </Box>
                            </Paper>
                        </Grid>
                    ))}

                    {stats?.quotas && (
                        <Grid item xs={12}>
                            <Paper sx={{ p: 3, bgcolor: 'rgba(33, 150, 243, 0.05)', border: '1px solid #2196f3' }}>
                                <Typography variant="subtitle2" color="primary" gutterBottom sx={{ fontWeight: 'bold' }}>ЛИМИТЫ РЕСУРСОВ (QUOTAS)</Typography>
                                <Grid container spacing={4}>
                                    <Grid item xs={12} md={4}>
                                        <Typography variant="caption" display="block">Проекты: {stats?.total_projects || 0} / {stats?.quotas?.max_projects || 0}</Typography>
                                        <Box sx={{ width: '100%', height: 4, bgcolor: '#333', mt: 1 }}>
                                            <Box sx={{ width: `${((stats?.total_projects || 0) / (stats?.quotas?.max_projects || 1)) * 100}%`, height: '100%', bgcolor: 'primary.main' }} />
                                        </Box>
                                    </Grid>
                                    <Grid item xs={12} md={4}>
                                        <Typography variant="caption" display="block">Хранилище: {stats?.storage_usage_mb || 0} MB / {(stats?.quotas?.max_storage_gb || 0) * 1024} MB</Typography>
                                        <Box sx={{ width: '100%', height: 4, bgcolor: '#333', mt: 1 }}>
                                            <Box sx={{ width: `${((stats?.storage_usage_mb || 0) / ((stats?.quotas?.max_storage_gb || 1) * 1024)) * 100}%`, height: '100%', bgcolor: 'warning.main' }} />
                                        </Box>
                                    </Grid>
                                    <Grid item xs={12} md={4}>
                                        <Typography variant="caption" display="block">AI Инструменты: {stats?.quotas?.can_use_ai ? 'ДОСТУПНО' : 'НЕДОСТУПНО'}</Typography>
                                        <Typography variant="caption" color={stats?.quotas?.can_use_ai ? "success.main" : "error.main"} sx={{ fontWeight: 'bold' }}>
                                            {stats?.quotas?.can_use_ai ? "✓ PREMIUM" : "⚠ UPGRADE NEEDED"}
                                        </Typography>
                                    </Grid>
                                </Grid>
                            </Paper>
                        </Grid>
                    )}
                    {/* ... rest of the normal dashboard code ... */}

                <Grid item xs={12} md={8}>
                    <Paper sx={{ p: 3, bgcolor: '#1e1e1e', border: '1px solid #333', mb: 3 }}>
                        <Typography variant="h6" gutterBottom>Активность и хранилище</Typography>
                        <Box sx={{ height: 350, width: '100%', mt: 2 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData}>
                                    <defs>
                                        <linearGradient id="colorTasks" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#2196f3" stopOpacity={0.8}/>
                                            <stop offset="95%" stopColor="#2196f3" stopOpacity={0}/>
                                        </linearGradient>
                                        <linearGradient id="colorStorage" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#ff9800" stopOpacity={0.8}/>
                                            <stop offset="95%" stopColor="#ff9800" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                    <XAxis dataKey="name" stroke="#666" />
                                    <YAxis stroke="#666" />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #333' }}
                                    />
                                    <Area type="monotone" dataKey="tasks" stroke="#2196f3" fillOpacity={0.6} fill="url(#colorTasks)" name="Задачи" />
                                    <Area type="monotone" dataKey="storage" stroke="#ff9800" fillOpacity={0.3} fill="url(#colorStorage)" name="Хранилище (MB)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </Box>
                    </Paper>

                    <Card sx={{ bgcolor: '#1e1e1e', border: '1px solid #333' }}>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>Последние уведомления</Typography>
                            <Divider sx={{ my: 1 }} />
                            <List>
                                {(!stats?.recent_notifications || stats.recent_notifications.length === 0) && (
                                    <Typography variant="body2" sx={{ p: 2, color: 'grey.500' }}>Уведомлений нет</Typography>
                                )}
                                {stats?.recent_notifications?.map((n, i) => (
                                    <ListItem key={i} divider={i < stats.recent_notifications.length - 1}>
                                        <ListItemText 
                                            primary={n.message} 
                                            secondary={new Date(n.created_at).toLocaleString()} 
                                            primaryTypographyProps={{ variant: 'body2' }}
                                        />
                                    </ListItem>
                                ))}
                            </List>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} md={4}>
                    <Card sx={{ bgcolor: '#1e1e1e', border: '1px solid #333', height: '100%' }}>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>Статус инфраструктуры</Typography>
                            <Divider sx={{ my: 1 }} />
                            <Box sx={{ mt: 2 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                    <Typography variant="body2">База данных (PostGIS)</Typography>
                                    <Typography variant="body2" color="success.main">ONLINE</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                    <Typography variant="body2">Брокер задач (Redis)</Typography>
                                    <Typography variant="body2" color="success.main">ONLINE</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                    <Typography variant="body2">Воркеры Celery</Typography>
                                    <Typography variant="body2" color="success.main">3 ACTIVE</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                    <Typography variant="body2">Хранилище (S3/Media)</Typography>
                                    <Typography variant="body2" color="success.main">HEALTHY</Typography>
                                </Box>
                                <Divider sx={{ my: 1 }} />
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                    <Typography variant="caption" sx={{ color: 'grey.500' }}>Последний бэкап</Typography>
                                    <Typography variant="caption" sx={{ color: 'grey.500' }}>Сегодня, 03:00</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="caption" sx={{ color: 'grey.500' }}>Uptime</Typography>
                                    <Typography variant="caption" sx={{ color: 'grey.500' }}>14д 05ч 22м</Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
            ) : (
                <Box>
                    <Grid container spacing={3}>
                        <Grid item xs={12} md={6}>
                            <Card sx={{ bgcolor: '#1e1e1e', border: '1px solid #333' }}>
                                <CardContent>
                                    <Typography variant="h6" gutterBottom>Пользователи в системе</Typography>
                                    <List>
                                        <ListItem>
                                            <ListItemText primary="admin" secondary="Был в сети: 2 мин. назад" />
                                            <Typography variant="caption" color="success.main">ONLINE</Typography>
                                        </ListItem>
                                        <ListItem>
                                            <ListItemText primary="user_test" secondary="Был в сети: 15 мин. назад" />
                                            <Typography variant="caption" color="grey.500">OFFLINE</Typography>
                                        </ListItem>
                                        <ListItem>
                                            <ListItemText primary="operator_1" secondary="Был в сети: 1 ч. назад" />
                                            <Typography variant="caption" color="grey.500">OFFLINE</Typography>
                                        </ListItem>
                                    </List>
                                    <MuiButton size="small" variant="outlined" sx={{ mt: 2 }}>УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ</MuiButton>
                                </CardContent>
                            </Card>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <Card sx={{ bgcolor: '#1e1e1e', border: '1px solid #333' }}>
                                <CardContent>
                                    <Typography variant="h6" gutterBottom>Нагрузка на воркеры</Typography>
                                    <Box sx={{ mt: 2 }}>
                                        <Typography variant="body2">CPU Usage (Celery Cluster)</Typography>
                                        <Box sx={{ width: '100%', bgcolor: '#444', height: 8, borderRadius: 1, my: 1 }}>
                                            <Box sx={{ width: `${clusterLoad.cpu}%`, bgcolor: clusterLoad.cpu > 80 ? 'error.main' : 'primary.main', height: '100%', borderRadius: 1, transition: 'width 1s' }} />
                                        </Box>
                                        <Typography variant="caption" align="right" display="block">{clusterLoad.cpu}% (Dynamic Load)</Typography>
                                    </Box>
                                    <Box sx={{ mt: 3 }}>
                                        <Typography variant="body2">RAM Usage</Typography>
                                        <Box sx={{ width: '100%', bgcolor: '#444', height: 8, borderRadius: 1, my: 1 }}>
                                            <Box sx={{ width: `${clusterLoad.ram}%`, bgcolor: 'warning.main', height: '100%', borderRadius: 1, transition: 'width 1s' }} />
                                        </Box>
                                        <Typography variant="caption" align="right" display="block">{Math.round(16 * clusterLoad.ram / 100)} GB / 16 GB</Typography>
                                    </Box>
                                    <MuiButton size="small" variant="outlined" sx={{ mt: 2 }}>ОТКРЫТЬ GRAFANA</MuiButton>
                                </CardContent>
                            </Card>
                        </Grid>
                    </Grid>
                </Box>
            )}
        </Box>
      </Layout>
    );
};

export default Dashboard;
