from django.contrib import admin
from .models import Project, ProjectFile, Task, Notification, Artifact, Organization, UserProfile, DetectedObject, QualityMetric

@admin.register(QualityMetric)
class QualityMetricAdmin(admin.ModelAdmin):
    list_display = ('project', 'artifact', 'gsd', 'rmse_x', 'rmse_y', 'rmse_z', 'created_at')
    list_filter = ('project',)

@admin.register(DetectedObject)
class DetectedObjectAdmin(admin.ModelAdmin):
    list_display = ('object_type', 'project', 'confidence', 'created_at')
    list_filter = ('object_type', 'project')

@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ('name', 'primary_color', 'created_at')

@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'organization', 'language', 'data_retention_days')
    list_filter = ('organization', 'language')

@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ('name', 'created_at')
    search_fields = ('name',)

@admin.register(ProjectFile)
class ProjectFileAdmin(admin.ModelAdmin):
    list_display = ('name', 'project', 'created_at')
    list_filter = ('project',)

@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ('name', 'project', 'status', 'progress', 'created_at')
    list_filter = ('status', 'project')

@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('project', 'message', 'is_read', 'created_at')
    list_filter = ('is_read', 'project')

@admin.register(Artifact)
class ArtifactAdmin(admin.ModelAdmin):
    list_display = ('artifact_type', 'project', 'created_at')
    list_filter = ('artifact_type', 'project')
