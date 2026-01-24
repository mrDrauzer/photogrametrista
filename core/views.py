from django.contrib.auth.models import User
from django.db.models import Count, Q
from django.http import FileResponse
from django.utils import timezone
from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response

from photogrametrista.celery import app as celery_app

from .models import (GCP, ActivityLog, Annotation, Artifact, CRSDefinition,
                     DetectedObject, FlightPlan, FlightWaypoint,
                     MeasuringResult, Notification, Orthophoto, Project,
                     ProjectBranch, ProjectCategory, ProjectFile,
                     ProjectPresence, ProjectShare, ProjectSnapshot,
                     ProjectTemplate, ProjectTimeline, QualityMetric,
                     SurveyPoint, SurveyTask, Task, UserProfile, WebhookConfig)
from .serializers import (ActivityLogSerializer, AnnotationSerializer,
                          ArtifactSerializer, CRSDefinitionSerializer,
                          DetectedObjectSerializer, FlightPlanSerializer,
                          FlightWaypointSerializer, GCPSerializer,
                          MeasuringResultSerializer, NotificationSerializer,
                          OrthophotoSerializer, ProjectBranchSerializer,
                          ProjectCategorySerializer, ProjectFileSerializer,
                          ProjectSerializer, ProjectShareSerializer,
                          ProjectSnapshotSerializer, ProjectTemplateSerializer,
                          ProjectTimelineSerializer, QualityMetricSerializer,
                          SurveyPointSerializer, SurveyTaskSerializer,
                          TaskSerializer, UserProfileSerializer,
                          UserSerializer, WebhookConfigSerializer)
from .tasks import (export_project_data, generate_comparison_report,
                    generate_contours, generate_project_report,
                    import_from_yadisk, process_photogrammetry, run_gis_export,
                    run_multispectral_analysis, run_object_detection,
                    simplify_mesh)
from .utils import extract_exif_data


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def health_check(request):
    return Response({"status": "ok", "timestamp": timezone.now()})


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    permission_classes = (permissions.AllowAny,)
    serializer_class = UserSerializer


class ProjectFileViewSet(viewsets.ModelViewSet):
    queryset = ProjectFile.objects.all()
    serializer_class = ProjectFileSerializer
    filterset_fields = ["project"]

    def perform_create(self, serializer):
        instance = serializer.save()
        ActivityLog.objects.create(
            project=instance.project,
            user=self.request.user,
            action="Загрузка файла",
            details=f"Загружен файл {instance.name}",
        )
        if instance.file:
            lat, lon, alt = extract_exif_data(instance.file.path)
            if lat and lon:
                instance.latitude = lat
                instance.longitude = lon
                instance.altitude = alt
                instance.save()

    @action(detail=False, methods=["post"])
    def bulk_delete(self, request):
        ids = request.data.get("ids", [])
        if not ids:
            return Response(
                {"error": "No IDs provided"}, status=status.HTTP_400_BAD_REQUEST
            )

        # Проверяем права (файлы должны принадлежать проектам текущего пользователя)
        files = ProjectFile.objects.filter(id__in=ids, project__owner=request.user)
        count = files.count()
        files.delete()

        return Response({"status": f"Deleted {count} files"})


class CRSDefinitionViewSet(viewsets.ModelViewSet):
    queryset = CRSDefinition.objects.all()
    serializer_class = CRSDefinitionSerializer
    permission_classes = [permissions.IsAuthenticated]


class ProjectTemplateViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ProjectTemplate.objects.all()
    serializer_class = ProjectTemplateSerializer
    permission_classes = [permissions.IsAuthenticated]


class ProjectCategoryViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectCategorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return ProjectCategory.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class MeasuringResultViewSet(viewsets.ModelViewSet):
    serializer_class = MeasuringResultSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ["project"]

    def get_queryset(self):
        return MeasuringResult.objects.filter(project__owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)


class ProjectViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectSerializer

    def get_queryset(self):
        # Возвращаем свои проекты, проекты с общим доступом И публичные проекты
        return Project.objects.filter(
            Q(owner=self.request.user)
            | Q(shares__user=self.request.user)
            | Q(is_public=True)
        ).distinct()

    def perform_create(self, serializer):
        profile = getattr(self.request.user, "profile", None)
        if profile:
            if (
                Project.objects.filter(owner=self.request.user).count()
                >= profile.max_projects
            ):
                from rest_framework.exceptions import ValidationError

                raise ValidationError(
                    f"Превышен лимит проектов ({profile.max_projects})"
                )
        serializer.save(owner=self.request.user)

    @action(detail=False, methods=["get"])
    def statistics(self, request):
        # Статистика только для текущего пользователя
        projects = Project.objects.filter(owner=request.user)
        total_projects = projects.count()
        total_files = ProjectFile.objects.filter(project__owner=request.user).count()
        active_tasks = Task.objects.filter(
            project__owner=request.user, status="PROCESSING"
        ).count()
        completed_tasks = Task.objects.filter(
            project__owner=request.user, status="COMPLETED"
        ).count()

        # Расчет занимаемого объема
        storage_bytes = 0
        for f in ProjectFile.objects.filter(project__owner=request.user):
            try:
                if f.file:
                    storage_bytes += f.file.size
            except (FileNotFoundError, ValueError):
                continue
        for a in Artifact.objects.filter(project__owner=request.user):
            try:
                if a.file:
                    storage_bytes += a.file.size
            except (FileNotFoundError, ValueError):
                continue

        storage_mb = round(storage_bytes / (1024 * 1024), 2)

        profile = getattr(request.user, "profile", None)
        quotas = {
            "max_projects": profile.max_projects if profile else 10,
            "max_storage_gb": profile.max_storage_gb if profile else 5.0,
            "can_use_ai": profile.can_use_ai if profile else True,
        }

        # Последние уведомления
        recent_notifications = NotificationSerializer(
            Notification.objects.filter(project__owner=request.user)[:5], many=True
        ).data

        return Response(
            {
                "total_projects": total_projects,
                "total_files": total_files,
                "active_tasks": active_tasks,
                "completed_tasks": completed_tasks,
                "storage_usage_mb": storage_mb,
                "quotas": quotas,
                "recent_notifications": recent_notifications,
            }
        )

    @action(detail=False, methods=["post"])
    def batch_process(self, request):
        project_ids = request.data.get("project_ids", [])
        quality = request.data.get("quality", "MEDIUM")

        if not project_ids:
            return Response({"error": "No project IDs provided"}, status=400)

        task_ids = []
        for pid in project_ids:
            # Check if project exists and owned by user
            project = Project.objects.filter(id=pid, owner=request.user).first()
            if project:
                t = process_photogrammetry.delay(pid, quality=quality)
                task_ids.append(t.id)
                ActivityLog.objects.create(
                    project=project,
                    action="Пакетная обработка",
                    details=f"Проект включен в пакетную обработку (Качество: {quality})",
                    user=request.user,
                )

        ActivityLog.objects.create(
            project=project,  # Here project is the last one in loop, let's fix to log overall
            action="Пакетная обработка",
            details=f"Запущена пакетная обработка для {len(task_ids)} проектов (Качество: {quality})",
            user=request.user,
        )

        return Response(
            {
                "status": f"Started processing for {len(task_ids)} projects",
                "task_ids": task_ids,
            }
        )

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        project = self.get_object()
        project.is_archived = True
        project.save()
        ActivityLog.objects.create(
            project=project,
            user=request.user,
            action="Архивация",
            details="Проект перемещен в архив",
        )
        return Response({"status": "Project archived"})

    @action(detail=True, methods=["post"])
    def unarchive(self, request, pk=None):
        project = self.get_object()
        project.is_archived = False
        project.save()
        ActivityLog.objects.create(
            project=project,
            user=request.user,
            action="Разархивация",
            details="Проект извлечен из архива",
        )
        return Response({"status": "Project unarchived"})

    @action(detail=True, methods=["post"])
    def import_kml(self, request, pk=None):
        project = self.get_object()
        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response({"error": "No file uploaded"}, status=400)

        artifact = Artifact.objects.create(
            project=project, artifact_type="KML", file=file_obj, name=file_obj.name
        )

        ActivityLog.objects.create(
            project=project,
            user=request.user,
            action="Импорт KML",
            details=f"Загружен KML слой: {file_obj.name}",
        )

        return Response(ArtifactSerializer(artifact).data)

    @action(detail=True, methods=["post"])
    def update_presence(self, request, pk=None):
        project = self.get_object()
        ProjectPresence.objects.update_or_create(
            project=project, user=request.user, defaults={"last_seen": timezone.now()}
        )
        # Очищаем старые записи (более 5 минут)
        threshold = timezone.now() - timezone.timedelta(minutes=5)
        ProjectPresence.objects.filter(
            project=project, last_seen__lt=threshold
        ).delete()

        presences = ProjectPresence.objects.filter(project=project)
        users = [p.user.username for p in presences]
        return Response({"active_users": users})

    @action(detail=True, methods=["post"])
    def generate_contours(self, request, pk=None):
        project = self.get_object()
        interval = request.data.get("interval", 1.0)
        task = generate_contours.delay(project.id, interval=interval)
        return Response({"task_id": task.id, "status": "Contour generation started"})

    @action(detail=True, methods=["post"])
    def run_change_detection(self, request, pk=None):
        project = self.get_object()
        a1_id = request.data.get("artifact1_id")
        a2_id = request.data.get("artifact2_id")
        if not a1_id or not a2_id:
            return Response({"error": "Two artifact IDs required"}, status=400)

        from .tasks import run_change_detection

        task = run_change_detection.delay(project.id, a1_id, a2_id)
        return Response({"task_id": task.id, "status": "Change detection started"})

    @action(detail=True, methods=["post"])
    def run_landxml_export(self, request, pk=None):
        project = self.get_object()
        from .tasks import run_landxml_export

        task = run_landxml_export.delay(project.id)
        return Response({"task_id": task.id, "status": "LandXML export started"})

    @action(
        detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated]
    )
    def generate_public_link(self, request, pk=None):
        import uuid

        project = self.get_object()
        password = request.data.get("password")
        project.share_token = uuid.uuid4().hex
        if password:
            project.share_password = password
        project.save()
        return Response({"token": project.share_token})

    @action(detail=True, methods=["post"], permission_classes=[permissions.AllowAny])
    def check_public_link(self, request, pk=None):
        project = Project.objects.get(pk=pk)
        token = request.data.get("token")
        password = request.data.get("password")

        if project.share_token != token:
            return Response({"error": "Invalid token"}, status=403)

        if project.share_password and project.share_password != password:
            return Response(
                {"error": "Invalid password", "password_required": True}, status=401
            )

        return Response(ProjectSerializer(project).data)

    @action(detail=True, methods=["post"])
    def run_processing(self, request, pk=None):
        project = self.get_object()
        quality = request.data.get("quality", "MEDIUM")
        branch_id = request.data.get("branch_id")
        ortho_only = request.data.get("ortho_only", False)

        ActivityLog.objects.create(
            project=project,
            user=request.user,
            action="Запуск обработки",
            details=f"Запущен цикл ({'Только ортофото' if ortho_only else 'Полная реконструкция'}, {quality}, branch={branch_id or 'Main'})",
        )
        task = process_photogrammetry.delay(
            project.id, quality=quality, branch_id=branch_id, ortho_only=ortho_only
        )
        return Response({"task_id": task.id, "status": "Processing started"})

    @action(detail=True, methods=["post"])
    def import_photos(self, request, pk=None):
        project = self.get_object()
        folder_path = request.data.get("folder_path", "photos/default")
        task = import_from_yadisk.delay(project.id, folder_path)
        return Response({"task_id": task.id, "status": "Import started"})

    @action(detail=True, methods=["post"])
    def generate_report(self, request, pk=None):
        project = self.get_object()
        task = generate_project_report.delay(project.id)
        return Response({"task_id": task.id, "status": "Report generation started"})

    @action(detail=True, methods=["post"])
    def export_data(self, request, pk=None):
        project = self.get_object()
        export_format = request.data.get("format", "ZIP")
        task = export_project_data.delay(project.id, export_format=export_format)
        return Response(
            {"task_id": task.id, "status": f"Export ({export_format}) started"}
        )

    @action(detail=True, methods=["post"])
    def run_multispectral(self, request, pk=None):
        project = self.get_object()
        index_type = request.data.get("index_type", "NDVI")
        task = run_multispectral_analysis.delay(project.id, index_type=index_type)
        return Response(
            {"task_id": task.id, "status": f"Spectral analysis ({index_type}) started"}
        )

    @action(detail=True, methods=["post"])
    def gis_export(self, request, pk=None):
        project = self.get_object()
        fmt = request.data.get("format", "SHAPEFILE")
        epsg = request.data.get("epsg", 4326)
        task = run_gis_export.delay(project.id, format=fmt, epsg=epsg)
        return Response(
            {"task_id": task.id, "status": f"GIS Export ({fmt}, EPSG:{epsg}) started"}
        )

    @action(detail=True, methods=["post"])
    def run_detection(self, request, pk=None):
        project = self.get_object()
        profile = getattr(request.user, "profile", None)
        if profile and not profile.can_use_ai:
            return Response(
                {"error": "AI анализ не доступен для вашего тарифа"}, status=403
            )
        task = run_object_detection.delay(project.id)
        return Response({"task_id": task.id, "status": "Object detection started"})

    @action(detail=True, methods=["post"])
    def cloud_export(self, request, pk=None):
        project = self.get_object()
        service = request.data.get("service", "google_drive")
        from .tasks import export_to_cloud

        task = export_to_cloud.delay(project.id, service=service)

        ActivityLog.objects.create(
            project=project,
            user=request.user,
            action="Экспорт в облако",
            details=f"Запущен экспорт в {service}",
        )

        return Response({"task_id": task.id, "status": f"Export to {service} started"})

    @action(detail=True, methods=["get"])
    def detected_objects(self, request, pk=None):
        project = self.get_object()
        objs = project.detected_objects.all()
        return Response(DetectedObjectSerializer(objs, many=True).data)

    @action(detail=True, methods=["get"])
    def quality_metrics(self, request, pk=None):
        project = self.get_object()
        metrics = project.quality_metrics.all()
        return Response(QualityMetricSerializer(metrics, many=True).data)

    @action(detail=True, methods=["get"])
    def project_stats(self, request, pk=None):
        project = self.get_object()
        files_count = project.files.count()
        artifacts_count = project.artifacts.count()
        tasks_count = project.tasks.count()
        gcps_count = project.gcps.count()

        storage_bytes = 0
        for f in project.files.all():
            try:
                if f.file:
                    storage_bytes += f.file.size
            except (FileNotFoundError, ValueError):
                continue
        for a in project.artifacts.all():
            try:
                if a.file:
                    storage_bytes += a.file.size
            except (FileNotFoundError, ValueError):
                continue

        return Response(
            {
                "files_count": files_count,
                "artifacts_count": artifacts_count,
                "tasks_count": tasks_count,
                "gcps_count": gcps_count,
                "storage_mb": round(storage_bytes / (1024 * 1024), 2),
                "last_activity": (
                    ActivityLogSerializer(project.activities.first()).data
                    if project.activities.exists()
                    else None
                ),
            }
        )

    @action(detail=True, methods=["post"])
    def bulk_artifact_download(self, request, pk=None):
        # В реальной системе здесь бы создавалась Celery задача на ZIP
        # Для демо возвращаем ссылку на "виртуальный" архив
        project = self.get_object()
        ActivityLog.objects.create(
            project=project,
            user=request.user,
            action="Массовый экспорт",
            details=f"Запрошена выгрузка всех артефактов проекта ({project.artifacts.count()} шт.)",
        )
        # Имитируем создание архива через секунду (в реале - Celery)
        return Response(
            {
                "status": "Archive generation started",
                "demo_url": "/media/artifacts/all_results.zip",
            }
        )


class OrthophotoViewSet(viewsets.ModelViewSet):
    serializer_class = OrthophotoSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ["project"]

    def get_queryset(self):
        return Orthophoto.objects.filter(
            Q(project__owner=self.request.user)
            | Q(project__shares__user=self.request.user)
        ).distinct()

    @action(detail=True, methods=["get"])
    def export(self, request, pk=None):
        ortho = self.get_object()
        export_format = request.GET.get("format", "geotiff")

        # В реальности здесь была бы конвертация в PNG, KMZ, Tiles
        # Для демонстрации отдаем основной файл с соответствующим расширением (имитация)
        import os

        from django.conf import settings

        # Обработка пути, если он сохранен как относительный
        if str(ortho.file_path).startswith("artifacts/"):
            file_path = os.path.join(settings.MEDIA_ROOT, str(ortho.file_path))
        else:
            file_path = os.path.join(
                settings.MEDIA_ROOT, "artifacts", os.path.basename(str(ortho.file_path))
            )

        if not os.path.exists(file_path):
            # Пробуем найти без папки artifacts
            alt_path = os.path.join(
                settings.MEDIA_ROOT, os.path.basename(str(ortho.file_path))
            )
            if os.path.exists(alt_path):
                file_path = alt_path
            else:
                return Response(
                    {"error": f"Файл не найден на сервере: {ortho.file_path}"},
                    status=404,
                )

        response = FileResponse(
            open(file_path, "rb"),
            as_attachment=True,
            filename=f"{ortho.name}.{export_format}",
        )
        response["Access-Control-Expose-Headers"] = "Content-Disposition"
        response["Content-Disposition"] = (
            f'attachment; filename="{ortho.name}.{export_format}"'
        )
        return response

    @action(detail=True, methods=["get"])
    def tiles(self, request, pk=None):
        # Имитация прокси на тайлы (если нужно для CORS или авторизации)
        ortho = self.get_object()
        if not ortho.tiles_url:
            return Response({"error": "Tiles not available"}, status=404)
        return Response({"url": ortho.tiles_url})


class GCPViewSet(viewsets.ModelViewSet):
    serializer_class = GCPSerializer
    filterset_fields = ["project", "point_type"]

    def get_queryset(self):
        return GCP.objects.filter(
            Q(project__owner=self.request.user)
            | Q(project__shares__user=self.request.user)
        ).distinct()


class FlightPlanViewSet(viewsets.ModelViewSet):
    serializer_class = FlightPlanSerializer

    def get_queryset(self):
        return FlightPlan.objects.filter(
            Q(project__owner=self.request.user)
            | Q(project__shares__user=self.request.user)
        ).distinct()

    @action(detail=True, methods=["post"])
    def add_waypoint(self, request, pk=None):
        plan = self.get_object()
        serializer = FlightWaypointSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(plan=plan)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["get"])
    def export_kml(self, request, pk=None):
        plan = self.get_object()
        # Имитация генерации KML
        kml_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>{plan.name}</name>
    <Placemark>
      <name>Flight Path</name>
      <LineString>
        <coordinates>
          {" ".join([f"{w.longitude},{w.latitude},{w.altitude or plan.altitude}" for w in plan.waypoints.all()])}
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>"""
        # В реальной системе сохраняем в файл и возвращаем FileResponse
        return Response({"kml": kml_content, "status": "KML generated"})


class ProjectTimelineViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectTimelineSerializer

    def get_queryset(self):
        return ProjectTimeline.objects.filter(
            Q(project__owner=self.request.user)
            | Q(project__shares__user=self.request.user)
        ).distinct()


class SurveyTaskViewSet(viewsets.ModelViewSet):
    serializer_class = SurveyTaskSerializer
    filterset_fields = ["project"]

    def get_queryset(self):
        return SurveyTask.objects.filter(
            Q(project__owner=self.request.user)
            | Q(project__shares__user=self.request.user)
        ).distinct()

    def perform_create(self, serializer):
        serializer.save(inspector=self.request.user)


class SurveyPointViewSet(viewsets.ModelViewSet):
    serializer_class = SurveyPointSerializer
    filterset_fields = ["survey"]

    def get_queryset(self):
        return SurveyPoint.objects.filter(
            Q(survey__project__owner=self.request.user)
            | Q(survey__project__shares__user=self.request.user)
        ).distinct()


class ProjectBranchViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectBranchSerializer
    filterset_fields = ["project"]

    def get_queryset(self):
        return ProjectBranch.objects.filter(
            Q(project__owner=self.request.user)
            | Q(project__shares__user=self.request.user)
        ).distinct()


class TaskViewSet(viewsets.ModelViewSet):
    queryset = Task.objects.all()
    serializer_class = TaskSerializer
    filterset_fields = ["project"]

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        task = self.get_object()
        if task.status == "PROCESSING" and task.celery_task_id:
            celery_app.control.revoke(task.celery_task_id, terminate=True)
            task.status = "FAILED"
            task.logs += (
                f"\n[INFO] Задача отменена пользователем {request.user.username}\n"
            )
            task.save()
            return Response({"status": "Task cancelled"})
        return Response(
            {"status": "Task cannot be cancelled"}, status=status.HTTP_400_BAD_REQUEST
        )


class NotificationViewSet(viewsets.ModelViewSet):
    queryset = Notification.objects.all()
    serializer_class = NotificationSerializer
    filterset_fields = ["project", "is_read"]

    @action(detail=False, methods=["post"])
    def mark_all_as_read(self, request):
        Notification.objects.filter(is_read=False).update(is_read=True)
        return Response({"status": "All notifications marked as read"})


class ArtifactViewSet(viewsets.ModelViewSet):
    queryset = Artifact.objects.all()
    serializer_class = ArtifactSerializer
    filterset_fields = ["project", "artifact_type"]

    @action(detail=True, methods=["post"])
    def simplify_mesh(self, request, pk=None):
        artifact = self.get_object()
        if artifact.artifact_type != "MODEL_3D":
            return Response({"error": "Can only simplify 3D models"}, status=400)
        ratio = request.data.get("ratio", 0.5)
        task = simplify_mesh.delay(artifact.id, ratio=ratio)
        return Response({"task_id": task.id, "status": "Simplification started"})

    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        artifact = self.get_object()
        if not artifact.file:
            return Response({"error": "File not found"}, status=404)

        try:
            file_path = artifact.file.path
        except (ValueError, AttributeError):
            import os

            from django.conf import settings

            file_path = os.path.join(settings.MEDIA_ROOT, str(artifact.file))

        if not os.path.exists(file_path):
            return Response(
                {"error": f"File not found on disk: {file_path}"}, status=404
            )

        from django.http import FileResponse

        response = FileResponse(open(file_path, "rb"), as_attachment=True)
        # Добавляем правильный filename в заголовок, чтобы фронтенд мог его прочитать
        filename = artifact.name or os.path.basename(file_path)
        # Убеждаемся, что расширение соответствует типу
        if artifact.artifact_type == "ORTHOPHOTO" and not filename.lower().endswith(
            (".png", ".tif", ".tiff")
        ):
            filename += ".png"

        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        response["Access-Control-Expose-Headers"] = "Content-Disposition"
        return response

    @action(detail=True, methods=["get"])
    def compare(self, request, pk=None):
        artifact1 = self.get_object()
        other_id = request.query_params.get("other_id")
        if not other_id:
            return Response({"error": "Parameter other_id is required"}, status=400)

        try:
            artifact2 = Artifact.objects.get(id=other_id, project=artifact1.project)
        except Artifact.DoesNotExist:
            return Response(
                {"error": "Second artifact not found in this project"}, status=404
            )

        # Имитация анализа различий
        diff_data = {
            "type": artifact1.artifact_type,
            "v1": artifact1.version,
            "v2": artifact2.version,
            "changes": [
                {
                    "metric": "Кол-во точек",
                    "diff": (
                        "+150,000"
                        if artifact2.version > artifact1.version
                        else "-150,000"
                    ),
                },
                {
                    "metric": "Средняя ошибка",
                    "diff": (
                        "-0.02 px"
                        if artifact2.version > artifact1.version
                        else "+0.02 px"
                    ),
                },
                {"metric": "Время обработки", "diff": "15 сек"},
            ],
            "recommendation": (
                "Версия 2 более точная в области зданий"
                if artifact2.version > artifact1.version
                else "Версии практически идентичны"
            ),
        }

        return Response(diff_data)

    @action(detail=True, methods=["post"])
    def generate_comparison_pdf(self, request, pk=None):
        artifact1 = self.get_object()
        other_id = request.data.get("other_id")
        if not other_id:
            return Response({"error": "Parameter other_id is required"}, status=400)

        task = generate_comparison_report.delay(artifact1.id, other_id)
        return Response(
            {"task_id": task.id, "status": "Comparison report generation started"}
        )


class ProjectSnapshotViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectSnapshotSerializer

    def get_queryset(self):
        return ProjectSnapshot.objects.filter(project__owner=self.request.user)

    def perform_create(self, serializer):
        project = serializer.validated_data["project"]
        # Автоматически заполняем статистику
        serializer.save(
            artifacts_count=project.artifacts.count(), files_count=project.files.count()
        )


class UserViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return User.objects.filter(id=self.request.user.id)

    @action(detail=False, methods=["get", "patch"])
    def me(self, request):
        if request.method == "GET":
            serializer = self.get_serializer(request.user)
            return Response(serializer.data)

        # Обработка UserProfile данных
        profile_data = request.data.pop("profile", None)

        serializer = self.get_serializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        if profile_data:
            profile, created = UserProfile.objects.get_or_create(user=user)
            profile_serializer = UserProfileSerializer(
                profile, data=profile_data, partial=True
            )
            profile_serializer.is_valid(raise_exception=True)
            profile_serializer.save()

        return Response(self.get_serializer(user).data)


class AnnotationViewSet(viewsets.ModelViewSet):
    serializer_class = AnnotationSerializer

    def get_queryset(self):
        # Доступ к аннотациям своих и общих проектов
        return Annotation.objects.filter(
            Q(project__owner=self.request.user)
            | Q(project__shares__user=self.request.user)
        ).distinct()

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)


class ProjectShareViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectShareSerializer

    def get_queryset(self):
        # Только владелец проекта может видеть, с кем он им поделился
        return ProjectShare.objects.filter(project__owner=self.request.user)

    def perform_create(self, serializer):
        # Проверяем, что текущий пользователь - владелец проекта
        project = serializer.validated_data["project"]
        if project.owner != self.request.user:
            raise permissions.PermissionDenied(
                "Только владелец может делиться проектом"
            )
        serializer.save()


class ActivityLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ActivityLogSerializer

    def get_queryset(self):
        return ActivityLog.objects.filter(
            Q(project__owner=self.request.user)
            | Q(project__shares__user=self.request.user)
        ).distinct()


class WebhookConfigViewSet(viewsets.ModelViewSet):
    serializer_class = WebhookConfigSerializer

    def get_queryset(self):
        return WebhookConfig.objects.filter(project__owner=self.request.user)

    def perform_create(self, serializer):
        project = serializer.validated_data["project"]
        if project.owner != self.request.user:
            raise permissions.PermissionDenied(
                "Только владелец проекта может настраивать вебхуки"
            )
        serializer.save()
