import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'photogrametrista.settings')
django.setup()

from django.contrib.auth.models import User
from core.models import UserProfile, ProjectTemplate

username = 'admin'
email = 'admin@example.com'
password = 'admin'

if not User.objects.filter(username=username).exists():
    user = User.objects.create_superuser(username, email, password)
    print(f"Superuser '{username}' created successfully.")
else:
    user = User.objects.get(username=username)
    print(f"User '{username}' already exists.")

# Ensure profile is created or updated
profile, created = UserProfile.objects.get_or_create(
    user=user,
    defaults={
        'max_projects': 100,
        'max_storage_gb': 50.0,
        'can_use_ai': True
    }
)
if created:
    print(f"UserProfile for '{username}' created.")
else:
    profile.max_projects = 100
    profile.max_storage_gb = 50.0
    profile.can_use_ai = True
    profile.save()
    print(f"UserProfile for '{username}' updated.")

# Seed default templates
templates = [
    ('Маркшейдерия', 'Шаблон для маркшейдерских работ'),
    ('Строительство', 'Шаблон для мониторинга стройки'),
    ('Сельское хозяйство', 'Анализ вегетационных индексов и состояния посевов'),
]

for name, desc in templates:
    t, created = ProjectTemplate.objects.get_or_create(
        name=name,
        defaults={'description': desc}
    )
    if created:
        print(f"Template '{name}' created.")
