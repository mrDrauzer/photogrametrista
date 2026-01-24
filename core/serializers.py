import json
import os

from django.conf import settings
from django.contrib.auth.models import User
from django.contrib.gis.geos import GEOSGeometry
from rest_framework import serializers
from rest_framework_gis.serializers import GeoModelSerializer

from .models import (GCP, ActivityLog, Annotation, Artifact, CRSDefinition,
                     DetectedObject, FlightPlan, FlightWaypoint,
                     MeasuringResult, Notification, Organization, Orthophoto,
                     Project, ProjectBranch, ProjectCategory, ProjectFile,
                     ProjectShare, ProjectSnapshot, ProjectTemplate,
                     ProjectTimeline, QualityMetric, SurveyPoint, SurveyTask,
                     Task, UserProfile, WebhookConfig)


class ProjectCategorySerializer(serializers.ModelSerializer):
    projects_count = serializers.IntegerField(source="projects.count", read_only=True)

    class Meta:
        model = ProjectCategory
        fields = ["id", "name", "color", "projects_count", "created_at"]
        read_only_fields = ["owner"]


class CRSDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = CRSDefinition
        fields = "__all__"


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ["id", "name", "logo", "primary_color"]


class UserProfileSerializer(serializers.ModelSerializer):
    organization_details = OrganizationSerializer(source="organization", read_only=True)

    class Meta:
        model = UserProfile
        fields = [
            "dark_mode",
            "notifications_enabled",
            "quality_preference",
            "language",
            "data_retention_days",
            "organization",
            "organization_details",
        ]


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    profile = UserProfileSerializer(read_only=True)

    class Meta:
        model = User
        fields = ("id", "username", "email", "password", "profile")

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data.get("email", ""),
            password=validated_data["password"],
        )
        return user


class ProjectFileSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectFile
        fields = [
            "id",
            "project",
            "name",
            "file",
            "created_at",
            "latitude",
            "longitude",
            "altitude",
        ]
        read_only_fields = ["latitude", "longitude", "altitude"]


class ProjectTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectTemplate
        fields = "__all__"


class ProjectSerializer(GeoModelSerializer):
    files_count = serializers.IntegerField(source="files.count", read_only=True)
    template_details = ProjectTemplateSerializer(source="template", read_only=True)
    category_details = ProjectCategorySerializer(source="category", read_only=True)
    has_password = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = [
            "id",
            "name",
            "description",
            "created_at",
            "updated_at",
            "area",
            "files_count",
            "is_public",
            "is_archived",
            "owner",
            "tags",
            "template",
            "template_details",
            "category",
            "category_details",
            "share_token",
            "has_password",
            "processing_quality",
            "ortho_resolution",
            "dsm_resolution",
            "optimize_mesh",
            "target_gsd",
        ]
        read_only_fields = ["owner", "share_token"]

    def get_has_password(self, obj):
        return bool(obj.share_password)

    def validate_area(self, value):
        if value:
            # ВАЖНО: Django SpatialProxy ожидает объект GEOSGeometry.
            # Если пришел словарь (GeoJSON), принудительно конвертируем его.
            if isinstance(value, dict):
                geom_type = value.get("type")
                coords = value.get("coordinates")
                if geom_type != "Polygon":
                    raise serializers.ValidationError("Area must be a Polygon.")
                if not coords or len(coords[0]) < 4:
                    raise serializers.ValidationError(
                        "Polygon must have at least 4 points (including the closing point)."
                    )
                try:
                    # json.dumps обязателен, чтобы GEOSGeometry корректно распознал формат
                    return GEOSGeometry(json.dumps(value))
                except Exception as e:
                    raise serializers.ValidationError(f"Invalid geometry: {e}")
            else:
                # Если уже объект GEOSGeometry
                if value.geom_type != "Polygon":
                    raise serializers.ValidationError("Area must be a Polygon.")
                if len(value.coords[0]) < 4:
                    raise serializers.ValidationError(
                        "Polygon must have at least 4 points (including the closing point)."
                    )
        return value


class TaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = "__all__"


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = "__all__"


class ArtifactSerializer(serializers.ModelSerializer):
    artifact_type_display = serializers.CharField(
        source="get_artifact_type_display", read_only=True
    )

    class Meta:
        model = Artifact
        fields = [
            "id",
            "project",
            "task",
            "artifact_type",
            "artifact_type_display",
            "file",
            "version",
            "created_at",
            "metadata",
            "name",
        ]


class ProjectSnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectSnapshot
        fields = "__all__"


class ProjectShareSerializer(serializers.ModelSerializer):
    user_username = serializers.ReadOnlyField(source="user.username")

    class Meta:
        model = ProjectShare
        fields = [
            "id",
            "project",
            "user",
            "user_username",
            "access_level",
            "created_at",
        ]


class MeasuringResultSerializer(serializers.ModelSerializer):
    author_username = serializers.ReadOnlyField(source="author.username")

    class Meta:
        model = MeasuringResult
        fields = [
            "id",
            "project",
            "author",
            "author_username",
            "measure_type",
            "value",
            "unit",
            "created_at",
        ]
        read_only_fields = ["author"]


class AnnotationSerializer(serializers.ModelSerializer):
    author_username = serializers.ReadOnlyField(source="author.username")

    class Meta:
        model = Annotation
        fields = [
            "id",
            "project",
            "author",
            "author_username",
            "text",
            "annotation_type",
            "position",
            "created_at",
        ]
        read_only_fields = ["author"]


class ActivityLogSerializer(serializers.ModelSerializer):
    user_username = serializers.ReadOnlyField(source="user.username")

    class Meta:
        model = ActivityLog
        fields = [
            "id",
            "project",
            "user",
            "user_username",
            "action",
            "details",
            "created_at",
        ]


class QualityMetricSerializer(serializers.ModelSerializer):
    class Meta:
        model = QualityMetric
        fields = "__all__"


class SurveyPointSerializer(serializers.ModelSerializer):
    class Meta:
        model = SurveyPoint
        fields = "__all__"


class SurveyTaskSerializer(serializers.ModelSerializer):
    points = SurveyPointSerializer(many=True, read_only=True)
    inspector_username = serializers.ReadOnlyField(source="inspector.username")

    class Meta:
        model = SurveyTask
        fields = [
            "id",
            "project",
            "name",
            "inspector",
            "inspector_username",
            "date",
            "notes",
            "points",
            "created_at",
        ]


class ProjectBranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectBranch
        fields = "__all__"


class WebhookConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = WebhookConfig
        fields = "__all__"


class GCPSerializer(serializers.ModelSerializer):
    point_type_display = serializers.CharField(
        source="get_point_type_display", read_only=True
    )

    class Meta:
        model = GCP
        fields = "__all__"


class FlightWaypointSerializer(serializers.ModelSerializer):
    class Meta:
        model = FlightWaypoint
        fields = "__all__"


class FlightPlanSerializer(serializers.ModelSerializer):
    waypoints = FlightWaypointSerializer(many=True, read_only=True)

    class Meta:
        model = FlightPlan
        fields = [
            "id",
            "project",
            "name",
            "altitude",
            "speed",
            "overlap_h",
            "overlap_v",
            "waypoints",
            "created_at",
        ]


class ProjectTimelineSerializer(serializers.ModelSerializer):
    artifact_details = ArtifactSerializer(source="artifact", read_only=True)

    class Meta:
        model = ProjectTimeline
        fields = ["id", "project", "artifact", "artifact_details", "timestamp", "label"]


class DetectedObjectSerializer(serializers.ModelSerializer):
    object_type_display = serializers.CharField(
        source="get_object_type_display", read_only=True
    )

    class Meta:
        model = DetectedObject
        fields = [
            "id",
            "project",
            "object_type",
            "object_type_display",
            "confidence",
            "location",
            "created_at",
        ]


class OrthophotoSerializer(GeoModelSerializer):
    file_size = serializers.SerializerMethodField()

    class Meta:
        model = Orthophoto
        fields = [
            "id",
            "project",
            "name",
            "file_path",
            "bounds",
            "created_at",
            "resolution",
            "tiles_url",
            "file_size",
        ]

    def get_file_size(self, obj):
        try:
            full_path = os.path.join(settings.MEDIA_ROOT, obj.file_path)
            return os.path.getsize(full_path)
        except:
            return 0
