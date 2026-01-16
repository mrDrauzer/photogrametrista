import React, { useState, useEffect } from 'react';
import { Box, Typography, Grid, Card, CardContent, CardMedia, Button, Container, TextField, InputAdornment } from '@mui/material';
import Layout from '../components/layout/Layout';
import { fetchProjects } from '../api/client';
import SearchIcon from '@mui/icons-material/Search';
import PublicIcon from '@mui/icons-material/Public';
import { useNavigate } from 'react-router-dom';

const GalleryPage = () => {
    const [publicProjects, setPublicProjects] = useState([]);
    const [search, setSearch] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        fetchProjects().then(res => {
            // Вьюсет уже фильтрует публичные проекты
            setPublicProjects(res.data.filter(p => p.is_public));
        });
    }, []);

    const filteredProjects = publicProjects.filter(p => 
        p.name.toLowerCase().includes(search.toLowerCase()) || 
        (p.description || '').toLowerCase().includes(search.toLowerCase())
    );

    return (
        <Layout>
            <Container maxWidth="lg" sx={{ py: 4 }}>
                <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                        <Typography variant="h4" sx={{ fontWeight: 'bold', color: 'primary.main', display: 'flex', alignItems: 'center' }}>
                            <PublicIcon sx={{ mr: 2, fontSize: 40 }} /> ГАЛЕРЕЯ ПРОЕКТОВ
                        </Typography>
                        <Typography variant="body1" sx={{ color: 'grey.500' }}>
                            Исследуйте публичные результаты фотограмметрической обработки
                        </Typography>
                    </Box>
                    <TextField 
                        placeholder="Поиск по галерее..."
                        variant="outlined"
                        size="small"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon sx={{ color: 'grey.500' }} />
                                </InputAdornment>
                            ),
                        }}
                        sx={{ bgcolor: '#1e1e1e', borderRadius: 1, width: 300 }}
                    />
                </Box>

                <Grid container spacing={4}>
                    {filteredProjects.length === 0 && (
                        <Box sx={{ textAlign: 'center', width: '100%', mt: 10 }}>
                            <Typography variant="h6" color="grey.500">Публичных проектов пока нет...</Typography>
                        </Box>
                    )}
                    {filteredProjects.map(project => (
                        <Grid item xs={12} sm={6} md={4} key={project.id}>
                            <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#1e1e1e', border: '1px solid #333' }}>
                                <Box sx={{ height: 200, bgcolor: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <PublicIcon sx={{ fontSize: 80, color: 'rgba(255,255,255,0.1)' }} />
                                </Box>
                                <CardContent sx={{ flexGrow: 1 }}>
                                    <Typography gutterBottom variant="h6" component="h2" sx={{ fontWeight: 'bold' }}>
                                        {project.name}
                                    </Typography>
                                    <Typography variant="body2" color="grey.500" sx={{ mb: 2, height: 60, overflow: 'hidden' }}>
                                        {project.description || 'Описание отсутствует'}
                                    </Typography>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Typography variant="caption" color="primary.main">
                                            {project.files_count} снимков
                                        </Typography>
                                        <Button 
                                            size="small" 
                                            variant="contained" 
                                            onClick={() => navigate('/projects', { state: { autoSelect: project.id } })}
                                        >
                                            Открыть
                                        </Button>
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            </Container>
        </Layout>
    );
};

export default GalleryPage;
