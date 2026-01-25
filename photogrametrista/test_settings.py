from photogrametrista.settings import *

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

# Remove GIS from installed apps to avoid GDAL requirement if possible
if 'django.contrib.gis' in INSTALLED_APPS:
    INSTALLED_APPS.remove('django.contrib.gis')

# Also might need to remove other apps that depend on GIS
if 'leaflet' in INSTALLED_APPS:
    INSTALLED_APPS.remove('leaflet')

GDAL_LIBRARY_PATH = None
GEOS_LIBRARY_PATH = None
