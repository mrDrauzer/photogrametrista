import os
import time

import requests
from django.conf import settings


class WebODMClient:
    def __init__(self):
        self.base_url = settings.WEBODM_URL.rstrip("/")
        self.username = settings.WEBODM_USERNAME
        self.password = settings.WEBODM_PASSWORD
        self.token = None

    def authenticate(self):
        url = f"{self.base_url}/api/token-auth/"
        response = requests.post(
            url, data={"username": self.username, "password": self.password}
        )
        response.raise_for_status()
        self.token = response.json()["token"]
        return self.token

    def get_headers(self):
        if not self.token:
            self.authenticate()
        return {"Authorization": f"JWT {self.token}"}

    def create_project(self, name, description=""):
        url = f"{self.base_url}/api/projects/"
        response = requests.post(
            url,
            headers=self.get_headers(),
            data={"name": name, "description": description},
        )
        response.raise_for_status()
        return response.json()["id"]

    def create_task(self, project_id, images_paths, options=None):
        """
        images_paths: list of full paths to image files
        options: list of dicts like [{"name": "dsm", "value": "true"}]
        """
        url = f"{self.base_url}/api/projects/{project_id}/tasks/"

        files = []
        for path in images_paths:
            files.append(("images", open(path, "rb")))

        data = {}
        if options:
            data["options"] = list(
                options
            )  # options should be a list of dicts or similar as per WebODM API
            # Actually WebODM expects options as a JSON string in some versions or multiple fields
            import json

            data["options"] = json.dumps(options)

        try:
            response = requests.post(
                url, headers=self.get_headers(), files=files, data=data
            )
            response.raise_for_status()
            return response.json()["id"]
        finally:
            for _, f in files:
                f.close()

    def get_task_status(self, project_id, task_id):
        url = f"{self.base_url}/api/projects/{project_id}/tasks/{task_id}/"
        try:
            response = requests.get(url, headers=self.get_headers(), timeout=10)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"Error getting WebODM task status: {e}")
            return None

    def download_artifact(self, project_id, task_id, artifact_name, output_path):
        """
        artifact_name examples: 'orthophoto.tif', 'dsm.tif', 'all.zip'
        """
        url = f"{self.base_url}/api/projects/{project_id}/tasks/{task_id}/download/{artifact_name}"
        response = requests.get(url, headers=self.get_headers(), stream=True)
        response.raise_for_status()
        with open(output_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        return output_path
