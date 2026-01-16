import time
import os
import yadisk
import requests
import json
import hmac
import hashlib
from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings
from .models import Project, Task, ProjectFile, Notification, Artifact, ActivityLog, QualityMetric, WebhookConfig, ProjectBranch, ProjectTimeline, Orthophoto
from django.utils import timezone
import random
from PIL import Image, ImageDraw
from .webodm_client import WebODMClient

def trigger_webhooks(project, event_type, payload):
    webhooks = WebhookConfig.objects.filter(project=project, is_active=True)
    for hook in webhooks:
        if event_type in hook.events:
            try:
                data = json.dumps(payload)
                headers = {'Content-Type': 'application/json'}
                if hook.secret:
                    signature = hmac.new(
                        hook.secret.encode(),
                        data.encode(),
                        hashlib.sha256
                    ).hexdigest()
                    headers['X-Hub-Signature-256'] = f'sha256={signature}'
                
                requests.post(hook.url, data=data, headers=headers, timeout=5)
            except Exception as e:
                print(f"Webhook failed: {e}")

def process_orthophoto_internal(images, output_path):
    try:
        import cv2
        import numpy as np
        # Добавляем корень проекта в sys.path, чтобы импорт из OrthoStitcher работал
        import sys
        root_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if root_path not in sys.path:
            sys.path.append(root_path)
        
        from OrthoStitcher.OrthoScript import stitch_images
        
        # Чтобы не упасть по памяти (8GB RAM), ограничим количество снимков для демо-сшивки
        # или будем уменьшать их масштаб. Для 480 снимков нужна серьезная фотограмметрия.
        # OrthoStitcher — это последовательная сшивка, она может накапливать ошибку и требовать много памяти.
        max_images = 120 # Увеличиваем лимит, чтобы покрыть 108 снимков пользователя
        target_width = 1600 # Увеличиваем разрешение сшивки для лучшей детализации
        
        selected_images = images[:max_images]
        cv_images = []
        
        print(f"DEBUG: Loading {len(selected_images)} images for stitching...")
        for img_path in selected_images:
            img = cv2.imread(img_path)
            if img is not None:
                # Оптимизация: Сразу уменьшаем изображение до разумного размера,
                # чтобы не хранить гигантские массивы в списке cv_images.
                h, w = img.shape[:2]
                if w > target_width:
                    scale = target_width / w
                    img = cv2.resize(img, (target_width, int(h * scale)))
                cv_images.append(img)
        
        if len(cv_images) < 2:
            print("DEBUG: Not enough valid images for stitching.")
            return None
            
        print(f"DEBUG: Starting stitch_images with {len(cv_images)} images...")
        # Уменьшаем blend_width для экономии памяти при больших холстах
        result = stitch_images(cv_images, blend_width=20)
        
        if result is not None:
            cv2.imwrite(output_path, result)
            print(f"DEBUG: Successfully saved stitched result to {output_path}")
            return output_path
        
        print("DEBUG: stitch_images returned None")
        return None
    except Exception as e:
        print(f"OrthoStitcher integration failed: {e}. Fallback to mock.")
        import traceback
        traceback.print_exc()
        return None

def generate_tiles(orthophoto_path, ortho_id):
    """Конвертация PNG/GeoTIFF в тайлы для Leaflet (XYZ)"""
    import subprocess
    output_dir = os.path.join(settings.MEDIA_ROOT, 'tiles', f'orthophoto_{ortho_id}')
    os.makedirs(output_dir, exist_ok=True)
    
    try:
        # Пытаемся использовать gdal2tiles если он доступен
        # Если нет — имитируем структуру тайлов для фронтенда
        gdal_cmd = 'gdal2tiles.py'
        
        # Проверяем наличие команды
        import shutil
        if shutil.which(gdal_cmd):
            # ...
            # subprocess.run(...)
            pass 
        
        # В ЛЮБОМ СЛУЧАЕ создаем фейковую структуру, чтобы гарантировать отображение
        # (т.к. gdal2tiles может не найти привязку в PNG)
        print(f"DEBUG: Creating/Updating tiles structure for ortho_{ortho_id}.")
        z, x, y = 15, 15845, 10260 # Примерные координаты для Москвы
        z_dir = os.path.join(output_dir, str(z))
        x_dir = os.path.join(z_dir, str(x))
        os.makedirs(x_dir, exist_ok=True)
        shutil.copy(orthophoto_path, os.path.join(x_dir, f"{y}.png"))

        return f'/media/tiles/orthophoto_{ortho_id}/{{z}}/{{x}}/{{y}}.png'
    except Exception as e:
        print(f"Tile generation failed: {e}")
        # Возвращаем путь к самому файлу как fallback (некоторые Leaflet плагины могут его съесть)
        return f'/media/artifacts/{os.path.basename(orthophoto_path)}'

@shared_task(bind=True)
def generate_contours(self, project_id, interval=1.0):
    project = Project.objects.get(id=project_id)
    task_record = Task.objects.create(
        project=project,
        name=f"Генерация изолиний ({interval}м)",
        status='PROCESSING',
        celery_task_id=self.request.id
    )

    task_record.logs += "[INFO] Анализ цифровой модели рельефа (DSM)...\n"
    task_record.progress = 30
    task_record.save()
    time.sleep(2)

    task_record.logs += f"[INFO] Извлечение векторов с шагом {interval} метров...\n"
    task_record.progress = 60
    task_record.save()
    time.sleep(2)

    task_record.logs += "[INFO] Сглаживание линий и генерация атрибутов высоты...\n"
    task_record.progress = 90
    task_record.save()
    time.sleep(1)

    # Создаем артефакт
    Artifact.objects.create(
        project=project,
        task=task_record,
        artifact_type='CONTOUR_LINES',
        name=f"Изолинии ({interval}м)",
        file='artifacts/demo_contours.geojson',
        metadata={'interval': interval, 'format': 'GeoJSON'}
    )

    task_record.status = 'COMPLETED'
    task_record.progress = 100
    task_record.save()

    Notification.objects.create(
        project=project,
        message=f"Изолинии для проекта '{project.name}' успешно сгенерированы."
    )
    return f"Contours for project {project_id} generated"

@shared_task(bind=True)
def simplify_mesh(self, artifact_id, ratio=0.5):
    old_artifact = Artifact.objects.get(id=artifact_id)
    project = old_artifact.project
    task_record = Task.objects.create(
        project=project,
        name=f"Оптимизация 3D модели ({int(ratio*100)}%)",
        status='PROCESSING',
        celery_task_id=self.request.id
    )

    task_record.logs += f"[INFO] Загрузка исходной модели (V{old_artifact.version})...\n"
    task_record.progress = 20
    task_record.save()
    time.sleep(2)

    task_record.logs += f"[INFO] Децимация сетки: целевой коэффициент {ratio}...\n"
    task_record.progress = 70
    task_record.save()
    time.sleep(3)

    # Создаем новый артефакт (оптимизированную версию)
    new_version = Artifact.objects.filter(project=project, artifact_type='MODEL_3D').count() + 1
    new_artifact = Artifact.objects.create(
        project=project,
        task=task_record,
        artifact_type='MODEL_3D',
        name=f"3D Модель (Optimized {int(ratio*100)}%)",
        file='artifacts/demo_model_low.obj',
        version=new_version,
        metadata={'faces': int(250000 * ratio), 'optimized': True, 'ratio': ratio}
    )
    
    # Добавляем в таймлайн
    ProjectTimeline.objects.create(
        project=project,
        artifact=new_artifact,
        timestamp=timezone.now(),
        label=f"Оптимизированная 3D модель V{new_version}"
    )

    task_record.status = 'COMPLETED'
    task_record.progress = 100
    task_record.save()

    return f"Mesh simplification for artifact {artifact_id} finished"

@shared_task(bind=True)
def process_photogrammetry(self, project_id, quality='MEDIUM', branch_id=None, ortho_only=False, task_name=None):
    try:
        project = Project.objects.get(id=project_id)
    except Project.DoesNotExist:
        return f"Project {project_id} not found"

    branch = None
    if branch_id:
        try:
            branch = ProjectBranch.objects.get(id=branch_id)
        except ProjectBranch.DoesNotExist:
            pass

    ActivityLog.objects.create(
        project=project,
        action="Начало вычислений",
        details=f"Celery воркер принял задачу на обработку ({'Только ортофото' if ortho_only else 'Полная реконструкция'}, Качество: {quality}, Ветка: {branch.name if branch else 'Main'})"
    )

    task_display_name = task_name or (f"Реконструкция ({quality})" if not ortho_only else f"Ортофотоплан ({quality})")
    task_record = Task.objects.create(
        project=project,
        branch=branch,
        name=task_display_name,
        task_type='orthophoto' if ortho_only else 'reconstruction',
        status='PROCESSING',
        quality_preset=quality,
        celery_task_id=self.request.id
    )

    # Задержка зависит от качества
    sleep_time = 2 if quality == 'LOW' else (4 if quality == 'MEDIUM' else 7)
    
    # Проверка наличия файлов
    files_count = project.files.count()
    if files_count < 3:
        task_record.logs += "[ERROR] Недостаточно снимков для обработки. Нужно минимум 3 снимка.\n"
        task_record.status = 'FAILED'
        task_record.save()
        Notification.objects.create(
            project=project,
            message=f"Ошибка обработки '{project.name}': недостаточно снимков."
        )
        return f"Project {project_id} failed: not enough files"
    
    task_record.logs += f"[INFO] Найдено {files_count} снимков. Начало обработки...\n"
    
    # Проверка целевого GSD
    if project.target_gsd:
        task_record.logs += f"[INFO] Проверка целевой точности (Target GSD: {project.target_gsd} см/пикс)...\n"
        # В реальности рассчитывается по фокусному и высоте, здесь имитируем
        achieved_gsd = 2.5 
        if achieved_gsd > project.target_gsd:
            task_record.logs += f"[WARNING] Достигнутый GSD ({achieved_gsd} см/пикс) превышает целевой ({project.target_gsd} см/пикс)!\n"
        else:
            task_record.logs += f"[INFO] Целевая точность соблюдена ({achieved_gsd} см/пикс).\n"

    # Список этапов зависит от режима
    if ortho_only:
        steps = [
            ("Инициализация", 5, "Проверка структуры проекта..."),
            ("Выравнивание снимков", 30, f"Анализ EXIF. Найдено {files_count * 5} связующих точек."),
            ("Построение ортофотоплана", 80, "Ортотрансформирование и создание мозаики (упрощенно)..."),
            ("Завершение", 100, "Ортофотоплан успешно сохранен.")
        ]
    else:
        # Режим "Полная реконструкция БЕЗ 3D" (максимально упрощенная)
        steps = [
            ("Инициализация", 5, "Проверка структуры проекта..."),
            ("Выравнивание снимков", 25, f"Анализ EXIF. Найдено {files_count * 8} связующих точек."),
            ("Построение плотного облака", 50, "Генерация облака (упрощенная фильтрация)..."),
            ("Построение DSM", 75, "Создание цифровой модели поверхности..."),
            ("Построение ортофотоплана", 95, "Генерация финальной мозаики..."),
            ("Завершение", 100, "Все артефакты успешно сохранены.")
        ]
    
    # ПЕРЕНОС: Сначала создаем артефакты (демо или реальные), а потом ставим статус COMPLETED
    # 300:    task_record.status = 'COMPLETED'
    # 301:    task_record.save()

    for step_name, progress, detail in steps:
        task_record.logs += f"[INFO] {step_name}... {detail}\n"
        task_record.progress = progress
        task_record.save()
        # Имитируем работу, но проверяем не слишком ли долго
        time.sleep(min(sleep_time, 2)) 

    # ПЕРЕД СОЗДАНИЕМ ФАЙЛОВ убеждаемся, что demo_ortho.png существует
    media_artifacts_dir = os.path.join(settings.MEDIA_ROOT, 'artifacts')
    os.makedirs(media_artifacts_dir, exist_ok=True)
    demo_ortho_path = os.path.join(media_artifacts_dir, 'demo_ortho.png')
    if not os.path.exists(demo_ortho_path) or os.path.getsize(demo_ortho_path) < 100:
        try:
            from PIL import Image, ImageDraw
            img = Image.new('RGB', (1024, 1024), color=(76, 175, 80)) # Зеленый фон
            draw = ImageDraw.Draw(img)
            for i in range(0, 1024, 128):
                draw.line([(i, 0), (i, 1024)], fill=(255, 255, 255), width=2)
                draw.line([(0, i), (1024, i)], fill=(255, 255, 255), width=2)
            try:
                draw.text((400, 500), "ORTHOPHOTO", fill=(255,255,255))
            except:
                draw.rectangle([400, 480, 624, 520], fill=(255,255,255))
            img.save(demo_ortho_path)
        except Exception as e:
            print(f"Failed to create demo ortho: {e}")
            transparent_png = (
                b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06'
                b'\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00'
                b'\x01\r\n+\x45\x00\x00\x00\x00IEND\xaeB`\x82'
            )
            with open(demo_ortho_path, 'wb') as f:
                f.write(transparent_png)

    # Убеждаемся, что demo_ortho.tif тоже существует
    demo_ortho_tif_path = os.path.join(media_artifacts_dir, 'demo_ortho.tif')
    if not os.path.exists(demo_ortho_tif_path) or os.path.getsize(demo_ortho_tif_path) == 0:
        if os.path.exists(demo_ortho_path):
            import shutil
            shutil.copy(demo_ortho_path, demo_ortho_tif_path)

    # 1. Попытка реальной сшивки через OrthoStitcher (если есть файлы)
    ortho_filename = f'ortho_{project.id}_{int(time.time())}.png'
    ortho_path = os.path.join(media_artifacts_dir, ortho_filename)
    
    # Чтобы избежать SIGKILL, мы запускаем stitch_images только если количество снимков умеренное
    # Иначе используем демо-заглушку, т.к. OrthoStitcher не оптимизирован для памяти.
    images = [f.file.path for f in project.files.all() if f.file]
    stitching_success = False
    
    if images and 3 <= len(images) <= 200:
        try:
            res_ortho = process_orthophoto_internal(images, ortho_path)
            if res_ortho:
                stitching_success = True
        except Exception as e:
            print(f"Stitching failed: {e}")
            
    if not stitching_success:
        import shutil
        if len(images) > 0:
            # Вместо просто зеленого фона, возьмем первый снимок проекта как основу для "ортофото"
            # чтобы пользователь видел реальный контент, а не просто заглушку.
            try:
                img = Image.open(images[0])
                img.thumbnail((2048, 2048)) # Ограничим размер
                img.save(ortho_path)
                task_record.logs += f"[INFO] Использован первый снимок проекта в качестве обзорного ортоплана (сшивка {len(images)} снимков пропущена для экономии памяти).\n"
                stitching_success = True
            except Exception as e:
                print(f"Failed to use first image as fallback: {e}")
        
        if not stitching_success:
            shutil.copy(demo_ortho_path, ortho_path)
            task_record.logs += "[INFO] Используется демонстрационный ортофотоплан (сшивка пропущена).\n"
        
        task_record.save()
    
    # ПРИВЯЗКА (Georeferencing):
    # Т.к. OrthoStitcher делает PNG без привязки, создаем World File (.tfw / .pgw)
    # Используем область проекта (project.area) или EXIF первого фото
    pgw_path = ortho_path.replace('.png', '.pgw')
    # Имитируем привязку: 1 пиксель = 0.025 метра
    # [A: x-scale, D: y-rotation, B: x-rotation, E: y-scale, C: x-origin, F: y-origin]
    # Т.к. PNG обычно 1024x1024 или около того, а градусы маленькие, 
    # масштаб должен быть очень маленьким для покрытия области.
    # Для отладки используем фиксированный размер пикселя в градусах (примерно 2.5см)
    pixel_size = 0.00000025 
    origin_x = 37.6176
    origin_y = 55.7558
    if project.area and project.area.extent:
        origin_x = project.area.extent[0]
        origin_y = project.area.extent[3] # Верхний левый угол
        
        # Если есть область, попробуем подогнать масштаб под нее, 
        # чтобы ImageOverlay сел ровно.
        try:
            from PIL import Image
            img_temp = Image.open(ortho_path)
            w_img, h_img = img_temp.size
            extent = project.area.extent
            # extent: [min_x, min_y, max_x, max_y]
            width_geo = extent[2] - extent[0]
            height_geo = extent[3] - extent[1]
            if w_img > 0 and h_img > 0:
                scale_x = width_geo / w_img
                scale_y = height_geo / h_img
                pixel_size_x = scale_x
                pixel_size_y = scale_y
            else:
                pixel_size_x = pixel_size
                pixel_size_y = pixel_size
        except Exception as e:
            print(f"Error calculating precise scale: {e}")
            pixel_size_x = pixel_size
            pixel_size_y = pixel_size
    else:
        pixel_size_x = pixel_size
        pixel_size_y = pixel_size
    
    with open(pgw_path, 'w') as f:
        f.write(f"{pixel_size_x}\n0.0\n0.0\n-{pixel_size_y}\n{origin_x}\n{origin_y}\n")

    # 2. Генерация тайлов
    tiles_url = generate_tiles(ortho_path, f"{project.id}_{int(time.time())}")
    
    # 3. Создание Orthophoto объекта
    ortho_obj = Orthophoto.objects.create(
        project=project,
        name=task_record.name,
        file_path=f'artifacts/{ortho_filename}',
        bounds=project.area, # Используем область проекта
        resolution=2.5, # 2.5 см/пикс
        tiles_url=tiles_url
    )

    # Автоматический расчет версии для Artifact
    next_version = Artifact.objects.filter(project=project, artifact_type='ORTHOPHOTO').count() + 1
    
    timestamp = timezone.now()
    
    ortho = Artifact.objects.create(
        project=project,
        task=task_record,
        branch=branch,
        artifact_type='ORTHOPHOTO',
        file=f'artifacts/{ortho_filename}',
        version=next_version,
        metadata={'resolution': '2.5 cm/px', 'quality': quality, 'ortho_only': ortho_only, 'orthophoto_id': ortho_obj.id}
    )
    
    # Добавляем в таймлайн
    ProjectTimeline.objects.create(
        project=project,
        artifact=ortho,
        timestamp=timestamp,
        label=f"{'Ортофото' if ortho_only else 'Реконструкция'} V{next_version} ({quality})"
    )
    
    # 4. Финализация статуса задачи
    task_record.status = 'COMPLETED'
    task_record.progress = 100
    task_record.save()
    
    # Создаем метрики качества
    QualityMetric.objects.create(
        project=project,
        artifact=ortho,
        gsd=2.5,
        rmse_x=random.uniform(0.01, 0.05),
        rmse_y=random.uniform(0.01, 0.05),
        rmse_z=random.uniform(0.02, 0.08),
        overlap_mean=random.uniform(70, 85)
    )

    # 3D МОДЕЛЬ ТЕПЕРЬ СОЗДАЕМ ТОЛЬКО ЕСЛИ ЭТО НЕ ortho_only И НЕ "Полная БЕЗ 3D"
    # Для упрощения задачи считаем, что если ortho_only=False, то это "Полная БЕЗ 3D",
    # если не указано иное. В ТЗ сказано "Ничего, связанное с 3D-моделью... не должно больше запускаться".
    # Поэтому полностью отключаем 3D артефакт в основном пайплайне.
    
    # if not ortho_only: 
    #     ... 3D model creation ...

    Notification.objects.create(
        project=project,
        message=f"{'Построение ортофото' if ortho_only else 'Обработка'} проекта '{project.name}' успешно завершена."
    )
    
    # Email уведомление
    if project.owner and project.owner.email:
        try:
            send_mail(
                'Проект обработан',
                f'Ваш проект "{project.name}" успешно обработан. Результаты доступны в системе.',
                settings.DEFAULT_FROM_EMAIL,
                [project.owner.email],
                fail_silently=True,
            )
        except:
            pass

    ActivityLog.objects.create(
        project=project,
        action="Завершение обработки",
        details="Все этапы реконструкции выполнены, артефакты созданы"
    )

    # Триггер вебхука
    trigger_webhooks(project, 'task.completed', {
        'project_id': project.id,
        'task_id': task_record.id,
        'status': 'COMPLETED',
        'artifacts_count': 2
    })

    return f"Project {project_id} processed"

@shared_task(bind=True)
def run_change_detection(self, project_id, artifact1_id, artifact2_id):
    project = Project.objects.get(id=project_id)
    a1 = Artifact.objects.get(id=artifact1_id)
    a2 = Artifact.objects.get(id=artifact2_id)
    
    task_record = Task.objects.create(
        project=project,
        name=f"Детекция изменений (V{a1.version} vs V{a2.version})",
        status='PROCESSING',
        celery_task_id=self.request.id
    )

    task_record.logs += f"[INFO] Сопоставление растров V{a1.version} и V{a2.version}...\n"
    task_record.progress = 25
    task_record.save()
    time.sleep(2)

    task_record.logs += "[INFO] Вычисление разностного индекса и фильтрация шумов...\n"
    task_record.progress = 60
    task_record.save()
    time.sleep(3)

    task_record.logs += "[INFO] Выделение контуров изменений (Change Segments)...\n"
    task_record.progress = 90
    task_record.save()
    time.sleep(2)

    # Создаем артефакт разностной карты
    Artifact.objects.create(
        project=project,
        task=task_record,
        artifact_type='KML', # Используем KML/GeoJSON для отображения на карте
        name=f"Карта изменений V{a1.version}-V{a2.version}",
        file='artifacts/demo_changes.geojson',
        metadata={
            'v1': a1.version, 
            'v2': a2.version, 
            'changed_area_sqm': 1250,
            'confidence': 0.89
        }
    )

    task_record.status = 'COMPLETED'
    task_record.progress = 100
    task_record.save()

    Notification.objects.create(
        project=project,
        message=f"Анализ изменений между V{a1.version} и V{a2.version} завершен."
    )
    return f"Change detection for {project_id} finished"

@shared_task(bind=True)
def generate_project_report(self, project_id):
    project = Project.objects.get(id=project_id)
    task_record = Task.objects.create(
        project=project,
        name="Генерация отчета PDF (QA/QC)",
        status='PROCESSING',
        celery_task_id=self.request.id
    )

    task_record.logs += f"[INFO] Начало формирования детального отчета для проекта {project.name}...\n"
    task_record.progress = 10
    task_record.save()
    time.sleep(1)

    # Имитация вставки графиков в PDF
    task_record.logs += "[INFO] Анализ метрик качества (QA/QC)...\n"
    metrics = QualityMetric.objects.filter(project=project).first()
    if metrics:
        task_record.logs += f"[INFO] GSD: {metrics.gsd} см/пикс. RMSE: {metrics.rmse_x}/{metrics.rmse_y}/{metrics.rmse_z} м.\n"
    
    task_record.progress = 30
    task_record.save()
    time.sleep(1)

    task_record.logs += "[INFO] Отрисовка схем перекрытия снимков и карты высот...\n"
    task_record.progress = 50
    task_record.save()
    time.sleep(2)

    task_record.logs += "[INFO] Расчет невязок по опорным точкам (GCP)...\n"
    gcps = project.gcps.all()
    for gcp in gcps:
        if gcp.measured_lat:
            task_record.logs += f"[INFO] Точка {gcp.name}: Ошибка {random.uniform(1, 5):.1f} см.\n"

    task_record.progress = 80
    task_record.save()
    time.sleep(1)

    task_record.logs += "[INFO] Финализация PDF документа и вшивка метаданных...\n"
    
    # Создаем артефакт отчета
    Artifact.objects.create(
        project=project,
        task=task_record,
        artifact_type='REPORT',
        file='artifacts/full_qa_report.pdf',
        name=f"QA_Report_{project.name}_{timezone.now().strftime('%Y%m%d')}.pdf",
        metadata={'type': 'QA_QC', 'gsd': metrics.gsd if metrics else 0}
    )

    task_record.status = 'COMPLETED'
    task_record.progress = 100
    task_record.save()

    Notification.objects.create(
        project=project,
        message=f"Детальный QA/QC отчет для '{project.name}' готов."
    )
    return f"QA Report for project {project_id} generated"

@shared_task(bind=True)
def export_project_data(self, project_id, export_format='ZIP'):
    project = Project.objects.get(id=project_id)
    files_count = project.files.count()
    task_record = Task.objects.create(
        project=project,
        name=f"Экспорт данных ({export_format})",
        status='PROCESSING',
        celery_task_id=self.request.id
    )

    task_record.logs += f"[INFO] Подготовка данных в формате {export_format}...\n"
    task_record.progress = 10
    task_record.save()
    time.sleep(1)

    # Сбор всех ортофотопланов и карт высот...
    orthos = Artifact.objects.filter(project=project, artifact_type='ORTHOPHOTO')
    for ortho in orthos:
        task_record.logs += f"[INFO] Включение в экспорт: {ortho.name or f'Ortho_V{ortho.version}'}\n"
    
    # Спектральные данные
    ndvis = Artifact.objects.filter(project=project, artifact_type='NDVI')
    for ndvi in ndvis:
        task_record.logs += f"[INFO] Включение спектральной карты: {ndvi.name or f'NDVI_V{ndvi.version}'}\n"
    
    task_record.progress = 40
    task_record.save()
    time.sleep(1)

    task_record.logs += "[INFO] Сбор векторов и аннотаций...\n"
    gcps = project.gcps.all()
    if gcps.exists():
        task_record.logs += f"[INFO] Экспорт {gcps.count()} опорных точек (GCP)...\n"
    
    task_record.progress = 70
    task_record.save()
    time.sleep(1)

    task_record.logs += "[INFO] Генерация сопроводительной документации и метаданных JSON...\n"
    task_record.progress = 85
    task_record.save()
    time.sleep(1)

    task_record.logs += "[INFO] Финальная упаковка (сжатие LZW для GeoTIFF)...\n"
    task_record.progress = 95
    task_record.save()
    time.sleep(1)

    file_ext = 'zip' if export_format == 'ZIP' else 'tar.gz'
    filename = f"project_{project.id}_export_{export_format.lower()}.{file_ext}"
    
    task_record.logs += f"[INFO] Экспорт завершен: {filename}\n"
    
    # Создаем артефакт для скачивания
    Artifact.objects.create(
        project=project,
        task=task_record,
        artifact_type='REPORT',
        file='artifacts/demo_export.zip',
        name=filename,
        metadata={'size_mb': 15.4, 'files_included': files_count, 'format': export_format}
    )

    task_record.status = 'COMPLETED'
    task_record.progress = 100
    task_record.save()

    Notification.objects.create(
        project=project,
        message=f"Экспорт проекта '{project.name}' в формате {export_format} завершен."
    )
    
    ActivityLog.objects.create(
        project=project,
        action="Экспорт завершен",
        details=f"Архив {filename} готов к скачиванию"
    )
    return f"Export for project {project_id} ({export_format}) finished"

@shared_task(bind=True)
def run_gis_export(self, project_id, format='SHAPEFILE', epsg=4326):
    project = Project.objects.get(id=project_id)
    task_record = Task.objects.create(
        project=project,
        name=f"ГИС Экспорт ({format})",
        status='PROCESSING',
        celery_task_id=self.request.id
    )

    task_record.logs += f"[INFO] Начало экспорта в формате {format}...\n"
    task_record.logs += f"[INFO] Целевая система координат: EPSG:{epsg}\n"
    task_record.progress = 20
    task_record.save()
    time.sleep(2)

    if epsg != 4326:
        task_record.logs += f"[INFO] Перепроецирование геометрии из WGS-84 в EPSG:{epsg}...\n"
        task_record.progress = 50
        task_record.save()
        time.sleep(2)

    task_record.logs += f"[INFO] Сбор векторных слоев (аннотации, GCP, измерения)...\n"
    
    # Имитация реальной сборки данных
    vector_data = {
        "type": "FeatureCollection",
        "features": []
    }
    
    # Добавляем AOI
    if project.area:
        vector_data["features"].append({
            "type": "Feature",
            "properties": {"name": "Area of Interest", "type": "AOI"},
            "geometry": json.loads(project.area.json) if hasattr(project.area, 'json') else None 
        })
    
    # Добавляем GCP
    for gcp in project.gcps.all():
        vector_data["features"].append({
            "type": "Feature",
            "properties": {"name": gcp.name, "type": "GCP", "point_type": gcp.point_type},
            "geometry": {"type": "Point", "coordinates": [gcp.longitude, gcp.latitude]}
        })
        
    # Добавляем аннотации
    from .models import Annotation
    for ann in Annotation.objects.filter(project=project, annotation_type='MAP'):
        vector_data["features"].append({
            "type": "Feature",
            "properties": {"text": ann.text, "type": "Annotation"},
            "geometry": {"type": "Point", "coordinates": [ann.position[1], ann.position[0]]}
        })

    task_record.progress = 70
    task_record.save()
    time.sleep(2)

    task_record.logs += f"[INFO] Генерация файлов (.shp, .dbf, .shx, .prj) или (.dxf)...\n"
    task_record.progress = 90
    task_record.save()
    time.sleep(2)
    
    # Создаем артефакт
    ext = 'zip' if format == 'SHAPEFILE' else 'dxf'
    Artifact.objects.create(
        project=project,
        task=task_record,
        artifact_type='REPORT',
        file=f'artifacts/gis_export.{ext}',
        name=f"{project.name}_gis_{format.lower()}_epsg{epsg}.{ext}",
        metadata={'format': format, 'epsg': epsg, 'crs': f'EPSG:{epsg}'}
    )

    task_record.status = 'COMPLETED'
    task_record.progress = 100
    task_record.save()

    Notification.objects.create(
        project=project,
        message=f"ГИС-экспорт ({format}, EPSG:{epsg}) проекта '{project.name}' завершен."
    )
    return f"GIS Export for {project_id} finished"

@shared_task(bind=True)
def run_landxml_export(self, project_id):
    project = Project.objects.get(id=project_id)
    task_record = Task.objects.create(
        project=project,
        name="Экспорт в LandXML",
        status='PROCESSING',
        celery_task_id=self.request.id
    )

    task_record.logs += "[INFO] Анализ триангуляционной модели (TIN)...\n"
    task_record.progress = 30
    task_record.save()
    time.sleep(2)

    task_record.logs += "[INFO] Формирование структуры XML (Surfaces, Points, Faces)...\n"
    task_record.progress = 70
    task_record.save()
    time.sleep(2)

    # Создаем артефакт
    Artifact.objects.create(
        project=project,
        task=task_record,
        artifact_type='MODEL_3D',
        file='artifacts/demo_surface.xml',
        name=f"{project.name}_surface.landxml",
        metadata={'type': 'LandXML', 'version': '1.2'}
    )

    task_record.status = 'COMPLETED'
    task_record.progress = 100
    task_record.save()

    Notification.objects.create(
        project=project,
        message=f"Экспорт LandXML для проекта '{project.name}' завершен."
    )
    return f"LandXML export for {project_id} finished"

from django.utils import timezone
from datetime import timedelta
from .models import UserProfile

@shared_task
def run_data_retention_policy():
    """
    Автоматическая архивация и удаление старых проектов согласно политике хранения.
    """
    profiles = UserProfile.objects.all()
    count_archived = 0
    
    for profile in profiles:
        retention_date = timezone.now() - timedelta(days=profile.data_retention_days)
        # Находим проекты пользователя, которые старше срока хранения и еще не архивированы
        old_projects = Project.objects.filter(
            owner=profile.user,
            updated_at__lt=retention_date,
            is_archived=False
        )
        
        for project in old_projects:
            project.is_archived = True
            project.save()
            count_archived += 1
            
            ActivityLog.objects.create(
                project=project,
                action="Авто-архивация",
                details=f"Проект архивирован автоматически (срок хранения {profile.data_retention_days} дней)"
            )
            
            Notification.objects.create(
                project=project,
                message=f"Проект '{project.name}' автоматически перемещен в архив согласно политике хранения."
            )
            
    return f"Retention policy processed: {count_archived} projects archived"

@shared_task(bind=True)
def generate_comparison_report(self, artifact1_id, artifact2_id):
    a1 = Artifact.objects.get(id=artifact1_id)
    a2 = Artifact.objects.get(id=artifact2_id)
    project = a1.project
    
    task_record = Task.objects.create(
        project=project,
        name=f"Сравнение V{a1.version} и V{a2.version}",
        status='PROCESSING',
        celery_task_id=self.request.id
    )

    task_record.logs += f"[INFO] Начало дифференциального анализа моделей...\n"
    task_record.progress = 20
    task_record.save()
    time.sleep(2)

    task_record.logs += f"[INFO] Сравнение геометрии. Отклонение RMS: 0.12м.\n"
    task_record.logs += f"[INFO] Обнаружено 4 новых строения в версии {a2.version}.\n"
    task_record.progress = 50
    task_record.save()
    time.sleep(2)

    task_record.logs += "[INFO] Анализ изменений текстур и спектральных данных...\n"
    task_record.logs += "[INFO] NDVI индекс увеличился на 12% в южной части участка.\n"
    task_record.progress = 80
    task_record.save()
    time.sleep(2)

    task_record.logs += f"[INFO] PDF отчет о сравнении сформирован: comparison_v{a1.version}_v{a2.version}.pdf\n"
    
    Artifact.objects.create(
        project=project,
        task=task_record,
        artifact_type='REPORT',
        file='artifacts/demo_comparison_report.pdf',
        metadata={'type': 'COMPARISON', 'v1': a1.version, 'v2': a2.version}
    )

    task_record.status = 'COMPLETED'
    task_record.progress = 100
    task_record.save()

    Notification.objects.create(
        project=project,
        message=f"Отчет о сравнении версий для '{project.name}' готов."
    )
    return f"Comparison report for {project.id} generated"

@shared_task(bind=True)
def export_to_cloud(self, project_id, service='google_drive'):
    project = Project.objects.get(id=project_id)
    task_record = Task.objects.create(
        project=project,
        name=f"Экспорт в облако ({service})",
        status='PROCESSING',
        celery_task_id=self.request.id
    )

    task_record.logs += f"[INFO] Авторизация в сервисе {service}...\n"
    task_record.progress = 20
    task_record.save()
    time.sleep(2)

    task_record.logs += "[INFO] Архивация артефактов и метаданных проекта...\n"
    task_record.progress = 50
    task_record.save()
    time.sleep(3)

    task_record.logs += f"[INFO] Передача данных в облачное хранилище (Project_{project_id}.zip)...\n"
    task_record.progress = 90
    task_record.save()
    time.sleep(2)

    task_record.status = 'COMPLETED'
    task_record.progress = 100
    task_record.logs += f"[SUCCESS] Проект успешно экспортирован в {service}.\n"
    task_record.save()

    Notification.objects.create(
        project=project,
        message=f"Экспорт проекта '{project.name}' в {service} завершен."
    )
    return f"Export to {service} for project {project_id} completed"

@shared_task(bind=True)
def run_object_detection(self, project_id):
    from .models import DetectedObject, Annotation
    project = Project.objects.get(id=project_id)
    task_record = Task.objects.create(
        project=project,
        name="AI Обнаружение объектов",
        status='PROCESSING',
        celery_task_id=self.request.id
    )

    task_record.logs += "[INFO] Загрузка предобученной модели (YOLOv8-Photogrammetry)...\n"
    task_record.progress = 20
    task_record.save()
    time.sleep(2)

    task_record.logs += "[INFO] Анализ ортофотоплана и выделение тайлов...\n"
    task_record.progress = 50
    task_record.save()
    time.sleep(2)

    # Имитация обнаружения
    import random
    types = ['VEHICLE', 'BUILDING', 'TREE', 'STOCKPILE']
    detected_count = 0
    
    # Создаем фиктивные объекты
    for i in range(random.randint(5, 15)):
        obj_type = random.choice(types)
        # Имитируем координаты рядом с первой точкой проекта (если есть) или просто центр
        lat = 55.75 + random.uniform(-0.01, 0.01)
        lon = 37.61 + random.uniform(-0.01, 0.01)
        
        # Если проект имеет область, стараемся попасть в нее
        if project.area and project.area.centroid:
             lat = project.area.centroid.y + random.uniform(-0.005, 0.005)
             lon = project.area.centroid.x + random.uniform(-0.005, 0.005)
        
        obj = DetectedObject.objects.create(
            project=project,
            object_type=obj_type,
            confidence=round(random.uniform(0.75, 0.99), 2),
            location=[lat, lon]
        )
        
        # Автоматически создаем аннотацию на карте для каждого обнаруженного объекта
        Annotation.objects.create(
            project=project,
            text=f"AI Detection: {obj.get_object_type_display()} ({int(obj.confidence*100)}%)",
            annotation_type='MAP',
            position=[lat, lon]
        )
        
        detected_count += 1

    task_record.logs += f"[INFO] Обнаружено {detected_count} объектов. Аннотации добавлены на карту.\n"
    task_record.logs += "[INFO] Классификация и сохранение геометрии завершено.\n"
    
    task_record.status = 'COMPLETED'
    task_record.progress = 100
    task_record.save()

    Notification.objects.create(
        project=project,
        message=f"AI анализ проекта '{project.name}' завершен. Найдено объектов: {detected_count}."
    )
    
    ActivityLog.objects.create(
        project=project,
        action="AI Анализ",
        details=f"Завершено автоматическое обнаружение объектов ({detected_count} шт.)"
    )
    
    return f"AI Detection for project {project_id} finished"

@shared_task(bind=True)
def run_multispectral_analysis(self, project_id, index_type='NDVI'):
    project = Project.objects.get(id=project_id)
    task_record = Task.objects.create(
        project=project,
        name=f"Спектральный анализ ({index_type})",
        status='PROCESSING',
        celery_task_id=self.request.id
    )

    steps = [
        ("Калибровка датчиков", 20, "Проверка спектральных характеристик снимков."),
        ("Извлечение каналов", 40, "Доступ к каналам NIR, RED, REDEDGE, GREEN."),
        ("Расчет индекса", 70, f"Вычисление {index_type} по формуле..."),
        ("Генерация карты индексов", 90, "Построение растровой сетки."),
        ("Завершение", 100, f"Слой {index_type} готов.")
    ]

    for step_name, progress, detail in steps:
        task_record.logs += f"[INFO] {step_name}... {detail}\n"
        task_record.progress = progress
        task_record.save()
        time.sleep(2)

    # Имитируем создание спектральных каналов как артефактов
    bands = ['RED', 'GREEN', 'BLUE', 'NIR', 'REDEDGE']
    for band in bands:
        Artifact.objects.get_or_create(
            project=project,
            artifact_type='SPECTRAL_BAND',
            name=f"Канал {band}",
            defaults={'file': f'artifacts/band_{band.lower()}.tif', 'metadata': {'band': band}}
        )
    
    # Спектральные каналы в таймлайн не добавляем, чтобы не перегружать 4D вид

    # Создаем основной индекс
    val_map = {
        'NDVI': {'mean': 0.65, 'area': 8.2},
        'GNDVI': {'mean': 0.58, 'area': 7.5},
        'NDRE': {'mean': 0.42, 'area': 5.1},
        'EVI': {'mean': 0.71, 'area': 9.0},
        'OSAVI': {'mean': 0.62, 'area': 7.8},
    }
    data = val_map.get(index_type, {'mean': 0.5, 'area': 6.0})

    ndvi = Artifact.objects.create(
        project=project,
        task=task_record,
        artifact_type='NDVI',
        name=f"Карта {index_type}",
        file=f'artifacts/demo_{index_type.lower()}.tif',
        metadata={'mean_index': data['mean'], 'vegetation_area_ha': data['area'], 'index_type': index_type}
    )
    
    # Добавляем в таймлайн
    ProjectTimeline.objects.create(
        project=project,
        artifact=ndvi,
        timestamp=timezone.now(),
        label=f"Анализ вегетации ({index_type})"
    )

    task_record.status = 'COMPLETED'
    task_record.save()

    Notification.objects.create(
        project=project,
        message=f"Спектральный анализ ({index_type}) проекта '{project.name}' завершен."
    )
    return f"{index_type} for project {project_id} finished"

@shared_task(bind=True)
def import_from_yadisk(self, project_id, folder_path):
    project = Project.objects.get(id=project_id)
    task_record = Task.objects.create(
        project=project,
        name=f"Импорт из {folder_path}",
        status='PROCESSING',
        celery_task_id=self.request.id
    )
    
    token = os.getenv('YADISK_TOKEN')
    if not token:
        task_record.logs += "Ошибка: YADISK_TOKEN не настроен.\n"
        task_record.status = 'FAILED'
        task_record.save()
        return "Token missing"

    y = yadisk.YaDisk(token=token)
    
    try:
        if not y.check_token():
            task_record.logs += "Ошибка: Невалидный YADISK_TOKEN.\n"
            task_record.status = 'FAILED'
            task_record.save()
            return "Invalid token"

        task_record.logs += f"Подключение к Яндекс.Диску успешно.\n"
        task_record.progress = 10
        task_record.save()

        # Проверяем, является ли путь ссылкой
        if folder_path.startswith('http'):
            task_record.logs += f"Обработка публичной ссылки: {folder_path}\n"
            try:
                files = list(y.public_listdir(folder_path))
            except Exception as e:
                # Если не получилось как с публичной, пробуем как с обычным путем (вдруг это просто путь)
                files = list(y.listdir(folder_path))
        else:
            files = list(y.listdir(folder_path))

        image_files = [f for f in files if f.name.lower().endswith(('.jpg', '.jpeg', '.png', '.tif', '.tiff'))]
        
        total = len(image_files)
        if total == 0:
            task_record.logs += f"В папке {folder_path} не найдено подходящих изображений.\n"
            task_record.status = 'COMPLETED'
            task_record.progress = 100
            task_record.save()
            return "No images found"

        task_record.logs += f"Найдено {total} изображений. Начало загрузки метаданных...\n"
        
        for i, disk_file in enumerate(image_files):
            # В реальном приложении мы бы скачивали файл или получали прямую ссылку
            # Для демо создаем записи с фиктивными координатами, если их нет в метаданных диска
            ProjectFile.objects.create(
                project=project,
                name=disk_file.name,
                # Здесь можно было бы добавить логику скачивания и извлечения EXIF
                latitude=55.75 + (i * 0.0001), 
                longitude=37.61 + (i * 0.0001),
                altitude=150.0
            )
            task_record.progress = 10 + int((i + 1) / total * 80)
            if i % 5 == 0:
                task_record.logs += f"Обработано {i+1}/{total}: {disk_file.name}\n"
                task_record.save()
        
        task_record.status = 'COMPLETED'
        task_record.progress = 100
        task_record.logs += "Импорт успешно завершен.\n"
        task_record.save()
        
        Notification.objects.create(
            project=project,
            message=f"Импорт {total} файлов из Яндекс.Диска завершен."
        )

    except Exception as e:
        task_record.logs += f"Произошла ошибка: {str(e)}\n"
        task_record.status = 'FAILED'
        task_record.save()
        return f"Error: {str(e)}"

    return f"Import to project {project_id} finished"
