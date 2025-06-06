import yaml
import json
import re
import sys
import shutil
import base64
import io
import time
import requests
import jsonschema
import hashlib
import pathlib
from PIL import Image


BOARDS_DIR = pathlib.Path('boards')
TEMPLATE_DIR =  pathlib.Path('page_template')
OUTPUT_DIR =  pathlib.Path('out')
CACHE_DIR = pathlib.Path('cache')

BOARD_SCHEMA = {
    'type': 'object',
    'properties': {
        'name': { 'type': 'string' },
        'chip': { 'type': 'string' },
        'cores': { 'type': 'string' },
        'flash': { 'type': 'string', 'pattern': '^(\\d+\\s*(KB|MB|GB)|0)$' },
        'ram': { 'type': 'string', 'pattern': '^\\d+\\s*(KB|MB|GB)$' },
        'usb': { 'type': 'string', 'enum': [ 'micro', 'type-c' ] },
        'dimensions': { 'type': 'string' },
        'connectivity': {
            'type': 'array',
            'items': { 'type': 'string', 'enum': [ 'WiFi', 'BLE', 'Lora', 'Zigbee', 'Ethernet' ] }
        },
        'connectors': {
            'type': 'array',
            'items': { 'type': 'string', 'enum': [ 'Qwiic', 'SP/CE', 'PiDebug', 'BConnect', 'CSI', 'microSD', 'RJ45', 'RTC', 'LiPo-PH2.0', 'LiPo-MX1.25', 'CAN' ] }
        },
        'smd': { 'type': 'boolean' },
        'notes': {'type': [ 'string', 'null' ] },
        'image': { 'type': [ 'string', 'null' ], 'format': 'uri' },
        'url': { 'type': [ 'string', 'null' ], 'format': 'uri' }
    },
    'required': [ 'name', 'chip', 'cores', 'flash', 'ram', 'usb', 'dimensions', 'smd', 'image', 'url' ],
    'additionalProperties': False
}


def parse_memory_size(size_str):
    if not size_str or size_str == '0':
        return 0

    match = re.match(r'(\d+)\s*(KB|MB|GB)', size_str.upper())
    if not match:
        raise ValueError(f'Error: Invalid memory size format: "{size_str}"!')

    value = int(match.group(1))
    unit = match.group(2)

    if unit == 'KB':
        return value * 1024

    if unit == 'MB':
        return value * 1024 * 1024

    if unit == 'GB':
        return value * 1024 * 1024 * 1024

    return 0


def generate_thumbnail(image_url, max_size=(64, 64), quality=85):
    if not image_url:
        return None

    cache_file = CACHE_DIR / hashlib.sha256(image_url.encode('utf-8')).hexdigest()

    try:
        if not cache_file.exists():
            print('\tFetching image... ', end='\r')

            req = requests.get(image_url, stream=True, timeout=10)

            total_size = int(req.headers.get('content-length', 0))
            downloaded = 0
            image_data = bytearray()

            with req as r:
                r.raise_for_status()
                for chunk in r.iter_content(1024):
                    downloaded += len(chunk)
                    image_data.extend(chunk)
                    print(f'\tFetching image... {downloaded / total_size:.0%}', end='\r')
            print('', end='\r')

            open(cache_file, 'wb').write(image_data)
        
        else:
            print(f'\tUsing cached image: {cache_file}')

        with Image.open(cache_file) as img:
            if img.mode in ('RGBA', 'LA', 'P'):
                background = Image.new('RGB', img.size, (255, 255, 255))

                if img.mode == 'P':
                    img = img.convert('RGBA')

                if img.mode in ('RGBA', 'LA'):
                    background.paste(img, mask=img.split()[-1])
                    img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')

            img.thumbnail(max_size, Image.Resampling.LANCZOS)

            buffer = io.BytesIO()
            img.save(buffer, format='JPEG', quality=quality, optimize=True)
            buffer.seek(0)

            return 'data:image/jpeg;base64,' + base64.b64encode(buffer.read()).decode('utf-8')
    except Exception as e:
        print(f'\tError generating thumbnail: {e}')
        return None


def validate(filepath):
    print(f'Validating "{filepath.name}"...')

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            jsonschema.validate(instance=yaml.safe_load(f), schema=BOARD_SCHEMA)

        return True

    except yaml.YAMLError as e:
        print(f'\tError parsing YAML: {e}')
        return False

    except jsonschema.ValidationError as e:
        print(f'\tError validating schema: {e.message}:')
        return False

    except jsonschema.SchemaError as e:
        print(f'\tError in schema: {e.message}:')
        return False


def parse(filepath):
    print(f'Processing "{filepath.name}"...')

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            board_data = yaml.safe_load(f)

        board_data['flash_bytes'] = parse_memory_size(board_data.get('flash'))
        board_data['ram_bytes'] = parse_memory_size(board_data.get('ram'))

        board_data.setdefault('connectivity', [])
        board_data.setdefault('connectors', [])
        board_data.setdefault('notes', '')
        board_data.setdefault('thumbnail', None)

        if board_data.get('image'):
            board_data['thumbnail'] = None
            for _ in range(3):
                board_data['thumbnail'] = generate_thumbnail(board_data['image'])
                if board_data['thumbnail']:
                    break

                time.sleep(5)

            if board_data['thumbnail'] is None:
                return False

        return board_data

    except yaml.YAMLError as e:
        print(f'\tError parsing YAML: {e}')
        return False
    except ValueError as e:
        print(f'\tValue error: {e}')
        return False
    except Exception as e:
        print(f'\tUnexpected error: {e}')
        return False


def main():
    if not BOARDS_DIR.exists():
        sys.exit(f'Error: Directory "{BOARDS_DIR}" not found!')

    if not TEMPLATE_DIR.exists():
        sys.exit(f'Error: Directory "{TEMPLATE_DIR}" not found!')

    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)

    if not CACHE_DIR.exists():
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    files = [filepath for filepath in BOARDS_DIR.glob("*.yaml") if not filepath.stem == '_template']
    files.sort()

    valid = [validate(filepath) for filepath in files]

    if False in valid:
        sys.exit('\nErrors found during validation. Aborting!')

    all_data = [parse(filepath) for filepath in files]

    if False in all_data:
        sys.exit('\nErrors found during processing. Aborting!')

    json_path = OUTPUT_DIR / 'board_data.json'
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump({'data': all_data}, f, indent=2)

    print(f'Successfully wrote {len(all_data)} boards to "{json_path}"!')

    shutil.copytree(TEMPLATE_DIR, OUTPUT_DIR, dirs_exist_ok=True)


if __name__ == '__main__':
    main()
