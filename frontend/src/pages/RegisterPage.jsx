import React, { useState } from 'react';
import { Box, Paper, Typography, TextField, Button, Link, Alert, Container, CircularProgress } from '@mui/material';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { register } from '../api/client';

const RegisterPage = () => {
    const [formData, setFormData] = useState({ username: '', email: '', password: '', confirmPassword: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (formData.password !== formData.confirmPassword) {
            setError('Пароли не совпадают');
            return;
        }

        setLoading(true);
        try {
            await register({
                username: formData.username,
                email: formData.email,
                password: formData.password
            });
            navigate('/login', { state: { message: 'Регистрация успешна. Войдите в систему.' } });
        } catch (err) {
            setError(err.response?.data?.username?.[0] || err.response?.data?.email?.[0] || 'Ошибка регистрации. Возможно, имя пользователя уже занято.');
        } finally {
            setLoading(false);
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
                <Paper sx={{ p: 4, bgcolor: '#1e1e1e', border: '1px solid #333', color: 'white', mt: -6.25 }}>
                    <Typography variant="h5" align="center" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                        РЕГИСТРАЦИЯ
                    </Typography>
                    <Typography variant="body2" align="center" sx={{ mb: 3, color: 'grey.500' }}>
                        Создайте аккаунт для работы с фотограмметрией
                    </Typography>

                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                    <form onSubmit={handleSubmit}>
                        <TextField
                            fullWidth
                            label="Имя пользователя"
                            name="username"
                            variant="outlined"
                            margin="normal"
                            required
                            value={formData.username}
                            onChange={handleChange}
                            sx={{ input: { color: 'white' }, label: { color: 'grey.500' } }}
                        />
                        <TextField
                            fullWidth
                            label="Email"
                            name="email"
                            type="email"
                            variant="outlined"
                            margin="normal"
                            value={formData.email}
                            onChange={handleChange}
                            sx={{ input: { color: 'white' }, label: { color: 'grey.500' } }}
                        />
                        <TextField
                            fullWidth
                            label="Пароль"
                            name="password"
                            type="password"
                            variant="outlined"
                            margin="normal"
                            required
                            value={formData.password}
                            onChange={handleChange}
                            sx={{ input: { color: 'white' }, label: { color: 'grey.500' } }}
                        />
                        <TextField
                            fullWidth
                            label="Подтверждение пароля"
                            name="confirmPassword"
                            type="password"
                            variant="outlined"
                            margin="normal"
                            required
                            value={formData.confirmPassword}
                            onChange={handleChange}
                            sx={{ input: { color: 'white' }, label: { color: 'grey.500' } }}
                        />
                        <Button
                            fullWidth
                            type="submit"
                            variant="contained"
                            color="primary"
                            size="large"
                            disabled={loading}
                            sx={{ mt: 3, mb: 2 }}
                        >
                            {loading ? <CircularProgress size={24} /> : 'ЗАРЕГИСТРИРОВАТЬСЯ'}
                        </Button>
                        <Box sx={{ textAlign: 'center' }}>
                            <Link component={RouterLink} to="/login" sx={{ color: 'primary.main', textDecoration: 'none' }}>
                                Уже есть аккаунт? Войти
                            </Link>
                        </Box>
                    </form>
                </Paper>
            </Container>
        </Box>
    );
};

export default RegisterPage;
