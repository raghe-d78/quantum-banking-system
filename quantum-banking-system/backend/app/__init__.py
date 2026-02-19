from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from app.config import config

# Initialiser SQLAlchemy
db = SQLAlchemy()

def create_app(config_name='development'):
    """Factory pour créer l'application Flask"""
    app = Flask(__name__)
    
    # Charger la configuration
    app.config.from_object(config[config_name])
    
    # Initialiser les extensions
    db.init_app(app)
    
    # Importer les modèles (important pour Alembic)
    with app.app_context():
        from app.models import user, transaction, log, quantum_result
    
    return app