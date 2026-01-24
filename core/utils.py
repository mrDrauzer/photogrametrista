from exif import Image as ExifImage


def decimal_coords(coords, ref):
    decimal_degrees = coords[0] + coords[1] / 60 + coords[2] / 3600
    if ref in ["S", "W"]:
        decimal_degrees = -decimal_degrees
    return decimal_degrees


def extract_exif_data(file_path):
    try:
        with open(file_path, "rb") as f:
            img = ExifImage(f)

        if img.has_exif:
            try:
                lat = decimal_coords(img.gps_latitude, img.gps_latitude_ref)
                lon = decimal_coords(img.gps_longitude, img.gps_longitude_ref)
                alt = getattr(img, "gps_altitude", None)
                return lat, lon, alt
            except (AttributeError, KeyError, ZeroDivisionError):
                return None, None, None
    except Exception as e:
        print(f"Error extracting EXIF: {e}")
    return None, None, None
