#!/usr/bin/env python
# -*- coding: utf-8 -*-

import sys
import os

# Ajouter le répertoire parent au path
sys.path.insert(0, os.path.dirname(__file__))

from app import create_app, db
from app.models import User, Transaction, AuditLog, QuantumResult
from sqlalchemy import inspect

def init_database():
    """Initialiser la base de données"""
    print("🚀 Initialisation de la base de données...")
    
    app = create_app('development')
    
    with app.app_context():
        try:
            # Vérifier la connexion
            print("🔍 Test de connexion à PostgreSQL...")
            db.engine.connect()
            print("✅ Connexion réussie!")
            
            # Supprimer les anciennes tables
            print("\n🔄 Suppression des anciennes tables...")
            db.drop_all()
            print("✅ Anciennes tables supprimées")
            
            # Créer les nouvelles tables
            print("\n🔄 Création des nouvelles tables...")
            db.create_all()
            
            # Vérifier les tables créées
            inspector = inspect(db.engine)
            tables = inspector.get_table_names()
            
            print("\n✅ Tables créées avec succès:")
            for table in tables:
                columns = inspector.get_columns(table)
                print(f"   📋 {table} ({len(columns)} colonnes)")
                
            print(f"\n🎉 Initialisation terminée!")
            print(f"   Total: {len(tables)} tables créées")
            
            return True
            
        except Exception as e:
            print(f"\n❌ Erreur lors de l'initialisation: {e}")
            import traceback
            traceback.print_exc()
            return False

if __name__ == '__main__':
    success = init_database()
    sys.exit(0 if success else 1)