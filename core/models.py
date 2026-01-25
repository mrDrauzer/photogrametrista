import os

from django.contrib.auth.models import User
from django.contrib.gis.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver
from django.utils.translation import gettext_lazy as _


class CRSDefinition(models.Model):
    name = models.CharField(_("Название СК"), max_length=255)
    epsg_code = models.IntegerField(_("Код EPSG"), null=True, blank=True)
    proj4_definition = models.TextField(_("Определение Proj4"), blank=True)
    is_custom = models.BooleanField(default=False)

    class Meta:
        verbose_name = _("Система координат")
        verbose_name_plural = _("Системы координат")

    def __str__(self):
        return f"{self.name} (EPSG:{self.epsg_code})"


class ProjectTemplate(models.Model):
    name = models.CharField(_("Название шаблона"), max_length=255)
    description = models.TextField(_("Описание"), blank=True)
    default_tags = models.JSONField(_("Теги по умолчанию"), default=list, blank=True)
    default_quality = models.CharField(
        _("Качество по умолчанию"), max_length=20, default="MEDIUM"
    )
    default_target_gsd = models.FloatField(
        _("Целевой GSD по умолчанию"), null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Шаблон проекта")
        verbose_name_plural = _("Шаблоны проекта")

    def __str__(self):
        return self.name


class ProjectCategory(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="categories")
    name = models.CharField(_("Название категории"), max_length=100)
    color = models.CharField(_("Цвет"), max_length=7, default="#2196f3")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Категория проекта")
        verbose_name_plural = _("Категории проектов")
        unique_together = ("owner", "name")

    def __str__(self):
        return self.name


class Project(models.Model):
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="projects", null=True, blank=True
    )
    template = models.ForeignKey(
        ProjectTemplate,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="projects",
    )
    category = models.ForeignKey(
        ProjectCategory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="projects",
    )
    name = models.CharField(_("Название"), max_length=255)
    description = models.TextField(_("Описание"), blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Геометрия проекта (область интереса)
    area = models.PolygonField(_("Область интереса"), null=True, blank=True)
    is_public = models.BooleanField(_("Публичный"), default=False)
    is_archived = models.BooleanField(_("Архивирован"), default=False)
    share_token = models.CharField(
        _("Токен доступа"), max_length=100, null=True, blank=True, unique=True
    )
    share_password = models.CharField(
        _("Пароль доступа"), max_length=128, null=True, blank=True
    )
    target_gsd = models.FloatField(_("Целевой GSD (см/пикс)"), null=True, blank=True)
    tags = models.JSONField(_("Теги"), default=list, blank=True)

    # Параметры обработки по умолчанию
    processing_quality = models.CharField(
        _("Качество обработки"), max_length=20, default="MEDIUM"
    )
    ortho_resolution = models.FloatField(
        _("Разрешение ортофото (см/пикс)"), null=True, blank=True
    )
    dsm_resolution = models.FloatField(
        _("Разрешение DSM (см/пикс)"), null=True, blank=True
    )
    optimize_mesh = models.BooleanField(_("Оптимизировать 3D модель"), default=True)

    class Meta:
        verbose_name = _("Проект")
        verbose_name_plural = _("Проекты")
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class ProjectFile(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="files")
    name = models.CharField(_("Имя файла"), max_length=255)
    file = models.FileField(_("Файл"), upload_to="projects/", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    # Метаданные (могут быть заполнены при обработке)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    altitude = models.FloatField(null=True, blank=True)

    class Meta:
        verbose_name = _("Файл проекта")
        verbose_name_plural = _("Файлы проекта")

    def __str__(self):
        return f"{self.name} ({self.project.name})"


class Task(models.Model):
    STATUS_CHOICES = [
        ("PENDING", _("Ожидание")),
        ("PROCESSING", _("Обработка")),
        ("COMPLETED", _("Завершено")),
        ("PARTIAL", _("Частично")),
        ("FAILED", _("Ошибка")),
    ]

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="tasks")
    branch = models.ForeignKey(
        "ProjectBranch",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tasks",
    )
    celery_task_id = models.CharField(
        max_length=255, unique=True, null=True, blank=True
    )
    name = models.CharField(_("Название задачи"), max_length=255)
    task_type = models.CharField(_("Тип задачи"), max_length=50, default="orthophoto")
    status = models.CharField(
        _("Статус"), max_length=20, choices=STATUS_CHOICES, default="PENDING"
    )
    quality_preset = models.CharField(
        _("Настройка качества"), max_length=20, default="MEDIUM"
    )
    progress = models.IntegerField(_("Прогресс"), default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    logs = models.TextField(_("Логи"), blank=True)

    class Meta:
        verbose_name = _("Задача")
        verbose_name_plural = _("Задачи")
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} - {self.project.name} ({self.status})"


class Notification(models.Model):
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="notifications"
    )
    message = models.CharField(_("Сообщение"), max_length=255)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Уведомление")
        verbose_name_plural = _("Уведомления")
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.project.name}: {self.message[:30]}"


class Artifact(models.Model):
    ARTIFACT_TYPES = [
        ("ORTHOPHOTO", _("Ортофотоплан")),
        ("DSM", _("Цифровая модель рельефа")),
        ("MODEL_3D", _("3D Модель")),
        ("POINT_CLOUD", _("Облако точек")),
        ("NDVI", _("Карта NDVI")),
        ("REPORT", _("Отчет")),
        ("KML", _("KML/KMZ Слой")),
        ("SPECTRAL_BAND", _("Спектральный канал")),
        ("CONTOUR_LINES", _("Изолинии (Горизонтали)")),
    ]

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="artifacts"
    )
    task = models.ForeignKey(
        Task, on_delete=models.SET_NULL, null=True, blank=True, related_name="artifacts"
    )
    branch = models.ForeignKey(
        "ProjectBranch",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="artifacts",
    )
    artifact_type = models.CharField(
        _("Тип артефакта"), max_length=20, choices=ARTIFACT_TYPES
    )
    file = models.FileField(_("Файл"), upload_to="artifacts/")
    version = models.IntegerField(_("Версия"), default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    metadata = models.JSONField(_("Метаданные"), default=dict, blank=True)
    name = models.CharField(_("Название файла"), max_length=255, null=True, blank=True)

    class Meta:
        verbose_name = _("Артефакт")
        verbose_name_plural = _("Артефакты")
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.get_artifact_type_display()} - {self.project.name}"


class Orthophoto(models.Model):
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="orthophotos"
    )
    name = models.CharField(_("Название ортофото"), max_length=200)
    file_path = models.CharField(max_length=500)
    bounds = models.PolygonField(_("Границы для отображения"))
    created_at = models.DateTimeField(auto_now_add=True)
    resolution = models.FloatField(_("GSD в метрах"))

    # Tile server URL для Leaflet
    tiles_url = models.CharField(max_length=500, blank=True)

    class Meta:
        db_table = "orthophotos"
        verbose_name = _("Ортофотоплан")
        verbose_name_plural = _("Ортофотопланы")

    def __str__(self):
        return self.name


class ProjectSnapshot(models.Model):
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="snapshots"
    )
    name = models.CharField(_("Название снимка"), max_length=255)
    description = models.TextField(_("Описание"), blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    # Снимок состояния на момент создания
    artifacts_count = models.IntegerField(default=0)
    files_count = models.IntegerField(default=0)

    class Meta:
        verbose_name = _("Снимок проекта")
        verbose_name_plural = _("Снимки проекта")
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} - {self.project.name} ({self.created_at.strftime('%Y-%m-%d')})"


class ProjectPresence(models.Model):
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="presence"
    )
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    last_seen = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("project", "user")


class ProjectBranch(models.Model):
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="branches"
    )
    name = models.CharField(_("Название ветки"), max_length=255)
    description = models.TextField(_("Описание"), blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    is_main = models.BooleanField(default=False)

    class Meta:
        verbose_name = _("Ветка проекта")
        verbose_name_plural = _("Ветки проекта")


class MeasuringResult(models.Model):
    MEASURE_TYPES = [
        ("DISTANCE", _("Расстояние")),
        ("AREA", _("Площадь")),
        ("VOLUME", _("Объем")),
    ]
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="measurements"
    )
    author = models.ForeignKey(User, on_delete=models.CASCADE)
    measure_type = models.CharField(
        _("Тип замера"), max_length=10, choices=MEASURE_TYPES
    )
    value = models.FloatField(_("Значение"))
    unit = models.CharField(_("Единица измерения"), max_length=10)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Замер")
        verbose_name_plural = _("Замеры")
        ordering = ["-created_at"]


class Annotation(models.Model):
    ANNOTATION_TYPES = [
        ("MAP", _("Карта")),
        ("MODEL_3D", _("3D Модель")),
    ]

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="annotations"
    )
    author = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    text = models.TextField(_("Текст заметки"))
    annotation_type = models.CharField(
        _("Тип"), max_length=20, choices=ANNOTATION_TYPES
    )

    # Координаты (JSON для гибкости: [lat, lon] или [x, y, z])
    position = models.JSONField(_("Позиция"))
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Аннотация")
        verbose_name_plural = _("Аннотации")
        ordering = ["-created_at"]

    def __str__(self):
        return f"Заметка от {self.author.username if self.author else 'System'} в {self.project.name}"


class ProjectShare(models.Model):
    ACCESS_CHOICES = [
        ("VIEW", _("Просмотр")),
        ("EDIT", _("Редактирование")),
    ]

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="shares"
    )
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="shared_projects"
    )
    access_level = models.CharField(
        _("Уровень доступа"), max_length=10, choices=ACCESS_CHOICES, default="VIEW"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Доступ к проекту")
        verbose_name_plural = _("Доступы к проектам")
        unique_together = ("project", "user")

    def __str__(self):
        return f"{self.user.username} - {self.project.name} ({self.access_level})"


class ActivityLog(models.Model):
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="activities"
    )
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    action = models.CharField(_("Действие"), max_length=255)
    details = models.TextField(_("Детали"), blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Лог активности")
        verbose_name_plural = _("Логи активности")
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.action} - {self.project.name} ({self.created_at})"


class Organization(models.Model):
    name = models.CharField(_("Название организации"), max_length=255)
    logo = models.ImageField(_("Логотип"), upload_to="branding/", null=True, blank=True)
    primary_color = models.CharField(
        _("Основной цвет"), max_length=7, default="#2196f3"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Организация")
        verbose_name_plural = _("Организации")

    def __str__(self):
        return self.name


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    organization = models.ForeignKey(
        Organization,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="members",
    )
    dark_mode = models.BooleanField(default=True)
    notifications_enabled = models.BooleanField(default=True)
    quality_preference = models.CharField(max_length=20, default="MEDIUM")
    language = models.CharField(max_length=10, default="ru")
    data_retention_days = models.IntegerField(
        _("Срок хранения данных (дней)"), default=365
    )

    # Квоты (Resource Quotas)
    max_projects = models.IntegerField(_("Макс. количество проектов"), default=10)
    max_storage_gb = models.FloatField(_("Макс. объем хранилища (ГБ)"), default=5.0)
    can_use_ai = models.BooleanField(_("Доступ к AI анализу"), default=True)

    def __str__(self):
        return f"Profile of {self.user.username}"


class QualityMetric(models.Model):
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="quality_metrics"
    )
    artifact = models.ForeignKey(
        Artifact, on_delete=models.CASCADE, related_name="quality_metrics"
    )
    gsd = models.FloatField(_("GSD (см/пикс)"))
    rmse_x = models.FloatField(_("RMSE X (м)"))
    rmse_y = models.FloatField(_("RMSE Y (м)"))
    rmse_z = models.FloatField(_("RMSE Z (м)"))
    overlap_mean = models.FloatField(_("Среднее перекрытие (%)"))
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Метрика качества")
        verbose_name_plural = _("Метрика качества")


class SurveyTask(models.Model):
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="surveys"
    )
    name = models.CharField(_("Название выезда"), max_length=255)
    inspector = models.ForeignKey(User, on_delete=models.CASCADE)
    date = models.DateField(_("Дата обследования"))
    notes = models.TextField(_("Заметки"), blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Полевой выезд")
        verbose_name_plural = _("Полевые выезды")


class SurveyPoint(models.Model):
    survey = models.ForeignKey(
        SurveyTask, on_delete=models.CASCADE, related_name="points"
    )
    location = models.PointField(_("Координаты"))
    photo = models.ImageField(_("Фото"), upload_to="surveys/")
    comment = models.TextField(_("Комментарий"), blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Точка обследования")
        verbose_name_plural = _("Точки обследования")


class WebhookConfig(models.Model):
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="webhooks"
    )
    url = models.URLField(_("Webhook URL"))
    secret = models.CharField(_("Secret Key"), max_length=255, blank=True)
    events = models.JSONField(
        _("Events"), default=list
    )  # e.g. ["task.completed", "artifact.created"]
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Вебхук")
        verbose_name_plural = _("Вебхуки")

    def __str__(self):
        return f"Webhook to {self.url} ({self.project.name})"


class DetectedObject(models.Model):
    OBJECT_TYPES = [
        ("VEHICLE", _("Транспорт")),
        ("BUILDING", _("Здание")),
        ("TREE", _("Дерево")),
        ("OTHER", _("Прочее")),
    ]
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="detected_objects"
    )
    object_type = models.CharField(
        _("Тип объекта"), max_length=20, choices=OBJECT_TYPES
    )
    confidence = models.FloatField(_("Уверенность"))
    location = models.JSONField(_("Местоположение (lat, lon)"))
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Обнаруженный объект")
        verbose_name_plural = _("Обнаруженные объекты")


class GCP(models.Model):
    GCP_TYPES = [
        ("CONTROL", _("Контрольная точка (GCP)")),
        ("CHECK", _("Проверочная точка (Check Point)")),
    ]
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="gcps")
    name = models.CharField(_("Название"), max_length=50)
    point_type = models.CharField(
        _("Тип"), max_length=10, choices=GCP_TYPES, default="CONTROL"
    )

    # Координаты (WGS-84)
    latitude = models.FloatField(_("Широта"))
    longitude = models.FloatField(_("Долгота"))
    altitude = models.FloatField(_("Высота"), null=True, blank=True)

    # Фактические координаты после обработки (для расчета ошибки)
    measured_lat = models.FloatField(null=True, blank=True)
    measured_lon = models.FloatField(null=True, blank=True)
    measured_alt = models.FloatField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Опорная точка")
        verbose_name_plural = _("Опорные точки")
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.get_point_type_display()})"


class FlightPlan(models.Model):
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="flight_plans"
    )
    name = models.CharField(_("Название миссии"), max_length=255)
    altitude = models.FloatField(_("Высота полета (м)"), default=100)
    speed = models.FloatField(_("Скорость (м/с)"), default=5)
    overlap_h = models.IntegerField(_("Продольное перекрытие (%)"), default=80)
    overlap_v = models.IntegerField(_("Поперечное перекрытие (%)"), default=70)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("План полета")
        verbose_name_plural = _("Планы полетов")


class FlightWaypoint(models.Model):
    plan = models.ForeignKey(
        FlightPlan, on_delete=models.CASCADE, related_name="waypoints"
    )
    order = models.IntegerField(default=0)
    latitude = models.FloatField()
    longitude = models.FloatField()
    altitude = models.FloatField(null=True, blank=True)

    class Meta:
        ordering = ["order"]


class ProjectTimeline(models.Model):
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="timeline"
    )
    artifact = models.ForeignKey(Artifact, on_delete=models.CASCADE)
    timestamp = models.DateTimeField()
    label = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["timestamp"]
        verbose_name = _("Таймлайн проекта")
        verbose_name_plural = _("Таймлайн проекта")


@receiver(post_delete, sender=ProjectFile)
def auto_delete_file_on_delete(sender, instance, **kwargs):
    if instance.file:
        if os.path.isfile(instance.file.path):
            os.remove(instance.file.path)


@receiver(post_delete, sender=Artifact)
def auto_delete_artifact_on_delete(sender, instance, **kwargs):
    if instance.file:
        if os.path.isfile(instance.file.path):
            os.remove(instance.file.path)
