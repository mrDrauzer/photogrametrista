from __future__ import absolute_import, unicode_literals

import os

from celery import Celery

# Установка модуля настроек Django по умолчанию
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "photogrametrista.settings")

app = Celery("photogrametrista")

# Использование строки здесь означает, что воркеру не нужно сериализовать
# объект конфигурации при использовании Windows.
app.config_from_object("django.conf:settings", namespace="CELERY")

# Автоматическое обнаружение задач в зарегистрированных приложениях Django.
app.autodiscover_tasks()
