import React, { useState, useEffect } from 'react';
import { Box, Paper, Typography, TextField, Button, Avatar, Divider, Grid, Alert, Switch, FormControlLabel } from '@mui/material';
import Layout from '../components/layout/Layout';
import { fetchUserProfile, updateUserProfile } from '../api/client';

const ProfilePage = () => {
    const [profile, setProfile] = useState({ username: '', email: '', profile: { dark_mode: true, notifications_enabled: true, quality_preference: 'MEDIUM', language: 'ru' } });
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState(null);

    useEffect(() => {
        fetchUserProfile()
            .then(res => {
                const data = res.data;
                if (!data.profile) {
                    data.profile = { dark_mode: true, notifications_enabled: true, quality_preference: 'MEDIUM', language: 'ru' };
                }
                setProfile(data);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    const handleUpdate = (e) => {
        e.preventDefault();
        updateUserProfile(profile)
            .then(() => {
                setMessage({ type: 'success', text: 'Профиль успешно обновлен' });
                setTimeout(() => setMessage(null), 3000);
            })
            .catch(() => setMessage({ type: 'error', text: 'Ошибка при обновлении' }));
    };

    const handleProfileToggle = (key) => {
        setProfile(prev => ({
            ...prev,
            profile: {
                ...prev.profile,
                [key]: !prev.profile[key]
            }
        }));
    };

    const handleProfileChange = (key, value) => {
        setProfile(prev => ({
            ...prev,
            profile: {
                ...prev.profile,
                [key]: value
            }
        }));
    };

    return (
        <Layout>
            <Box sx={{ p: 4, maxWidth: 800, mx: 'auto', color: 'white' }}>
                <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold' }}>ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ</Typography>
                
                {message && <Alert severity={message.type} sx={{ mb: 2 }}>{message.text}</Alert>}

                <Grid container spacing={3}>
                    <Grid item xs={12} md={4}>
                        <Paper sx={{ p: 3, textAlign: 'center', bgcolor: '#1e1e1e' }}>
                            <Avatar sx={{ width: 100, height: 100, mx: 'auto', mb: 2, bgcolor: 'primary.main' }}>
                                {profile.username[0]?.toUpperCase()}
                            </Avatar>
                            <Typography variant="h6">{profile.username}</Typography>
                            <Typography variant="body2" color="grey.500">{profile.email}</Typography>
                            <Button variant="outlined" sx={{ mt: 2 }} size="small">Сменить аватар</Button>
                        </Paper>
                    </Grid>

                    <Grid item xs={12} md={8}>
                        <Paper sx={{ p: 3, bgcolor: '#1e1e1e', mb: 3 }}>
                            <Typography variant="h6" gutterBottom>Личные данные</Typography>
                            <form onSubmit={handleUpdate}>
                                <TextField
                                    fullWidth
                                    label="Имя пользователя"
                                    margin="normal"
                                    value={profile.username}
                                    onChange={(e) => setProfile({ ...profile, username: e.target.value })}
                                />
                                <TextField
                                    fullWidth
                                    label="Email"
                                    margin="normal"
                                    value={profile.email}
                                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                                />
                                <Button type="submit" variant="contained" sx={{ mt: 2 }}>Сохранить изменения</Button>
                            </form>
                        </Paper>

                        <Paper sx={{ p: 3, bgcolor: '#1e1e1e' }}>
                            <Typography variant="h6" gutterBottom>Настройки интерфейса</Typography>
                            <Divider sx={{ mb: 2 }} />
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <FormControlLabel
                                    control={<Switch checked={profile.profile.notifications_enabled} onChange={() => handleProfileToggle('notifications_enabled')} />}
                                    label="Уведомления системы"
                                />
                                <FormControlLabel
                                    control={<Switch checked={profile.profile.dark_mode} onChange={() => handleProfileToggle('dark_mode')} />}
                                    label="Темная тема (Dark Mode)"
                                />
                                <Box>
                                    <Typography variant="caption" sx={{ color: 'grey.500', display: 'block', mb: 1 }}>КАЧЕСТВО ОБРАБОТКИ ПО УМОЛЧАНИЮ:</Typography>
                                    <Grid container spacing={1}>
                                        {['LOW', 'MEDIUM', 'HIGH'].map(q => (
                                            <Grid item key={q}>
                                                <Button 
                                                    size="small" 
                                                    variant={profile.profile.quality_preference === q ? "contained" : "outlined"}
                                                    onClick={() => handleProfileChange('quality_preference', q)}
                                                >
                                                    {q}
                                                </Button>
                                            </Grid>
                                        ))}
                                    </Grid>
                                </Box>
                                <Box>
                                    <Typography variant="caption" sx={{ color: 'grey.500', display: 'block', mb: 1 }}>ЯЗЫК ИНТЕРФЕЙСА:</Typography>
                                    <Grid container spacing={1}>
                                        {[
                                            { code: 'ru', label: 'Русский' },
                                            { code: 'en', label: 'English' }
                                        ].map(l => (
                                            <Grid item key={l.code}>
                                                <Button 
                                                    size="small" 
                                                    variant={profile.profile.language === l.code ? "contained" : "outlined"}
                                                    onClick={() => handleProfileChange('language', l.code)}
                                                >
                                                    {l.label}
                                                </Button>
                                            </Grid>
                                        ))}
                                    </Grid>
                                </Box>
                            </Box>
                        </Paper>

                        {profile.profile.organization_details && (
                            <Paper sx={{ p: 3, bgcolor: '#1e1e1e', mt: 3, borderLeft: `6px solid ${profile.profile.organization_details.primary_color}` }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                    <Typography variant="h6">Ваша организация</Typography>
                                    {profile.profile.organization_details.logo && (
                                        <Box component="img" src={profile.profile.organization_details.logo} sx={{ height: 40, borderRadius: 1 }} />
                                    )}
                                </Box>
                                <Divider sx={{ mb: 2 }} />
                                <Typography variant="h5" color="primary" sx={{ fontWeight: 'bold' }}>{profile.profile.organization_details.name}</Typography>
                                <Typography variant="caption" color="grey.500" display="block" sx={{ mt: 1 }}>
                                    Брендинг организации применен к вашему интерфейсу.
                                </Typography>
                                <Button variant="outlined" size="small" sx={{ mt: 2 }}>Настройки организации</Button>
                            </Paper>
                        )}
                    </Grid>
                </Grid>
            </Box>
        </Layout>
    );
};

export default ProfilePage;