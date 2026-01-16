import React, { useEffect, useState, useMemo, useCallback, memo } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents, GeoJSON, FeatureGroup, Marker, Popup, CircleMarker, Polyline, LayersControl, ImageOverlay } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
// import { EditControl } from 'react-leaflet-draw'; // Deprecated, replaced by Geoman
import { Box, Typography, Paper, Button, IconButton, Tooltip, Divider, Grid, ToggleButtonGroup, ToggleButton, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import EditIcon from '@mui/icons-material/Edit';
import PolylineIcon from '@mui/icons-material/Polyline';
import HexagonIcon from '@mui/icons-material/Hexagon';
import PlaceIcon from '@mui/icons-material/Place';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';

// ВАЖНО: Импорты для кластеров (без них маркеры могут быть невидимы или отображаться некорректно)
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

import { fetchAnnotations, createAnnotation, deleteAnnotation } from '../../api/client';

const isValidGeoJSON = (geojson) => {
    if (!geojson || typeof geojson !== 'object') return false;
    const isValidCoord = (c) => Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]);
    try {
        // Поддержка WKT Polygon, который DRF может вернуть как объект с типом и координатами
        if (geojson.type === 'Polygon' && Array.isArray(geojson.coordinates)) {
            return geojson.coordinates.length > 0 && 
                   Array.isArray(geojson.coordinates[0]) && 
                   geojson.coordinates[0].length >= 3;
        }
        if (geojson.type === 'Feature') {
            return geojson.geometry && isValidGeoJSON(geojson.geometry);
        }
        if (geojson.type === 'FeatureCollection') {
            return Array.isArray(geojson.features);
        }
    } catch (e) {
        return false;
    }
    return false;
  };

const isValidBounds = (bounds) => {
    if (!bounds || !Array.isArray(bounds) || bounds.length !== 2) return false;
    const [sw, ne] = bounds;
    if (!Array.isArray(sw) || sw.length !== 2 || !Array.isArray(ne) || ne.length !== 2) return false;
    return Number.isFinite(sw[0]) && Number.isFinite(sw[1]) && 
           Number.isFinite(ne[0]) && Number.isFinite(ne[1]);
};
  
const getBoundsFromArea = (area) => {
    if (!area) return null;
    let coords = [];
    
    try {
        if (area.type === 'Polygon') coords = area.coordinates[0];
        else if (area.type === 'Feature') {
            if (area.geometry.type === 'Polygon') coords = area.geometry.coordinates[0];
            else if (area.geometry.type === 'MultiPolygon') {
                area.geometry.coordinates.forEach(poly => {
                    coords.push(...poly[0]);
                });
            }
        }
        else if (area.type === 'FeatureCollection') {
            area.features.forEach(f => {
                if (f.geometry.type === 'Polygon') coords.push(...f.geometry.coordinates[0]);
                else if (f.geometry.type === 'MultiPolygon') {
                    f.geometry.coordinates.forEach(poly => {
                        coords.push(...poly[0]);
                    });
                }
            });
        }
    } catch (e) {
        console.error("Error extracting coords from area:", e);
        return null;
    }
    
    if (!coords || coords.length === 0) return null;
    const lats = coords.map(c => c[1]).filter(val => Number.isFinite(val));
    const lngs = coords.map(c => c[0]).filter(val => Number.isFinite(val));
    
    if (lats.length === 0 || lngs.length === 0) return null;
  
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
  
    return [
        [minLat, minLng],
        [maxLat, maxLng]
    ];
};
  
const calculateArea = (area) => {
    if (!isValidGeoJSON(area)) return 0;
    let latlngs = [];
    if (area.type === 'Polygon') latlngs = area.coordinates[0].map(c => L.latLng(c[1], c[0]));
    else if (area.type === 'Feature') latlngs = area.geometry.coordinates[0].map(c => L.latLng(c[1], c[0]));
    
    if (latlngs.length === 0) return 0;
    
    // В Leaflet-draw обычно есть L.GeometryUtil
    if (L.GeometryUtil && L.GeometryUtil.geodesicArea) {
        return L.GeometryUtil.geodesicArea(latlngs);
    }
    
    const factorX = 111320;
    const avgLat = latlngs.reduce((sum, ll) => sum + ll.lat, 0) / latlngs.length;
    const factorY = 111320 * Math.cos(avgLat * Math.PI / 180);
    
    let sum = 0;
    for (let i = 0; i < latlngs.length; i++) {
        const j = (i + 1) % latlngs.length;
        const xi = latlngs[i].lng * factorY;
        const yi = latlngs[i].lat * factorX;
        const xj = latlngs[j].lng * factorY;
        const yj = latlngs[j].lat * factorX;
        sum += (xi * yj - xj * yi);
    }
    return Math.abs(sum) / 2;
};

// ... (marker fix remain)

const SyncMap = ({ center, zoom, onMove }) => {
    const map = useMap();
    useEffect(() => {
        // Leaflet падает, если центр карты некорректный (например, [null, null]).
        // Это может происходить, если у первых фото нет GPS в EXIF.
        if (!Array.isArray(center) || center.length !== 2) return;
        const lat = Number(center[0]);
        const lng = Number(center[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        map.setView([lat, lng], zoom, { animate: false });
    }, [center, zoom]);

    useEffect(() => {
        const handleMove = () => {
            onMove(map.getCenter(), map.getZoom());
        };
        map.on('move', handleMove);
        return () => map.off('move', handleMove);
    }, [map, onMove]);
    return null;
};

// ВАЖНО: CursorDisplay вынесен в отдельный компонент для производительности.
// Если его состояние 'pos' поднять выше, то при каждом движении мыши (60fps) 
// будет перерисовываться вся карта и родительская страница ProjectPage (2000+ строк), 
// что вызовет фатальные лаги интерфейса.
const CursorDisplay = () => {
    const [pos, setPos] = useState(null);
    useMapEvents({
        mousemove: (e) => setPos(e.latlng),
        mouseout: () => setPos(null),
    });

    if (!pos) {
        return (
            <div className="leaflet-bottom leaflet-left" style={{ marginBottom: '60px', marginLeft: '10px', zIndex: 1000, pointerEvents: 'none' }}>
                <Paper sx={{ px: 1, py: 0.5, bgcolor: 'rgba(0,0,0,0.7)', color: '#fff', border: '1px solid #333' }}>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>Lat: —  Lon: —</Typography>
                </Paper>
            </div>
        );
    }

    return (
        <div className="leaflet-bottom leaflet-left" style={{ marginBottom: '60px', marginLeft: '10px', zIndex: 1000, pointerEvents: 'none' }}>
            <Paper sx={{ px: 1, py: 0.5, bgcolor: 'rgba(0,0,0,0.7)', color: '#fff', border: '1px solid #333' }}>
                <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                    Lat: {pos.lat.toFixed(6)}  Lon: {pos.lng.toFixed(6)}
                </Typography>
            </Paper>
        </div>
    );
};

const ScaleRuler = () => {
    const map = useMap();

    useEffect(() => {
        const control = L.control.scale({ position: 'bottomleft', metric: true, imperial: false });
        control.addTo(map);
        return () => {
            control.remove();
        };
    }, [map]);

    return null;
};

const KmlLayer = ({ url }) => {
    const map = useMap();
    useEffect(() => {
        if (!url) return;
        let layer;
        let disposed = false;

        const run = async () => {
            try {
                // ВАЖНО: `leaflet-omnivore` расширяет Leaflet через глобальный `window.L`.
                // В ESM импорты выполняются до тела модуля, поэтому статический import мог
                // происходить ДО `window.L = L`, и `L.omnivore` оставался undefined → белый экран.
                // Динамический import гарантирует, что плагин загрузится уже после инициализации.
                await import('leaflet-omnivore');

                const omnivore = (window?.L && window.L.omnivore) || L.omnivore;
                if (!omnivore || typeof omnivore.kml !== 'function') {
                    // eslint-disable-next-line no-console
                    console.warn('leaflet-omnivore is not available; skipping KML layer');
                    return;
                }

                if (disposed) return;

                layer = omnivore
                    .kml(url)
                    .on('ready', function () {
                        try {
                            map.fitBounds(layer.getBounds());
                        } catch (e) {
                            // ignore fit bounds errors for invalid geometries
                        }
                    })
                    .addTo(map);
            } catch (e) {
                // eslint-disable-next-line no-console
                console.error('Failed to load KML via leaflet-omnivore:', e);
            }
        };

        run();

        return () => {
            disposed = true;
            if (layer) {
                try {
                    map.removeLayer(layer);
                } catch (e) {
                    // ignore
                }
            }
        };
    }, [url, map]);
    return null;
};

const SwipeControl = ({ onSwipe }) => {
    useEffect(() => {
        const handleMouseMove = (e) => {
            if (e.buttons === 1) { // Left button held
                const x = e.clientX / window.innerWidth;
                onSwipe(x);
            }
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, [onSwipe]);
    return null;
};

const MapDrawTools = ({ activeDrawMode, onDrawPolygon, onDrawPolyline, onDrawMarker, onEditLayers, onDeleteLayers }) => {
    const map = useMap();
    // ВАЖНО: Кнопки ДОЛЖНЫ иметь component="button" (или быть реальными <button>).
    // Если использовать <a> с href="#", то клик приведет к навигации и сбросу стейта SPA.
    return (
        <div className="leaflet-top leaflet-left" style={{ marginTop: '80px', marginLeft: '10px', pointerEvents: 'auto', zIndex: 1000 }}>
            <Paper sx={{ display: 'flex', flexDirection: 'column', borderRadius: 1, overflow: 'hidden', border: '2px solid rgba(0,0,0,0.2)' }}>
                <Tooltip title="Нарисовать полигон (Draw a polygon)" placement="right">
                    <IconButton 
                        component="button"
                        size="small" 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDrawPolygon(); }}
                        sx={{ 
                            borderRadius: 0, 
                            bgcolor: activeDrawMode === 'polygon' ? 'primary.main' : 'background.paper',
                            color: activeDrawMode === 'polygon' ? 'white' : 'text.primary',
                            '&:hover': { bgcolor: activeDrawMode === 'polygon' ? 'primary.dark' : 'action.hover' }
                        }}
                    >
                        <HexagonIcon />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Нарисовать линию (Draw a polyline)" placement="right">
                    <IconButton 
                        component="button"
                        size="small" 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDrawPolyline(); }}
                        sx={{ 
                            borderRadius: 0, 
                            bgcolor: activeDrawMode === 'polyline' ? 'primary.main' : 'background.paper',
                            color: activeDrawMode === 'polyline' ? 'white' : 'text.primary',
                            '&:hover': { bgcolor: activeDrawMode === 'polyline' ? 'primary.dark' : 'action.hover' }
                        }}
                    >
                        <PolylineIcon />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Добавить маркер (Draw a marker)" placement="right">
                    <IconButton 
                        component="button"
                        size="small" 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDrawMarker(); }}
                        sx={{ 
                            borderRadius: 0, 
                            bgcolor: activeDrawMode === 'marker' ? 'primary.main' : 'background.paper',
                            color: activeDrawMode === 'marker' ? 'white' : 'text.primary',
                            '&:hover': { bgcolor: activeDrawMode === 'marker' ? 'primary.dark' : 'action.hover' }
                        }}
                    >
                        <PlaceIcon />
                    </IconButton>
                </Tooltip>
                <Divider />
                <Tooltip title="Редактировать слои (Edit layers)" placement="right">
                    <IconButton 
                        component="button"
                        size="small" 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEditLayers(); }}
                        sx={{ 
                            borderRadius: 0, 
                            bgcolor: activeDrawMode === 'edit' ? 'secondary.main' : 'background.paper',
                            color: activeDrawMode === 'edit' ? 'white' : 'text.primary',
                            '&:hover': { bgcolor: activeDrawMode === 'edit' ? 'secondary.dark' : 'action.hover' }
                        }}
                    >
                        <EditIcon />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Удалить слои (Delete layers)" placement="right">
                    <IconButton 
                        component="button"
                        size="small" 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDeleteLayers(); }}
                        sx={{ 
                            borderRadius: 0, 
                            bgcolor: activeDrawMode === 'delete' ? 'error.main' : 'background.paper',
                            color: activeDrawMode === 'delete' ? 'white' : 'text.primary',
                            borderBottom: '1px solid rgba(0,0,0,0.1)',
                            '&:hover': { bgcolor: activeDrawMode === 'delete' ? 'error.dark' : 'action.hover' }
                        }}
                    >
                        <DeleteIcon />
                    </IconButton>
                </Tooltip>
            </Paper>

            {/* Группа кнопок масштабирования - ОТДЕЛЬНО ПОД ИНСТРУМЕНТАМИ */}
            <Paper 
                elevation={3} 
                sx={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    bgcolor: 'background.paper',
                    mt: 1, // Отступ от основных инструментов
                    borderRadius: 1,
                    overflow: 'hidden',
                    border: '1px solid rgba(0,0,0,0.1)'
                }}
            >
                <Tooltip title="Приблизить (Zoom In)" placement="right">
                    <IconButton 
                        size="small" 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); map.zoomIn(); }}
                        sx={{ borderRadius: 0, bgcolor: 'background.paper', color: 'text.primary', py: 1 }}
                    >
                        <ZoomInIcon />
                    </IconButton>
                </Tooltip>
                <Divider />
                <Tooltip title="Отдалить (Zoom Out)" placement="right">
                    <IconButton 
                        size="small" 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); map.zoomOut(); }}
                        sx={{ borderRadius: 0, bgcolor: 'background.paper', color: 'text.primary', py: 1 }}
                    >
                        <ZoomOutIcon />
                    </IconButton>
                </Tooltip>
            </Paper>
        </div>
    );
};

const FitBounds = ({ files, trigger, isDrawing }) => {
    const map = useMap();
    useEffect(() => {
        if (isDrawing) return;
        if (files && files.length > 0) {
          const validFiles = files.filter(f => Number.isFinite(f.latitude) && Number.isFinite(f.longitude));
          if (validFiles.length > 0) {
            const bounds = L.latLngBounds(validFiles.map(f => [f.latitude, f.longitude]));
            if (bounds.isValid()) {
              map.fitBounds(bounds, { padding: [50, 50] });
            }
          }
        }
    }, [trigger, isDrawing]); 
    return null;
};

const GeomanManager = ({ 
    activeDrawMode, setActiveDrawMode, setIsDrawing, 
    onAreaCreated, onMeasure, onGcpCreated, onWaypointCreated, onAddAnnotation,
    selectedFlightPlan, gcpsCount
}) => {
    const map = useMap();

    // Экспонируем карту глобально для дебага (как обещали в OPERATIONS.md)
    useEffect(() => {
        if (map) {
            window.map = map;
            console.log('🗺 Leaflet map instance assigned to window.map');
            if (!map.pm) {
                console.error('❌ Leaflet Geoman (PM) is NOT initialized on the map instance!');
            } else {
                console.log('✅ Leaflet Geoman (PM) is available');
            }
        }
    }, [map]);

    const calculateDistance = (points) => {
        if (points.length < 2) return 0;
        let dist = 0;
        for (let i = 0; i < points.length - 1; i++) {
            dist += L.latLng(points[i]).distanceTo(L.latLng(points[i+1]));
        }
        return dist.toFixed(2);
    };

    useEffect(() => {
        if (!map || !map.pm) return;

        // Явно отключаем дефолтную панель Geoman, если она вдруг появилась
        map.pm.addControls({
            drawMarker: false,
            drawCircleMarker: false,
            drawPolyline: false,
            drawRectangle: false,
            drawPolygon: false,
            drawCircle: false,
            editMode: false,
            dragMode: false,
            cutPolygon: false,
            removalMode: false,
            rotateMode: false,
        });

        map.pm.setGlobalOptions({ 
            snapDistance: 20,
            allowSelfIntersection: false,
            templineStyle: { color: '#2196f3', weight: 3 },
            hintlineStyle: { color: '#2196f3', weight: 3, dashArray: [5, 5] },
            pathOptions: { color: '#2196f3', fillColor: '#2196f3', fillOpacity: 0.4 }
        });

        const handleCreate = (e) => {
            const { shape, layer } = e;
            console.log('✅ Geoman Object Created:', shape);

            if (shape === 'Polygon') {
                const geojson = layer.toGeoJSON();
                const geometry = geojson.type === 'Feature' ? geojson.geometry : geojson;
                if (onAreaCreated) onAreaCreated(geometry);
            } else if (shape === 'Line') {
                const coords = layer.getLatLngs().map(ll => [ll.lat, ll.lng]);
                if (onMeasure) {
                    const dist = calculateDistance(coords);
                    onMeasure({ type: 'DISTANCE', value: dist, unit: 'м' });
                }
            } else if (shape === 'Marker') {
                const latlng = layer.getLatLng();
                if (selectedFlightPlan && onWaypointCreated) {
                    onWaypointCreated(latlng);
                } else if (onGcpCreated) {
                    onGcpCreated(latlng);
                } else if (onAddAnnotation) {
                    onAddAnnotation(latlng);
                }
            }

            map.pm.disableDraw();
            setActiveDrawMode(null);
            setIsDrawing(false);
            layer.remove();
        };

        const handleEdit = (e) => {
            const { layer } = e;
            const geojson = layer.toGeoJSON();
            const geometry = geojson.type === 'Feature' ? geojson.geometry : geojson;
            if (geometry && geometry.type === 'Polygon' && onAreaCreated) {
                onAreaCreated(geometry);
            }
        };

        const handleRemove = (e) => {
            // Geoman removal mode handles deletion. 
            // If it was the project area, we need to notify.
            // Note: our project area is rendered via GeoJSON component, not as a PM layer usually.
            // But if user edits it, Geoman makes it editable.
        };

        map.on('pm:create', handleCreate);
        map.on('pm:edit', handleEdit);
        map.on('pm:remove', handleRemove);

        return () => {
            map.off('pm:create', handleCreate);
            map.off('pm:edit', handleEdit);
            map.off('pm:remove', handleRemove);
        };
    }, [map, onAreaCreated, onMeasure, onGcpCreated, onWaypointCreated, onAddAnnotation, selectedFlightPlan, setActiveDrawMode, setIsDrawing]);

    // Реактивное управление режимами рисования
    useEffect(() => {
        if (!map || !map.pm) return;

        // Сначала всё выключаем, чтобы режимы не наслаивались
        map.pm.disableDraw();
        if (map.pm.globalEditModeEnabled()) map.pm.disableGlobalEditMode();
        if (map.pm.globalRemovalModeEnabled()) map.pm.disableGlobalRemovalMode();

        if (activeDrawMode === 'polygon') {
            map.pm.enableDraw('Polygon', {
                snappable: true,
                snapDistance: 20,
                finishOn: 'dblclick',
                allowSelfIntersection: false
            });
            console.log('✏️ Geoman: Polygon draw mode enabled');
        } else if (activeDrawMode === 'polyline') {
            map.pm.enableDraw('Line', { snappable: true });
            console.log('✏️ Geoman: Polyline draw mode enabled');
        } else if (activeDrawMode === 'marker') {
            map.pm.enableDraw('Marker');
            console.log('✏️ Geoman: Marker draw mode enabled');
        } else if (activeDrawMode === 'edit') {
            map.pm.enableGlobalEditMode();
            console.log('✏️ Geoman: Global edit mode enabled');
        } else if (activeDrawMode === 'delete') {
            map.pm.enableGlobalRemovalMode();
            console.log('✏️ Geoman: Global removal mode enabled');
        }
    }, [map, activeDrawMode]);

    // Handle ESC key to cancel drawing
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                map.pm.disableDraw();
                map.pm.disableGlobalEditMode();
                map.pm.disableGlobalRemovalMode();
                setActiveDrawMode(null);
                setIsDrawing(false);
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [map, setActiveDrawMode, setIsDrawing]);

    return null;
};

const MapView = ({ 
  project, files, results, gcps = [], surveys = [], flightPlans = [], 
  selectedFlightPlan = null, timeline = [], currentTimeIndex = 0, fitTrigger = 0,
  setFitTrigger,
  onAreaCreated, onGcpCreated, onWaypointCreated, onMeasure, onAddAnnotation,
  comparisonMode = false, 
  mapLayer = 'rgb', setMapLayer,
  secondMapLayer = 'ndvi', setSecondMapLayer,
  selectedOrthoIndex = 0, setSelectedOrthoIndex,
  secondOrthoIndex = 1, setSecondOrthoIndex,
  selectedNdviIndex = 0, setSelectedNdviIndex,
  secondNdviIndex = 1, setSecondNdviIndex,
  swipeActive = false, setSwipeActive,
  swipeDivider = 0.5, setSwipeDivider,
  orthoArtifacts = [], ndviArtifacts = [],
  orthophotoLayers = []
}) => {
  const [mapCenter, setMapCenter] = useState([55.75, 37.61]);
  const [measurePoints, setMeasurePoints] = useState([]);
  const [annotations, setAnnotations] = useState([]);
  const [zoom, setZoom] = useState(12);
  const [isDrawing, setIsDrawing] = useState(false);
  const [activeDrawMode, setActiveDrawMode] = useState(null);

  const onDrawPolygon = useCallback(() => {
      setActiveDrawMode(prev => prev === 'polygon' ? null : 'polygon');
      setIsDrawing(prev => !prev || activeDrawMode !== 'polygon');
  }, [activeDrawMode]);

  const onDrawPolyline = useCallback(() => {
      setActiveDrawMode(prev => prev === 'polyline' ? null : 'polyline');
      setIsDrawing(prev => !prev || activeDrawMode !== 'polyline');
  }, [activeDrawMode]);

  const onDrawMarker = useCallback(() => {
      setActiveDrawMode(prev => prev === 'marker' ? null : 'marker');
      setIsDrawing(prev => !prev || activeDrawMode !== 'marker');
  }, [activeDrawMode]);

  const onEditLayers = useCallback(() => {
      setActiveDrawMode(prev => prev === 'edit' ? null : 'edit');
      setIsDrawing(prev => !prev || activeDrawMode !== 'edit');
  }, [activeDrawMode]);

  const onDeleteLayers = useCallback(() => {
      setActiveDrawMode(prev => prev === 'delete' ? null : 'delete');
      setIsDrawing(prev => !prev || activeDrawMode !== 'delete');
  }, [activeDrawMode]);

  const kmlArtifacts = useMemo(() => results?.filter(r => r.type === 'kml') || [], [results]);

  const currentOrtho = orthoArtifacts[selectedOrthoIndex];
  const secondOrtho = orthoArtifacts[secondOrthoIndex];
  const currentNdvi = ndviArtifacts[selectedNdviIndex];
  const secondNdvi = ndviArtifacts[secondNdviIndex];

  const isOrthoReady = currentOrtho?.ready;
  const isSecondOrthoReady = secondOrtho?.ready;
  const isNDVIReady = currentNdvi?.ready;
  const isSecondNDVIReady = secondNdvi?.ready;

  const areaSize = useMemo(() => calculateArea(project?.area), [project?.area]);
  const bounds = getBoundsFromArea(project?.area);

  const calculateDistance = (points) => {
    if (!points || points.length < 2) return 0;
    let dist = 0;
    for (let i = 0; i < points.length - 1; i++) {
        dist += L.latLng(points[i]).distanceTo(L.latLng(points[i+1]));
    }
    return dist.toFixed(2);
  };

  const surveyPoints = useMemo(() => {
    return (surveys || []).flatMap(s => (s.points || []).map(p => {
        let lat = 0, lng = 0;
        try {
            if (p.location && p.location.includes('POINT')) {
                const coords = p.location.match(/POINT\s*\(([^ ]+)\s+([^ ]+)\)/);
                if (coords) {
                    lng = parseFloat(coords[1]);
                    lat = parseFloat(coords[2]);
                }
            }
        } catch (e) {
            console.error("Error parsing survey point location:", e);
        }
        return {
            ...p,
            surveyName: s.name,
            lat,
            lng
        };
    }));
  }, [surveys]);

  const filesWithCoords = useMemo(() => files?.filter(f => f.latitude && f.longitude) || [], [files]);

  const heatmapData = useMemo(() => {
    if (!files || files.length === 0) return [];
    return files
      .filter(f => Number.isFinite(f.latitude) && Number.isFinite(f.longitude))
      .map(f => [f.latitude, f.longitude, Math.min((f.altitude || 50) / 150, 1.0)]);
  }, [files]);

  const timelineArtifact = useMemo(() => {
        if (timeline.length > 0 && timeline[currentTimeIndex]) {
            return timeline[currentTimeIndex].artifact_details;
        }
        return null;
    }, [timeline, currentTimeIndex]);

  const prevTimelineArtifact = useMemo(() => {
        if (comparisonMode && timeline.length > 1 && currentTimeIndex > 0) {
            return timeline[currentTimeIndex - 1].artifact_details;
        }
        return null;
    }, [timeline, currentTimeIndex, comparisonMode]);

  useEffect(() => {
    // ВАЖНО: используем локальные копии или дожидаемся инициализации всех переменных
    // чтобы избежать ReferenceError 'gt' в минифицированных сборках.
    const orthoUrl = currentOrtho?.url;
    const currentBounds = bounds;
    const orthoReady = isOrthoReady;

    console.log(`📍 MapView Data Check:
      - Files total: ${files?.length || 0}
      - Files with coords: ${filesWithCoords.length}
      - Results total: ${results?.length || 0}
      - Ortho artifacts: ${orthoArtifacts.length}
      - isOrthoReady: ${orthoReady}
      - currentOrtho URL: ${orthoUrl}
      - Bounds: ${JSON.stringify(currentBounds)}
      - Project area valid: ${isValidGeoJSON(project?.area)}
    `);
  }, [files?.length, filesWithCoords.length, results?.length, project?.area, isOrthoReady, currentOrtho?.url, bounds]);

  // Автоматическое центрирование при получении файлов
  useEffect(() => {
      if (isDrawing) return;
      if (files && files.length > 0) {
          console.log(`📸 Files updated: ${files.length} items`);
          setFitTrigger(prev => prev + 1);
      }
  }, [project?.id, files?.length, isDrawing]);

  useEffect(() => {
      if (isDrawing) return;
      if (isValidGeoJSON(project?.area)) {
          let coord;
          if (project.area.type === 'Polygon') coord = project.area.coordinates[0][0];
          else if (project.area.type === 'Feature') coord = project.area.geometry.coordinates[0][0];
          
          if (coord && Number.isFinite(coord[1]) && Number.isFinite(coord[0])) {
              setMapCenter([coord[1], coord[0]]);
          }
      }
  }, [project?.id, isDrawing]);

  // Error Boundary component for Leaflet components
  const SafeGeoJSON = (props) => {
    const [hasError, setHasError] = useState(false);
    
    useEffect(() => {
        setHasError(false);
    }, [JSON.stringify(props.data)]);

    if (hasError || !isValidGeoJSON(props.data)) return null;

    try {
        return (
            <GeoJSON 
                {...props} 
            />
        );
    } catch (e) {
        return null;
    }
  };

  const _onCreate = (e) => {
    setIsDrawing(false);
    const { layerType, layer } = e;
    if (layerType === 'polygon') {
      const geojson = layer.toGeoJSON();
      // Ensure we have a valid geometry for calculation and update
      const geometry = geojson.type === 'Feature' ? geojson.geometry : geojson;
      
      if (onMeasure && !onAreaCreated) { // Only measure if not specifically creating area
          const area = calculateArea(geometry);
          onMeasure({ type: 'AREA', value: area.toFixed(2), unit: 'м²' });
      }
      if (onAreaCreated) onAreaCreated(geometry);
      layer.remove(); 
    } else if (layerType === 'polyline' || layerType === 'line') {
        const coords = layer.getLatLngs().map(ll => [ll.lat, ll.lng]);
        setMeasurePoints(coords);
        if (onMeasure) {
            const dist = calculateDistance(coords);
            onMeasure({ type: 'DISTANCE', value: dist, unit: 'м' });
        }
        // layer.remove(); // Optional: remove if you don't want it on map
    } else if (layerType === 'marker') {
        if (selectedFlightPlan && onWaypointCreated) {
            onWaypointCreated(layer.getLatLng());
        } else if (onGcpCreated) {
            onGcpCreated(layer.getLatLng());
        } else if (onAddAnnotation) {
            onAddAnnotation(layer.getLatLng());
        } else {
            handleAddAnnotation(layer.getLatLng());
        }
        layer.remove();
    }
  };

  const downloadAreaGeoJSON = () => {
    if (!project?.area) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(project.area));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", `project_${project.id}_area.geojson`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const onAddMarkerAnnotation = (latlng) => {
    const text = prompt("Текст заметки:");
    if (text) {
        onAddAnnotation(text, [latlng.lat, latlng.lng]);
    }
  };

  const handleAddAnnotation = (latlng) => {
    onAddMarkerAnnotation(latlng);
  };

    return (
    <Box sx={{ height: '100%', width: '100%', display: 'flex', position: 'relative' }}>
        <style>
            {`
                .leaflet-container.leaflet-pm-draw-mode {
                    cursor: crosshair !important;
                }
                /* Гарантируем видимость временных линий Geoman */
                .leaflet-pane.leaflet-overlay-pane svg {
                    z-index: 400;
                }
                .photo-marker {
                    transition: transform 0.2s;
                }
                .photo-marker:hover {
                    transform: scale(1.5);
                    z-index: 1000 !important;
                }
            `}
        </style>
        {/* Floating Controls (Center, RGB/NDVI) have been moved to ProjectPage for unified toolbar layout */}
        {isDrawing && (
            <Paper sx={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, p: 1, bgcolor: 'error.main', color: 'white', border: '2px solid white' }}>
                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                    РЕЖИМ {activeDrawMode?.toUpperCase()} ВКЛЮЧЕН. Двойной клик - завершить. ESC - отмена.
                </Typography>
            </Paper>
        )}
        {timelineArtifact && (
            <Paper sx={{ position: 'absolute', top: 70, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, p: 1, bgcolor: 'rgba(33, 150, 243, 0.8)', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                    4D СРЕЗ: {new Date(timelineArtifact.created_at).toLocaleDateString()} ({timelineArtifact.artifact_type_display})
                </Typography>
                {prevTimelineArtifact && (
                    <Typography variant="caption" sx={{ fontSize: '9px', opacity: 0.8 }}>
                        В сравнении с: {new Date(prevTimelineArtifact.created_at).toLocaleDateString()} (Слева)
                    </Typography>
                )}
            </Paper>
        )}
        {/* Floating Controls (Center, RGB/NDVI) have been moved to ProjectPage for unified toolbar layout */}
        {comparisonMode && (
            <Paper sx={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, p: 2, bgcolor: 'rgba(0,0,0,0.8)', minWidth: 400 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="caption" sx={{ color: 'white', fontWeight: 'bold' }}>РЕЖИМ СРАВНЕНИЯ (4D / СЛОИ):</Typography>
                    <Button size="small" variant={swipeActive ? "contained" : "outlined"} onClick={() => setSwipeActive(!swipeActive)}>
                        {swipeActive ? "ВЫКЛ. SWIPE" : "ВКЛ. SWIPE"}
                    </Button>
                </Box>
                
                <Grid container spacing={2}>
                    <Grid item xs={6}>
                        <Typography variant="caption" sx={{ color: 'grey.500', display: 'block', mb: 0.5 }}>СЛОЙ 1 (СЛЕВА):</Typography>
                        <ToggleButtonGroup
                            size="small"
                            value={mapLayer}
                            exclusive
                            onChange={(e, v) => v && setMapLayer(v)}
                            fullWidth
                            sx={{ mb: 1 }}
                        >
                            <ToggleButton value="rgb" sx={{ py: 0, fontSize: '10px' }}>RGB</ToggleButton>
                            <ToggleButton value="ndvi" sx={{ py: 0, fontSize: '10px' }}>NDVI</ToggleButton>
                        </ToggleButtonGroup>

                        {mapLayer === 'rgb' && orthoArtifacts.length > 1 && (
                            <FormControl fullWidth size="small" sx={{ bgcolor: '#333' }}>
                                <Select
                                    value={selectedOrthoIndex}
                                    onChange={(e) => setSelectedOrthoIndex(e.target.value)}
                                    sx={{ color: 'white', fontSize: '10px', height: '25px' }}
                                >
                                    {orthoArtifacts.map((art, idx) => (
                                        <MenuItem key={art.id} value={idx} sx={{ fontSize: '10px' }}>
                                            V{art.version || idx+1} ({new Date(art.created_at).toLocaleDateString()})
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        )}
                        {mapLayer === 'ndvi' && ndviArtifacts.length > 1 && (
                            <FormControl fullWidth size="small" sx={{ bgcolor: '#333' }}>
                                <Select
                                    value={selectedNdviIndex}
                                    onChange={(e) => setSelectedNdviIndex(e.target.value)}
                                    sx={{ color: 'white', fontSize: '10px', height: '25px' }}
                                >
                                    {ndviArtifacts.map((art, idx) => (
                                        <MenuItem key={art.id} value={idx} sx={{ fontSize: '10px' }}>
                                            V{art.version || idx+1} ({new Date(art.created_at).toLocaleDateString()})
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        )}
                    </Grid>
                    <Grid item xs={6}>
                        <Typography variant="caption" sx={{ color: 'grey.500', display: 'block', mb: 0.5 }}>СЛОЙ 2 (СПРАВА):</Typography>
                        <ToggleButtonGroup
                            size="small"
                            value={secondMapLayer}
                            exclusive
                            onChange={(e, v) => v && setSecondMapLayer(v)}
                            fullWidth
                            sx={{ mb: 1 }}
                        >
                            <ToggleButton value="rgb" sx={{ py: 0, fontSize: '10px' }}>RGB</ToggleButton>
                            <ToggleButton value="ndvi" sx={{ py: 0, fontSize: '10px' }}>NDVI</ToggleButton>
                        </ToggleButtonGroup>

                        {secondMapLayer === 'rgb' && orthoArtifacts.length > 1 && (
                            <FormControl fullWidth size="small" sx={{ bgcolor: '#333' }}>
                                <Select
                                    value={secondOrthoIndex}
                                    onChange={(e) => setSecondOrthoIndex(e.target.value)}
                                    sx={{ color: 'white', fontSize: '10px', height: '25px' }}
                                >
                                    {orthoArtifacts.map((art, idx) => (
                                        <MenuItem key={art.id} value={idx} sx={{ fontSize: '10px' }}>
                                            V{art.version || idx+1} ({new Date(art.created_at).toLocaleDateString()})
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        )}
                        {secondMapLayer === 'ndvi' && ndviArtifacts.length > 1 && (
                            <FormControl fullWidth size="small" sx={{ bgcolor: '#333' }}>
                                <Select
                                    value={secondNdviIndex}
                                    onChange={(e) => setSecondNdviIndex(e.target.value)}
                                    sx={{ color: 'white', fontSize: '10px', height: '25px' }}
                                >
                                    {ndviArtifacts.map((art, idx) => (
                                        <MenuItem key={art.id} value={idx} sx={{ fontSize: '10px' }}>
                                            V{art.version || idx+1} ({new Date(art.created_at).toLocaleDateString()})
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        )}
                    </Grid>
                </Grid>

                {!swipeActive ? (
                    <Box sx={{ mt: 2 }}>
                        <Typography variant="caption" sx={{ color: 'white', display: 'block', mb: 1 }}>ПРОЗРАЧНОСТЬ ВТОРОГО СЛОЯ:</Typography>
                        <input 
                            type="range" min="0" max="1" step="0.1" 
                            value={overlayOpacity} 
                            onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
                            style={{ width: '100%' }}
                        />
                    </Box>
                ) : (
                    <Typography variant="caption" sx={{ color: 'primary.main', display: 'block', textAlign: 'center', mt: 2, fontWeight: 'bold' }}>
                        ← Перемещайте разделитель мышкой →
                    </Typography>
                )}
            </Paper>
        )}
        {swipeActive && <SwipeControl onSwipe={setSwipeDivider} />}
        
        {mapLayer === 'ndvi' && isNDVIReady && (
            <Paper sx={{ position: 'absolute', bottom: 100, right: 20, zIndex: 1000, p: 1, bgcolor: 'rgba(0,0,0,0.7)', color: 'white' }}>
                <Typography variant="caption" sx={{ display: 'block', mb: 0.5, fontWeight: 'bold' }}>NDVI Легенда</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 12, height: 12, bgcolor: '#2e7d32' }} />
                        <Typography variant="caption">{'> 0.6 (Здоровая растительность)'}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 12, height: 12, bgcolor: '#fbc02d' }} />
                        <Typography variant="caption">0.3 - 0.6 (Средний стресс)</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 12, height: 12, bgcolor: '#d32f2f' }} />
                        <Typography variant="caption">{'< 0.3 (Почва / Мертвая раст.)'}</Typography>
                    </Box>
                </Box>
            </Paper>
        )}

      <MapContainer center={mapCenter} zoom={zoom} style={{ height: '100%', width: '100%', background: '#000' }} attributionControl={false} zoomControl={false}>
        <SyncMap center={mapCenter} zoom={zoom} onMove={(c, z) => { setMapCenter([c.lat, c.lng]); setZoom(z); }} />
        <FitBounds files={files} trigger={fitTrigger} isDrawing={isDrawing} />
        <GeomanManager 
            activeDrawMode={activeDrawMode} 
            setActiveDrawMode={setActiveDrawMode} 
            setIsDrawing={setIsDrawing}
            onAreaCreated={onAreaCreated}
            onMeasure={onMeasure}
            onGcpCreated={onGcpCreated}
            onWaypointCreated={onWaypointCreated}
            onAddAnnotation={onAddAnnotation}
            selectedFlightPlan={selectedFlightPlan}
        />
        <CursorDisplay />
        <ScaleRuler />
        
        <LayersControl position="topright">
            <LayersControl.BaseLayer name="Тёмная карта">
                <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer checked name="OpenStreetMap">
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Спутник (Esri)">
                <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Рельеф (OTM)">
                <TileLayer url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png" />
            </LayersControl.BaseLayer>

            <LayersControl.Overlay checked name="Область проекта">
                <FeatureGroup>
                    {isValidGeoJSON(project?.area) && (
                        <SafeGeoJSON 
                            key={JSON.stringify(project.area) + isOrthoReady + isNDVIReady + mapLayer + secondMapLayer} 
                            data={project.area} 
                            style={{ 
                                color: (isOrthoReady ? '#4caf50' : '#2196f3'), 
                                weight: 2, 
                                fillOpacity: (isOrthoReady) ? 0.1 : 0.2,
                                fillColor: (isOrthoReady ? '#2e7d32' : '#2196f3')
                            }} 
                        >
                            <Popup>
                                <Box sx={{ p: 1 }}>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>Область интереса (AOI)</Typography>
                                    <Typography variant="body2">Проект: {project.name}</Typography>
                                    {areaSize > 0 && (
                                        <Typography variant="body2">
                                            Площадь: {areaSize > 10000 ? (areaSize/10000).toFixed(2) + ' га' : areaSize.toFixed(0) + ' м²'}
                                        </Typography>
                                    )}
                                    <Divider sx={{ my: 1 }} />
                                    {project.area.coordinates?.[0]?.[0] && (
                                        <Typography variant="caption" color="text.secondary">
                                            Координаты: {project.area.coordinates[0][0][1].toFixed(5)}, {project.area.coordinates[0][0][0].toFixed(5)}
                                        </Typography>
                                    )}
                                </Box>
                            </Popup>
                        </SafeGeoJSON>
                    )}
                    {timelineArtifact && timelineArtifact.file && isValidBounds(bounds) && (
                        <ImageOverlay
                            url={timelineArtifact.file}
                            bounds={bounds}
                            opacity={1.0}
                            zIndex={12}
                        />
                    )}
                    {prevTimelineArtifact && prevTimelineArtifact.file && isValidBounds(bounds) && (
                         <ImageOverlay
                            url={prevTimelineArtifact.file}
                            bounds={bounds}
                            opacity={1.0}
                            zIndex={13}
                            clip={`rect(0, ${swipeDivider * 100}vw, 100vh, 0)`}
                        />
                    )}
                    
                    {/* Primary Layer (Left or Background) */}
                    {mapLayer === 'rgb' && isOrthoReady && currentOrtho.url && isValidBounds(bounds || getBoundsFromArea(currentOrtho.metadata?.bounds)) && (
                        <ImageOverlay
                            key={`ortho-rgb-base-${currentOrtho.id}`}
                            url={currentOrtho.url}
                            bounds={bounds || getBoundsFromArea(currentOrtho.metadata?.bounds)}
                            opacity={1.0}
                            zIndex={10}
                            eventHandlers={{
                                error: (e) => console.error("ImageOverlay (RGB) error:", e, "URL:", currentOrtho.url),
                                load: () => console.log("ImageOverlay (RGB) loaded:", currentOrtho.url)
                            }}
                        />
                    )}
                    {mapLayer === 'ndvi' && isNDVIReady && currentNdvi.url && isValidBounds(bounds || getBoundsFromArea(currentNdvi.metadata?.bounds)) && (
                        <ImageOverlay
                            key={`ortho-ndvi-base-${currentNdvi.id}`}
                            url={currentNdvi.url}
                            bounds={bounds || getBoundsFromArea(currentNdvi.metadata?.bounds)}
                            opacity={1.0}
                            zIndex={10}
                            eventHandlers={{
                                error: (e) => console.error("ImageOverlay (NDVI) error:", e),
                                load: () => console.log("ImageOverlay (NDVI) loaded:", currentNdvi.url)
                            }}
                        />
                    )}

                    {/* Secondary Layer (Right or Overlay) */}
                    {comparisonMode && (
                        <>
                            {secondMapLayer === 'rgb' && isSecondOrthoReady && secondOrtho.url && isValidBounds(bounds || getBoundsFromArea(secondOrtho.metadata?.bounds)) && (
                                <ImageOverlay
                                    url={secondOrtho.url}
                                    bounds={bounds || getBoundsFromArea(secondOrtho.metadata?.bounds)}
                                    opacity={swipeActive ? 1.0 : overlayOpacity}
                                    zIndex={11}
                                    clip={swipeActive ? `rect(0, ${swipeDivider * 100}vw, 100vh, 0)` : undefined}
                                />
                            )}
                            {secondMapLayer === 'ndvi' && isSecondNDVIReady && secondNdvi.url && isValidBounds(bounds || getBoundsFromArea(secondNdvi.metadata?.bounds)) && (
                                <ImageOverlay
                                    url={secondNdvi.url}
                                    bounds={bounds || getBoundsFromArea(secondNdvi.metadata?.bounds)}
                                    opacity={swipeActive ? 1.0 : overlayOpacity}
                                    zIndex={11}
                                    clip={swipeActive ? `rect(0, ${swipeDivider * 100}vw, 100vh, 0)` : undefined}
                                />
                            )}
                        </>
                    )}

                    {comparisonMode && !swipeActive && isSecondOrthoReady && secondOrtho.url && isValidBounds(bounds || getBoundsFromArea(secondOrtho.metadata?.bounds)) && (
                        <ImageOverlay
                            url={secondOrtho.url}
                            bounds={bounds || getBoundsFromArea(secondOrtho.metadata?.bounds)}
                            opacity={overlayOpacity}
                            zIndex={11}
                        />
                    )}
                </FeatureGroup>
            </LayersControl.Overlay>

            {orthophotoLayers.map(ortho => ortho.tiles_url && isValidBounds(getBoundsFromArea(ortho.bounds)) && (
                <LayersControl.Overlay key={`layer-xyz-${ortho.id}`} name={`Тайлы (XYZ): ${ortho.name}`}>
                    <TileLayer 
                        url={ortho.tiles_url} 
                        bounds={getBoundsFromArea(ortho.bounds)}
                        opacity={0.8}
                        maxZoom={20}
                        zIndex={10}
                    />
                </LayersControl.Overlay>
            ))}

            {orthoArtifacts.map((ortho, idx) => ortho.url && isValidBounds(bounds || getBoundsFromArea(ortho.metadata?.bounds)) && (
                <LayersControl.Overlay 
                    key={`layer-ortho-${ortho.id}`} 
                    checked={idx === selectedOrthoIndex}
                    name={`Ортофото (PNG/TIF): ${ortho.name}`}
                >
                    <ImageOverlay
                        url={ortho.url}
                        bounds={bounds || getBoundsFromArea(ortho.metadata?.bounds)}
                        opacity={idx === selectedOrthoIndex ? 1.0 : 0.5}
                        zIndex={idx === selectedOrthoIndex ? 12 : 11}
                    />
                </LayersControl.Overlay>
            ))}

            <LayersControl.Overlay checked name="Снимки">
                <FeatureGroup>
                    <MarkerClusterGroup
                        chunkedLoading
                        maxClusterRadius={50}
                        showCoverageOnHover={false}
                    >
                        {files && files.map(file => (
                            file.latitude && file.longitude && (
                            <Marker 
                                key={file.id}
                                position={[file.latitude, file.longitude]}
                                icon={L.divIcon({
                                    className: 'photo-marker',
                                    html: `<div style="background-color: #4caf50; width: 8px; height: 8px; border-radius: 50%; border: 2px solid white;"></div>`,
                                    iconSize: [8, 8],
                                    iconAnchor: [4, 4]
                                })}
                            >
                                <Popup>
                                    <Typography variant="caption" sx={{ fontWeight: 'bold' }}>{file.name}</Typography>
                                    {Number.isFinite(file.altitude) && <Typography variant="caption" display="block">Высота: {file.altitude.toFixed(1)}м</Typography>}
                                    <Typography variant="caption" display="block">Lat: {Number.isFinite(file.latitude) ? file.latitude.toFixed(6) : '—'}</Typography>
                                    <Typography variant="caption" display="block">Lon: {Number.isFinite(file.longitude) ? file.longitude.toFixed(6) : '—'}</Typography>
                                </Popup>
                            </Marker>
                            )
                        ))}
                    </MarkerClusterGroup>
                </FeatureGroup>
            </LayersControl.Overlay>
            <LayersControl.Overlay name="Тепловая карта плотности">
                <FeatureGroup>
                    {heatmapData.map((point, idx) => (
                        <CircleMarker 
                            key={`heat-${idx}`}
                            center={[point[0], point[1]]}
                            radius={20 * point[2]}
                            pathOptions={{ 
                                stroke: false, 
                                fillColor: point[2] > 0.7 ? 'red' : (point[2] > 0.4 ? 'yellow' : 'blue'), 
                                fillOpacity: 0.4 
                            }}
                        />
                    ))}
                </FeatureGroup>
            </LayersControl.Overlay>
            {kmlArtifacts.map(kml => (
                <LayersControl.Overlay key={kml.id} name={`KML: ${kml.filename || kml.id}`}>
                    <FeatureGroup>
                        <KmlLayer url={kml.url} />
                    </FeatureGroup>
                </LayersControl.Overlay>
            ))}
            
            <LayersControl.Overlay name="Векторы ошибок GCP">
                <FeatureGroup>
                    {gcps.filter(g => 
                        Number.isFinite(g.latitude) && Number.isFinite(g.longitude) && 
                        Number.isFinite(g.measured_lat) && Number.isFinite(g.measured_lon)
                    ).map(gcp => (
                        <Polyline 
                            key={`error-${gcp.id}`}
                            positions={[
                                [gcp.latitude, gcp.longitude],
                                [gcp.measured_lat, gcp.measured_lon]
                            ]}
                            color="red"
                            weight={3}
                            dashArray="5, 10"
                        >
                            <Popup>
                                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'red' }}>ВЕКТОР ОШИБКИ: {gcp.name}</Typography>
                                <Typography variant="body2" display="block">
                                    Смещение: {(L.latLng(gcp.latitude, gcp.longitude).distanceTo(L.latLng(gcp.measured_lat, gcp.measured_lon)) * 100).toFixed(1)} см
                                </Typography>
                            </Popup>
                        </Polyline>
                    ))}
                </FeatureGroup>
            </LayersControl.Overlay>

            {results?.filter(r => r.type === 'contour').map(cont => (
                <LayersControl.Overlay key={cont.id} name={`Изолинии: ${cont.filename || cont.id}`}>
                    <FeatureGroup>
                        {cont.url && <KmlLayer url={cont.url} />}
                    </FeatureGroup>
                </LayersControl.Overlay>
            ))}
            <LayersControl.Overlay checked name="Опорные точки (GCP)">
                <FeatureGroup>
                    {gcps.filter(gcp => Number.isFinite(gcp.latitude) && Number.isFinite(gcp.longitude)).map(gcp => (
                        <Marker 
                            key={gcp.id} 
                            position={[gcp.latitude, gcp.longitude]}
                            icon={L.divIcon({
                                className: 'custom-div-icon',
                                html: `<div style="background-color: ${gcp.point_type === 'CONTROL' ? '#2196f3' : '#f44336'}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>`,
                                iconSize: [12, 12],
                                iconAnchor: [6, 6]
                            })}
                        >
                            <Popup>
                                <Typography variant="subtitle2">{gcp.name}</Typography>
                                <Typography variant="caption">{gcp.point_type_display}</Typography>
                            </Popup>
                        </Marker>
                    ))}
                </FeatureGroup>
            </LayersControl.Overlay>
            <LayersControl.Overlay checked name="Планы полетов">
                <FeatureGroup>
                    {flightPlans.map(plan => {
                        const validWaypoints = (plan.waypoints || []).filter(w => Number.isFinite(w.latitude) && Number.isFinite(w.longitude));
                        return (
                            <React.Fragment key={`plan-${plan.id}`}>
                                <Polyline 
                                    positions={validWaypoints.length > 1 ? validWaypoints.map(w => [w.latitude, w.longitude]) : []}
                                    color={selectedFlightPlan?.id === plan.id ? "#00e676" : "#666"}
                                    dashArray={selectedFlightPlan?.id === plan.id ? "" : "5, 10"}
                                    weight={3}
                                />
                                {validWaypoints.map(w => (
                                    <CircleMarker 
                                        key={`wp-${w.id}`}
                                        center={[w.latitude, w.longitude]}
                                        radius={selectedFlightPlan?.id === plan.id ? 6 : 4}
                                        pathOptions={{ 
                                            color: selectedFlightPlan?.id === plan.id ? "#00e676" : "#666",
                                            fillColor: "#fff",
                                            fillOpacity: 1
                                        }}
                                    >
                                        <Popup>
                                            <Typography variant="caption">{plan.name} - WP {w.order}</Typography>
                                        </Popup>
                                    </CircleMarker>
                                ))}
                            </React.Fragment>
                        );
                    })}
                </FeatureGroup>
            </LayersControl.Overlay>
            <LayersControl.Overlay checked name="Полевые точки">
                <FeatureGroup>
                    {surveyPoints.map(p => (
                        <Marker 
                            key={p.id} 
                            position={[p.lat, p.lng]}
                            icon={L.icon({
                                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
                                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                                iconSize: [25, 41],
                                iconAnchor: [12, 41],
                                popupAnchor: [1, -34],
                                shadowSize: [41, 41]
                            })}
                        >
                            <Popup>
                                <Box sx={{ width: 150 }}>
                                    <Typography variant="subtitle2">{p.surveyName}</Typography>
                                    <img src={p.photo} alt="Survey" style={{ width: '100%', borderRadius: 4, marginTop: 4 }} />
                                    <Typography variant="caption" display="block">{p.comment}</Typography>
                                </Box>
                            </Popup>
                        </Marker>
                    ))}
                </FeatureGroup>
            </LayersControl.Overlay>
        </LayersControl>

        <MapDrawTools 
            activeDrawMode={activeDrawMode}
            onDrawPolygon={onDrawPolygon}
            onDrawPolyline={onDrawPolyline}
            onDrawMarker={onDrawMarker}
            onEditLayers={onEditLayers}
            onDeleteLayers={onDeleteLayers}
        />

        {annotations.filter(ann => 
            Array.isArray(ann.position) && ann.position.length >= 2 && 
            Number.isFinite(ann.position[0]) && Number.isFinite(ann.position[1])
        ).map(ann => (
            <Marker key={ann.id} position={ann.position}>
                <Popup>
                    <Box sx={{ minWidth: 150 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>{ann.author_username}:</Typography>
                        <Typography variant="body2">{ann.text}</Typography>
                        <Divider sx={{ my: 1 }} />
                        <Button 
                            size="small" 
                            color="error" 
                            startIcon={<DeleteIcon fontSize="small" />} 
                            onClick={() => handleDeleteAnnotation(ann.id)}
                        >
                            Удалить
                        </Button>
                    </Box>
                </Popup>
            </Marker>
        ))}
      </MapContainer>

      {/* В режиме сравнения 2D мы используем наложение слоев с прозрачностью, а не две карты рядом */}

      {project?.area && (
          <Box sx={{ position: 'absolute', bottom: 20, right: 20, zIndex: 1000 }}>
             <Button 
                variant="contained" 
                size="small" 
                startIcon={<DownloadIcon />} 
                onClick={downloadAreaGeoJSON}
                sx={{ bgcolor: 'rgba(0,0,0,0.7)', color: '#fff', '&:hover': { bgcolor: 'rgba(0,0,0,0.9)' } }}
             >
                Экспорт области (.geojson)
             </Button>
          </Box>
      )}

      {measurePoints.length > 0 && (
          <Box sx={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 1000 }}>
             <Paper sx={{ p: 1, bgcolor: 'rgba(0,0,0,0.7)', color: '#fff' }}>
                Дистанция: {calculateDistance(measurePoints)} м
             </Paper>
          </Box>
      )}
    </Box>
  );
};

export default memo(MapView);

const ChangeView = ({ center, zoom }) => {
  const map = useMap();
  map.setView(center, zoom);
  return null;
};
