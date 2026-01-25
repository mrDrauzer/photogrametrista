import axios from 'axios';

const api = axios.create({
    baseURL: '/api/',
});

api.interceptors.request.use(config => {
    const token = localStorage.getItem('access_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

api.interceptors.response.use(
    response => response,
    async error => {
        const originalRequest = error.config;
        if (error.response && error.response.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;
            const refreshToken = localStorage.getItem('refresh_token');
            if (refreshToken) {
                try {
                    const res = await axios.post('/api/token/refresh/', { refresh: refreshToken });
                    localStorage.setItem('access_token', res.data.access);
                    api.defaults.headers.common['Authorization'] = `Bearer ${res.data.access}`;
                    return api(originalRequest);
                } catch (refreshError) {
                    localStorage.removeItem('access_token');
                    localStorage.removeItem('refresh_token');
                    window.location.href = '/login';
                }
            }
        }
        return Promise.reject(error);
    }
);

export const login = (username, password) => api.post('token/', { username, password });
export const register = (data) => api.post('register/', data); // Нужно будет добавить в бэкенд

export const fetchProjects = () => api.get('projects/');
export const fetchProjectDetail = (id) => api.get(`projects/${id}/`);
export const createProject = (data) => api.post('projects/', data);
export const updateProject = (id, data) => api.patch(`projects/${id}/`, data);
export const deleteProject = (id) => api.delete(`projects/${id}/`);
export const bulkDeleteFiles = (ids) => api.post('files/bulk_delete/', { ids });
export const fetchTasks = () => api.get('tasks/');
export const fetchProjectTasks = (projectId) => api.get(`tasks/?project=${projectId}`);
export const fetchProjectFiles = (projectId) => api.get(`files/?project=${projectId}`);
export const fetchProjectArtifacts = (projectId) => api.get(`artifacts/?project=${projectId}`);
export const downloadArtifact = (artifactId) => {
    return api.get(`artifacts/${artifactId}/download/`, { responseType: 'blob' })
        .then(response => {
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            const contentDisposition = response.headers['content-disposition'];
            let fileName = `artifact_${artifactId}`;
            if (contentDisposition) {
                const fileNameMatch = contentDisposition.match(/filename="(.+)"/);
                if (fileNameMatch.length === 2) fileName = fileNameMatch[1];
            }
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            link.remove();
        });
};
export const uploadProjectFile = (projectId, file, onUploadProgress, nameOverride = null) => {
    const formData = new FormData();
    formData.append('project', projectId);
    formData.append('file', file);
    formData.append('name', nameOverride || file.name);
    return api.post('files/', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
        onUploadProgress,
    });
};
export const createTask = (data) => api.post('tasks/', data);
export const cancelTask = (id) => api.post(`tasks/${id}/cancel/`);

export const fetchProjectOrthophotos = (projectId) => api.get(`orthophotos/?project=${projectId}`);
export const updateOrthophoto = (id, data) => api.patch(`orthophotos/${id}/`, data);
export const exportOrthophoto = (id, format = 'geotiff') => api.get(`orthophotos/${id}/export/?format=${format}`, { responseType: 'blob' });

export const runProjectProcessing = (id, quality = 'MEDIUM', branchId = null, orthoOnly = false, taskName = null) => 
    api.post(`projects/${id}/run_processing/`, { quality, branch_id: branchId, ortho_only: orthoOnly, task_name: taskName });

export const uploadGeoTiff = (projectId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`projects/${projectId}/upload_geotiff/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
};

export const importProjectPhotos = (id, folderPath) => api.post(`projects/${id}/import_photos/`, { folder_path: folderPath });
export const generateProjectReport = (id) => api.post(`projects/${id}/generate_report/`);
export const exportProjectData = (id, format = 'ZIP') => api.post(`projects/${id}/export_data/`, { format });
export const runGisExport = (id, format = 'SHAPEFILE', epsg = 4326) => api.post(`projects/${id}/gis_export/`, { format, epsg });
export const runMultispectralAnalysis = (id, indexType = 'NDVI') => api.post(`projects/${id}/run_multispectral/`, { index_type: indexType });
export const runChangeDetection = (projectId, a1Id, a2Id) => api.post(`projects/${projectId}/run_change_detection/`, { artifact1_id: a1Id, artifact2_id: a2Id });
export const runLandXmlExport = (id) => api.post(`projects/${id}/landxml_export/`);
export const generateContours = (id, interval = 1.0) => api.post(`projects/${id}/generate_contours/`, { interval });
export const simplifyMesh = (artifactId, ratio = 0.5) => api.post(`artifacts/${artifactId}/simplify_mesh/`, { ratio });
export const importKml = (id, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`projects/${id}/import_kml/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
};
export const updateProjectArea = (id, area) => api.patch(`projects/${id}/`, { area });
export const updateProjectCategory = (id, categoryId) => api.patch(`projects/${id}/`, { category: categoryId });

export const fetchCategories = () => api.get('categories/');
export const createCategory = (data) => api.post('categories/', data);
export const deleteCategory = (id) => api.delete(`categories/${id}/`);

export const archiveProject = (id) => api.post(`projects/${id}/archive/`);
export const unarchiveProject = (id) => api.post(`projects/${id}/unarchive/`);

export const generatePublicLink = (projectId, password) => api.post(`projects/${projectId}/generate_public_link/`, { password });
export const checkPublicLink = (projectId, token, password) => api.post(`projects/${projectId}/check_public_link/`, { token, password });

export const fetchMeasurements = (projectId) => api.get(`measurements/?project=${projectId}`);
export const createMeasurement = (data) => api.post('measurements/', data);

export const fetchNotifications = () => api.get('notifications/');
export const markNotificationRead = (id) => api.patch(`notifications/${id}/`, { is_read: true });
export const markAllNotificationsRead = () => api.post('notifications/mark_all_as_read/');

export const fetchGlobalStats = () => api.get('projects/statistics/');

export const fetchSnapshots = (projectId) => api.get(`snapshots/?project=${projectId}`);
export const createSnapshot = (data) => api.post('snapshots/', data);
export const deleteSnapshot = (id) => api.delete(`snapshots/${id}/`);

export const fetchShares = (projectId) => api.get(`shares/?project=${projectId}`);
export const createShare = (data) => api.post('shares/', data);
export const deleteShare = (id) => api.delete(`shares/${id}/`);

export const fetchAnnotations = (projectId, type) => api.get(`annotations/?project=${projectId}${type ? `&annotation_type=${type}` : ''}`);
export const createAnnotation = (data) => api.post('annotations/', data);
export const deleteAnnotation = (id) => api.delete(`annotations/${id}/`);

export const fetchActivityLogs = (projectId) => api.get(`activities/?project=${projectId}`);

export const fetchUserProfile = () => api.get('users/me/');
export const updateUserProfile = (data) => api.patch('users/me/', data);

export const fetchProjectStats = (projectId) => api.get(`projects/${projectId}/project_stats/`);
export const bulkDownloadArtifacts = (projectId) => api.post(`projects/${projectId}/bulk_artifact_download/`);
export const compareArtifacts = (id1, id2) => api.get(`artifacts/${id1}/compare/?other_id=${id2}`);
export const generateComparisonPdf = (id1, id2) => api.post(`artifacts/${id1}/generate_comparison_pdf/`, { other_id: id2 });

export const runObjectDetection = (id) => api.post(`projects/${id}/run_detection/`);
export const exportToCloud = (id, service = 'google_drive') => api.post(`projects/${id}/cloud_export/`, { service });
export const fetchDetectedObjects = (id) => api.get(`projects/${id}/detected_objects/`);
export const fetchQualityMetrics = (id) => api.get(`projects/${id}/quality_metrics/`);

export const fetchWebhooks = (projectId) => api.get(`webhooks/?project=${projectId}`);
export const createWebhook = (data) => api.post('webhooks/', data);
export const deleteWebhook = (id) => api.delete(`webhooks/${id}/`);

export const fetchGcps = (projectId) => api.get(`gcps/?project=${projectId}`);
export const createGcp = (data) => api.post('gcps/', data);
export const deleteGcp = (id) => api.delete(`gcps/${id}/`);

export const updatePresence = (projectId) => api.post(`projects/${projectId}/update_presence/`);

export const fetchBranches = (projectId) => api.get(`branches/?project=${projectId}`);
export const createBranch = (data) => api.post('branches/', data);
export const deleteBranch = (id) => api.delete(`branches/${id}/`);

export const fetchSurveys = (projectId) => api.get(`surveys/?project=${projectId}`);
export const createSurvey = (data) => api.post('surveys/', data);
export const deleteSurvey = (id) => api.delete(`surveys/${id}/`);
export const uploadSurveyPoint = (surveyId, file, location, comment) => {
    const formData = new FormData();
    formData.append('survey', surveyId);
    formData.append('photo', file);
    formData.append('location', `POINT(${location[1]} ${location[0]})`);
    formData.append('comment', comment);
    return api.post('survey-points/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
};

export const fetchFlightPlans = (projectId) => api.get(`flight-plans/?project=${projectId}`);
export const createFlightPlan = (data) => api.post('flight-plans/', data);
export const deleteFlightPlan = (id) => api.delete(`flight-plans/${id}/`);
export const addFlightWaypoint = (planId, data) => api.post(`flight-plans/${planId}/add_waypoint/`, data);
export const exportFlightKml = (planId) => api.get(`flight-plans/${planId}/export_kml/`);

export const fetchProjectTimeline = (projectId) => api.get(`timeline/?project=${projectId}`);

export const fetchTemplates = () => api.get('templates/');
export const fetchCrsDefinitions = () => api.get('crs/');
export const createCrsDefinition = (data) => api.post('crs/', data);

// Public healthcheck endpoint (AllowAny). Useful for quick API connectivity status.
export const checkApiHealth = () => api.get('health/');

export default api;
