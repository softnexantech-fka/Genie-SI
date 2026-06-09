import sqlite3
import json
import hashlib
from pathlib import Path

path = Path('api-proxy/data/si_genie.db')
conn = sqlite3.connect(path)
cur = conn.cursor()
cur.execute('SELECT value FROM si_data WHERE key = ?', ('gc-users',))
row = cur.fetchone()
users = json.loads(row[0]) if row else []
print('id|email|username|hashlen|hashblank|pwlen|pwblank|candidate|match')
for u in users:
    ph = u.get('passwordHash', '')
    pw = u.get('password', '')
    candidate = u.get('id', '')[-6:]
    candidate_hash = hashlib.sha256((candidate + 'GC_SALT_2026_GABON').encode()).hexdigest() if candidate else ''
    print(f"{u.get('id','')}|{u.get('email','')}|{u.get('username','')}|{len(ph)}|{ph==''}|{len(pw)}|{pw==''}|{candidate}|{candidate_hash}|{candidate_hash==ph}")
conn.close()

conn = sqlite3.connect(path)
cur = conn.cursor()
cur.execute('SELECT value FROM si_data WHERE key = ?', ('users',))
row = cur.fetchone()
users = json.loads(row[0]) if row else []
print('\nusers table: id|email|username|hashlen|blank|candidate|match')
for u in users:
    ph = u.get('passwordHash', '')
    candidate = u.get('id', '')[-6:]
    candidate_hash = hashlib.sha256((candidate + 'GC_SALT_2026_GABON').encode()).hexdigest() if candidate else ''
    print(f"{u.get('id','')}|{u.get('email','')}|{u.get('username','')}|{len(ph)}|{ph==''}|{candidate}|{candidate_hash}|{candidate_hash==ph}")
conn.close()
