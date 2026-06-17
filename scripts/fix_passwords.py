#!/usr/bin/env python3
"""
fix_passwords.py — Correcteur de mots de passe SI Génie Consultant
=================================================================
Ce script corrige les passwordHash corrompus des comptes par défaut (Admin + DG)
directement dans la base SQLite du proxy.

USAGE :
    python3 fix_passwords.py
    ou : python fix_passwords.py

Placer ce fichier dans le dossier racine du projet (à côté de api-proxy/).
"""

import sqlite3, json, hashlib, os, shutil
from datetime import datetime

# ── Configuration ────────────────────────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(__file__), "api-proxy", "data", "si_genie.db")

# Fonction de hash identique à gcHashPassword() dans constants.js (front)
def gc_hash(password: str) -> str:
    return hashlib.sha256((password + "GC_SALT_2026_GABON").encode("utf-8")).hexdigest()

# Mots de passe par défaut des comptes système
DEFAULT_ACCOUNTS = {
    "USR-ADM-000": "Admin@SI#2026!",
    "USR-DG-001":  "DG@GenieSI#2026!",
}

# ── Vérification fichier DB ───────────────────────────────────────────────────
if not os.path.exists(DB_PATH):
    print(f"❌ Base de données introuvable : {DB_PATH}")
    print("   Vérifiez que le proxy a été lancé au moins une fois (pour créer la DB).")
    exit(1)

# ── Sauvegarde préventive ─────────────────────────────────────────────────────
ts = datetime.now().strftime("%Y%m%d_%H%M%S")
backup_path = DB_PATH + f".backup_{ts}"
shutil.copy2(DB_PATH, backup_path)
print(f"✅ Sauvegarde créée : {backup_path}")

# ── Connexion DB ──────────────────────────────────────────────────────────────
conn = sqlite3.connect(DB_PATH)
conn.execute("PRAGMA journal_mode=WAL")
cur = conn.cursor()

# ── Lecture des utilisateurs ──────────────────────────────────────────────────
cur.execute("SELECT value FROM si_data WHERE key='users'")
row = cur.fetchone()
if not row:
    print("❌ Clé 'users' introuvable dans la base.")
    conn.close()
    exit(1)

users = json.loads(row[0])
fixed = 0

print(f"\n📋 Utilisateurs trouvés : {len(users)}")
for u in users:
    uid  = u.get("id", "?")
    name = u.get("name", u.get("alias", "?"))
    ph   = u.get("passwordHash", "")
    has_plain = bool(u.get("password", ""))

    if uid in DEFAULT_ACCOUNTS:
        new_hash = gc_hash(DEFAULT_ACCOUNTS[uid])
        if ph != new_hash:
            print(f"  🔧 {uid} ({name}) — hash incorrect → correction en cours…")
            u["passwordHash"] = new_hash
            u["password"]     = ""          # effacer le mot de passe en clair
            u["accountStatus"] = u.get("accountStatus", "ACTIF")
            fixed += 1
        else:
            print(f"  ✅ {uid} ({name}) — hash déjà correct")
    else:
        status = "⚠️  hash manquant" if not ph else "✅ hash présent"
        print(f"  👤 {uid} ({name}) — {status}")

# ── Sauvegarde utilisateurs corrigés ─────────────────────────────────────────
if fixed > 0:
    cur.execute(
        "UPDATE si_data SET value=?, updated_at=strftime('%s','now') WHERE key='users'",
        (json.dumps(users, ensure_ascii=False),)
    )

    # ── Synchroniser aussi gc-users (nouveau backend JWT) ─────────────────────
    admin_u = next((u for u in users if u.get("id") == "USR-ADM-000"), None)
    if admin_u:
        gc_users_entry = [{
            "id":            "admin",
            "username":      admin_u.get("alias", "admin.si"),
            "email":         admin_u.get("email", "admin@genie-consultant.com"),
            "passwordHash":  admin_u["passwordHash"],
            "role":          "ADMIN",
            "level":         6,
            "accountStatus": "ACTIF",
        }]
        cur.execute("SELECT key FROM si_data WHERE key='gc-users'")
        if cur.fetchone():
            cur.execute(
                "UPDATE si_data SET value=?, updated_at=strftime('%s','now') WHERE key='gc-users'",
                (json.dumps(gc_users_entry, ensure_ascii=False),)
            )
        else:
            cur.execute(
                "INSERT INTO si_data (key, value, updated_at) VALUES ('gc-users', ?, strftime('%s','now'))",
                (json.dumps(gc_users_entry, ensure_ascii=False),)
            )
        print(f"\n  🔗 gc-users synchronisé pour le backend JWT")

    conn.commit()
    print(f"\n✅ {fixed} compte(s) corrigé(s) avec succès.")
    print("\n🔑 Mots de passe par défaut après correction :")
    print("   ┌─────────────────┬───────────────────┬──────────────────────┐")
    print("   │ Compte          │ Alias             │ Mot de passe         │")
    print("   ├─────────────────┼───────────────────┼──────────────────────┤")
    print("   │ Superviseur SI  │ admin.si          │ Admin@SI#2026!       │")
    print("   │ Directeur Gén.  │ dg.genie          │ DG@GenieSI#2026!     │")
    print("   └─────────────────┴───────────────────┴──────────────────────┘")
    print("\n⚠️  Changez ces mots de passe dès la première connexion !")
else:
    print("\n✅ Aucune correction nécessaire — les mots de passe sont déjà valides.")

conn.close()

# ── Vérification finale ───────────────────────────────────────────────────────
print("\n🔍 Vérification finale…")
conn2 = sqlite3.connect(DB_PATH)
cur2  = conn2.cursor()
cur2.execute("SELECT value FROM si_data WHERE key='users'")
final_users = json.loads(cur2.fetchone()[0])
all_ok = True
for u in final_users:
    uid = u.get("id")
    if uid in DEFAULT_ACCOUNTS:
        expected = gc_hash(DEFAULT_ACCOUNTS[uid])
        stored   = u.get("passwordHash", "")
        ok = (stored == expected)
        all_ok = all_ok and ok
        print(f"   {uid} : {'✅ OK' if ok else '❌ TOUJOURS INCORRECT'}")
conn2.close()
print()
if all_ok:
    print("🎉 Correction réussie — Redémarrez le proxy (node api-proxy.js) pour appliquer.")
else:
    print("❌ Des erreurs persistent. Restaurez la sauvegarde :", backup_path)
