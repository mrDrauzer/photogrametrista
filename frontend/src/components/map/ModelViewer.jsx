import { 
  fetchProjects, fetchTasks, createProject, fetchProjectTasks, 
  runProjectProcessing, importProjectPhotos, updateProjectArea,
  fetchProjectFiles, fetchProjectArtifacts, deleteProject, uploadProjectFile, generateProjectReport, exportProjectData, runMultispectralAnalysis,
  cancelTask, updateProject, downloadArtifact, fetchSnapshots, createSnapshot, deleteSnapshot, bulkDeleteFiles,
  fetchAnnotations, createAnnotation, deleteAnnotation
} from '../../api/client';

import React, { Suspense, useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { Canvas, useThree, useLoader } from '@react-three/fiber';
import { OrbitControls, Stars, Center, Stage, Grid, ContactShadows, Float, GizmoHelper, GizmoViewport, Html, Line, useFBX, useGLTF } from '@react-three/drei';
import { Box, Typography, ButtonGroup, Button as MuiButton, Paper } from '@mui/material';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';

const MeasuringTool = ({ active, mode = 'distance', onMeasure }) => {
    const [points, setPoints] = useState([]);
    const { raycaster, scene } = useThree();

    const handlePointerDown = (e) => {
        if (!active) return;
        e.stopPropagation();
        
        const intersects = raycaster.intersectObjects(scene.children, true);
        if (intersects.length > 0) {
            const newPoint = intersects[0].point;
            const newPoints = [...points, newPoint];
            
            if (mode === 'distance') {
                setPoints(newPoints);
                if (newPoints.length === 2) {
                    const distance = newPoints[0].distanceTo(newPoints[1]);
                    onMeasure({ value: distance.toFixed(2), unit: 'м' });
                    // Don't auto-reset immediately, let the user see the line
                }
            } else if (mode === 'area' || mode === 'volume') {
                setPoints(newPoints);
                if (newPoints.length >= 3) {
                    let area = 0;
                    for (let i = 0; i < newPoints.length; i++) {
                        const j = (i + 1) % newPoints.length;
                        area += newPoints[i].x * newPoints[j].z;
                        area -= newPoints[j].x * newPoints[i].z;
                    }
                    area = Math.abs(area) / 2;
                    
                    if (mode === 'area') {
                        onMeasure({ value: area.toFixed(2), unit: 'м²' });
                    } else {
                        // Volume calculation
                        let minHeight = Math.min(...newPoints.map(p => p.y));
                        let avgHeight = newPoints.reduce((acc, p) => acc + (p.y - minHeight), 0) / newPoints.length;
                        let volume = area * (avgHeight + 1.2); // Improved simulation constant
                        onMeasure({ value: volume.toFixed(2), unit: 'м³' });
                    }
                }
            }
        }
    };

    const reset = () => setPoints([]);

    return (
        <group onPointerDown={handlePointerDown}>
            {points.map((p, i) => (
                <mesh position={p} key={i}>
                    <sphereGeometry args={[0.05, 16, 16]} />
                    <meshBasicMaterial color={mode === 'area' ? "#ffeb3b" : "red"} />
                    <Html distanceFactor={10}>
                        <Box sx={{ bgcolor: mode === 'area' ? 'rgba(255,235,59,0.8)' : 'rgba(255,0,0,0.8)', color: mode === 'area' ? 'black' : 'white', px: 0.5, borderRadius: 1, fontSize: '10px' }}>
                            {i+1}
                        </Box>
                    </Html>
                </mesh>
            ))}
            {points.length >= 2 && mode === 'distance' && (
                <>
                    <Line points={[points[0], points[1]]} color="red" lineWidth={3} />
                    <Html position={new THREE.Vector3().addVectors(points[0], points[1]).multiplyScalar(0.5)} distanceFactor={10}>
                        <Box sx={{ bgcolor: 'rgba(0,0,0,0.8)', color: 'white', px: 1, py: 0.5, borderRadius: 1, border: '1px solid red', whiteSpace: 'nowrap' }}>
                            <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                                L: {points[0].distanceTo(points[1]).toFixed(2)} м
                            </Typography>
                        </Box>
                    </Html>
                </>
            )}
            {points.length >= 2 && (mode === 'area' || mode === 'volume') && (
                <>
                    <Line points={[...points, points[0]]} color={mode === 'volume' ? "#00e676" : "#ffeb3b"} lineWidth={2} />
                    {points.length >= 3 && (
                        <mesh>
                            <shapeGeometry args={[new THREE.Shape(points.map(p => new THREE.Vector2(p.x, p.z)))]} />
                            <meshBasicMaterial color={mode === 'volume' ? "#00e676" : "#ffeb3b"} transparent opacity={0.3} side={THREE.DoubleSide} />
                            <primitive object={new THREE.Mesh()} rotation={[-Math.PI/2, 0, 0]} />
                        </mesh>
                    )}
                    {points.length >= 3 && mode === 'area' && (
                        <Html position={points[0]} distanceFactor={10}>
                            <Box sx={{ bgcolor: 'rgba(0,0,0,0.8)', color: 'white', px: 1, py: 0.5, borderRadius: 1, border: '1px solid #ffeb3b', whiteSpace: 'nowrap' }}>
                                <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                                    S: {(Math.abs(points.reduce((acc, p, i) => {
                                        const j = (i + 1) % points.length;
                                        return acc + (p.x * points[j].z - points[j].x * p.z);
                                    }, 0)) / 2).toFixed(2)} м²
                                </Typography>
                            </Box>
                        </Html>
                    )}
                    {points.length >= 3 && mode === 'volume' && (
                        <Html position={points[0]} distanceFactor={10}>
                            <Box sx={{ bgcolor: 'rgba(0,0,0,0.8)', color: 'white', px: 1, py: 0.5, borderRadius: 1, border: '1px solid #00e676', whiteSpace: 'nowrap' }}>
                                <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                                    V ≈ {(Math.abs(points.reduce((acc, p, i) => {
                                        const j = (i + 1) % points.length;
                                        return acc + (p.x * points[j].z - points[j].x * p.z);
                                    }, 0)) / 2 * 3.5).toFixed(2)} м³
                                </Typography>
                            </Box>
                        </Html>
                    )}
                </>
            )}
            {active && points.length > 0 && (
                <Html position={points[points.length-1]} distanceFactor={10}>
                    <MuiButton size="small" variant="contained" color="inherit" onClick={(e) => { e.stopPropagation(); reset(); }} sx={{ ml: 2, scale: '0.7' }}>Сброс</MuiButton>
                </Html>
            )}
        </group>
    );
};

const PointCloud = ({ count = 5000, color = "#2196f3", size = 0.06 }) => {
  const points = useMemo(() => {
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 12;
      const z = (Math.random() - 0.5) * 12;
      // Более выраженный рельеф
      const y = Math.sin(x * 0.4) * Math.cos(z * 0.4) * 2 + 
                Math.sin(x * 0.8) * 0.5 + 
                (Math.random() - 0.5) * 0.3;
      p[i * 3] = x;
      p[i * 3 + 1] = y;
      p[i * 3 + 2] = z;
    }
    return p;
  }, [count]);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={points.length / 3}
          array={points}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial size={size} color={color} sizeAttenuation transparent opacity={0.8} />
    </points>
  );
};

const ModelErrorBoundary = ({ children, fallback }) => {
  const [hasError, setHasError] = useState(false);
  useEffect(() => {
    setHasError(false);
  }, [children]);

  if (hasError) return fallback;

  return (
    <Suspense fallback={null}>
      <LocalErrorBoundary 
        fallback={fallback} 
        onError={(err) => {
            console.error("Model loading error:", err);
            setHasError(true);
        }}
      >
        {children}
      </LocalErrorBoundary>
    </Suspense>
  );
};

const LocalErrorBoundary = class extends React.Component {
    state = { hasError: false };
    static getDerivedStateFromError() { return { hasError: true }; }
    componentDidCatch(error) { if (this.props.onError) this.props.onError(error); }
    render() {
        if (this.state.hasError) return this.props.fallback;
        return this.props.children;
    }
}

// Реальный компонент для загрузки 3D модели
const RealModel = ({ url, wireframe = false }) => {
  const extension = url.split('.').pop().toLowerCase();
  
  const applyWireframe = (obj) => {
    if (!obj) return;
    obj.traverse((child) => {
        if (child.isMesh) {
            child.material.wireframe = wireframe;
        }
    });
  };

    if (extension === 'obj') {
        const obj = useLoader(OBJLoader, url);
        applyWireframe(obj);
        return <primitive object={obj} castShadow receiveShadow />;
    }
    
    if (extension === 'glb' || extension === 'gltf') {
        const { scene } = useGLTF(url);
        applyWireframe(scene);
        return <primitive object={scene} castShadow receiveShadow />;
    }

    if (extension === 'landxml' || extension === 'xml') {
        return (
            <group>
                <mesh rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
                    <planeGeometry args={[10, 10, 50, 50]} />
                    <meshStandardMaterial color="#8d6e63" wireframe={wireframe} />
                </mesh>
                <Html position={[0, 1, 0]}>
                    <Typography variant="caption" sx={{ color: 'white', bgcolor: 'rgba(0,0,0,0.5)', p: 0.5 }}>
                        LandXML Surface (Preview)
                    </Typography>
                </Html>
            </group>
        );
    }

  // Заглушка, если формат не поддерживается или расширение неизвестно
  return <TexturedMesh wireframe={wireframe} />;
};

// Компонент-заглушка для 3D модели (текстурированная меш)
const TexturedMesh = ({ color = "#2196f3", wireframe = false }) => {
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0, 0]}>
        <torusKnotGeometry args={[1, 0.3, 128, 16]} />
        <meshStandardMaterial color="#2196f3" roughness={0.3} metalness={0.8} wireframe={wireframe} />
      </mesh>
      {/* Имитация зданий/объектов вокруг */}
      <mesh position={[2, -0.5, 2]} castShadow>
        <boxGeometry args={[1, 2, 1]} />
        <meshStandardMaterial color="#555" wireframe={wireframe} />
      </mesh>
      <mesh position={[-2, -0.7, -1]} castShadow>
        <boxGeometry args={[1.5, 1.5, 1.5]} />
        <meshStandardMaterial color="#666" wireframe={wireframe} />
      </mesh>
    </group>
  );
};

const OrthoPlane = ({ url }) => {
    const texture = useLoader(THREE.TextureLoader, url);
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial map={texture} transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
    );
};

const PointInfoTool = ({ active, onInfo, onAddAnnotation }) => {
    const { raycaster, scene } = useThree();

    const handlePointerDown = (e) => {
        if (!active) return;
        e.stopPropagation();
        
        const intersects = raycaster.intersectObjects(scene.children, true);
        if (intersects.length > 0) {
            const point = intersects[0].point;
            onInfo({
                x: point.x.toFixed(3),
                y: point.y.toFixed(3),
                z: point.z.toFixed(3),
            });
            
            // Если зажат Shift, открываем диалог аннотации
            if (e.shiftKey) {
                const text = prompt("Текст заметки:");
                if (text) {
                    onAddAnnotation(text, [point.x, point.y, point.z]);
                }
            }
        }
    };

    return (
        <mesh onPointerDown={handlePointerDown} visible={false}>
            <boxGeometry args={[100, 100, 100]} />
        </mesh>
    );
};

const AnnotationMarker = ({ position, text, author, onDelete }) => {
    return (
        <group position={position}>
            <mesh>
                <sphereGeometry args={[0.08, 16, 16]} />
                <meshBasicMaterial color="#ffeb3b" />
            </mesh>
            <Html distanceFactor={10}>
                <Paper sx={{ p: 1, minWidth: 100, bgcolor: 'rgba(255,235,59,0.9)', color: 'black' }}>
                    <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'block' }}>{author}:</Typography>
                    <Typography variant="caption">{text}</Typography>
                    <MuiButton size="small" onClick={onDelete} sx={{ display: 'block', minWidth: 0, p: 0, color: 'error.main' }}>Удалить</MuiButton>
                </Paper>
            </Html>
        </group>
    );
};

const ModelViewer = ({ 
    project, results, comparisonMode = false, onMeasure,
    selectedModelIndex = 0, setSelectedModelIndex,
    secondModelIndex = 1, setSecondModelIndex
}) => {
  const isProcessed = results?.some(r => r.ready);
  const modelArtifacts = useMemo(() => results?.filter(r => r.type === '3d') || [], [results]);
  const orthoArtifacts = useMemo(() => results?.filter(r => r.type === 'ortho' && r.ready && r.url) || [], [results]);
  
  const currentModel = modelArtifacts[selectedModelIndex];
  const secondModel = modelArtifacts[secondModelIndex];
  const currentOrtho = orthoArtifacts[0];
  
  const isNDVI = results?.find(r => r.type === 'ndvi')?.ready;
  const controlsRef = useRef();
  const [measureActive, setMeasureActive] = useState(false);
  const [measureMode, setMeasureMode] = useState('distance'); // 'distance', 'area', 'volume'
  const [infoActive, setInfoActive] = useState(false);
  const [measureResult, setMeasureResult] = useState(null);
  const [pointInfo, setPointInfo] = useState(null);
  const [annotations, setAnnotations] = useState([]);
  const [wireframe, setWireframe] = useState(false);
  const [pointSize, setPointSize] = useState(0.06);

  const refreshAnnotations = useCallback(() => {
    if (project?.id) {
        fetchAnnotations(project.id, 'MODEL_3D').then(res => setAnnotations(res.data));
    }
  }, [project?.id]);

  useEffect(() => {
    refreshAnnotations();
  }, [project?.id, refreshAnnotations]);

  const handleAddAnnotation = (text, position) => {
    createAnnotation({
        project: project.id,
        text,
        position,
        annotation_type: 'MODEL_3D'
    }).then(refreshAnnotations);
  };

  const handleDeleteAnnotation = (id) => {
    if (window.confirm("Удалить заметку?")) {
        deleteAnnotation(id).then(refreshAnnotations);
    }
  };

  const statusText = useMemo(() => {
    if (isNDVI) return 'NDVI АНАЛИЗ';
    if (currentModel) return `МОДЕЛЬ: ${currentModel.name}`;
    if (currentOrtho) return `Ортофото (3D): ${currentOrtho.name}`;
    if (isProcessed) return 'РЕКОНСТРУКЦИИ';
    return 'ОЖИДАНИЕ ДАННЫХ';
  }, [isProcessed, isNDVI, currentModel, currentOrtho]);

  const modelColor = isNDVI ? "#8bc34a" : "#2196f3";

  const setView = (position) => {
    if (controlsRef.current) {
        const { camera } = controlsRef.current;
        camera.position.set(...position);
        controlsRef.current.target.set(0, 0, 0);
        controlsRef.current.update();
    }
  };

  return (
    <Box sx={{ width: '100%', height: '100%', position: 'relative', bgcolor: '#000', display: 'flex' }}>
      <Box sx={{ width: comparisonMode ? '50%' : '100%', height: '100%', position: 'relative' }}>
          <Box sx={{ position: 'absolute', top: 10, left: 10, zIndex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography 
                variant="caption" 
                sx={{ 
                color: isNDVI ? 'success.main' : 'primary.main',
                bgcolor: 'rgba(0,0,0,0.7)',
                p: 1,
                borderRadius: 1,
                border: '1px solid #333'
                }}
            >
                {comparisonMode ? `ВЕРСИЯ ${currentModel?.id || 1}` : statusText}
            </Typography>

            <ButtonGroup size="small" orientation="vertical" variant="contained" sx={{ opacity: 0.8 }}>
                <MuiButton onClick={() => setView([0, 15, 0])}>Сверху</MuiButton>
                <MuiButton onClick={() => setView([15, 0, 0])}>Спереди</MuiButton>
                <MuiButton onClick={() => setView([0, 0, 15])}>Сбоку</MuiButton>
            </ButtonGroup>
            
            {/* Tools only in single mode for simplicity or sync them later */}
            {!comparisonMode && (
                <>
                    {modelArtifacts.length > 1 && (
                        <Box sx={{ mt: 2 }}>
                            <Typography variant="caption" sx={{ color: 'grey.500', display: 'block', mb: 0.5 }}>ВЫБОР МОДЕЛИ:</Typography>
                            <ButtonGroup size="small" orientation="vertical" variant="outlined">
                                {modelArtifacts.map((m, idx) => (
                                    <MuiButton 
                                        key={m.id} 
                                        onClick={() => setSelectedModelIndex(idx)}
                                        variant={selectedModelIndex === idx ? "contained" : "outlined"}
                                    >
                                        {m.name}
                                    </MuiButton>
                                ))}
                            </ButtonGroup>
                        </Box>
                    )}

                    <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <MuiButton 
                            size="small" 
                            variant={measureActive && measureMode === 'distance' ? "contained" : "outlined"} 
                            color="error" 
                            onClick={() => {
                                if (measureActive && measureMode === 'distance') setMeasureActive(false);
                                else { setMeasureActive(true); setMeasureMode('distance'); setInfoActive(false); }
                            }}
                        >
                            ЛИНЕЙКА
                        </MuiButton>
                        <MuiButton 
                            size="small" 
                            variant={measureActive && measureMode === 'area' ? "contained" : "outlined"} 
                            color="warning" 
                            onClick={() => {
                                if (measureActive && measureMode === 'area') setMeasureActive(false);
                                else { setMeasureActive(true); setMeasureMode('area'); setInfoActive(false); }
                            }}
                        >
                            ПЛОЩАДЬ
                        </MuiButton>
                        <MuiButton 
                            size="small" 
                            variant={measureActive && measureMode === 'volume' ? "contained" : "outlined"} 
                            color="success" 
                            onClick={() => {
                                if (measureActive && measureMode === 'volume') setMeasureActive(false);
                                else { setMeasureActive(true); setMeasureMode('volume'); setInfoActive(false); }
                            }}
                        >
                            ОБЪЕМ
                        </MuiButton>
                    </Box>
                    
                    {measureResult && (
                        <Paper sx={{ p: 1, bgcolor: measureMode === 'area' ? 'rgba(255, 193, 7, 0.8)' : (measureMode === 'volume' ? 'rgba(76, 175, 80, 0.8)' : 'rgba(244, 67, 54, 0.8)'), color: measureMode === 'area' ? 'black' : 'white' }}>
                            <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                                {measureMode === 'area' ? 'Площадь' : (measureMode === 'volume' ? 'Объем' : 'Дистанция')}: {measureResult.value} {measureResult.unit}
                            </Typography>
                        </Paper>
                    )}
                    <MuiButton 
                        size="small" 
                        variant={infoActive ? "contained" : "outlined"} 
                        color="info" 
                        onClick={() => { setInfoActive(!infoActive); setMeasureActive(false); }}
                        sx={{ mt: 1 }}
                    >
                        ИНФО О ТОЧКЕ
                    </MuiButton>

                    <MuiButton 
                        size="small" 
                        variant={wireframe ? "contained" : "outlined"} 
                        color="secondary"
                        onClick={() => setWireframe(!wireframe)}
                        sx={{ mt: 1 }}
                    >
                        СЕТКА (WIREFRAME)
                    </MuiButton>
                </>
            )}
          </Box>
          
          <Canvas shadows camera={{ position: [8, 8, 8], fov: 50 }}>
            <Suspense fallback={null}>
              <OrbitControls ref={controlsRef} makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 1.75} enabled={!measureActive && !infoActive} />
              <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
              
              {!comparisonMode && <MeasuringTool active={measureActive} mode={measureMode} onMeasure={(res) => setMeasureResult(res)} />}
              {!comparisonMode && <PointInfoTool active={infoActive} onInfo={(info) => setPointInfo(info)} onAddAnnotation={handleAddAnnotation} />}

              {annotations.map(ann => (
                  <AnnotationMarker 
                    key={ann.id} 
                    position={ann.position} 
                    text={ann.text} 
                    author={ann.author_username} 
                    onDelete={() => handleDeleteAnnotation(ann.id)} 
                  />
              ))}

              <Stage environment="city" intensity={0.6} adjustCamera={false}>
                <Center>
                  {(isProcessed || isNDVI) ? (
                    <group>
                      <PointCloud count={8000} color={modelColor} size={pointSize} />
                      <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
                        {currentModel && currentModel.url ? (
                          <ModelErrorBoundary fallback={<TexturedMesh color={modelColor} wireframe={wireframe} />}>
                            <RealModel url={currentModel.url} wireframe={wireframe} />
                          </ModelErrorBoundary>
                        ) : (
                          currentOrtho && currentOrtho.url ? (
                            <ModelErrorBoundary fallback={<TexturedMesh color={modelColor} wireframe={wireframe} />}>
                                <OrthoPlane url={currentOrtho.url} />
                            </ModelErrorBoundary>
                          ) : (
                            <TexturedMesh color={modelColor} wireframe={wireframe} />
                          )
                        )}
                      </Float>
                    </group>
                  ) : (
                    <mesh wireframe>
                      <boxGeometry args={[4, 4, 4]} />
                      <meshStandardMaterial color="#444" />
                    </mesh>
                  )}
                </Center>
              </Stage>
              
              <Grid
                renderOrder={-1}
                position={[0, -1, 0]}
                infiniteGrid
                cellSize={0.6}
                cellThickness={1}
                sectionSize={3.3}
                sectionThickness={1.5}
                sectionColor="#2196f3"
                fadeDistance={30}
              />
              <ambientLight intensity={0.5} />
              <pointLight position={[10, 10, 10]} castShadow />
            </Suspense>
          </Canvas>
      </Box>

      {comparisonMode && (
          <Box sx={{ width: '50%', height: '100%', position: 'relative', borderLeft: '2px solid #333' }}>
            <Box sx={{ position: 'absolute', top: 10, left: 10, zIndex: 1 }}>
                <Typography 
                    variant="caption" 
                    sx={{ color: 'secondary.main', bgcolor: 'rgba(0,0,0,0.7)', p: 1, borderRadius: 1, border: '1px solid #333' }}
                >
                    ВЕРСИЯ {secondModel?.id || 2}
                </Typography>
            </Box>
            <Canvas shadows camera={{ position: [8, 8, 8], fov: 50 }}>
                <Suspense fallback={null}>
                <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 1.75} />
                <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
                
                <Stage environment="city" intensity={0.6} adjustCamera={false}>
                <Center>
                    <group>
                        <PointCloud count={8000} color="#9c27b0" size={pointSize} />
                        <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
                            {secondModel && secondModel.url ? (
                                <ModelErrorBoundary fallback={<TexturedMesh color="#9c27b0" wireframe={wireframe} />}>
                                    <RealModel url={secondModel.url} wireframe={wireframe} />
                                </ModelErrorBoundary>
                            ) : (
                                <TexturedMesh color="#9c27b0" wireframe={wireframe} />
                            )}
                        </Float>
                    </group>
                </Center>
                </Stage>
                <Grid
                    renderOrder={-1}
                    position={[0, -1, 0]}
                    infiniteGrid
                    cellSize={0.6}
                    cellThickness={1}
                    sectionSize={3.3}
                    sectionThickness={1.5}
                    sectionColor="#9c27b0"
                    fadeDistance={30}
                />
                <ambientLight intensity={0.5} />
                <pointLight position={[10, 10, 10]} castShadow />
                </Suspense>
            </Canvas>
          </Box>
      )}
    </Box>
  );
};

export default ModelViewer;
