import sqlite3, json, pathlib
p=pathlib.Path('api-proxy/data/si_genie.db')
con=sqlite3.connect(p)
cur=con.cursor()
for key in ('gc-users','users'):
    cur.execute('SELECT value FROM si_data WHERE key=?',(key,))
    row=cur.fetchone()
    if not row:
        print(key,'MISSING')
        continue
    data=json.loads(row[0])
    print('\nKEY=',key,'COUNT=',len(data))
    for i,u in enumerate(data[:12]):
        print(i+1,u.get('id'), 'hashlen=', len(u.get('passwordHash','')), 'hist=', len(u.get('passwordHistory') or []), 'avatar=', u.get('avatar'))
con.close()
