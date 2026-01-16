import React, { useState } from 'react';
import { Box, Paper, TextField, Button, Typography, Container, Alert, Link } from '@mui/material';
import { useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
import { login } from '../api/client';

const LoginPage = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const location = useLocation();
    const successMessage = location.state?.message;

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const res = await login(username, password);
            localStorage.setItem('access_token', res.data.access);
            localStorage.setItem('refresh_token', res.data.refresh);
            navigate('/dashboard');
        } catch (err) {
            setError('Неверное имя пользователя или пароль');
        }
    };

    return (
        <Box sx={{ 
            height: '100vh', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            bgcolor: '#121212',
            background: 'radial-gradient(circle, #1a1a1a 0%, #000000 100%)'
        }}>
            <Container maxWidth="xs">
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Paper sx={{ p: 4, width: '100%', bgcolor: '#1e1e1e', border: '1px solid #333', color: 'white' }}>
                        <Typography variant="h5" align="center" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                            ВХОД В СИСТЕМУ
                        </Typography>
                        {successMessage && <Alert severity="success" sx={{ mb: 2 }}>{successMessage}</Alert>}
                        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                        <form onSubmit={handleSubmit}>
                            <TextField
                                fullWidth
                                label="Имя пользователя"
                                variant="outlined"
                                margin="normal"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                sx={{ input: { color: 'white' }, label: { color: 'grey.500' } }}
                            />
                            <TextField
                                fullWidth
                                label="Пароль"
                                type="password"
                                variant="outlined"
                                margin="normal"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                sx={{ input: { color: 'white' }, label: { color: 'grey.500' } }}
                            />
                            <Button
                                fullWidth
                                variant="contained"
                                type="submit"
                                sx={{ mt: 3, mb: 2, py: 1.5, fontWeight: 'bold' }}
                            >
                                ВОЙТИ
                            </Button>
                            <Box sx={{ textAlign: 'center' }}>
                                <Link component={RouterLink} to="/register" sx={{ color: 'primary.main', textDecoration: 'none' }}>
                                    Нет аккаунта? Зарегистрироваться
                                </Link>
                            </Box>
                        </form>
                    </Paper>
                </Box>
            </Container>
        </Box>
    );
};

export default LoginPage;
