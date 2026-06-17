#!/usr/bin/env python3
import sqlite3
import json
import hashlib
from pathlib import Path
from shutil import copy2
from datetime import datetime

DB = Path('api-proxy/data/si_genie.db')
BACKUP_DIR = Path('api-proxy/data/backups')
SALT = 'GC_SALT_2026_GABON'

if not DB.exists():
    print('DB file not found:', DB)
    raise SystemExit(1)

BACKUP_DIR.mkdir(parents=True, exist_ok=True)
bak = BACKUP_DIR / f"si_genie.db.bak.{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}"
copy2(DB, bak)
print('Backup created at', bak)

con = sqlite3.connect(str(DB))
cur = con.cursor()

# helper
def sha256_hash(pwd):
    return hashlib.sha256((pwd + SALT).encode('utf-8')).hexdigest()

# Load key
def load_key(key):
    cur.execute('SELECT value FROM si_data WHERE key = ?', (key,))
    row = cur.fetchone()
    if not row:
        return None
    try:
        return json.loads(row[0])
    except Exception as e:
        print('Failed to parse', key, e)
        return None

# Save key
def save_key(key, value):
    v = json.dumps(value, ensure_ascii=False)
    cur.execute('UPDATE si_data SET value = ?, updated_at = strftime("%s","now") WHERE key = ?', (v, key))
    con.commit()

# Update users list
def apply_updates(users_list):
    changed_ids = []
    for u in users_list:
        uid = u.get('id')
        if not uid:
            continue
        # Skip admin and dg
        if uid in ('USR-ADM-000', 'USR-DG-001'):
            # Ensure avatar for admin/dg
            if uid == 'USR-ADM-000': u['avatar'] = u.get('avatar') or 'AD'
            if uid == 'USR-DG-001': u['avatar'] = u.get('avatar') or 'DG'
            continue
        # Determine password
        if uid == 'USR-S02-0571':
            pwd = 'fkastanh@30'
        else:
            pwd = uid[-6:]
        # Compute hash and set
        h = sha256_hash(pwd)
        if u.get('passwordHash') != h:
            u['passwordHash'] = h
            changed_ids.append(uid)
        # avatars: first letters of first two words in name or alias
        if not u.get('avatar'):
            name = u.get('name') or u.get('alias') or u.get('username') or ''
            parts = [p for p in name.split() if p]
            if len(parts) >= 2:
                av = (parts[0][0] + parts[1][0]).upper()
            elif len(parts) == 1 and len(parts[0]) >= 2:
                av = parts[0][:2].upper()
            else:
                av = (u.get('username','')[:2] or '??').upper()
            u['avatar'] = av
    return changed_ids

# Process both keys
for key in ('gc-users','users'):
    data = load_key(key)
    if data is None:
        print('Key not found or empty:', key)
        continue
    if not isinstance(data, list):
        print('Key is not a list:', key)
        continue
    changed = apply_updates(data)
    print(f'Key {key}: updated {len(changed)} users')
    if changed:
        print('Updated ids sample:', changed[:20])
    save_key(key, data)

con.close()
print('Done')
