import sqlite3,json
con=sqlite3.connect('api-proxy/data/si_genie.db')
cur=con.cursor()
cur.execute("SELECT value FROM si_data WHERE key='gc-users'")
row=cur.fetchone()
arr=json.loads(row[0]) if row else []
for u in arr:
    if u.get('id')=='USR-S02-0571':
        print(json.dumps(u,indent=2,ensure_ascii=False))
        break
con.close()
