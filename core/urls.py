from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (ActivityLogViewSet, AnnotationViewSet, ArtifactViewSet,
                    CRSDefinitionViewSet, FlightPlanViewSet, GCPViewSet,
                    MeasuringResultViewSet, NotificationViewSet,
                    OrthophotoViewSet, ProjectBranchViewSet,
                    ProjectCategoryViewSet, ProjectFileViewSet,
                    ProjectShareViewSet, ProjectSnapshotViewSet,
                    ProjectTemplateViewSet, ProjectTimelineViewSet,
                    ProjectViewSet, RegisterView, SurveyPointViewSet,
                    SurveyTaskViewSet, TaskViewSet, UserViewSet,
                    WebhookConfigViewSet, health_check)

router = DefaultRouter()
router.register(r"projects", ProjectViewSet, basename="project")
router.register(r"orthophotos", OrthophotoViewSet, basename="orthophoto")
router.register(r"categories", ProjectCategoryViewSet, basename="category")
router.register(r"measurements", MeasuringResultViewSet, basename="measurement")
router.register(r"timeline", ProjectTimelineViewSet, basename="timeline")
router.register(r"flight-plans", FlightPlanViewSet, basename="flight-plan")
router.register(r"templates", ProjectTemplateViewSet, basename="template")
router.register(r"branches", ProjectBranchViewSet, basename="branch")
router.register(r"crs", CRSDefinitionViewSet, basename="crs")
router.register(r"tasks", TaskViewSet)
router.register(r"files", ProjectFileViewSet)
router.register(r"notifications", NotificationViewSet)
router.register(r"artifacts", ArtifactViewSet)
router.register(r"snapshots", ProjectSnapshotViewSet, basename="snapshot")
router.register(r"annotations", AnnotationViewSet, basename="annotation")
router.register(r"users", UserViewSet, basename="user")
router.register(r"shares", ProjectShareViewSet, basename="share")
router.register(r"activities", ActivityLogViewSet, basename="activity")
router.register(r"webhooks", WebhookConfigViewSet, basename="webhook")
router.register(r"gcps", GCPViewSet, basename="gcp")
router.register(r"surveys", SurveyTaskViewSet, basename="survey")
router.register(r"survey-points", SurveyPointViewSet, basename="survey-point")

urlpatterns = [
    path("health/", health_check, name="health_check"),
    path("", include(router.urls)),
    path("register/", RegisterView.as_view(), name="register"),
]
