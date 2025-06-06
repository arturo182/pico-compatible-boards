import yaml
import json
import os
import re
import sys
import shutil
import base64
import io
import time
import requests
import jsonschema
import hashlib
from PIL import Image


BOARDS_DIR = 'boards'
TEMPLATE_DIR = 'page_template'
OUTPUT_DIR = 'out'
CACHE_DIR = 'cache'

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

    cache_file = os.path.join(CACHE_DIR, hashlib.sha256(image_url.encode('utf-8')).hexdigest())

    try:
        if not os.path.exists(cache_file):
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


def validate(filename, BOARDS_DIR):
    print(f'Validating "{filename}"...')

    filepath = os.path.join(BOARDS_DIR, filename)

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


def parse(filename, BOARDS_DIR):
    print(f'Processing "{filename}"...')

    filepath = os.path.join(BOARDS_DIR, filename)

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
    if not os.path.exists(BOARDS_DIR):
        sys.exit(f'Error: Directory "{BOARDS_DIR}" not found!')

    if not os.path.exists(TEMPLATE_DIR):
        sys.exit(f'Error: Directory "{TEMPLATE_DIR}" not found!')

    if os.path.exists(OUTPUT_DIR):
        shutil.rmtree(OUTPUT_DIR)

    if not os.path.exists(CACHE_DIR):
        os.makedirs(CACHE_DIR, exist_ok=True)

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    files = [filename for filename in os.listdir(BOARDS_DIR) if filename.endswith('.yaml') and not filename == '_template.yaml']
    files.sort()

    valid = [validate(filename, BOARDS_DIR) for filename in files]

    if False in valid:
        sys.exit('\nErrors found during validation. Aborting!')

    all_data = [parse(filename, BOARDS_DIR) for filename in files]

    if False in all_data:
        sys.exit('\nErrors found during processing. Aborting!')

    json_path = os.path.join(OUTPUT_DIR, 'board_data.json')
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump({'data': all_data}, f, indent=2)

    print(f'Successfully wrote {len(all_data)} boards to "{json_path}"!')

    for item in os.listdir(TEMPLATE_DIR):
        src = os.path.join(TEMPLATE_DIR, item)
        dest = os.path.join(OUTPUT_DIR, item)

        if os.path.isdir(src):
            shutil.copytree(src, dest, dirs_exist_ok=True)
        else:
            shutil.copy2(src, dest)


if __name__ == '__main__':
    main()
