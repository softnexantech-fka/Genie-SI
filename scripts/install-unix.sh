#!/bin/bash
# ============================================================
#  Installation Automatique SI-GC — Scénario B (Réseau Local)
#  Bash Script pour Mac/Linux
#  Usage: bash install-unix.sh
# ============================================================

set -e  # Arrête au premier erreur

clear
echo ""
echo "============================================================"
echo "  SI Genie Consultant — Installation Automatique"
echo "  Scenario B (Reseau Local Mac/Linux)"
echo "============================================================"
echo ""

# Vérifier Node.js
echo "[1/4] Vérification de Node.js..."
if ! command -v node &> /dev/null; then
    echo ""
    echo "❌ ERREUR: Node.js non trouvé !"
    echo "Installez depuis https://nodejs.org (LTS)"
    echo "Puis relancez ce script."
    exit 1
fi
NODE_VER=$(node --version)
echo "  ✓ Node.js $NODE_VER détecté"
echo ""

# Installer dépendances frontend
echo "[2/4] Installation des dépendances frontend..."
echo "  (peut prendre 3-5 minutes...)"
npm install
echo "  ✓ Frontend prêt"
echo ""

# Installer dépendances backend
echo "[3/4] Installation des dépendances backend..."
cd api-proxy
npm install
cd ..
echo "  ✓ Backend prêt"
echo ""

# Configuration .env
echo "[4/4] Configuration du serveur..."
if [ ! -f "api-proxy/.env" ]; then
    echo "  Création du fichier .env..."
    cat > "api-proxy/.env" << EOF
JWT_SECRET=genie-consultant-secure-key-$(date +%s)-$(uname -r | md5sum | cut -c1-8)
PORT=3001
NODE_ENV=production
EOF
    echo "  ✓ .env créé avec clés par défaut"
else
    echo "  ✓ .env déjà présent"
fi
echo ""

# Créer scripts de démarrage
echo "  Création des scripts de démarrage..."
cat > "demarrer-backend.sh" << 'BACKEND_EOF'
#!/bin/bash
cd "$(dirname "$0")"
echo "Lancement du BACKEND API SI-Genie..."
cd api-proxy
npm start
BACKEND_EOF
chmod +x demarrer-backend.sh

cat > "demarrer-frontend.sh" << 'FRONTEND_EOF'
#!/bin/bash
cd "$(dirname "$0")"
echo "Lancement du FRONTEND SI-Genie..."
npm run dev
FRONTEND_EOF
chmod +x demarrer-frontend.sh

echo "  ✓ Scripts de démarrage créés:"
echo "    - demarrer-backend.sh"
echo "    - demarrer-frontend.sh"
echo ""

# Message de fin
clear
echo ""
echo "============================================================"
echo "  ✅ INSTALLATION TERMINÉE !"
echo "============================================================"
echo ""
echo "INSTRUCTION DE DÉMARRAGE:"
echo ""
echo "1. Ouvrez DEUX terminaux (fenêtres séparées):"
echo ""
echo "   Terminal 1:"
echo "     bash demarrer-backend.sh"
echo "     Attendre le message: '✅ Server running on port 3001'"
echo ""
echo "   Terminal 2:"
echo "     bash demarrer-frontend.sh"
echo "     Attendre le message: 'Local: http://localhost:5173'"
echo ""
echo "2. Dans Terminal 2, notez l'adresse 'Network: http://192.168.X.X:5173'"
echo ""
echo "3. Sur cet ordinateur, ouvrez: http://localhost:5173"
echo "   Sur les autres ordinateurs: http://192.168.X.X:5173"
echo ""
echo "4. Connexion par défaut:"
echo "   Email: admin@genie-consultant.ga"
echo "   Mot de passe: Admin@SI#2026!"
echo "   (Changez le mot de passe immédiatement !)"
echo ""
echo "5. Pour arrêter: Ctrl+C dans chaque terminal"
echo ""
echo "============================================================"
echo "  Suivant: Consultez DEPLOIEMENT_COMPTES.md"
echo "============================================================"
echo ""
