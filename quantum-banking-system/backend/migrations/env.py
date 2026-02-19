from logging.config import fileConfig
from sqlalchemy import engine_from_config
from sqlalchemy import pool
from alembic import context
import os
from pathlib import Path
from dotenv import load_dotenv

# ========================================
# CHARGEMENT DES VARIABLES D'ENVIRONNEMENT
# ========================================

# Trouver le fichier .env
base_dir = Path(__file__).parent.parent
env_file = base_dir / '.env'

print(f"📂 Recherche du fichier .env : {env_file}")
print(f"📂 Existe ? {env_file.exists()}")

# Charger avec encodage UTF-8 explicite
load_dotenv(dotenv_path=str(env_file), encoding='utf-8')

# Vérifier que DATABASE_URL est chargé
database_url = os.getenv('DATABASE_URL')
print(f"🔗 DATABASE_URL trouvé : {database_url is not None}")

# ========================================
# IMPORTS DES MODÈLES
# ========================================

import sys
sys.path.insert(0, str(base_dir))

from app import db, create_app
from app.models import User, Transaction, AuditLog, QuantumResult

# ========================================
# CONFIGURATION ALEMBIC
# ========================================

config = context.config

# Configurer l'URL de la base de données
if database_url:
    config.set_main_option('sqlalchemy.url', str(database_url))
else:
    raise ValueError(
        f"❌ DATABASE_URL not found!\n"
        f"   Fichier .env recherché : {env_file}\n"
        f"   Existe : {env_file.exists()}\n"
        f"   Vérifiez que le fichier .env contient : DATABASE_URL=..."
    )

# Logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Metadata
target_metadata = db.metadata

# ========================================
# FONCTIONS DE MIGRATION
# ========================================

def run_migrations_offline() -> None:
    """Migrations en mode 'offline'."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    """Migrations en mode 'online'."""
    
    app = create_app('development')
    
    with app.app_context():
        connectable = db.engine
        
        with connectable.connect() as connection:
            context.configure(
                connection=connection,
                target_metadata=target_metadata
            )

            with context.begin_transaction():
                context.run_migrations()

# ========================================
# EXÉCUTION
# ========================================

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()