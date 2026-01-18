import React, { useState, useEffect, useCallback, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Layout from '../components/layout/Layout';
import ResizeHandle from '../components/ResizeHandle';
import MapView from '../components/map/MapView';
import ModelViewer from '../components/map/ModelViewer';
import { 
  List, ListItem, ListItemText, Typography, Divider, Box, Tabs, Tab, 
  CircularProgress, Button, TextField, Dialog, DialogTitle, DialogContent, 
  DialogActions, IconButton, Grid, Paper, ListItemSecondaryAction,
  ToggleButtonGroup, ToggleButton, Select, MenuItem, Menu, FormControl, InputLabel,
  Snackbar, Alert, Tooltip
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import DeleteIcon from '@mui/icons-material/Delete';
import UploadIcon from '@mui/icons-material/Upload';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import MapIcon from '@mui/icons-material/Map';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import CancelIcon from '@mui/icons-material/Cancel';
import ArchiveIcon from '@mui/icons-material/Archive';
import UnarchiveIcon from '@mui/icons-material/Unarchive';
import DownloadIcon from '@mui/icons-material/Download';
import EditIcon from '@mui/icons-material/Edit';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import PeopleIcon from '@mui/icons-material/People';
import PublicIcon from '@mui/icons-material/Public';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { 
  fetchProjects, fetchTasks, createProject, fetchProjectTasks, 
  runProjectProcessing, importProjectPhotos, updateProjectArea, runChangeDetection,
  fetchProjectFiles, fetchProjectArtifacts, deleteProject, uploadProjectFile, generateProjectReport, exportProjectData, runMultispectralAnalysis,
  cancelTask, updateProject, downloadArtifact, fetchSnapshots, createSnapshot, deleteSnapshot, bulkDeleteFiles,
  fetchShares, createShare, deleteShare,
  fetchProjectStats, bulkDownloadArtifacts,
  compareArtifacts, generateComparisonPdf,
  archiveProject, unarchiveProject, importKml,
  runObjectDetection, fetchDetectedObjects, runGisExport, fetchQualityMetrics,
  exportToCloud,
  fetchWebhooks, createWebhook, deleteWebhook,
  fetchGcps, createGcp, deleteGcp, updatePresence,
  fetchSurveys, createSurvey, deleteSurvey, uploadSurveyPoint,
  fetchBranches, createBranch, deleteBranch,
  generateContours, simplifyMesh,
  fetchFlightPlans, createFlightPlan, deleteFlightPlan, addFlightWaypoint, exportFlightKml,
  fetchProjectTimeline, fetchTemplates, fetchCrsDefinitions, fetchActivityLogs,
  fetchCategories, createCategory, deleteCategory, updateProjectCategory,
  generatePublicLink, fetchMeasurements, createMeasurement, checkApiHealth,
  fetchProjectOrthophotos, updateOrthophoto, exportOrthophoto
} from '../api/client';

import { API_UNAVAILABLE_MESSAGE, CREATE_PROJECT_FAILED_MESSAGE, isNetworkError } from '../api/errors';
import useResizable from '../hooks/useResizable';

const ProjectPage = ({ publicMode = false }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const shareToken = queryParams.get('token');

  const [projects, setProjects] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedProject, setSelectedProject] = useState(null);
  const [activeUsers, setActiveUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [openBranchDialog, setOpenBranchDialog] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [projectStats, setProjectStats] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [files, setFiles] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [selectedTab, setSelectedTab] = useState(publicMode ? 3 : 0);
  const [results, setResults] = useState([]);
  const [selectedOrthoIndex, setSelectedOrthoIndex] = useState(0);
  const [secondOrthoIndex, setSecondOrthoIndex] = useState(1);
  const [selectedNdviIndex, setSelectedNdviIndex] = useState(0);
  const [secondNdviIndex, setSecondNdviIndex] = useState(1);
  const [selectedModelIndex, setSelectedModelIndex] = useState(0);
  const [secondModelIndex, setSecondModelIndex] = useState(1);
  const [snapshots, setSnapshots] = useState([]);
  const [shares, setShares] = useState([]);
  const [activities, setActivities] = useState([]);
  const [detectedObjects, setDetectedObjects] = useState([]);
  const [qualityMetrics, setQualityMetrics] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [gcps, setGcps] = useState([]);
  const [surveys, setSurveys] = useState([]);
  const [flightPlans, setFlightPlans] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [crsList, setCrsList] = useState([]);
  const [currentTimeIndex, setCurrentTimeIndex] = useState(0);
  const [viewMode, setViewMode] = useState('2d'); // '2d' or '3d'
  const [comparisonMode, setComparisonMode] = useState(false);
  const [selectedFlightPlan, setSelectedFlightPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [passwordRequired, setPasswordRequired] = useState(false);
  const { width: rightPanelWidth, handleMouseDown: handleResizeMouseDown } = useResizable({
    storageKey: 'projectRightPanelWidth',
    defaultWidth: 350,
    minWidth: 250,
    maxWidth: 800
  });

  // ВАЖНО (регрессия «белый экран»):
  // Если бэкенд (Django) недоступен, мы не должны «ронять» React из-за необработанных ошибок запросов.
  // Вместо этого показываем предупреждение на странице.
  const [apiUnavailable, setApiUnavailable] = useState(false);
  const [apiUnavailableMessage, setApiUnavailableMessage] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [fitTrigger, setFitTrigger] = useState(0);

  useEffect(() => {
    window.dispatchEvent(new Event('resize'));
  }, [rightPanelWidth]);
  
  // Create Project Dialog State
  const [openDialog, setOpenDialog] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', description: '', is_public: false, tags: [] });
  const [processingQuality, setProcessingQuality] = useState('MEDIUM');
  const [mapLayer, setMapLayer] = useState('rgb');
  const [secondMapLayer, setSecondMapLayer] = useState('ndvi');
  const [swipeActive, setSwipeActive] = useState(false);
  const [swipeDivider, setSwipeDivider] = useState(0.5);
  const [searchQuery, setSearchQuery] = useState('');
  const [artifactSearchQuery, setArtifactSearchQuery] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [selectedArtifactsForCompare, setSelectedArtifactsForCompare] = useState([]);
  const [measurements, setMeasurements] = useState([]);
  const [compareResult, setCompareResult] = useState(null);
  const [tagFilter, setTagFilter] = useState('');
  const [uploadProgress, setUploadProgress] = useState({});
  const [selectedTaskForLogs, setSelectedTaskForLogs] = useState(null);
  const [taskName, setTaskName] = useState('');
  const [orthophotoLayers, setOrthophotoLayers] = useState([]);
  const [editingOrthophoto, setEditingOrthophoto] = useState(null);
  const [newName, setNewName] = useState('');
  const [exportAnchorEl, setExportAnchorEl] = useState(null);
  const [activeExportOrtho, setActiveExportOrtho] = useState(null);

  const orthoArtifacts = useMemo(() => {
    const orthos = results?.filter(r => 
        r.type === 'ortho' && 
        r.ready && 
        r.url
    ) || [];
    return orthos.length > 0 ? orthos : [{ id: 'demo-rgb', name: 'Демо-слой RGB', type: 'ortho', ready: true, url: null }];
  }, [results]);

  const ndviArtifacts = useMemo(() => {
    const ndvis = results?.filter(r => 
        r.type === 'ndvi' && 
        r.ready && 
        r.url
    ) || [];
    return ndvis.length > 0 ? ndvis : [{ id: 'demo-ndvi', name: 'Демо-слой NDVI', type: 'ndvi', ready: true, url: null }];
  }, [results]);

  const modelArtifacts = useMemo(() => {
    return results?.filter(r => r.type === '3d' && r.ready) || [];
  }, [results]);

  const loadProjectData = useCallback((project) => {
    setSelectedProject(project);
    
    // Reset all project-specific states
    setResults([]);
    setTasks([]);
    setFiles([]);
    setSelectedFiles([]);
    setProjectStats(null);
    setSnapshots([]);
    setShares([]);
    setActivities([]);
    setDetectedObjects([]);
    setQualityMetrics([]);
    setWebhooks([]);
    setGcps([]);
    setMeasurements([]);
    setSurveys([]);
    setFlightPlans([]);
    setTimeline([]);
    setBranches([]);
    setSelectedBranch(null);

    if (!project || project.is_archived) {
        return;
    }

    fetchProjectStats(project.id).then(res => setProjectStats(res.data));
    fetchProjectTasks(project.id).then(res => {
        setTasks(res.data);
    });
    fetchProjectOrthophotos(project.id).then(res => {
        setOrthophotoLayers(res.data);
    });
    fetchProjectFiles(project.id).then(res => {
        setFiles(res.data);
    });
    fetchProjectArtifacts(project.id).then(res => {
            // Преобразуем артефакты из БД в формат для фронтенда
        const mappedResults = res.data.map(art => ({
            id: art.id,
            name: art.artifact_type === 'SPECTRAL_BAND' ? `${art.name} (${art.metadata?.band || '?'})` : (art.name || art.artifact_type_display),
            type: art.artifact_type?.toLowerCase().includes('ortho') ? 'ortho' : 
                  art.artifact_type?.toLowerCase().includes('ndvi') ? 'ndvi' :
                  art.artifact_type?.toLowerCase().includes('model_3d') ? '3d' : 
                  art.artifact_type?.toLowerCase().includes('report') ? 'report' : 
                  art.artifact_type?.toLowerCase().includes('kml') ? 'kml' : 
                  art.artifact_type?.toLowerCase().includes('spectral') ? 'band' : 'other',
            ready: true,
            url: art.file?.startsWith('http') ? art.file : (art.file ? `/media/${art.file.startsWith('/') ? art.file.substring(1) : art.file}` : null),
            filename: art.name,
            metadata: art.metadata,
            created_at: art.created_at
        }));
        setResults(mappedResults);

        // Auto-select latest results if nothing selected yet
        if (mappedResults.length > 0) {
            const latestOrthoIdx = mappedResults.findLastIndex(r => r.type === 'ortho' && r.ready);
            if (latestOrthoIdx !== -1 && selectedOrthoIndex === 0) setSelectedOrthoIndex(latestOrthoIdx);

            const latestNdviIdx = mappedResults.findLastIndex(r => r.type === 'ndvi' && r.ready);
            if (latestNdviIdx !== -1 && selectedNdviIndex === 0) setSelectedNdviIndex(latestNdviIdx);

            const latestModelIdx = mappedResults.findLastIndex(r => r.type === '3d' && r.ready);
            if (latestModelIdx !== -1 && selectedModelIndex === 0) setSelectedModelIndex(latestModelIdx);
        }
    });
    fetchSnapshots(project.id).then(res => setSnapshots(res.data));
    fetchShares(project.id).then(res => setShares(res.data));
    fetchActivityLogs(project.id).then(res => setActivities(res.data));
    fetchDetectedObjects(project.id).then(res => setDetectedObjects(res.data));
    fetchQualityMetrics(project.id).then(res => setQualityMetrics(res.data));
    fetchWebhooks(project.id).then(res => setWebhooks(res.data));
    fetchGcps(project.id).then(res => setGcps(res.data));
    fetchMeasurements(project.id).then(res => setMeasurements(res.data));
    fetchSurveys(project.id).then(res => setSurveys(res.data));
    fetchFlightPlans(project.id).then(res => setFlightPlans(res.data));
    fetchProjectTimeline(project.id).then(res => setTimeline(res.data));
    fetchBranches(project.id).then(res => {
        setBranches(res.data);
        if (res.data.length > 0) {
            const main = res.data.find(b => b.is_main) || res.data[0];
            setSelectedBranch(main);
        }
    });
  }, []);

  const handleSelectProject = useCallback((project) => {
    if (!project) return;
    navigate(`/projects/${project.id}`);
    loadProjectData(project);
  }, [navigate, loadProjectData]);

  const refreshData = useCallback(() => {
    if (publicMode) {
        if (!id || !shareToken) {
            showToast('Некорректная публичная ссылка', 'error');
            setLoading(false);
            return;
        }
        setLoading(true);
        checkPublicLink(id, shareToken, password)
            .then(res => {
                loadProjectData(res.data);
                setPasswordRequired(false);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                if (err.response?.status === 401) {
                    setPasswordRequired(true);
                } else {
                    showToast('Ошибка доступа к проекту', 'error');
                }
                setLoading(false);
            });
        return;
    }

    setLoading(true);

    // Быстрая проверка доступности API, чтобы корректно отключать действия (например, создание проекта).
    // `health/` публичный (AllowAny), так что не зависит от авторизации.
    checkApiHealth()
      .then(() => {
        setApiUnavailable(false);
        setApiUnavailableMessage('');

        fetchTemplates().then(res => setTemplates(res.data)).catch(() => {});
        fetchCrsDefinitions().then(res => setCrsList(res.data)).catch(() => {});
        fetchCategories().then(res => setCategories(res.data)).catch(() => {});

        return fetchProjects();
      })
      .then(res => {
        setProjects(res.data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);

        if (isNetworkError(err)) {
          // ВАЖНО: предотвращаем падение UI при выключенном Django (или проблемах прокси /api/).
          setApiUnavailable(true);
          setApiUnavailableMessage(API_UNAVAILABLE_MESSAGE);
        }

        setLoading(false);
      });
  }, [id, shareToken, password, publicMode, loadProjectData]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  useEffect(() => {
    if (projects.length > 0) {
        const targetId = id || location.state?.autoSelect;
        if (targetId) {
            const proj = projects.find(p => p.id === (typeof targetId === 'string' ? parseInt(targetId) : targetId));
            if (proj && proj.id !== selectedProject?.id) {
                loadProjectData(proj);
            }
        } else if (!selectedProject) {
            handleSelectProject(projects[0]);
        }
    }
  }, [projects, id, location.state, selectedProject?.id, loadProjectData, handleSelectProject]);

  const handleCreateProject = async () => {
    if (apiUnavailable) {
      showToast(CREATE_PROJECT_FAILED_MESSAGE, 'error');
      return;
    }

    setCreatingProject(true);
    try {
      if (isEditing) {
        if (!selectedProject?.id) return;
        const res = await updateProject(selectedProject.id, newProject);
        setOpenDialog(false);
        setIsEditing(false);
        setNewProject({ name: '', description: '', is_public: false, target_gsd: null });
        setSelectedProject(res.data);
        refreshData();
      } else {
        await createProject(newProject);
        setOpenDialog(false);
        setNewProject({ name: '', description: '', is_public: false });
        refreshData();
      }
    } catch (err) {
      console.error(err);
      if (isNetworkError(err)) {
        setApiUnavailable(true);
        setApiUnavailableMessage(API_UNAVAILABLE_MESSAGE);
      }
      showToast(CREATE_PROJECT_FAILED_MESSAGE, 'error');
    } finally {
      setCreatingProject(false);
    }
  };

  const handleEditProject = (e, project) => {
    e.stopPropagation();
    setNewProject({ 
        name: project.name, 
        description: project.description,
        is_public: project.is_public || false,
        tags: project.tags || [],
        processing_quality: project.processing_quality || 'MEDIUM',
        ortho_resolution: project.ortho_resolution || '',
        dsm_resolution: project.dsm_resolution || '',
        optimize_mesh: project.optimize_mesh ?? true
    });
    setIsEditing(true);
    setOpenDialog(true);
  };

  const handleGenerateContours = () => {
    if (!selectedProject) return;
    const interval = prompt('Введите интервал изолиний (в метрах):', '1.0');
    if (interval) {
        generateContours(selectedProject.id, parseFloat(interval)).then(() => {
            alert('Запущена генерация изолиний. Результат появится в списке.');
            setSelectedTab(1);
        });
    }
  };

  const handleSimplifyMesh = (artifactId) => {
    const ratio = prompt('Введите коэффициент упрощения (0.1 - 0.9):', '0.5');
    if (ratio) {
        simplifyMesh(artifactId, parseFloat(ratio)).then(() => {
            alert('Запущена оптимизация модели. Проверьте список задач.');
            setSelectedTab(1);
        });
    }
  };

  const handleDeleteProject = (e, id) => {
    e.stopPropagation();
    if (window.confirm('Вы уверены, что хотите удалить этот проект?')) {
        deleteProject(id).then(() => {
            if (selectedProject?.id === id) {
                setSelectedProject(null);
                setFiles([]);
                setTasks([]);
            }
            refreshData();
        });
    }
  };

  const handleArchiveProject = (e, id) => {
    e.stopPropagation();
    archiveProject(id).then(() => {
        refreshData();
        if (selectedProject?.id === id) {
            handleSelectProject({...selectedProject, is_archived: true});
        }
    });
  };

  const handleUnarchiveProject = (e, id) => {
    e.stopPropagation();
    unarchiveProject(id).then(() => {
        refreshData();
        if (selectedProject?.id === id) {
            handleSelectProject({...selectedProject, is_archived: false});
        }
    });
  };

  const handleCloudExport = () => {
    if (!selectedProject) return;
    const service = prompt('Выберите сервис (google_drive, dropbox, onedrive):', 'google_drive');
    if (service) {
        exportToCloud(selectedProject.id, service).then(() => {
            alert(`Запрос на облачный экспорт (${service}) отправлен. Проверьте список задач.`);
            setSelectedTab(1);
        });
    }
  };

  const handleAreaCreated = useCallback((geometry) => {
    if (!selectedProject?.id) return;
    updateProjectArea(selectedProject.id, geometry).then(() => {
        refreshData(); // Обновляем список проектов, чтобы подтянуть новую область
        showToast('Область проекта обновлена', 'success');
    }).catch(err => showToast("Ошибка при сохранении области: " + err.message, "error"));
  }, [selectedProject?.id, refreshData]);

  const handleRunProcessing = () => {
    if (!selectedProject) return;
    runProjectProcessing(selectedProject.id, processingQuality, selectedBranch?.id, false, taskName).then(() => {
        setTaskName('');
        setSelectedTab(1);
        handleSelectProject(selectedProject);
    });
  };

  const handleRunOrthoOnly = () => {
    if (!selectedProject) return;
    runProjectProcessing(selectedProject.id, processingQuality, selectedBranch?.id, true, taskName).then(() => {
        setTaskName('');
        showToast('Запущено построение ортофотоплана', 'info');
        setSelectedTab(1);
        handleSelectProject(selectedProject);
    });
  };

  const handleClearTasks = () => {
    if (!selectedProject) return;
    // In real app, we would call an API to delete tasks
    // Here we just refresh to show latest state
    refreshData();
  };

  const handleImportPhotos = () => {
    if (!selectedProject) return;
    const path = prompt('Введите путь к папке на Яндекс.Диске (например, /photos/test) или публичную ссылку:', 'photos/test_set');
    if (path !== null) {
        importProjectPhotos(selectedProject.id, path).then(() => {
            showToast('Запущен импорт файлов. Проверьте статус в списке задач.', 'success');
            setSelectedTab(1);
            handleSelectProject(selectedProject);
        });
    }
  };

  const handleRunBatchProcessing = () => {
    if (projects.length === 0) return;
    const ids = prompt('Введите ID проектов через запятую для пакетной обработки:', projects.slice(0, 3).map(p => p.id).join(', '));
    if (ids) {
        const idList = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
        const quality = prompt('Выберите качество (LOW, MEDIUM, HIGH):', 'MEDIUM') || 'MEDIUM';
        api.post('projects/batch_process/', { project_ids: idList, quality: quality.toUpperCase() }).then(res => {
            showToast(`Запущена обработка ${idList.length} проектов`, 'success');
            setSelectedTab(1);
        }).catch(err => showToast('Ошибка при запуске пакетной обработки', 'error'));
    }
  };

  const handleGenerateReport = () => {
    if (!selectedProject) return;
    generateProjectReport(selectedProject.id).then(() => {
        showToast('Запущена генерация PDF отчета', 'info');
        setSelectedTab(1);
        handleSelectProject(selectedProject);
    });
  };

  const handleExportData = () => {
    if (!selectedProject) return;
    const format = prompt('Выберите формат экспорта (ZIP, TAR, TIFF_ONLY):', 'ZIP');
    if (format) {
        exportProjectData(selectedProject.id, format.toUpperCase()).then(() => {
            alert(`Запрос на экспорт (${format.toUpperCase()}) отправлен. Архив появится в результатах.`);
            setSelectedTab(1);
            handleSelectProject(selectedProject);
        });
    }
  };

  const handleRunMultispectral = () => {
    if (!selectedProject) return;
    const indexType = prompt('Выберите индекс (NDVI, GNDVI, NDRE, EVI, OSAVI):', 'NDVI');
    if (indexType) {
        runMultispectralAnalysis(selectedProject.id, indexType.toUpperCase()).then(() => {
            alert(`Запущен спектральный анализ (${indexType.toUpperCase()}). Результаты появятся в списке артефактов.`);
            setSelectedTab(1);
            handleSelectProject(selectedProject);
        });
    }
  };

  const handleRunChangeDetection = () => {
    if (!selectedProject || results.length < 2) {
        showToast("Для анализа изменений нужно минимум 2 результата (версии) ортофотоплана.", "warning");
        return;
    }
    const a1 = prompt("Введите ID первого артефакта (V1):", results[0]?.id);
    const a2 = prompt("Введите ID второго артефакта (V2):", results[1]?.id);
    if (a1 && a2) {
        runChangeDetection(selectedProject.id, a1, a2).then(() => {
            showToast('Запущена детекция изменений. Результат появится в списке артефактов.', "success");
            setSelectedTab(1);
            handleSelectProject(selectedProject);
        });
    }
  };

  const handleKmlUpload = (e) => {
    const file = e.target.files[0];
    if (file && selectedProject) {
        importKml(selectedProject.id, file).then(() => {
            alert('KML слой загружен.');
            handleSelectProject(selectedProject);
        });
    }
  };

  const handleRunDetection = () => {
    if (!selectedProject) return;
    runObjectDetection(selectedProject.id).then(() => {
        alert('Запущен AI анализ объектов. Результаты появятся через несколько секунд.');
        setSelectedTab(1);
        handleSelectProject(selectedProject);
    });
  };

  const handleGisExport = () => {
    if (!selectedProject) return;
    const format = prompt('Укажите формат (SHAPEFILE или DXF):', 'SHAPEFILE');
    if (format) {
        const epsg = prompt('Укажите EPSG код для трансформации координат (напр. 3857, 32637):', '4326');
        runGisExport(selectedProject.id, format, epsg || 4326).then(() => {
            alert(`Запущен экспорт в формате ${format} (EPSG:${epsg || 4326}). Файл появится в результатах.`);
            setSelectedTab(1);
            handleSelectProject(selectedProject);
        });
    }
  };

  const handleCreateSnapshot = () => {
    if (!selectedProject) return;
    const name = prompt('Введите название снимка:', `Снимок от ${new Date().toLocaleDateString()}`);
    if (name) {
        createSnapshot({ project: selectedProject.id, name }).then(() => {
            fetchSnapshots(selectedProject.id).then(res => setSnapshots(res.data));
        });
    }
  };

  const handleDeleteSnapshot = (id) => {
    if (window.confirm('Удалить этот снимок?')) {
        deleteSnapshot(id).then(() => {
            fetchSnapshots(selectedProject.id).then(res => setSnapshots(res.data));
        });
    }
  };

  const handleGeneratePublicLink = () => {
    if (!selectedProject) return;
    const password = prompt('Установите пароль для доступа (оставьте пустым для свободного доступа):');
    generatePublicLink(selectedProject.id, password).then(res => {
        const link = `${window.location.origin}/share/${selectedProject.id}?token=${res.data.token}`;
        alert(`Публичная ссылка создана:\n\n${link}\n\nСкопируйте её для отправки заказчику.`);
        handleSelectProject(selectedProject);
    });
  };

  const handleCreateShare = () => {
    if (!selectedProject) return;
    const userId = prompt('Введите ID пользователя, которому хотите дать доступ:');
    if (userId) {
        const accessLevel = confirm('Дать права на редактирование? (Ок - Да, Отмена - Только чтение)') ? 'EDIT' : 'VIEW';
        createShare({ project: selectedProject.id, user: userId, access_level: accessLevel }).then(() => {
            fetchShares(selectedProject.id).then(res => setShares(res.data));
        }).catch(err => alert('Ошибка при добавлении доступа. Проверьте ID пользователя.'));
    }
  };

  const handleDeleteShare = (id) => {
    if (window.confirm('Отозвать доступ для этого пользователя?')) {
        deleteShare(id).then(() => {
            fetchShares(selectedProject.id).then(res => setShares(res.data));
        });
    }
  };

  const handleCreateWebhook = () => {
    if (!selectedProject) return;
    const url = prompt('Введите URL для вебхука:');
    if (url) {
        createWebhook({
            project: selectedProject.id,
            url,
            events: ["task.completed", "artifact.created"],
            secret: "demo_secret_key"
        }).then(() => {
            fetchWebhooks(selectedProject.id).then(res => setWebhooks(res.data));
        });
    }
  };

  const handleDeleteWebhook = (id) => {
    if (window.confirm('Удалить этот вебхук?')) {
        deleteWebhook(id).then(() => {
            fetchWebhooks(selectedProject.id).then(res => setWebhooks(res.data));
        });
    }
  };

  const handleDeleteGcp = (id) => {
    if (window.confirm('Удалить эту опорную точку?')) {
        deleteGcp(id).then(() => {
            fetchGcps(selectedProject.id).then(res => setGcps(res.data));
        });
    }
  };

  const handleCreateSurvey = () => {
    if (!selectedProject) return;
    const name = prompt('Название выезда:');
    if (name) {
        const date = new Date().toISOString().split('T')[0];
        createSurvey({ project: selectedProject.id, name, date, notes: '' }).then(() => {
            fetchSurveys(selectedProject.id).then(res => setSurveys(res.data));
        });
    }
  };

  const handleDeleteSurvey = (id) => {
    if (window.confirm('Удалить данные о выезде?')) {
        deleteSurvey(id).then(() => {
            fetchSurveys(selectedProject.id).then(res => setSurveys(res.data));
        });
    }
  };

  const handleSurveyPhotoUpload = (surveyId) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            // В реальном приложении берем GPS из фото или устройства
            const mockLocation = [55.75 + Math.random() * 0.01, 37.61 + Math.random() * 0.01];
            const comment = prompt('Комментарий к точке:');
            uploadSurveyPoint(surveyId, file, mockLocation, comment || '').then(() => {
                fetchSurveys(selectedProject.id).then(res => setSurveys(res.data));
            });
        }
    };
    input.click();
  };

  const handleCreateBranch = () => {
    if (newBranchName && selectedProject) {
        createBranch({ project: selectedProject.id, name: newBranchName }).then(() => {
            fetchBranches(selectedProject.id).then(res => setBranches(res.data));
            setOpenBranchDialog(false);
            setNewBranchName('');
        });
    }
  };

  const handleDeleteBranch = (id) => {
    if (window.confirm('Удалить эту ветку? Все связанные задачи и артефакты останутся в проекте, но потеряют привязку.')) {
        deleteBranch(id).then(() => {
            fetchBranches(selectedProject.id).then(res => setBranches(res.data));
            if (selectedBranch?.id === id) setSelectedBranch(branches.find(b => b.is_main) || branches[0]);
        });
    }
  };

  const handleCreateFlightPlan = () => {
    if (!selectedProject) return;
    const name = prompt('Название миссии:');
    if (name) {
        createFlightPlan({ project: selectedProject.id, name }).then(() => {
            fetchFlightPlans(selectedProject.id).then(res => setFlightPlans(res.data));
        });
    }
  };

  const handleDeleteFlightPlan = (id) => {
    if (window.confirm('Удалить этот план полета?')) {
        deleteFlightPlan(id).then(() => {
            fetchFlightPlans(selectedProject.id).then(res => setFlightPlans(res.data));
        });
    }
  };

  const handleExportFlightKml = (id) => {
    exportFlightKml(id).then(res => {
        const kml = res.data.kml;
        const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mission_${id}.kml`;
        a.click();
    });
  };

  const handleCancelTask = (taskId) => {
    if (window.confirm('Вы уверены, что хотите отменить эту задачу?')) {
        cancelTask(taskId).then(() => {
            handleSelectProject(selectedProject);
        });
    }
  };

  const toggleFileSelection = (id) => {
    setSelectedFiles(prev => 
        prev.includes(id) ? prev.filter(fid => fid !== id) : [...prev, id]
    );
  };

  const handleBulkDeleteFiles = () => {
    if (window.confirm(`Удалить выбранные файлы (${selectedFiles.length})?`)) {
        bulkDeleteFiles(selectedFiles).then(() => {
            setSelectedFiles([]);
            handleSelectProject(selectedProject);
        });
    }
  };


  const handleFileUpload = (e) => {
    const fileList = e.target.files;
    if (!fileList || !selectedProject) return;

    const filesToUpload = Array.from(fileList);
    const totalFiles = filesToUpload.length;
    let completedFiles = 0;

    filesToUpload.forEach(file => {
        const displayName = file.webkitRelativePath || file.name;

        uploadProjectFile(selectedProject.id, file, (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(prev => ({
                ...prev,
                [displayName]: percentCompleted
            }));
        }, displayName)
        .then(() => {
            completedFiles++;
            if (completedFiles === totalFiles) {
                setTimeout(() => {
                    setUploadProgress({});
                    handleSelectProject(selectedProject);
                    setSelectedTab(2);
                }, 1000);
            }
        })
        .catch(err => {
            console.error(err);
        });
    });

    // Позволяет повторно выбрать ту же папку/файлы (иначе onChange может не сработать)
    e.target.value = '';
  };

  const tasksRef = React.useRef(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    let interval;
    if (selectedProject?.id) {
        interval = setInterval(() => {
            fetchProjectTasks(selectedProject.id).then(res => {
                const newTasks = res.data;
                
                // Update results readiness based on task status
                const newCompletedTasks = newTasks.filter(t => t.status === 'COMPLETED');
                const oldCompletedTaskIds = tasksRef.current.filter(t => t.status === 'COMPLETED').map(t => t.id);
                
                newCompletedTasks.forEach(t => {
                    if (!oldCompletedTaskIds.includes(t.id)) {
                        window.dispatchEvent(new CustomEvent('app-notification', { 
                            detail: { message: `Задача "${t.name}" завершена!`, type: 'success' } 
                        }));
                    }
                });

                setTasks(newTasks);
            });
            
            // Fetch Quality Metrics
            fetchQualityMetrics(selectedProject.id).then(res => setQualityMetrics(res.data)).catch(() => {});

            // Always fetch files if project is selected to keep map markers updated
            fetchProjectFiles(selectedProject.id).then(res => setFiles(res.data)).catch(() => {});
            
            // Fetch artifacts to catch new ones (reports/exports)
            fetchProjectArtifacts(selectedProject.id).then(res => {
                const mappedResults = res.data.map(art => ({
                    id: art.id,
                    name: art.artifact_type === 'SPECTRAL_BAND' ? `${art.name} (${art.metadata?.band || '?'})` : (art.name || art.artifact_type_display),
                    type: art.artifact_type?.toLowerCase().includes('ortho') ? 'ortho' : 
                          art.artifact_type?.toLowerCase().includes('ndvi') ? 'ndvi' :
                          art.artifact_type?.toLowerCase().includes('model_3d') ? '3d' : 
                          art.artifact_type?.toLowerCase().includes('report') ? 'report' : 
                          art.artifact_type?.toLowerCase().includes('kml') ? 'kml' : 
                          art.artifact_type?.toLowerCase().includes('contour') ? 'contour' :
                          art.artifact_type?.toLowerCase().includes('spectral') ? 'band' : 'other',
                    ready: true,
                    url: art.file?.startsWith('http') ? art.file : `/media/${art.file.startsWith('/') ? art.file.substring(1) : art.file}`,
                    filename: art.name,
                    metadata: art.metadata,
                    created_at: art.created_at
                }));
                setResults(mappedResults);

                // If new results appeared and we are at index 0, maybe focus them
                if (mappedResults.length > results.length) {
                     const latestOrthoIdx = mappedResults.findLastIndex(r => r.type === 'ortho' && r.ready);
                     if (latestOrthoIdx !== -1 && selectedOrthoIndex === 0) setSelectedOrthoIndex(latestOrthoIdx);
                }
            }).catch(() => {});

            // Update presence
            updatePresence(selectedProject.id).then(res => {
                setActiveUsers(res.data.active_users);
            }).catch(() => {});
        }, 3000);
    }
    return () => clearInterval(interval);
  }, [selectedProject?.id]);


  const filteredResults = useMemo(() => {
    const q = (artifactSearchQuery || '').toLowerCase();
    return (Array.isArray(results) ? results : []).filter(r =>
      (r?.name || '').toLowerCase().includes(q) ||
      (r?.type || '').toLowerCase().includes(q) ||
      (r?.filename || '').toLowerCase().includes(q)
    );
  }, [results, artifactSearchQuery]);

  const showToast = (message, severity = 'info') => {
    setSnackbar({ open: true, message, severity });
  };

  const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  useEffect(() => {
    const handleNotification = (event) => {
        const { message, type } = event.detail;
        showToast(message, type || 'info');
    };
    window.addEventListener('app-notification', handleNotification);
    return () => window.removeEventListener('app-notification', handleNotification);
  }, []);

  const handleCreateCategory = () => {
    const name = prompt('Введите название новой категории:');
    if (name) {
      createCategory({ name }).then(() => fetchCategories().then(res => setCategories(res.data)));
    }
  };

  const handleSetProjectCategory = (projectId, categoryId) => {
    updateProjectCategory(projectId, categoryId).then(() => {
        fetchProjects().then(res => setProjects(res.data));
    });
  };

  const handleViewArtifact = (res) => {
    if (!res || !res.ready) return;

    if (res.type === 'ortho') {
        const idx = orthoArtifacts.findIndex(a => a.id === res.id);
        if (idx !== -1) {
            setSelectedOrthoIndex(idx);
            setMapLayer('rgb');
            setViewMode('2d');
            showToast(`Отображение на карте: ${res.name}`, 'info');
        } else {
            // Если в orthoArtifacts не нашли, пробуем перегрузить слои ортофото
            fetchProjectOrthophotos(selectedProject.id).then(res_orthos => {
                setOrthophotoLayers(res_orthos.data);
                setMapLayer('rgb');
                setViewMode('2d');
            });
        }
    } else if (res.type === 'ndvi') {
        const idx = ndviArtifacts.findIndex(a => a.id === res.id);
        if (idx !== -1) {
            setSelectedNdviIndex(idx);
            setMapLayer('ndvi');
            setViewMode('2d');
            showToast(`Отображение NDVI: ${res.name}`, 'info');
        }
    } else if (res.type === '3d') {
        const idx = modelArtifacts.findIndex(a => a.id === res.id);
        if (idx !== -1) {
            setSelectedModelIndex(idx);
            setViewMode('3d');
            showToast(`Открытие 3D модели: ${res.name}`, 'info');
        }
    } else if (res.type === 'kml') {
        setViewMode('2d');
        showToast(`KML слой "${res.name}" доступен в списке слоев карты`, 'info');
    }
  };

  const handleRenameOrthophoto = async () => {
    if (!editingOrthophoto || !newName) return;
    try {
        await updateOrthophoto(editingOrthophoto.id, { name: newName });
        showToast('Ортофотоплан переименован', 'success');
        setEditingOrthophoto(null);
        setNewName('');
        fetchProjectOrthophotos(selectedProject.id).then(res => setOrthophotoLayers(res.data));
    } catch (err) {
        showToast('Ошибка при переименовании', 'error');
    }
  };

  const handleDownloadOrtho = async (format) => {
    if (!activeExportOrtho) return;
    setExportAnchorEl(null);
    showToast(`Подготовка ${format}...`, 'info');
    try {
        const response = await exportOrthophoto(activeExportOrtho.id, format);
        // ВАЖНО: используем правильное имя файла из заголовка или пропса
        const url = window.URL.createObjectURL(new Blob([response.data], { type: response.headers['content-type'] }));
        const link = document.createElement('a');
        link.href = url;
        
        // Пытаемся достать имя из Content-Disposition
        let fileName = `${activeExportOrtho.name}.${format}`;
        const disposition = response.headers['content-disposition'];
        console.log('Content-Disposition:', disposition);
        if (disposition && disposition.indexOf('filename=') !== -1) {
            const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
            const matches = filenameRegex.exec(disposition);
            if (matches != null && matches[1]) { 
                fileName = matches[1].replace(/['"]/g, '');
            }
        }
        
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    } catch (err) {
        console.error(err);
        showToast('Ошибка при скачивании', 'error');
    }
  };


  const handleFitBounds = useCallback(() => {
    // Используем функциональное обновление, чтобы не зависеть от значения fitTrigger
    setFitTrigger(prev => prev + 1);
  }, []);

  const sidebar = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>ПРОЕКТЫ</Typography>
        <IconButton size="small" color="primary" disabled={apiUnavailable} onClick={() => setOpenDialog(true)}>
            <AddIcon />
        </IconButton>
      </Box>
      <Box sx={{ px: 2, pb: 2 }}>
          <TextField 
            size="small" 
            fullWidth 
            placeholder="Поиск по имени/тегам..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{ bgcolor: '#2a2a2a', borderRadius: 1, mb: 1 }}
          />
          <Grid container spacing={1} sx={{ mb: 1 }}>
              <Grid item xs={12}>
                <FormControl fullWidth size="small">
                    <InputLabel sx={{ color: 'grey.500' }}>Категория</InputLabel>
                    <Select
                        value={selectedCategory}
                        label="Категория"
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        sx={{ bgcolor: '#2a2a2a', color: 'white' }}
                    >
                        <MenuItem value="all">Все проекты</MenuItem>
                        <MenuItem value="none">Без категории</MenuItem>
                        {categories.map(cat => (
                            <MenuItem key={cat.id} value={cat.id}>{cat.name}</MenuItem>
                        ))}
                        <Divider />
                        <MenuItem onClick={handleCreateCategory}>+ Новая категория</MenuItem>
                    </Select>
                </FormControl>
              </Grid>
          </Grid>
      </Box>
      <Divider />
      <List sx={{ flexGrow: 1, overflowY: 'auto' }}>
        {projects
          .filter(p => {
              const q = (searchQuery || '').toLowerCase();
              const name = (p?.name || '').toLowerCase();
              const tags = Array.isArray(p?.tags) ? p.tags : [];
              const matchesSearch = name.includes(q) || tags.some(t => (t || '').toLowerCase().includes(q));
              return matchesSearch;
          })
          .filter(p => {
              if (selectedCategory === 'all') return true;
              if (selectedCategory === 'none') return !p.category;
              return p.category === selectedCategory;
          })
          .map(p => (
          <ListItem 
            button 
            key={p.id} 
            selected={selectedProject?.id === p.id}
            onClick={() => handleSelectProject(p)}
            sx={{ 
                borderLeft: p.category_details ? `4px solid ${p.category_details.color}` : '4px solid transparent',
                mb: 0.5,
                opacity: p.is_archived ? 0.6 : 1
            }}
          >
            <ListItemText 
                primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography variant="body2" sx={{ fontWeight: selectedProject?.id === p.id ? 'bold' : 'normal' }}>
                            {p.name} {p.is_archived && '(Архив)'}
                        </Typography>
                        {p.is_public && <PublicIcon sx={{ fontSize: 14, ml: 1, color: 'primary.main' }} />}
                    </Box>
                } 
                secondary={
                    <Box component="span">
                        <Typography variant="caption" display="block">{new Date(p.created_at).toLocaleDateString()}</Typography>
                        {p.category_details && (
                            <Box component="span" sx={{ bgcolor: p.category_details.color || '#2196f3', color: 'white', px: 0.5, borderRadius: 0.5, fontSize: '9px', mr: 0.5 }}>
                                {p.category_details.name}
                            </Box>
                        )}
                        {p.tags?.map(tag => (
                            <Box component="span" key={tag} sx={{ bgcolor: '#444', color: 'white', px: 0.5, borderRadius: 0.5, fontSize: '9px', mr: 0.5 }}>
                                #{tag}
                            </Box>
                        ))}
                    </Box>
                } 
            />
            <ListItemSecondaryAction>
                {p.is_archived ? (
                    <IconButton edge="end" size="small" onClick={(e) => handleUnarchiveProject(e, p.id)} sx={{ mr: 1 }} title="Из архива">
                        <UnarchiveIcon fontSize="small" color="info" />
                    </IconButton>
                ) : (
                    <IconButton edge="end" size="small" onClick={(e) => handleArchiveProject(e, p.id)} sx={{ mr: 1 }} title="В архив">
                        <ArchiveIcon fontSize="small" />
                    </IconButton>
                )}
                <IconButton edge="end" size="small" onClick={(e) => handleDeleteProject(e, p.id)}>
                    <DeleteIcon fontSize="small" />
                </IconButton>
            </ListItemSecondaryAction>
          </ListItem>
        ))}
      </List>
      <Divider />
      <Box sx={{ p: 2, maxHeight: 200, overflowY: 'auto', bgcolor: '#1a1a1a' }}>
        <Typography variant="caption" sx={{ fontWeight: 'bold', mb: 1, display: 'block', color: 'primary.main' }}>
            ХРОНОЛОГИЯ (TIMELINE)
        </Typography>
        {activities.slice(0, 10).map(act => (
            <Box key={act.id} sx={{ mb: 1, borderLeft: '2px solid #333', pl: 1 }}>
                <Typography sx={{ fontSize: '10px', color: 'grey.500' }}>
                    {new Date(act.created_at).toLocaleTimeString()} - {act.action}
                </Typography>
                <Typography sx={{ fontSize: '11px', color: 'grey.300' }}>
                    {act.details}
                </Typography>
            </Box>
        ))}
        {activities.length === 0 && <Typography variant="caption" color="grey.600">Нет активности</Typography>}
      </Box>
    </Box>
  );


  const handleBulkDownload = () => {
    if (!selectedProject) return;
    bulkDownloadArtifacts(selectedProject.id).then(res => {
        alert('Запрос на массовую загрузку принят. Ссылка будет доступна в уведомлениях.');
        // В демо просто открываем ссылку
        if (res.data.demo_url) {
            window.open(res.data.demo_url, '_blank');
        }
    });
  };

  const handleCompare = () => {
    if (selectedArtifactsForCompare.length !== 2) return;
    compareArtifacts(selectedArtifactsForCompare[0], selectedArtifactsForCompare[1]).then(res => {
        setCompareResult(res.data);
    });
  };

  const handleGenerateCompareReport = () => {
    if (selectedArtifactsForCompare.length !== 2) return;
    generateComparisonPdf(selectedArtifactsForCompare[0], selectedArtifactsForCompare[1]).then(() => {
        alert('Запуск генерации PDF отчета о сравнении. Он появится в списке результатов через несколько секунд.');
        setSelectedTab(1);
    });
  };

  const handleAddAnnotation = (latlng) => {
      const text = prompt("Текст заметки для карты:");
      if (text) {
          createAnnotation({
              project: selectedProject.id,
              text,
              position: [latlng.lat, latlng.lng],
              annotation_type: 'MAP'
          }).then(() => {
              showToast('Заметка добавлена на карту', 'success');
              // MapView handles its own annotation refresh, but we could trigger it via project refresh
              handleSelectProject(selectedProject);
          });
      }
  };

  const onMeasure = (res) => {
    if (selectedProject) {
        createMeasurement({
            project: selectedProject.id,
            measure_type: res.type || 'DISTANCE',
            value: parseFloat(res.value),
            unit: res.unit
        }).then(() => {
            fetchMeasurements(selectedProject.id).then(r => setMeasurements(r.data));
            showToast(`Замер сохранен: ${res.value} ${res.unit}`, 'info');
        });
    }
  };

  const rightPanel = (
    <>
      <ResizeHandle onMouseDown={handleResizeMouseDown} />
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {Object.keys(uploadProgress).length > 0 && (
                <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" sx={{ color: 'primary.main' }}>ЗАГРУЗКА ФАЙЛОВ...</Typography>
                    {Object.entries(uploadProgress).map(([name, progress]) => (
                        <Box key={name} sx={{ mt: 0.5 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography sx={{ fontSize: '10px' }} noWrap>{name}</Typography>
                                <Typography sx={{ fontSize: '10px' }}>{progress}%</Typography>
                            </Box>
                            <Box sx={{ width: '100%', height: 2, bgcolor: '#333', borderRadius: 1 }}>
                                <Box sx={{ width: `${progress}%`, height: '100%', bgcolor: 'primary.main', borderRadius: 1 }} />
                            </Box>
                        </Box>
                    ))}
                </Box>
            )}

            <Tabs value={selectedTab} onChange={(e, v) => setSelectedTab(v)} variant="scrollable" scrollButtons="auto">
        {!publicMode && <Tab label="Инфо" />}
        {!publicMode && <Tab label="Задачи" />}
        {!publicMode && <Tab label="Файлы" />}
        <Tab label="Результаты" />
        {!publicMode && <Tab label="Снимки" />}
        {!publicMode && <Tab label="Доступ" />}
        {!publicMode && <Tab label="AI Анализ" />}
        {!publicMode && <Tab label="Качество" />}
        {!publicMode && <Tab label="Вебхуки" />}
        {!publicMode && <Tab label="GCP" />}
        {!publicMode && <Tab label="Полевые работы" />}
        {!publicMode && <Tab label="Миссии" />}
        <Tab label="4D Мониторинг" />
      </Tabs>
      <Box sx={{ p: 2, flexGrow: 1, overflowY: 'auto' }}>
        {selectedTab === 0 && selectedProject && (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6">{selectedProject.name}</Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    {activeUsers.length > 1 && (
                        <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: 'rgba(76, 175, 80, 0.1)', px: 1, borderRadius: 1 }}>
                            <Box sx={{ width: 8, height: 8, bgcolor: 'success.main', borderRadius: '50%', mr: 1 }} />
                            <Typography variant="caption" color="success.main">+{activeUsers.length - 1} онлайн</Typography>
                        </Box>
                    )}
                    {selectedProject.is_archived && (
                        <Box sx={{ bgcolor: 'error.main', color: 'white', px: 1, borderRadius: 1, fontSize: '12px' }}>АРХИВ</Box>
                    )}
                </Box>
            </Box>
            <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>
                {selectedProject.description || 'Нет описания'}
            </Typography>
            
            {!selectedProject.is_archived && (
                <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                    <FormControl size="small" sx={{ minWidth: 150 }}>
                        <InputLabel>Ветка (Версия)</InputLabel>
                        <Select
                            value={selectedBranch?.id || ''}
                            label="Ветка (Версия)"
                            onChange={(e) => setSelectedBranch(branches.find(b => b.id === e.target.value))}
                        >
                            {branches.map(b => (
                                <MenuItem key={b.id} value={b.id}>{b.name} {b.is_main ? '(Main)' : ''}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <IconButton size="small" color="primary" onClick={handleCreateBranch}><AddIcon /></IconButton>
                </Box>
            )}

            <Divider sx={{ my: 2 }} />
            {selectedProject.is_archived ? (
                <Box sx={{ p: 4, textAlign: 'center' }}>
                    <ArchiveIcon sx={{ fontSize: 60, color: 'grey.700', mb: 2 }} />
                    <Typography color="grey.500">Этот проект находится в архиве. Для работы с ним сначала извлеките его из архива.</Typography>
                    <Button 
                        variant="contained" 
                        sx={{ mt: 2 }} 
                        startIcon={<UnarchiveIcon />}
                        onClick={(e) => handleUnarchiveProject(e, selectedProject.id)}
                    >
                        Извлечь из архива
                    </Button>
                </Box>
            ) : (
                <>
                <Typography variant="subtitle2">Статистика:</Typography>
                <Typography variant="body2">• Снимков: {projectStats?.files_count || 0}</Typography>
            <Typography variant="body2">• Результатов: {projectStats?.artifacts_count || 0}</Typography>
            <Typography variant="body2">• Объем: {projectStats?.storage_mb || 0} МБ</Typography>
            {selectedProject.area && (
                <Typography variant="body2" sx={{ color: 'success.main', mt: 0.5 }}>
                    ✓ Область задана
                </Typography>
            )}
            {!selectedProject.area && (
                <Typography variant="body2" sx={{ color: 'warning.main', mt: 0.5 }}>
                    ⚠ Нарисуйте область на карте
                </Typography>
            )}
            
            <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle2" gutterBottom>ДЕЙСТВИЯ</Typography>
                <Grid container spacing={1}>
                    <Grid item xs={12}>
                        <Paper sx={{ p: 1.5, mb: 1.5, bgcolor: 'rgba(255, 152, 0, 0.05)', border: '1px solid rgba(255, 152, 0, 0.2)' }}>
                            <Typography variant="caption" color="warning.main" sx={{ fontWeight: 'bold', display: 'block', mb: 1 }}>
                                РЕЖИМЫ ОБРАБОТКИ
                            </Typography>
                            <TextField
                                label="Название задачи (опционально)"
                                size="small"
                                fullWidth
                                value={taskName}
                                onChange={(e) => setTaskName(e.target.value)}
                                placeholder="Например: Участок А, январь 2026"
                                sx={{ mb: 1.5, bgcolor: '#2a2a2a', borderRadius: 1 }}
                            />
                            <Box sx={{ mb: 1.5 }}>
                                <Typography variant="caption" color="grey.500">КАЧЕСТВО ОБРАБОТКИ:</Typography>
                                <ToggleButtonGroup
                                    value={processingQuality}
                                    exclusive
                                    onChange={(e, v) => v && setProcessingQuality(v)}
                                    fullWidth
                                    size="small"
                                    sx={{ mt: 0.5 }}
                                >
                                    <ToggleButton value="LOW">LOW</ToggleButton>
                                    <ToggleButton value="MEDIUM">MED</ToggleButton>
                                    <ToggleButton value="HIGH">HIGH</ToggleButton>
                                </ToggleButtonGroup>
                            </Box>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                <Button 
                                    variant="contained" 
                                    color="secondary" 
                                    fullWidth 
                                    size="small"
                                    disabled={!selectedProject.area || (selectedProject.files_count === 0)}
                                    onClick={handleRunProcessing}
                                    startIcon={<ViewInArIcon />}
                                    sx={{ py: 1.5, fontWeight: 'bold' }}
                                >
                                    ПОЛНЫЙ ЦИКЛ (3D + Орто)
                                </Button>
                                <Button 
                                    variant="contained" 
                                    color="primary" 
                                    fullWidth 
                                    size="small"
                                    disabled={!selectedProject.area || (selectedProject.files_count === 0)}
                                    onClick={handleRunOrthoOnly}
                                    startIcon={<MapIcon />}
                                    sx={{ py: 1.5, fontWeight: 'bold' }}
                                >
                                    ТОЛЬКО ОРТОФОТО (Быстро)
                                </Button>
                            </Box>
                        </Paper>
                    </Grid>

                    <Grid item xs={12}>
                        <Button variant="outlined" fullWidth color="primary" onClick={handleGenerateContours} sx={{ mb: 1 }}>
                            Сгенерировать изолинии
                        </Button>
                    </Grid>
                    <Grid item xs={12}>
                        <Button variant="outlined" fullWidth onClick={handleImportPhotos} sx={{ mb: 1 }}>
                            Импорт из облака
                        </Button>
                    </Grid>
                    <Grid item xs={12}>
                        <Button
                            variant="outlined"
                            component="label"
                            fullWidth
                            startIcon={<UploadIcon />}
                        >
                            Загрузить локально
                            <input
                                type="file"
                                hidden
                                multiple
                                accept="image/*"
                                onChange={handleFileUpload}
                            />
                        </Button>
                    </Grid>
                    <Grid item xs={12}>
                        <Button
                            variant="outlined"
                            component="label"
                            fullWidth
                            startIcon={<FolderOpenIcon />}
                        >
                            Загрузить папку
                            <input
                                type="file"
                                hidden
                                multiple
                                accept="image/*"
                                // Поддержка выбора папки целиком (Chrome/Edge и др.)
                                webkitdirectory="true"
                                directory="true"
                                onChange={handleFileUpload}
                            />
                        </Button>
                    </Grid>
                    <Grid item xs={12}>
                        <Button 
                            variant="outlined" 
                            color="primary" 
                            fullWidth 
                            disabled={results.length === 0 || !results.some(r => r.ready)}
                            onClick={handleGenerateReport}
                        >
                            Сформировать отчет
                        </Button>
                    </Grid>
                    <Grid item xs={12}>
                        <Button 
                            variant="outlined" 
                            color="info" 
                            fullWidth 
                            disabled={results.length === 0 || !results.some(r => r.ready)}
                            onClick={handleExportData}
                        >
                            Экспорт проекта
                        </Button>
                    </Grid>
                    <Grid item xs={12}>
                        <Button 
                            variant="outlined" 
                            color="warning" 
                            fullWidth 
                            disabled={results.length === 0 || !results.some(r => r.ready)}
                            onClick={handleCloudExport}
                        >
                            Облачный экспорт
                        </Button>
                    </Grid>
                    <Grid item xs={12}>
                        <Button 
                            variant="outlined" 
                            color="success" 
                            fullWidth 
                            disabled={results.length === 0 || !results.some(r => r.ready)}
                            onClick={handleRunMultispectral}
                        >
                            Анализ NDVI
                        </Button>
                    </Grid>
                    <Grid item xs={12}>
                        <Button
                            variant="outlined"
                            component="label"
                            fullWidth
                            color="info"
                        >
                            Загрузить KML/KMZ
                            <input
                                type="file"
                                hidden
                                accept=".kml,.kmz"
                                onChange={handleKmlUpload}
                            />
                        </Button>
                    </Grid>
                </Grid>
            </Box>
            </>
            )}
          </Box>
        )}
        {selectedTab === 1 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
                <Button size="small" onClick={handleClearTasks}>Обновить</Button>
            </Box>
            <List sx={{ flexGrow: 1, overflowY: 'auto' }}>
                {tasks.length === 0 && <Typography variant="body2">Нет активных задач</Typography>}
                {tasks.map(t => (
                <ListItem 
                    key={t.id} 
                    button
                    onClick={() => setSelectedTaskForLogs(t)}
                    sx={{ flexDirection: 'column', alignItems: 'flex-start', mb: 2, p: 1, bgcolor: '#2a2a2a', borderRadius: 1 }}
                >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', mb: 1 }}>
                        <Typography variant="subtitle2">{t.name}</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="caption" sx={{ color: t.status === 'COMPLETED' ? 'success.main' : (t.status === 'FAILED' ? 'error.main' : 'primary.main') }}>
                                {t.status}
                            </Typography>
                            {t.status === 'PROCESSING' && (
                                <IconButton size="small" color="error" onClick={() => handleCancelTask(t.id)}>
                                    <CancelIcon fontSize="small" />
                                </IconButton>
                            )}
                        </Box>
                    </Box>
                    <Box sx={{ width: '100%', bgcolor: '#444', height: 4, mb: 1 }}>
                        <Box sx={{ width: `${t.progress}%`, bgcolor: 'primary.main', height: '100%', transition: 'width 0.5s' }} />
                    </Box>
                    {t.logs && (
                        <Typography variant="caption" sx={{ 
                            display: 'block', 
                            maxHeight: 100, 
                            overflowY: 'auto', 
                            width: '100%',
                            whiteSpace: 'pre-wrap',
                            fontFamily: 'monospace',
                            fontSize: '0.7rem',
                            color: 'grey.400',
                            bgcolor: '#1a1a1a',
                            p: 0.5
                        }}>
                            {t.logs}
                        </Typography>
                    )}
                </ListItem>
                ))}
            </List>
          </Box>
        )}
        {selectedTab === 2 && (
          <Box>
            <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                    <Typography variant="subtitle2">Выбрано: {selectedFiles.length}</Typography>
                    {orthoArtifacts.length > 0 && (
                        <Button 
                            variant="contained" 
                            color="success" 
                            size="small"
                            sx={{ mt: 1, mr: 1 }}
                            startIcon={<DownloadIcon />}
                            onClick={() => handleDownloadArtifact(orthoArtifacts[0])}
                        >
                            СКАЧАТЬ ОРТОФОТО (.TIF)
                        </Button>
                    )}
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button 
                        size="small" 
                        variant="outlined"
                        startIcon={<DownloadIcon />}
                        disabled={files.length === 0}
                        onClick={() => {
                            const ids = files.filter(f => f.type === 'ortho' || f.name.toLowerCase().includes('ortho')).map(f => f.id);
                            if (ids.length > 0) {
                                alert(`Загрузка ${ids.length} файлов ортофото...`);
                            } else {
                                alert('Файлы ортофото не найдены в исходных файлах.');
                            }
                        }}
                    >
                        Скачать исходные орто
                    </Button>
                    <Button 
                        size="small" 
                        color="error" 
                        variant="outlined" 
                        disabled={selectedFiles.length === 0}
                        onClick={handleBulkDeleteFiles}
                        startIcon={<DeleteIcon />}
                    >
                        Удалить
                    </Button>
                </Box>
            </Box>
            <Grid container spacing={1}>
                {files.length === 0 && (
                    <Box sx={{ p: 2, textAlign: 'center', width: '100%' }}>
                        <Typography variant="body2">Файлы отсутствуют. Запустите импорт.</Typography>
                    </Box>
                )}
                {files.map(f => (
                <Grid item xs={6} key={f.id}>
                    <Paper 
                        onClick={() => toggleFileSelection(f.id)}
                        sx={{ 
                            p: 1, 
                            textAlign: 'center', 
                            bgcolor: selectedFiles.includes(f.id) ? 'rgba(33, 150, 243, 0.2)' : '#2a2a2a',
                            border: selectedFiles.includes(f.id) ? '1px solid #2196f3' : '1px solid transparent',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        <ImageOutlinedIcon sx={{ fontSize: 40, color: selectedFiles.includes(f.id) ? 'primary.main' : 'grey.600' }} />
                        <Typography variant="caption" noWrap display="block">
                            {f.name}
                        </Typography>
                    </Paper>
                </Grid>
                ))}
            </Grid>
          </Box>
        )}
        {selectedTab === 3 && (
          <Box>
            <Paper sx={{ p: 2, mb: 3, bgcolor: 'rgba(33, 150, 243, 0.1)', border: '1px solid #2196f3' }}>
                <Typography variant="subtitle2" color="primary" gutterBottom sx={{ fontWeight: 'bold' }}>ХРАНИЛИЩЕ РЕЗУЛЬТАТОВ</Typography>
                <Typography variant="caption" display="block" sx={{ color: 'grey.400', mb: 1 }}>
                    Все файлы сохраняются в постоянное хранилище сервера: <code>/app/media/artifacts/</code>
                </Typography>
                <Typography variant="caption" display="block" sx={{ color: 'grey.400' }}>
                    Ортофотопланы (TIF/PNG) и 3D модели (OBJ) доступны для скачивания или просмотра прямо в браузере.
                </Typography>
            </Paper>

            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>РЕЗУЛЬТАТЫ</Typography>
            <Box sx={{ mb: 2 }}>
                <TextField 
                    size="small" 
                    fullWidth 
                    placeholder="Поиск по результатам..." 
                    value={artifactSearchQuery}
                    onChange={(e) => setArtifactSearchQuery(e.target.value)}
                    sx={{ mb: 1, bgcolor: '#2a2a2a' }}
                />
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button 
                        variant="contained" 
                        size="small" 
                        sx={{ flexGrow: 1 }}
                        onClick={handleBulkDownload}
                    >
                        Скачать всё (ZIP)
                    </Button>
                    <Button 
                        variant="outlined" 
                        size="small" 
                        color="secondary"
                        disabled={selectedArtifactsForCompare.length !== 2}
                        onClick={handleCompare}
                    >
                        Сравнить ({selectedArtifactsForCompare.length})
                    </Button>
                </Box>
            </Box>

            {orthophotoLayers.length > 0 && (
                <Box sx={{ mb: 4 }}>
                    <Typography variant="subtitle2" color="primary" sx={{ mb: 1, fontWeight: 'bold' }}>ОРТОФОТОПЛАНЫ (СЛОИ)</Typography>
                    <Grid container spacing={2}>
                        {orthophotoLayers.map(ortho => (
                            <Grid item xs={12} key={ortho.id}>
                                <Paper sx={{ p: 2, bgcolor: '#2a2a2a', borderLeft: '4px solid #4caf50' }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Box>
                                            <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>{ortho.name}</Typography>
                                            <Typography variant="caption" color="grey.500" display="block">
                                                Дата: {new Date(ortho.created_at).toLocaleString()}
                                            </Typography>
                                            <Typography variant="caption" color="grey.500" display="block">
                                                Разрешение (GSD): {ortho.resolution} м/пикс
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: 'grey.600', fontFamily: 'monospace', fontSize: '0.65rem', mt: 0.5, display: 'block' }}>
                                                ID: {ortho.id} • Размер: {formatBytes(ortho.file_size)}
                                            </Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', gap: 1 }}>
                                            <IconButton size="small" onClick={() => { setEditingOrthophoto(ortho); setNewName(ortho.name); }} title="Переименовать">
                                                <EditIcon fontSize="small" />
                                            </IconButton>
                                            <Tooltip title="Показать на карте">
                                                <Button 
                                                    size="small" 
                                                    variant="contained" 
                                                    color="success"
                                                    onClick={() => {
                                                        setMapLayer('rgb');
                                                        setViewMode('2d');
                                                        // Находим артефакт, связанный с этим слоем ортофото
                                                        const orthoArtifactsList = results.filter(r => r.type === 'ortho' && r.ready);
                                                        const artIdx = results.findIndex(r => r.type === 'ortho' && (r.metadata?.orthophoto_id === ortho.id || r.name === ortho.name));
                                                        if (artIdx !== -1) {
                                                            const orthoInFiltered = orthoArtifactsList.findIndex(a => a.id === results[artIdx].id);
                                                            if (orthoInFiltered !== -1) setSelectedOrthoIndex(orthoInFiltered);
                                                        }
                                                        showToast(`Слой "${ortho.name}" активирован`, 'success');
                                                    }}
                                                >
                                                    ПОКАЗАТЬ
                                                </Button>
                                            </Tooltip>
                                            <Button 
                                                size="small" 
                                                variant="contained"
                                                color="primary"
                                                startIcon={<DownloadIcon />}
                                                onClick={() => {
                                                    const art = results.find(r => r.type === 'ortho' && (r.metadata?.orthophoto_id === ortho.id || r.name === ortho.name));
                                                    if (art) handleDownloadArtifact(art);
                                                    else showToast("Файл артефакта не найден", "error");
                                                }}
                                            >
                                                СКАЧАТЬ TIF/PNG
                                            </Button>
                                            <Button 
                                                size="small" 
                                                variant="outlined"
                                                startIcon={<CloudDownloadIcon />}
                                                onClick={(e) => { setExportAnchorEl(e.currentTarget); setActiveExportOrtho(ortho); }}
                                            >
                                                ЭКСПОРТ
                                            </Button>
                                        </Box>
                                    </Box>
                                </Paper>
                            </Grid>
                        ))}
                    </Grid>
                </Box>
            )}

            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold', color: 'grey.500' }}>ВСЕ АРТЕФАКТЫ</Typography>

            {compareResult && (
                <Paper sx={{ p: 2, mb: 2, bgcolor: '#1a1a1a', border: '1px solid #secondary.main' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography variant="subtitle2" color="secondary">АНАЛИЗ РАЗЛИЧИЙ (V{compareResult.v1} vs V{compareResult.v2})</Typography>
                        <IconButton size="small" onClick={() => setCompareResult(null)}><CancelIcon fontSize="small" /></IconButton>
                    </Box>
                    {compareResult.changes.map((c, i) => (
                        <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography variant="caption">{c.metric}:</Typography>
                            <Typography variant="caption" sx={{ color: c.diff.startsWith('+') ? 'success.main' : (c.diff.startsWith('-') ? 'error.main' : 'info.main') }}>
                                {c.diff}
                            </Typography>
                        </Box>
                    ))}
                    <Typography variant="caption" sx={{ display: 'block', mt: 1, p: 0.5, bgcolor: '#333', borderRadius: 0.5 }}>
                        💡 {compareResult.recommendation}
                    </Typography>
                    <Button 
                        fullWidth 
                        size="small" 
                        variant="contained" 
                        color="secondary" 
                        sx={{ mt: 1 }}
                        onClick={() => {
                            setComparisonMode(true);
                            setViewMode('2d');
                        }}
                    >
                        Визуальное сравнение
                    </Button>
                    <Button 
                        fullWidth 
                        size="small" 
                        variant="outlined" 
                        color="secondary" 
                        sx={{ mt: 1 }}
                        onClick={handleGenerateCompareReport}
                    >
                        Скачать PDF сравнение
                    </Button>
                </Paper>
            )}

            {filteredResults.length === 0 && (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    Результаты не найдены или еще не созданы.
                </Typography>
            )}
            <Grid container spacing={2}>
              {filteredResults.map(res => (
                <Grid item xs={12} key={res.id}>
                  <Paper 
                    onClick={() => {
                        if (selectedArtifactsForCompare.includes(res.id)) {
                            setSelectedArtifactsForCompare(prev => prev.filter(id => id !== res.id));
                        } else if (selectedArtifactsForCompare.length < 2) {
                            setSelectedArtifactsForCompare(prev => [...prev, res.id]);
                        }
                    }}
                    sx={{ 
                        p: 2, 
                        bgcolor: selectedArtifactsForCompare.includes(res.id) ? 'rgba(156, 39, 176, 0.1)' : '#2a2a2a', 
                        border: selectedArtifactsForCompare.includes(res.id) ? '1px solid #9c27b0' : '1px solid #333',
                        cursor: 'pointer'
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box>
                            <Typography variant="subtitle2">{res.name}</Typography>
                            <Typography variant="caption" sx={{ color: res.ready ? 'success.main' : 'warning.main', display: 'block' }}>
                                {res.ready ? 'Готов к просмотру' : 'В ожидании...'}
                            </Typography>
                            {res.url && (
                                <Typography variant="caption" sx={{ color: 'grey.600', fontFamily: 'monospace', fontSize: '0.65rem' }}>
                                    Файл: {res.url.split('/').pop()}
                                </Typography>
                            )}
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            {res.ready && ['ortho', 'ndvi', '3d', 'kml'].includes(res.type) && (
                                <Button 
                                    size="small" 
                                    variant="contained" 
                                    color="success" 
                                    onClick={(e) => { e.stopPropagation(); handleViewArtifact(res); }}
                                >
                                    ПОКАЗАТЬ
                                </Button>
                            )}
                            <Button size="small" variant="outlined" disabled={!res.ready} onClick={(e) => { e.stopPropagation(); downloadArtifact(res.id); }}>Скачать</Button>
                        </Box>
                        {res.type === '3d' && (
                            <Button size="small" variant="outlined" color="secondary" onClick={() => handleSimplifyMesh(res.id)} sx={{ ml: 1 }}>
                                Оптимизировать
                            </Button>
                        )}
                        <Button 
                            size="small" 
                            variant="outlined" 
                            color="info" 
                            disabled={!res.ready} 
                            onClick={() => {
                                alert(`Генерация PDF отчета для ${res.name}...\n\nТип: ${res.type}\nID: ${res.id}\nМетаданные будут включены в отчет.`);
                            }}
                            sx={{ ml: 1 }}
                        >
                            PDF
                        </Button>
                    </Box>
                    {res.ready && (
                        <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid #444' }}>
                            <Typography variant="caption" display="block" color="grey.500">
                                {res.type === 'ortho' && "Разрешение: 2.5 см/пикс • GSD: 0.025m"}
                                {res.type === 'dsm' && "Точность: 5.0 см • Формат: GeoTIFF"}
                                {res.type === '3d' && "Полигонов: 254,120 • Текстура: 4K"}
                                {res.type === 'ndvi' && `Ср. индекс: ${res.metadata?.mean_index || 0.65} • Тип: ${res.metadata?.index_type || 'NDVI'}`}
                                {res.type === 'band' && `Канал: ${res.metadata?.band || 'RAW'} • Спектр: ${res.metadata?.band === 'NIR' ? '780-850nm' : '400-700nm'}`}
                                {res.type === 'report' && "Размер: 15.4 МБ • Содержит: Снимки, 3D, PDF"}
                                {res.type === 'contour' && `Интервал: ${res.metadata?.interval}м • Формат: GeoJSON`}
                            </Typography>
                        </Box>
                    )}
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Box>
        )}
        {selectedTab === 4 && (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>СНИМКИ СОСТОЯНИЯ</Typography>
                <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={handleCreateSnapshot}>Создать</Button>
            </Box>
            <List>
                {snapshots.length === 0 && <Typography variant="body2" color="grey.500">Снимков пока нет</Typography>}
                {snapshots.map(s => (
                    <Paper key={s.id} sx={{ mb: 1, p: 2, bgcolor: '#2a2a2a' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Box>
                                <Typography variant="subtitle2">{s.name}</Typography>
                                <Typography variant="caption" color="grey.500">
                                    {new Date(s.created_at).toLocaleString()} • {s.files_count} файлов • {s.artifacts_count} рез.
                                </Typography>
                            </Box>
                            <IconButton size="small" color="error" onClick={() => handleDeleteSnapshot(s.id)}>
                                <DeleteIcon fontSize="small" />
                            </IconButton>
                        </Box>
                    </Paper>
                ))}
            </List>
          </Box>
        )}
        {selectedTab === 5 && (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>СОВМЕСТНЫЙ ДОСТУП</Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button size="small" variant="outlined" color="success" onClick={handleGeneratePublicLink}>Публичная ссылка</Button>
                    <Button size="small" variant="contained" startIcon={<PeopleIcon />} onClick={handleCreateShare}>Добавить пользователя</Button>
                </Box>
            </Box>
            {selectedProject?.share_token && (
                <Paper sx={{ p: 1.5, mb: 2, bgcolor: 'rgba(76, 175, 80, 0.1)', border: '1px solid #4caf50' }}>
                    <Typography variant="caption" color="success.main" display="block" sx={{ fontWeight: 'bold' }}>
                        ПУБЛИЧНЫЙ ДОСТУП ВКЛЮЧЕН
                    </Typography>
                    <Typography variant="caption" color="grey.500">
                        Токен: {selectedProject.share_token} {selectedProject.has_password ? '• Под защитой пароля' : ''}
                    </Typography>
                </Paper>
            )}
            <List>
                {(shares || []).length === 0 && <Typography variant="body2" color="grey.500">Доступы пока не настроены</Typography>}
                {(shares || []).map(s => (
                <ListItem key={s.id} sx={{ bgcolor: '#2a2a2a', mb: 1, borderRadius: 1 }}>
                    <ListItemText 
                        primary={s.user_username} 
                        secondary={`Уровень доступа: ${s.access_level === 'EDIT' ? 'Редактирование' : 'Просмотр'}`} 
                    />
                    <ListItemSecondaryAction>
                        <IconButton edge="end" size="small" color="error" onClick={() => handleDeleteShare(s.id)}>
                            <DeleteIcon fontSize="small" />
                        </IconButton>
                    </ListItemSecondaryAction>
                </ListItem>
                ))}
            </List>
            <Typography variant="caption" sx={{ color: 'grey.500', mt: 2, display: 'block' }}>
                Поделитесь ID проекта или ссылкой с пользователями, которым вы предоставили доступ.
            </Typography>
          </Box>
        )}
        {selectedTab === 6 && (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>AI ОБНАРУЖЕНИЕ ОБЪЕКТОВ</Typography>
                <Button size="small" variant="contained" color="secondary" onClick={handleRunDetection}>Запустить AI</Button>
            </Box>
            <Paper sx={{ p: 2, bgcolor: '#2a2a2a', mb: 2 }}>
                <Typography variant="body2" color="grey.400" gutterBottom>
                    Автоматический поиск техники, строений и растительности на основе компьютерного зрения (YOLOv8).
                </Typography>
                <Divider sx={{ my: 1 }} />
                <Grid container spacing={2}>
                    <Grid item xs={4}>
                        <Typography variant="h6" align="center">{detectedObjects.filter(o => o.object_type === 'VEHICLE').length}</Typography>
                        <Typography variant="caption" align="center" display="block">Транспорт</Typography>
                    </Grid>
                    <Grid item xs={4}>
                        <Typography variant="h6" align="center">{detectedObjects.filter(o => o.object_type === 'BUILDING').length}</Typography>
                        <Typography variant="caption" align="center" display="block">Здания</Typography>
                    </Grid>
                    <Grid item xs={4}>
                        <Typography variant="h6" align="center">{detectedObjects.filter(o => o.object_type === 'TREE').length}</Typography>
                        <Typography variant="caption" align="center" display="block">Деревья</Typography>
                    </Grid>
                    <Grid item xs={3}>
                        <Typography variant="h6" align="center">{detectedObjects.filter(o => o.object_type === 'STOCKPILE').length}</Typography>
                        <Typography variant="caption" align="center" display="block">Насыпи</Typography>
                    </Grid>
                </Grid>
            </Paper>
            <List>
                {(detectedObjects || []).length === 0 && <Typography variant="body2" color="grey.500" align="center">Объекты не обнаружены. Запустите анализ.</Typography>}
                {(detectedObjects || []).map(obj => (
                    <Paper key={obj.id} sx={{ mb: 1, p: 1, bgcolor: '#1a1a1a', borderLeft: '4px solid #9c27b0' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="subtitle2">{obj.object_type_display}</Typography>
                            <Typography variant="caption" color="success.main">{(obj.confidence * 100).toFixed(0)}% точность</Typography>
                        </Box>
                        <Typography variant="caption" color="grey.500">
                            Координаты: {obj.location[0].toFixed(5)}, {obj.location[1].toFixed(5)}
                        </Typography>
                    </Paper>
                ))}
            </List>
          </Box>
        )}
        {selectedTab === 7 && (
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 2 }}>МЕТРИКИ КАЧЕСТВА (QA/QC)</Typography>
            {(qualityMetrics || []).length === 0 && (
                <Typography variant="body2" color="grey.500" align="center">Метрики пока не рассчитаны. Завершите обработку проекта.</Typography>
            )}
            {(qualityMetrics || []).map(m => (
                <Paper key={m.id} sx={{ p: 2, mb: 2, bgcolor: '#1a1a1a', borderLeft: '4px solid #4caf50' }}>
                    <Typography variant="subtitle2" gutterBottom color="primary.main">Ортофотоплан V{m.artifact}</Typography>
                    <Grid container spacing={2}>
                        <Grid item xs={6}>
                            <Typography variant="caption" color="grey.500">GSD:</Typography>
                            <Typography variant="body2">{m.gsd} см/пикс</Typography>
                        </Grid>
                        <Grid item xs={6}>
                            <Typography variant="caption" color="grey.500">Перекрытие:</Typography>
                            <Typography variant="body2">{m.overlap_mean.toFixed(1)}%</Typography>
                        </Grid>
                        <Grid item xs={4}>
                            <Typography variant="caption" color="grey.500">RMSE X:</Typography>
                            <Typography variant="body2" color="success.main">{m.rmse_x.toFixed(3)}м</Typography>
                        </Grid>
                        <Grid item xs={4}>
                            <Typography variant="caption" color="grey.500">RMSE Y:</Typography>
                            <Typography variant="body2" color="success.main">{m.rmse_y.toFixed(3)}м</Typography>
                        </Grid>
                        <Grid item xs={4}>
                            <Typography variant="caption" color="grey.500">RMSE Z:</Typography>
                            <Typography variant="body2" color="warning.main">{m.rmse_z.toFixed(3)}м</Typography>
                        </Grid>
                    </Grid>
                </Paper>
            ))}
            <Box sx={{ mt: 2, p: 2, bgcolor: 'rgba(33, 150, 243, 0.05)', borderRadius: 1 }}>
                <Typography variant="caption" color="primary.main" sx={{ fontWeight: 'bold' }}>СОВЕТ ПО УЛУЧШЕНИЮ:</Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                    Средняя ошибка по высоте (RMSE Z) выше допустимой. Рекомендуется добавить контрольные точки (GCP) или увеличить высоту полета для лучшего перекрытия.
                </Typography>
            </Box>
            
            <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>РАСПРЕДЕЛЕНИЕ ОШИБОК ПО ТОЧКАМ (GCP):</Typography>
                <Grid container spacing={1}>
                    {gcps.filter(g => Number.isFinite(g.latitude) && Number.isFinite(g.longitude) && Number.isFinite(g.measured_lat) && Number.isFinite(g.measured_lon)).map(gcp => {
                        const dist = L.latLng(gcp.latitude, gcp.longitude).distanceTo(L.latLng(gcp.measured_lat, gcp.measured_lon));
                        const errorStatus = dist < 0.03 ? 'success.main' : (dist < 0.07 ? 'warning.main' : 'error.main');
                        return (
                            <Grid item xs={12} key={gcp.id}>
                                <Paper sx={{ p: 1, bgcolor: '#1a1a1a', borderLeft: `4px solid ${errorStatus}` }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography variant="caption" sx={{ fontWeight: 'bold' }}>{gcp.name}</Typography>
                                        <Typography variant="caption" sx={{ color: errorStatus }}>
                                            {(dist * 100).toFixed(1)} см
                                        </Typography>
                                    </Box>
                                    <Box sx={{ width: '100%', height: 4, bgcolor: '#333', mt: 0.5, borderRadius: 1 }}>
                                        <Box sx={{ width: `${Math.min(dist * 1000, 100)}%`, height: '100%', bgcolor: errorStatus, borderRadius: 1 }} />
                                    </Box>
                                </Paper>
                            </Grid>
                        );
                    })}
                </Grid>
            </Box>
          </Box>
        )}
        {selectedTab === 8 && (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>ИНТЕГРАЦИЯ (WEBHOOKS)</Typography>
                <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={handleCreateWebhook}>Добавить</Button>
            </Box>
            <List>
                {(webhooks || []).length === 0 && <Typography variant="body2" color="grey.500">Вебхуки не настроены</Typography>}
                {(webhooks || []).map(w => (
                <ListItem key={w.id} sx={{ bgcolor: '#2a2a2a', mb: 1, borderRadius: 1, flexDirection: 'column', alignItems: 'flex-start' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                        <Typography variant="subtitle2" noWrap sx={{ maxWidth: '80%' }}>{w.url}</Typography>
                        <IconButton size="small" color="error" onClick={() => handleDeleteWebhook(w.id)}>
                            <DeleteIcon fontSize="small" />
                        </IconButton>
                    </Box>
                    <Box sx={{ mt: 1 }}>
                        <Typography variant="caption" sx={{ color: 'grey.500' }}>События: {w.events.join(', ')}</Typography>
                        <Typography variant="caption" display="block" sx={{ color: 'primary.main' }}>Status: {w.is_active ? 'Active' : 'Inactive'}</Typography>
                    </Box>
                </ListItem>
                ))}
            </List>
            <Typography variant="caption" sx={{ color: 'grey.500', mt: 2, display: 'block', p: 1, bgcolor: '#1a1a1a', borderLeft: '2px solid #2196f3' }}>
                💡 Система будет отправлять POST-запрос с JSON-телом и подписью HMAC-SHA256 (X-Hub-Signature-256) при наступлении выбранных событий.
            </Typography>
          </Box>
        )}
        {selectedTab === 9 && (
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 2 }}>ОПОРНЫЕ ТОЧКИ (GCP)</Typography>
            <Paper sx={{ p: 2, bgcolor: '#2a2a2a', mb: 2 }}>
                <Typography variant="body2" color="grey.400" gutterBottom>
                    Используйте опорные точки для повышения геодезической точности модели. 
                    Нанесите точки на карту в режиме 2D.
                </Typography>
                <Divider sx={{ my: 1 }} />
                <Typography variant="caption" color="primary.main">Всего точек: {gcps.length}</Typography>
            </Paper>
            <List>
                {(gcps || []).length === 0 && <Typography variant="body2" color="grey.500" align="center">Точки не заданы. Используйте инструмент "Маркер" на карте.</Typography>}
                {(gcps || []).map(gcp => (
                    <Paper key={gcp.id} sx={{ mb: 1, p: 1.5, bgcolor: '#1a1a1a', borderLeft: `4px solid ${gcp.point_type === 'CONTROL' ? '#2196f3' : '#f44336'}` }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Box>
                                <Typography variant="subtitle2">{gcp.name} ({gcp.point_type_display})</Typography>
                                <Typography variant="caption" color="grey.500" display="block">
                                    Ш: {Number.isFinite(gcp.latitude) ? gcp.latitude.toFixed(6) : '—'} Д: {Number.isFinite(gcp.longitude) ? gcp.longitude.toFixed(6) : '—'}
                                </Typography>
                            </Box>
                            <IconButton size="small" color="error" onClick={() => handleDeleteGcp(gcp.id)}>
                                <DeleteIcon fontSize="small" />
                            </IconButton>
                        </Box>
                    </Paper>
                ))}
            </List>
          </Box>
        )}
        {selectedTab === 10 && (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>ПОЛЕВЫЕ ОБСЛЕДОВАНИЯ</Typography>
                <Button size="small" variant="contained" onClick={handleCreateSurvey}>Новый выезд</Button>
            </Box>
            <List>
                {(surveys || []).length === 0 && <Typography variant="body2" color="grey.500" align="center">Данные отсутствуют</Typography>}
                {(surveys || []).map(s => (
                    <Paper key={s.id} sx={{ mb: 2, p: 2, bgcolor: '#2a2a2a' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <Box>
                                <Typography variant="subtitle2">{s.name}</Typography>
                                <Typography variant="caption" color="grey.500">{s.date} • {s.inspector_username}</Typography>
                            </Box>
                            <Box>
                                <IconButton size="small" color="primary" onClick={() => handleSurveyPhotoUpload(s.id)}><AddIcon fontSize="small" /></IconButton>
                                <IconButton size="small" color="error" onClick={() => handleDeleteSurvey(s.id)}><DeleteIcon fontSize="small" /></IconButton>
                            </Box>
                        </Box>
                        <Divider sx={{ my: 1, borderColor: '#444' }} />
                        <Typography variant="caption" sx={{ color: 'primary.main', mb: 1, display: 'block' }}>ТОЧКИ ({s.points?.length || 0}):</Typography>
                        <Grid container spacing={1}>
                            {s.points?.map(p => (
                                <Grid item xs={4} key={p.id}>
                                    <Box 
                                        sx={{ 
                                            width: '100%', 
                                            height: 60, 
                                            bgcolor: '#000', 
                                            borderRadius: 1, 
                                            overflow: 'hidden',
                                            cursor: 'pointer',
                                            border: '1px solid #444'
                                        }}
                                        onClick={() => alert(`Комментарий: ${p.comment}\nКоординаты: ${p.location}`)}
                                    >
                                        <img src={p.photo} alt="Point" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    </Box>
                                </Grid>
                            ))}
                        </Grid>
                    </Paper>
                ))}
            </List>
          </Box>
        )}
        {selectedTab === 11 && (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>ИСТОРИЯ ЗАМЕРОВ</Typography>
                <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={() => alert('Экспорт замеров в CSV/DXF...')}>Экспорт</Button>
            </Box>
            <Paper sx={{ p: 2, bgcolor: '#2a2a2a', mb: 2 }}>
                <Typography variant="body2" color="grey.400">
                    Здесь отображаются все измерения, сделанные в 2D и 3D режимах. 
                </Typography>
            </Paper>
            <List>
                {measurements.length === 0 && <Typography variant="body2" color="grey.500" align="center">Замеры не найдены. Используйте линейку в 3D или 2D режиме.</Typography>}
                {measurements.map(m => (
                    <Paper key={m.id} sx={{ mb: 1, p: 1.5, bgcolor: '#1a1a1a', borderLeft: '4px solid #f44336' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Box>
                                <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>{m.measure_type}: {m.value} {m.unit}</Typography>
                                <Typography variant="caption" color="grey.500" display="block">
                                    {new Date(m.created_at).toLocaleString()} • Автор: {m.author_username || 'Вы'}
                                </Typography>
                            </Box>
                            <IconButton size="small" color="error"><DeleteIcon fontSize="small" /></IconButton>
                        </Box>
                    </Paper>
                ))}
            </List>
            <Divider sx={{ my: 3 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>ПЛАНИРОВАНИЕ МИССИЙ</Typography>
                <Button size="small" variant="contained" onClick={handleCreateFlightPlan}>Новая миссия</Button>
            </Box>
            <List>
                {(flightPlans || []).length === 0 && <Typography variant="body2" color="grey.500" align="center">Миссии не созданы</Typography>}
                {(flightPlans || []).map(plan => (
                    <Paper key={plan.id} sx={{ mb: 2, p: 2, bgcolor: '#2a2a2a' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <Box>
                                <Typography variant="subtitle2">{plan.name}</Typography>
                                <Typography variant="caption" color="grey.500">
                                    Высота: {plan.altitude}м • Перекрытие: {plan.overlap_h}/{plan.overlap_v}%
                                </Typography>
                            </Box>
                            <Box>
                                <IconButton size="small" color="primary" onClick={() => handleExportFlightKml(plan.id)} title="Экспорт KML">
                                    <DownloadIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" color="error" onClick={() => handleDeleteFlightPlan(plan.id)}>
                                    <DeleteIcon fontSize="small" />
                                </IconButton>
                            </Box>
                        </Box>
                        <Divider sx={{ my: 1, borderColor: '#444' }} />
                        <Typography variant="caption" color="primary.main">ТОЧЕК ПУТИ: {plan.waypoints?.length || 0}</Typography>
                        <Box sx={{ mt: 1 }}>
                            <Button 
                                size="small" 
                                variant={selectedFlightPlan?.id === plan.id ? "contained" : "outlined"} 
                                fullWidth
                                onClick={() => setSelectedFlightPlan(selectedFlightPlan?.id === plan.id ? null : plan)}
                            >
                                {selectedFlightPlan?.id === plan.id ? "РЕЖИМ РЕДАКТИРОВАНИЯ ВКЛ." : "ВЫБРАТЬ ДЛЯ РЕДАКТИРОВАНИЯ"}
                            </Button>
                        </Box>
                        <Typography variant="body2" sx={{ fontSize: '10px', color: 'grey.500', mt: 1 }}>
                            Для редактирования точек выберите миссию и используйте инструменты рисования на карте.
                        </Typography>
                    </Paper>
                ))}
            </List>
          </Box>
        )}
        {selectedTab === 12 && (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>ВЕРСИОННОСТЬ (BRANCHES)</Typography>
                <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => setOpenBranchDialog(true)}>Создать ветку</Button>
            </Box>
            <Paper sx={{ p: 2, bgcolor: '#2a2a2a', mb: 3 }}>
                <Typography variant="body2" color="grey.400" gutterBottom>
                    Используйте ветки для сравнения различных сценариев обработки или периодов мониторинга.
                </Typography>
                <Box sx={{ mt: 2 }}>
                    <Typography variant="caption" color="primary.main" sx={{ fontWeight: 'bold' }}>ТЕКУЩАЯ ВЕТКА: {selectedBranch?.name || 'Main'}</Typography>
                </Box>
            </Paper>
            <List>
                {branches.map(branch => (
                    <Paper 
                        key={branch.id} 
                        sx={{ 
                            mb: 1.5, 
                            p: 2, 
                            bgcolor: selectedBranch?.id === branch.id ? 'rgba(33, 150, 243, 0.1)' : '#1a1a1a',
                            border: selectedBranch?.id === branch.id ? '1px solid #2196f3' : '1px solid transparent',
                            cursor: 'pointer'
                        }}
                        onClick={() => setSelectedBranch(branch)}
                    >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Box>
                                <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                                    {branch.name} {branch.is_main && "(Основная)"}
                                </Typography>
                                <Typography variant="caption" color="grey.500">Создана: {new Date(branch.created_at).toLocaleDateString()}</Typography>
                            </Box>
                            {!branch.is_main && (
                                <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); handleDeleteBranch(branch.id); }}>
                                    <DeleteIcon fontSize="small" />
                                </IconButton>
                            )}
                        </Box>
                    </Paper>
                ))}
            </List>
            <Divider sx={{ my: 3 }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 2 }}>4D МОНИТОРИНГ (TIME-SERIES)</Typography>
            <Paper sx={{ p: 2, bgcolor: '#2a2a2a', mb: 3 }}>
                <Typography variant="body2" color="grey.400" gutterBottom>
                    Сравнение состояния объекта по временной шкале. Перетащите ползунок для просмотра изменений.
                </Typography>
                <Box sx={{ px: 2, mt: 4 }}>
                    <input 
                        type="range" 
                        min="0" 
                        max={Math.max(0, timeline.length - 1)} 
                        step="1" 
                        value={currentTimeIndex} 
                        onChange={(e) => setCurrentTimeIndex(parseInt(e.target.value))}
                        style={{ width: '100%', cursor: 'pointer' }}
                    />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                        <Typography variant="caption" color="grey.500">
                            {timeline[0] ? new Date(timeline[0].timestamp).toLocaleDateString() : 'Начало'}
                        </Typography>
                        <Box sx={{ textAlign: 'center' }}>
                             <Typography variant="caption" color="primary.main" sx={{ fontWeight: 'bold', display: 'block' }}>
                                {timeline[currentTimeIndex] ? new Date(timeline[currentTimeIndex].timestamp).toLocaleDateString() : 'Текущая'}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'grey.400' }}>
                                {timeline[currentTimeIndex]?.label}
                            </Typography>
                        </Box>
                        <Typography variant="caption" color="grey.500">
                            {timeline[timeline.length - 1] ? new Date(timeline[timeline.length-1].timestamp).toLocaleDateString() : 'Конец'}
                        </Typography>
                    </Box>
                </Box>
            </Paper>
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                <Button 
                    variant={comparisonMode ? "contained" : "outlined"} 
                    fullWidth 
                    onClick={() => setComparisonMode(!comparisonMode)}
                >
                    {comparisonMode ? "ВЫКЛЮЧИТЬ СРАВНЕНИЕ" : "СРАВНИТЬ С ПРЕДЫДУЩИМ (SWIPE)"}
                </Button>
                <Button 
                    variant="outlined" 
                    color="secondary"
                    fullWidth 
                    onClick={handleRunChangeDetection}
                >
                    ГЕНЕРИРОВАТЬ КАРТУ ИЗМЕНЕНИЙ (AI)
                </Button>
            </Box>
            <List>
                {timeline.length === 0 && <Typography variant="body2" color="grey.500" align="center">Временные срезы не найдены. Обработайте проект несколько раз.</Typography>}
                {timeline.map((t, idx) => (
                    <Paper 
                        key={t.id} 
                        sx={{ 
                            mb: 1, 
                            p: 1.5, 
                            bgcolor: currentTimeIndex === idx ? 'rgba(33, 150, 243, 0.1)' : '#1a1a1a',
                            borderLeft: currentTimeIndex === idx ? '4px solid #2196f3' : '4px solid transparent',
                            cursor: 'pointer'
                        }}
                        onClick={() => setCurrentTimeIndex(idx)}
                    >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="subtitle2">{t.label || `Срез #${idx+1}`}</Typography>
                            <Typography variant="caption" color="grey.500">{new Date(t.timestamp).toLocaleString()}</Typography>
                        </Box>
                        <Typography variant="caption" color="grey.600">Артефакт: {t.artifact_details?.artifact_type_display}</Typography>
                    </Paper>
                ))}
            </List>
          </Box>
        )}
      </Box>
      </Box>
    </>
  );

  const handleWaypointCreated = useCallback((latlng) => {
    if (!selectedFlightPlan) return;
    addFlightWaypoint(selectedFlightPlan.id, {
        latitude: latlng.lat,
        longitude: latlng.lng,
        altitude: selectedFlightPlan.altitude,
        order: (selectedFlightPlan.waypoints?.length || 0) + 1
    }).then(() => {
        fetchFlightPlans(selectedProject.id).then(res => {
            setFlightPlans(res.data);
            const updated = res.data.find(p => p.id === selectedFlightPlan.id);
            if (updated) setSelectedFlightPlan(updated);
        });
        showToast('Точка пути добавлена в миссию', 'info');
    });
  }, [selectedFlightPlan, selectedProject]);

  const handleGcpCreated = useCallback((latlng) => {
      if (!selectedProject) return;
      const name = prompt("Название опорной точки:", `GCP_${gcps.length + 1}`);
      if (name) {
          const type = window.confirm("Это контрольная точка (GCP)? (Ок - GCP, Отмена - Проверочная/Check Point)") ? 'CONTROL' : 'CHECK';
          createGcp({
              project: selectedProject.id,
              name,
              point_type: type,
              latitude: latlng.lat,
              longitude: latlng.lng,
              altitude: 0
          }).then(() => {
              fetchGcps(selectedProject.id).then(res => setGcps(res.data));
              showToast(`Точка ${name} добавлена`, 'success');
          });
      }
  }, [selectedProject, gcps.length]);



  if (loading && projects.length === 0) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', bgcolor: '#121212', color: 'white' }}>
        <CircularProgress size={60} thickness={4} />
        <Typography variant="h6" sx={{ mt: 3, letterSpacing: 1 }}>ЗАГРУЗКА СИСТЕМЫ...</Typography>
      </Box>
    );
  }

    return (
    <Layout sidebar={!publicMode && sidebar} rightPanel={rightPanel} rightPanelWidth={rightPanelWidth} publicMode={publicMode}>
      {apiUnavailable && (
        <Box sx={{ position: 'absolute', top: 10, left: 10, zIndex: 2000, maxWidth: 520 }}>
          <Alert
            severity="warning"
            variant="filled"
            sx={{ bgcolor: 'rgba(245, 124, 0, 0.9)' }}
            action={
              <Button color="inherit" size="small" onClick={refreshData}>
                Повторить
              </Button>
            }
          >
            {apiUnavailableMessage || API_UNAVAILABLE_MESSAGE}
          </Alert>
        </Box>
      )}

      {/* Unified Top Toolbar */}
      {/* Floating Status Bar - API ONLY - Moved to far left-bottom or fixed top corner with more space */}
      <Box
        sx={{ 
          position: 'fixed', 
          bottom: 20, 
          left: 20, 
          zIndex: 2000, 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1,
          bgcolor: 'rgba(0,0,0,0.8)',
          p: '6px 14px',
          borderRadius: '20px',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.2)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
        }}
      >
        <Box sx={{ 
          width: 10, 
          height: 10, 
          bgcolor: apiUnavailable ? 'error.main' : 'success.main', 
          borderRadius: '50%',
          boxShadow: `0 0 8px ${apiUnavailable ? 'red' : '#4caf50'}` 
        }} />
        <Typography variant="caption" sx={{ color: 'white', fontWeight: 'bold', letterSpacing: 1 }}>
            API: {apiUnavailable ? 'OFFLINE' : 'ONLINE'}
        </Typography>
      </Box>

      {/* Floating Toolbar - Project Actions - Moved to Top Center to avoid clashing with sidebars and status */}
      <Box
        sx={{ 
          position: 'absolute', 
          top: 15, 
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1100, 
          display: 'flex', 
          alignItems: 'center', 
          gap: 2,
          bgcolor: 'rgba(20,20,20,0.85)',
          p: '6px 16px',
          borderRadius: 2,
          backdropFilter: 'blur(6px)',
          border: '1px solid rgba(255,255,255,0.15)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)'
        }}
      >
        {/* View mode & Comparison (ProjectPage logic) */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {viewMode === '2d' && (
                <Button 
                    variant="contained" 
                    size="small" 
                    color={comparisonMode ? "primary" : "inherit"}
                    onClick={() => setComparisonMode(!comparisonMode)}
                    sx={{ bgcolor: comparisonMode ? 'primary.main' : 'rgba(0,0,0,0.4)', color: '#fff', height: 28, fontSize: '0.75rem' }}
                >
                    СРАВНЕНИЕ
                </Button>
            )}
            <ToggleButtonGroup
                value={viewMode}
                exclusive
                onChange={(e, mode) => mode && setViewMode(mode)}
                size="small"
                sx={{ bgcolor: 'rgba(0,0,0,0.4)', height: 28 }}
            >
                <ToggleButton value="2d" sx={{ color: 'white', px: 1.5, py: 0, fontSize: '0.75rem' }}>
                    <MapIcon sx={{ mr: 0.5, fontSize: '1rem' }} /> 2D
                </ToggleButton>
                <ToggleButton value="3d" sx={{ color: 'white', px: 1.5, py: 0, fontSize: '0.75rem' }}>
                    <ViewInArIcon sx={{ mr: 0.5, fontSize: '1rem' }} /> 3D
                </ToggleButton>
            </ToggleButtonGroup>
        </Box>

        <Divider orientation="vertical" flexItem sx={{ bgcolor: 'rgba(255,255,255,0.2)' }} />

        {/* Map Controls (Moved from MapView) */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tooltip title="Центрировать по снимкам">
                <IconButton 
                    size="small"
                    onClick={handleFitBounds}
                    sx={{ color: 'white', p: 0.5 }}
                >
                    <CenterFocusStrongIcon fontSize="small" />
                </IconButton>
            </Tooltip>

            {viewMode === '2d' && (
                <ToggleButtonGroup
                    size="small"
                    value={mapLayer}
                    exclusive
                    onChange={(e, v) => v && setMapLayer(v)}
                    sx={{ bgcolor: 'rgba(0,0,0,0.4)', height: 28 }}
                >
                    <ToggleButton value="rgb" sx={{ color: 'white', px: 1.5, py: 0, fontSize: '0.75rem' }}>RGB</ToggleButton>
                    {ndviArtifacts.length > 0 && (
                        <ToggleButton value="ndvi" sx={{ color: 'white', px: 1.5, py: 0, fontSize: '0.75rem' }}>NDVI</ToggleButton>
                    )}
                </ToggleButtonGroup>
            )}
        </Box>
      </Box>

      {viewMode === '2d' ? (
        <MapView 
          project={selectedProject} 
          files={files} 
          results={results}
          gcps={gcps}
          surveys={surveys}
          flightPlans={flightPlans}
          selectedFlightPlan={selectedFlightPlan}
          timeline={timeline}
          currentTimeIndex={currentTimeIndex}
          fitTrigger={fitTrigger}
          setFitTrigger={setFitTrigger}
          comparisonMode={comparisonMode}
          mapLayer={mapLayer}
          setMapLayer={setMapLayer}
          secondMapLayer={secondMapLayer}
          setSecondMapLayer={setSecondMapLayer}
          selectedOrthoIndex={selectedOrthoIndex}
          setSelectedOrthoIndex={setSelectedOrthoIndex}
          secondOrthoIndex={secondOrthoIndex}
          setSecondOrthoIndex={setSecondOrthoIndex}
          selectedNdviIndex={selectedNdviIndex}
          setSelectedNdviIndex={setSelectedNdviIndex}
          secondNdviIndex={secondNdviIndex}
          setSecondNdviIndex={setSecondNdviIndex}
          swipeActive={swipeActive}
          setSwipeActive={setSwipeActive}
          swipeDivider={swipeDivider}
          setSwipeDivider={setSwipeDivider}
          onAreaCreated={handleAreaCreated}
          onGcpCreated={handleGcpCreated}
          onWaypointCreated={handleWaypointCreated}
          onMeasure={onMeasure}
          onAddAnnotation={handleAddAnnotation}
          orthoArtifacts={orthoArtifacts}
          ndviArtifacts={ndviArtifacts}
          orthophotoLayers={orthophotoLayers}
        />
      ) : (
        <ModelViewer 
            project={selectedProject} 
            results={results} 
            selectedModelIndex={selectedModelIndex}
            setSelectedModelIndex={setSelectedModelIndex}
            secondModelIndex={secondModelIndex}
            setSecondModelIndex={setSecondModelIndex}
            comparisonMode={comparisonMode} 
            onMeasure={(res) => onMeasure({...res, type: res.type || (res.value.includes('³') ? 'VOLUME' : (res.value.includes('²') ? 'AREA' : 'DISTANCE'))})} 
        />
      )}

      <Dialog
        open={openDialog}
        onClose={() => {
          if (creatingProject) return;
          setOpenDialog(false);
          setIsEditing(false);
          setNewProject({ name: '', description: '' });
        }}
        PaperProps={{ sx: { bgcolor: '#1e1e1e', color: 'white' } }}
      >
        <DialogTitle>{isEditing ? 'Редактировать проект' : 'Создать новый проект'}</DialogTitle>
        <DialogContent>
            {apiUnavailable && (
              <Alert
                severity="warning"
                sx={{ mt: 2 }}
                action={
                  <Button color="inherit" size="small" onClick={refreshData}>
                    Повторить
                  </Button>
                }
              >
                {apiUnavailableMessage || API_UNAVAILABLE_MESSAGE}
              </Alert>
            )}
            <TextField
                autoFocus
                margin="dense"
                label="Название"
                fullWidth
                variant="outlined"
                value={newProject.name}
                onChange={(e) => setNewProject({...newProject, name: e.target.value})}
                sx={{ input: { color: 'white' }, label: { color: 'grey.500' }, mt: 2 }}
            />
            <TextField
                margin="dense"
                label="Описание"
                fullWidth
                multiline
                rows={4}
                variant="outlined"
                value={newProject.description}
                onChange={(e) => setNewProject({...newProject, description: e.target.value})}
                sx={{ textarea: { color: 'white' }, label: { color: 'grey.500' }, mt: 2 }}
            />
            <TextField
                margin="dense"
                label="Теги (через запятую)"
                fullWidth
                variant="outlined"
                value={newProject.tags?.join(', ')}
                onChange={(e) => setNewProject({...newProject, tags: e.target.value.split(',').map(t => t.trim()).filter(t => t)})}
                sx={{ input: { color: 'white' }, label: { color: 'grey.500' }, mt: 2 }}
            />
            <TextField
                margin="dense"
                label="Целевой GSD (см/пикс)"
                fullWidth
                type="number"
                variant="outlined"
                value={newProject.target_gsd || ''}
                onChange={(e) => setNewProject({...newProject, target_gsd: parseFloat(e.target.value) || null})}
                sx={{ input: { color: 'white' }, label: { color: 'grey.500' }, mt: 2 }}
            />
            <Box sx={{ mt: 2, display: 'flex', alignItems: 'center' }}>
                <Typography variant="body2" sx={{ mr: 2, color: 'grey.500' }}>Категория:</Typography>
                <Select
                    size="small"
                    value={newProject.category || ''}
                    onChange={(e) => setNewProject({...newProject, category: e.target.value})}
                    sx={{ bgcolor: '#2a2a2a', color: 'white', minWidth: 150 }}
                >
                    <MenuItem value="">Без категории</MenuItem>
                    {categories.map(cat => (
                        <MenuItem key={cat.id} value={cat.id}>{cat.name}</MenuItem>
                    ))}
                </Select>
            </Box>
            <Box sx={{ mt: 2 }}>
                <Typography variant="caption" sx={{ color: 'grey.500', display: 'block', mb: 1 }}>КАЧЕСТВО ОБРАБОТКИ:</Typography>
                <ToggleButtonGroup
                    size="small"
                    value={newProject.processing_quality || 'MEDIUM'}
                    exclusive
                    onChange={(e, v) => v && setNewProject({...newProject, processing_quality: v})}
                    fullWidth
                    sx={{ bgcolor: '#2a2a2a' }}
                >
                    <ToggleButton value="LOW">LOW</ToggleButton>
                    <ToggleButton value="MEDIUM">MEDIUM</ToggleButton>
                    <ToggleButton value="HIGH">HIGH</ToggleButton>
                </ToggleButtonGroup>
            </Box>
            <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
                <TextField
                    label="Резолюция орто (см)"
                    size="small"
                    type="number"
                    value={newProject.ortho_resolution || ''}
                    onChange={(e) => setNewProject({...newProject, ortho_resolution: e.target.value})}
                    sx={{ input: { color: 'white' }, label: { color: 'grey.500' } }}
                />
                <TextField
                    label="Резолюция DSM (см)"
                    size="small"
                    type="number"
                    value={newProject.dsm_resolution || ''}
                    onChange={(e) => setNewProject({...newProject, dsm_resolution: e.target.value})}
                    sx={{ input: { color: 'white' }, label: { color: 'grey.500' } }}
                />
            </Box>
            <Box sx={{ mt: 2, display: 'flex', alignItems: 'center' }}>
                <Typography variant="body2" sx={{ mr: 2, color: 'grey.500' }}>Оптимизировать 3D:</Typography>
                <Button 
                    size="small" 
                    variant={newProject.optimize_mesh ? "contained" : "outlined"} 
                    onClick={() => setNewProject({...newProject, optimize_mesh: !newProject.optimize_mesh})}
                >
                    {newProject.optimize_mesh ? "ДА" : "НЕТ"}
                </Button>
            </Box>
            <Box sx={{ mt: 2, display: 'flex', alignItems: 'center' }}>
                <Typography variant="body2" sx={{ mr: 2, color: 'grey.500' }}>Сделать проект публичным:</Typography>
                <Button 
                    size="small" 
                    variant={newProject.is_public ? "contained" : "outlined"} 
                    onClick={() => setNewProject({...newProject, is_public: !newProject.is_public})}
                >
                    {newProject.is_public ? "ДА" : "НЕТ"}
                </Button>
            </Box>
        </DialogContent>
        <DialogActions>
            <Button
              onClick={() => {
                if (creatingProject) return;
                setOpenDialog(false);
                setIsEditing(false);
                setNewProject({ name: '', description: '' });
              }}
            >
              Отмена
            </Button>
            <Button
              onClick={handleCreateProject}
              variant="contained"
              disabled={apiUnavailable || creatingProject}
            >
              {creatingProject ? (isEditing ? 'Сохранение...' : 'Создание...') : (isEditing ? 'Сохранить' : 'Создать')}
            </Button>
        </DialogActions>
      </Dialog>

      <Dialog 
        open={Boolean(selectedTaskForLogs)} 
        onClose={() => setSelectedTaskForLogs(null)} 
        fullWidth 
        maxWidth="md"
        PaperProps={{ sx: { bgcolor: '#1e1e1e', color: 'white' } }}
      >
        <DialogTitle>Логи задачи: {selectedTaskForLogs?.name}</DialogTitle>
        <DialogContent dividers sx={{ borderColor: '#333' }}>
            <Box sx={{ 
                bgcolor: '#000', 
                p: 2, 
                borderRadius: 1, 
                fontFamily: 'monospace', 
                fontSize: '12px',
                minHeight: '300px',
                whiteSpace: 'pre-wrap',
                color: '#4caf50'
            }}>
                {selectedTaskForLogs?.logs || 'Логи отсутствуют...'}
            </Box>
        </DialogContent>
        <DialogActions>
            <Button onClick={() => setSelectedTaskForLogs(null)}>Закрыть</Button>
        </DialogActions>
      </Dialog>
      
      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={6000} 
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>

      <Dialog open={openBranchDialog} onClose={() => setOpenBranchDialog(false)}>
          <DialogTitle>Создать новую ветку (версию)</DialogTitle>
          <DialogContent>
              <Typography variant="body2" sx={{ mb: 2 }}>
                  Ветки позволяют изолировать результаты разных проходов обработки.
              </Typography>
              <TextField
                  autoFocus
                  margin="dense"
                  label="Название ветки"
                  fullWidth
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
              />
          </DialogContent>
          <DialogActions>
              <Button onClick={() => setOpenBranchDialog(false)}>Отмена</Button>
              <Button onClick={handleCreateBranch} variant="contained">Создать</Button>
          </DialogActions>
      </Dialog>

      <Dialog open={passwordRequired} disableEscapeKeyDown>
          <DialogTitle>Требуется пароль</DialogTitle>
          <DialogContent>
              <Typography variant="body2" sx={{ mb: 2 }}>
                  Этот проект защищен паролем. Пожалуйста, введите его для просмотра.
              </Typography>
              <TextField
                  autoFocus
                  margin="dense"
                  label="Пароль"
                  type="password"
                  fullWidth
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && refreshData()}
              />
          </DialogContent>
          <DialogActions>
              <Button onClick={refreshData} variant="contained" color="primary">Войти</Button>
          </DialogActions>
      </Dialog>

      <Dialog open={!!editingOrthophoto} onClose={() => setEditingOrthophoto(null)}>
          <DialogTitle>Переименовать ортофотоплан</DialogTitle>
          <DialogContent>
              <TextField
                  autoFocus
                  margin="dense"
                  label="Новое название"
                  fullWidth
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
              />
          </DialogContent>
          <DialogActions>
              <Button onClick={() => setEditingOrthophoto(null)}>Отмена</Button>
              <Button onClick={handleRenameOrthophoto} variant="contained">Сохранить</Button>
          </DialogActions>
      </Dialog>

      <Menu
          anchorEl={exportAnchorEl}
          open={Boolean(exportAnchorEl)}
          onClose={() => setExportAnchorEl(null)}
      >
          <MenuItem onClick={() => handleDownloadOrtho('geotiff')}>GeoTIFF (для GIS)</MenuItem>
          <MenuItem onClick={() => handleDownloadOrtho('png')}>PNG + World file</MenuItem>
          <MenuItem onClick={() => handleDownloadOrtho('kmz')}>KMZ (Google Earth)</MenuItem>
          <MenuItem onClick={() => handleDownloadOrtho('tiles')}>Тайлы XYZ (ZIP)</MenuItem>
      </Menu>
    </Layout>
    );
};

export default ProjectPage;
