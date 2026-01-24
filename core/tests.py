from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Project, ProjectCategory


class ModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="password")

    def test_project_category_creation(self):
        category = ProjectCategory.objects.create(name="Test Category", owner=self.user)
        self.assertEqual(str(category), "Test Category")

    def test_project_creation(self):
        project = Project.objects.create(name="Test Project", owner=self.user)
        self.assertEqual(project.name, "Test Project")
        self.assertEqual(str(project), "Test Project")


class APITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="password")
        self.client.force_authenticate(user=self.user)

    def test_get_projects(self):
        Project.objects.create(name="Test Project", owner=self.user)
        response = self.client.get("/api/projects/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

    def test_create_project(self):
        data = {"name": "New Project", "description": "Description"}
        response = self.client.get("/api/projects/")  # Just to check if it's there
        response = self.client.post("/api/projects/", data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Project.objects.count(), 1)
