import sqlite3,json,datetime
con=sqlite3.connect('api-proxy/data/si_genie.db')
cur=con.cursor()
cur.execute("SELECT value FROM si_data WHERE key='gc-users'")
row=cur.fetchone()
if not row:
    print('gc-users missing')
    raise SystemExit(1)
gc=json.loads(row[0])
cur.execute("SELECT value FROM si_data WHERE key='users'")
row=cur.fetchone()
users=json.loads(row[0]) if row else []
users_map={u.get('id'):u for u in users}
changed=0
for u in gc:
    uid=u.get('id')
    if not uid: continue
    g_hash=u.get('passwordHash','')
    if g_hash.startswith('$2'):
        # bcrypt stored in gc-users; find old sha in users
        pu=users_map.get(uid)
        old=None
        if pu:
            ph=pu.get('passwordHash','')
            if ph and len(ph)==64:
                old=ph
        if old:
            hist=u.get('passwordHistory') or []
            # avoid duplicates
            if not any(h.get('hash')==old for h in hist):
                hist.insert(0, {'hash': old, 'changedAt': datetime.datetime.utcnow().isoformat()+'Z'})
                u['passwordHistory']=hist[:5]
                changed+=1
print('Will update',changed,'gc-users entries')
if changed>0:
    cur.execute("UPDATE si_data SET value = ? WHERE key='gc-users'", (json.dumps(gc,ensure_ascii=False),))
    con.commit()
    print('Updated gc-users in DB')
con.close()
